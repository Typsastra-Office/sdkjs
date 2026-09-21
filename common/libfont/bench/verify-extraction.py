#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Cross-tool text-extraction verification for Enhanced Unicode PDFs.

Extracts the text layer of a PDF with several independent engines and reports how
much of the expected text each one recovers - the same idea as krilla's viewer
matrix (ghostscript / mupdf / poppler / pdfbox / pdfium / quartz), applied to the
text layer the Enhanced Unicode export writes.

    python verify-extraction.py --pdf export.pdf                 # verify a real export
    python verify-extraction.py --make-sample sample.pdf         # build a stand-in
    python verify-extraction.py --make-sample sample.pdf --pdf sample.pdf

Engines used when installed:
    poppler   pdftotext -enc UTF-8            (external)
    mupdf     pymupdf (fitz)                  (python)
    pdfium    pypdfium2                       (python)
    pypdf     pypdf                           (python)
    pdfminer  pdfminer.six                    (python)
    pdfjs     node + pdf.js (optional, --pdfjs <file>)
"""

import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

# optional tool locations, filled in from the command line
OPT = {}
TMPDIR = tempfile.mkdtemp(prefix='extract-verify-')

CORPUS = {
    "khmer": ["សួស្តីពិភពលោក។ កម្ពុជាជាប្រទេសដែលមានប្រវត្តិសាស្ត្រយូរអង្វែង។",
              "ការបែងចែកពាក្យក្នុងភាសាខ្មែរត្រូវការការវិភាគពិសេស។",
              "លេខខ្មែរ ០១២៣៤៥៦៧៨៩ និងលេខអារ៉ាប់ 0123456789។"],
    "thai": ["สวัสดีชาวโลก ประเทศไทยมีวัฒนธรรมที่ยาวนาน",
             "ภาษาไทยไม่มีช่องว่างระหว่างคำ จึงต้องอาศัยการตัดคำ",
             "ตัวเลขไทย ๐๑๒๓๔๕๖๗๘๙ และเลขอารบิก 0123456789"],
    "lao": ["ສະບາຍດີຊາວໂລກ ປະເທດລາວມີວັດທະນະທຳຍາວນານ",
            "ພາສາລາວບໍ່ມີຊ່ອງຫວ່າງລະຫວ່າງຄຳ",
            "ເລກລາວ ໐໑໒໓໔໕໖໗໘໙ ແລະເລກອາຣັບ 0123456789"],
    "devanagari": ["नमस्ते दुनिया। भारत में बहुत सारी भाषाएँ बोली जाती हैं।",
                   "देवनागरी लिपि में संयुक्ताक्षर और मात्राएँ होती हैं।",
                   "अंक ०१२३४५६७८९ और 0123456789"],
    "tamil": ["வணக்கம் உலகம். தமிழ் மொழி மிகவும் பழமையானது.",
              "தமிழ் எழுத்துமுறையில் உயிர் மற்றும் மெய் எழுத்துகள் உள்ளன.",
              "எண்கள் ௦௧௨௩௪௫௬௭௮௯ மற்றும் 0123456789"],
    "arabic": ["مرحبا بالعالم. اللغة العربية لغة غنية بالمعاني.",
               "تكتب الحروف العربية من اليمين إلى اليسار وتتصل ببعضها.",
               "الأرقام ٠١٢٣٤٥٦٧٨٩ و 0123456789"],
    "hebrew": ["שלום עולם. השפה העברית היא עתיקה ועשירה.",
               "הכתב העברי נכתב מימין לשמאל.",
               "ספרות 0123456789"],
    "latin": ["Hello world. The quick brown fox jumps over the lazy dog.",
              "Complex script shaping is compared against this plain baseline.",
              "Digits 0123456789"],
}

# fonts covering the scripts above (searched in this order)
FONT_CANDIDATES = {
    "khmer": ["ttf-khmeros-core/KhmerOS.ttf", "noto/NotoSansKhmer-Regular.ttf", "KhmerUI.ttf"],
    "thai": ["noto/NotoSansThai-Regular.ttf", "LeelawUI.ttf", "Tahoma.ttf"],
    "lao": ["noto/NotoSansLao-Regular.ttf", "LeelawUI.ttf", "Tahoma.ttf"],
    "devanagari": ["lohit-devanagari/Lohit-Devanagari.ttf", "samyak/Samyak-Devanagari.ttf",
                   "noto/NotoSansDevanagari-Regular.ttf", "Nirmala.ttc", "NirmalaUI.ttf", "mangal.ttf"],
    "tamil": ["noto/NotoSansTamil-Regular.ttf", "Nirmala.ttf", "latha.ttf"],
    "arabic": ["noto/NotoSansArabic-Regular.ttf", "segoeui.ttf", "Tahoma.ttf"],
    "hebrew": ["noto/NotoSansHebrew-Regular.ttf", "arial.ttf", "Tahoma.ttf"],
    "latin": ["noto/NotoSans-Regular.ttf", "arial.ttf", "DejaVuSans.ttf"],
}


def find_font(script, core_fonts, windows_fonts):
    for rel in FONT_CANDIDATES.get(script, []):
        for base in (core_fonts, windows_fonts):
            if not base:
                continue
            p = os.path.join(base, *rel.split("/"))
            if os.path.exists(p):
                return p
    return None


def make_sample(path, core_fonts, windows_fonts):
    """Build a stand-in export: visible text plus the same invisible Unicode text
    layer the Enhanced Unicode export adds (render mode 3, embedded font)."""
    import pymupdf

    doc = pymupdf.open()
    for script, lines in CORPUS.items():
        page = doc.new_page(width=595, height=842)
        font_path = find_font(script, core_fonts, windows_fonts)
        print("  %-11s font: %s" % (script, font_path or "<not found: text will not render>"))
        y = 60
        for line in lines:
            # invisible but selectable text layer (the export's payload)
            kwargs = {"fontsize": 11, "render_mode": 3}
            if font_path:
                kwargs["fontfile"] = font_path
                kwargs["fontname"] = "F_" + script
            try:
                page.insert_text((40, y), line, **kwargs)
            except Exception as exc:
                print("    insert_text failed (%s), trying default font" % exc)
                page.insert_text((40, y), line, fontsize=11, render_mode=3)
            y += 28
    doc.save(path)
    doc.close()
    return path


def norm(s):
    s = s.replace("\u00a0", " ").replace("\ufeff", "")
    return re.sub(r"[\s\u200b]+", "", s)


def count_script(s, script):
    # shaped scripts can come back as presentation forms (Arabic U+FB50-FDFF /
    # U+FE70-FEFF, Hebrew U+FB1D-FB4F), which still belong to the script
    ranges = {
        "khmer": "\u1780-\u17ff\u19e0-\u19ff", "thai": "\u0e00-\u0e7f",
        "lao": "\u0e80-\u0eff", "devanagari": "\u0900-\u097f",
        "tamil": "\u0b80-\u0bff",
        "arabic": "\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff",
        "hebrew": "\u0590-\u05ff\ufb1d-\ufb4f",
        "latin": "A-Za-z",
    }[script]
    return len(re.findall("[" + ranges + "]", s))


# ------------------------------------------------------------------ engines
def engine_poppler(pdf):
    exe = shutil.which("pdftotext")
    if not exe:
        return None, "not installed"
    r = subprocess.run([exe, "-enc", "UTF-8", "-layout", pdf, "-"],
                       capture_output=True, timeout=180)
    if r.returncode != 0:
        return None, "exit %d" % r.returncode
    return r.stdout.decode("utf-8", "replace"), ""


def engine_pymupdf(pdf):
    try:
        import pymupdf
    except ImportError:
        return None, "not installed"
    doc = pymupdf.open(pdf)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text, ""


def engine_pypdfium2(pdf):
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return None, "not installed"
    doc = pdfium.PdfDocument(pdf)
    out = []
    for page in doc:
        out.append(page.get_textpage().get_text_range())
    return "\n".join(out), ""


def engine_pypdf(pdf):
    try:
        from pypdf import PdfReader
    except ImportError:
        return None, "not installed"
    reader = PdfReader(pdf)
    return "\n".join(page.extract_text() or "" for page in reader.pages), ""


def engine_pdfminer(pdf):
    try:
        from pdfminer.high_level import extract_text
    except ImportError:
        return None, "not installed"
    return extract_text(pdf), ""


def engine_pdfbox(pdf):
    jar = OPT.get("pdfbox")
    if not jar or not os.path.exists(jar):
        return None, "pass --pdfbox-jar <pdfbox-app.jar>"
    if not shutil.which("java"):
        return None, "java not installed"
    out = os.path.join(TMPDIR, "pdfbox-out.txt")
    r = subprocess.run(["java", "-jar", jar, "export:text", "-i", pdf, "-o", out],
                       capture_output=True, timeout=300)
    if r.returncode != 0 or not os.path.exists(out):
        return None, "exit %d: %s" % (r.returncode, r.stderr.decode("utf-8", "replace")[-200:])
    with io.open(out, "r", encoding="utf-8", errors="replace") as f:
        return f.read(), ""


def engine_ghostscript(pdf):
    exe = OPT.get("gs") or shutil.which("gswin64c") or shutil.which("gs")
    if not exe:
        return None, "ghostscript not installed"
    out = os.path.join(TMPDIR, "gs-out.txt")
    r = subprocess.run([exe, "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=txtwrite",
                        "-sOutputFile=" + out, pdf], capture_output=True, timeout=300)
    if r.returncode != 0 or not os.path.exists(out):
        return None, "exit %d" % r.returncode
    with io.open(out, "r", encoding="utf-8", errors="replace") as f:
        return f.read(), ""


def engine_pdfjs(pdf):
    dist = OPT.get("pdfjs")
    if not dist or not os.path.isdir(dist):
        return None, "pass --pdfjs-dist <node_modules/pdfjs-dist>"
    if not shutil.which("node"):
        return None, "node not installed"
    script = os.path.join(TMPDIR, "pdfjs-extract.mjs")
    module_url = "file:///" + os.path.join(dist, "legacy", "build", "pdf.mjs").replace("\\", "/")
    with io.open(script, "w", encoding="utf-8", newline="\n") as f:
        f.write((
            "import fs from 'node:fs';\n"
            "import { getDocument } from %s;\n"
            "const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])) }).promise;\n"
            "let out = '';\n"
            "for (let p = 1; p <= doc.numPages; p++) {\n"
            "  const page = await doc.getPage(p);\n"
            "  const tc = await page.getTextContent();\n"
            "  for (const item of tc.items) out += item.str;\n"
            "  out += '\\n';\n"
            "}\n"
            "process.stdout.write(out);\n") % json.dumps(module_url))
    r = subprocess.run(["node", script, pdf], capture_output=True, timeout=300)
    if r.returncode != 0:
        return None, "exit %d: %s" % (r.returncode, r.stderr.decode("utf-8", "replace")[-200:])
    return r.stdout.decode("utf-8", "replace"), ""


ENGINES = [
    ("poppler", engine_poppler),
    ("mupdf", engine_pymupdf),
    ("pdfium", engine_pypdfium2),
    ("pdfjs", engine_pdfjs),
    ("pdfbox", engine_pdfbox),
    ("pypdf", engine_pypdf),
    ("pdfminer", engine_pdfminer),
    ("ghostscript", engine_ghostscript),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf")
    ap.add_argument("--make-sample")
    ap.add_argument("--out", default="results/extraction-matrix.json")
    ap.add_argument("--pdfbox-jar", help="pdfbox-app jar (java -jar <jar> export:text)")
    ap.add_argument("--pdfjs-dist", help="node_modules/pdfjs-dist for the pdf.js engine")
    ap.add_argument("--gs", help="ghostscript binary (txtwrite device)")
    ap.add_argument("--core-fonts", default=os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "core-fonts")))
    ap.add_argument("--windows-fonts", default=os.path.join(
        os.environ.get("WINDIR", "C:\\Windows"), "Fonts"))
    args = ap.parse_args()

    if args.pdfbox_jar:
        OPT['pdfbox'] = args.pdfbox_jar
    if args.pdfjs_dist:
        OPT['pdfjs'] = args.pdfjs_dist
    if args.gs:
        OPT['gs'] = args.gs

    if args.make_sample:
        make_sample(args.make_sample, args.core_fonts, args.windows_fonts)
        print("sample:", args.make_sample)
        if not args.pdf:
            args.pdf = args.make_sample
    if not args.pdf:
        ap.error("pass --pdf <file> (or --make-sample)")

    expected = {script: norm("".join(lines)) for script, lines in CORPUS.items()}

    rows = []
    for name, fn in ENGINES:
        try:
            text, err = fn(args.pdf)
        except Exception as exc:
            text, err = None, "%s: %s" % (type(exc).__name__, exc)
        if text is None:
            rows.append({"engine": name, "available": False, "note": err})
            continue
        total = norm(text)
        per = {}
        for script, want in expected.items():
            want_chars = count_script(want, script)
            got_chars = 0
            for line in CORPUS[script]:
                probe = norm(line)
                # count the script characters that actually came back in order
                if probe and probe in total:
                    got_chars += count_script(probe, script)
                else:
                    best = 0
                    window = probe[:max(4, len(probe) // 3)] if probe else ""
                    for i in range(0, max(1, len(window))):
                        frag = window[i:i + 6]
                        if frag and frag in total:
                            best = max(best, count_script(frag, script))
                    got_chars += best
            per[script] = {"expected": want_chars, "extracted": got_chars,
                           "recall": round(got_chars / want_chars, 3) if want_chars else 0}
        overall_expected = sum(v["expected"] for v in per.values())
        overall_got = sum(v["extracted"] for v in per.values())
        rows.append({"engine": name, "available": True, "note": "",
                     "replacementChars": text.count("\ufffd"),
                     "totalChars": len(total),
                     "recall": round(overall_got / overall_expected, 3) if overall_expected else 0,
                     "perScript": per})

    print("\n%-9s %-7s %-9s %s" % ("engine", "ok", "recall", "per script (extracted/expected)"))
    print("-" * 100)
    for r in rows:
        if not r["available"]:
            print("%-9s %-7s %s" % (r["engine"], "no", r["note"]))
            continue
        per = " ".join("%s %d/%d" % (s[:4], v["extracted"], v["expected"])
                       for s, v in r["perScript"].items())
        print("%-9s %-7s %-9s %s" % (r["engine"], "yes", r["recall"], per))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with io.open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"pdf": os.path.abspath(args.pdf), "engines": rows}, f,
                  ensure_ascii=False, indent=2)
    print("\njson:", os.path.abspath(args.out))

    missing = [r["engine"] for r in rows if not r["available"]]
    if missing:
        print("engines not available:", ", ".join(missing))
    worst = min([r["recall"] for r in rows if r["available"]], default=0)
    return 0 if worst >= 0.98 else 1


if __name__ == "__main__":
    sys.exit(main())
