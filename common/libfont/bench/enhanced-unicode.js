/*
 * Enhanced Unicode PDF export - benchmark.
 *
 * Measures the logical-unit layer that feeds the Enhanced Unicode PDF export for
 * the three editor layouts (document / slideshow / spreadsheet) across Khmer and
 * other complex scripts, and validates that the exported Unicode round-trips.
 *
 * Run with: node common/libfont/bench/enhanced-unicode.js
 * Options:  --repeat N  --paragraphs N  --slides N  --rows N  --json <file>
 *
 * The renderer normally supplies the visual units (one per drawn grapheme). Here
 * they are synthesised from grapheme clusters so the benchmark is fully headless;
 * everything after that (logical-unit production, metafile serialisation) is the
 * real code path the export uses.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ------------------------------------------------------------------ stubs */

global.window = global;
global.AscFonts = {
	HB_DIRECTION : {
		HB_DIRECTION_LTR : 4,
		HB_DIRECTION_RTL : 5,
		HB_DIRECTION_TTB : 6,
		HB_DIRECTION_BTT : 7
	},
	HB_SCRIPT : {
		HB_SCRIPT_INHERITED : 1,
		HB_SCRIPT_COMMON : 2
	},
	HB_StartString : function() {},
	StringShaper : function() {},
	HB_AppendToString : function(codePoint) {
		this.LastShapingCodePoint = codePoint;
	}
};
global.AscWord = { fontslot_None : 0 };
global.Asc = { LigaturesType : { None : 0 } };
global.AscCommon = { IsEnhancedUnicodeEnabled : function() { return false; } };
global.AscFormat = {
	nVertTTeaVert : 0,
	nVertTThorz : 1,
	nVertTTmongolianVert : 2,
	nVertTTvert : 3,
	nVertTTvert270 : 4
};

const LIBFONT = path.join(__dirname, "..");
const SDKJS = path.join(__dirname, "..", "..", "..");

function load(file, name) {
	vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename : name });
}

load(path.join(LIBFONT, "textshaper.js"), "textshaper.js");
load(path.join(SDKJS, "word", "Editor", "Paragraph", "TextShaper.js"),
	"word/Editor/Paragraph/TextShaper.js");
// loaded after the stubs, so the real Enhanced Unicode switch is installed here
load(path.join(SDKJS, "common", "Drawings", "LogicalUnitMetafile.js"),
	"LogicalUnitMetafile.js");

const Metafile = AscCommon.LogicalUnitMetafile;

/* --------------------------------------------------------------- corpus */

const SCRIPTS = {
	khmer : {
		label : "Khmer",
		lines : [
			"សួស្តីពិភពលោក។ កម្ពុជាជាប្រទេសដែលមានប្រវត្តិសាស្ត្រយូរអង្វែង។",
			"ភាសាខ្មែរមានអក្សរសម្រាប់សរសេរព្យញ្ជនៈ ស្រៈ និងសញ្ញាផ្សេងៗ។",
			"ការបែងចែកពាក្យក្នុងភាសាខ្មែរត្រូវការការវិភាគពិសេស។",
			"លេខខ្មែរ ០១២៣៤៥៦៧៨៩ និងលេខអារ៉ាប់ 0123456789។"
		]
	},
	thai : {
		label : "Thai",
		lines : [
			"สวัสดีชาวโลก ประเทศไทยมีวัฒนธรรมที่ยาวนาน",
			"ภาษาไทยไม่มีช่องว่างระหว่างคำ จึงต้องอาศัยการตัดคำ",
			"ตัวเลขไทย ๐๑๒๓๔๕๖๗๘๙ และเลขอารบิก 0123456789"
		]
	},
	lao : {
		label : "Lao",
		lines : [
			"ສະບາຍດີຊາວໂລກ ປະເທດລາວມີວັດທະນະທຳຍາວນານ",
			"ພາສາລາວບໍ່ມີຊ່ອງຫວ່າງລະຫວ່າງຄຳ",
			"ເລກລາວ ໐໑໒໓໔໕໖໗໘໙ ແລະເລກອາຣັບ 0123456789"
		]
	},
	devanagari : {
		label : "Devanagari",
		lines : [
			"नमस्ते दुनिया। भारत में बहुत सारी भाषाएँ बोली जाती हैं।",
			"देवनागरी लिपि में संयुक्ताक्षर और मात्राएँ होती हैं।",
			"अंक ०१२३४५६७८९ और 0123456789"
		]
	},
	tamil : {
		label : "Tamil",
		lines : [
			"வணக்கம் உலகம். தமிழ் மொழி மிகவும் பழமையானது.",
			"தமிழ் எழுத்துமுறையில் உயிர் மற்றும் மெய் எழுத்துகள் உள்ளன.",
			"எண்கள் ௦௧௨௩௪௫௬௭௮௯ மற்றும் 0123456789"
		]
	},
	arabic : {
		label : "Arabic (RTL)",
		lines : [
			"مرحبا بالعالم. اللغة العربية لغة غنية بالمعاني.",
			"تكتب الحروف العربية من اليمين إلى اليسار وتتصل ببعضها.",
			"الأرقام ٠١٢٣٤٥٦٧٨٩ و 0123456789"
		]
	},
	hebrew : {
		label : "Hebrew (RTL)",
		lines : [
			"שלום עולם. השפה העברית היא עתיקה ועשירה.",
			"הכתב העברי נכתב מימין לשמאל.",
			"ספרות 0123456789"
		]
	},
	latin : {
		label : "Latin (control)",
		lines : [
			"Hello world. The quick brown fox jumps over the lazy dog.",
			"Complex script shaping is compared against this plain baseline.",
			"Digits 0123456789"
		]
	}
};

/* ---------------------------------------------------------- grapheme split */

// Approximation of the renderer's clusters: a base character plus the combining
// marks / signs that belong to it.
const EXTEND = /[\u0300-\u036F\u0483-\u0489\u0591-\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u0900-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962-\u0963\u0981-\u0983\u09BC\u09BE-\u09CD\u09D7\u09E2-\u09E3\u0A01-\u0A03\u0A3C\u0A3E-\u0A4D\u0A51\u0A70-\u0A71\u0A75\u0B01-\u0B03\u0B3C\u0B3E-\u0B57\u0B82\u0BBE-\u0BCD\u0BD7\u0C00-\u0C04\u0C3E-\u0C56\u0C81-\u0C83\u0CBC\u0CBE-\u0CD6\u0D00-\u0D03\u0D3B-\u0D4D\u0D57\u0D62-\u0D63\u0DCA\u0DCF-\u0DDF\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18-\u0F19\u0F35\u0F37\u0F39\u0F3E-\u0F3F\u0F71-\u0F84\u0F86-\u0F87\u0F8D-\u0F97\u0F99-\u0FAD\u0FB1-\u0FB7\u0FC6\u102B-\u103E\u1056-\u1059\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A7F\u1AB0-\u1AFF\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CE8\u1CF2-\u1CF9\u1DC0-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099-\u309A\uA66F-\uA672\uA674-\uA67D\uA69E-\uA69F\uA6F0-\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880-\uA881\uA8B4-\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C-\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7-\uAAB8\uAABE-\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5-\uAAF6\uABE3-\uABEA\uABEC-\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F]/;

function clusters(line) {
	const out = [];
	for (const ch of line) {
		const cp = ch.codePointAt(0);
		if (out.length && (EXTEND.test(ch) || cp === 0x200D)) {
			out[out.length - 1] += ch;
		} else {
			out.push(ch);
		}
	}
	return out;
}

function codePoints(str) {
	return Array.from(str).map(ch => ch.codePointAt(0));
}

/* -------------------------------------------------------------- shaper */

function createShaper() {
	const shaper = new AscFonts.CTextShaper();
	shaper.StartString = function() {};
	shaper.private_CheckNewSegment = function(codePoint) { return codePoint; };
	shaper.SetWritingMode(0);
	return shaper;
}

function visualUnit(x, cluster) {
	return {
		FontId          : 7,
		FontStyle       : 1,
		LogicalAdvanceX : 640,
		LogicalAdvanceY : 0,
		VisualX         : x,
		VisualY         : 0,
		Components      : [{ Gid : 10 + (codePoints(cluster)[0] % 900), X : 0, Y : 0 }]
	};
}

// One "line" = one visual run: shape it and let the shaper produce logical units.
function shapeLine(line) {
	const parts = clusters(line);
	const all = codePoints(line);
	const shaper = createShaper();
	shaper.Buffer             = all.slice();
	shaper.BufferCodePoints   = all.slice();
	shaper.BufferSourceIndexes = all.map((_, i) => i);

	shaper.BeginLogicalUnits();
	let x = 0;
	let index = 0;
	for (const part of parts) {
		const count = codePoints(part).length;
		shaper.FlushLogicalUnit(visualUnit(x, part), count);
		shaper.FlushGrapheme(0, 0, count, false);
		x += 640;
		index += count;
	}
	const units = shaper.EndLogicalUnits();
	return { units, clusters : parts.length, codePoints : all.length };
}

/* ------------------------------------------------------- metafile memory */

function Memory() {
	this.data = [];
	this.pos = 0;
}
Memory.prototype.WriteByte = function(v) { this.data[this.pos++] = v & 0xFF; };
Memory.prototype.WriteShort = function(v) { this.WriteByte(v); this.WriteByte(v >>> 8); };
Memory.prototype.WriteLong = function(v) {
	this.WriteByte(v); this.WriteByte(v >>> 8); this.WriteByte(v >>> 16); this.WriteByte(v >>> 24);
};
Memory.prototype.WriteLongAt = function(pos, v) {
	const save = this.pos; this.pos = pos; this.WriteLong(v); this.pos = save;
};
Memory.prototype.WriteDouble = function(v) { this.WriteLong(Math.trunc(v * 100000)); };
Memory.prototype.GetCurPosition = function() { return this.pos; };
Memory.prototype.Skip = function(count) {
	for (let i = 0; i < count; ++i) this.data[this.pos + i] = 0;
	this.pos += count;
};
Memory.prototype.Write = Memory.prototype.WriteByte;
Memory.prototype.WriteBytes = function(bytes) {
	for (let i = 0; i < bytes.length; ++i) this.WriteByte(bytes[i]);
};

/* ------------------------------------------------------------- benchmark */

function runShape(name, script, lines, width, repeat) {
	const shapeStart = process.hrtime.bigint();
	const units = [];
	let clustersFed = 0;
	let codePointsFed = 0;
	for (let r = 0; r < repeat; ++r) {
		for (const line of lines) {
			const res = shapeLine(line);
			units.push(...res.units);
			clustersFed += res.clusters;
			codePointsFed += res.codePoints;
		}
	}
	const shapeMs = Number(process.hrtime.bigint() - shapeStart) / 1e6;

	// serialise exactly like the export does (queue -> records -> memory)
	const exportStart = process.hrtime.bigint();
	const font = { Name : "BenchFont", FontSize : 12 };
	const queue = new Metafile.Queue();
	queue.SetEnabled(true);
	let added = 0;
	units.forEach(function(unit, i) {
		const candidate = {
			Unicode        : unit.Unicode || [],
			SourceIndex    : Number.isInteger(unit.SourceIndex) ? unit.SourceIndex : i,
			VisualIndex    : Number.isInteger(unit.VisualIndex) ? unit.VisualIndex : i,
			LogicalAdvance : unit.LogicalAdvance !== undefined ? unit.LogicalAdvance : 6.4,
			VisualX        : unit.VisualX !== undefined ? unit.VisualX : i * 6.4,
			VisualY        : unit.VisualY !== undefined ? unit.VisualY : 0,
			Components     : unit.Components && unit.Components.length
				? unit.Components : [{ Gid : 10, X : 0, Y : 0 }]
		};
		if (queue.Add(candidate, font)) ++added;
	});
	const entries = queue.Drain();
	const memory = new Memory();
	let written = 0;
	for (const entry of entries) {
		if (Metafile.Write(memory, entry.Unit !== undefined ? entry.Unit : entry)) ++written;
	}
	const exportMs = Number(process.hrtime.bigint() - exportStart) / 1e6;

	let exportedCodePoints = 0;
	for (const unit of units) exportedCodePoints += (unit.Unicode || []).length;

	const expected = lines.reduce((n, l) => n + codePoints(l).length, 0) * repeat;
	return {
		shape : name,
		script,
		label : SCRIPTS[script].label,
		lines : lines.length * repeat,
		width,
		clustersFed,
		units : units.length,
		unitsQueued : added,
		records : written,
		bytes : memory.pos,
		codePointsFed,
		codePointsExpected : expected,
		exportedCodePoints,
		roundTrip : expected > 0 ? +(exportedCodePoints / expected).toFixed(3) : 0,
		shapeMs : +shapeMs.toFixed(2),
		exportMs : +exportMs.toFixed(2),
		unitsPerMs : shapeMs > 0 ? +(units.length / shapeMs).toFixed(1) : 0
	};
}

function arg(name, def) {
	const i = process.argv.indexOf("--" + name);
	if (i < 0) return def;
	const v = process.argv[i + 1];
	return (v === undefined || v.startsWith("--")) ? true : v;
}

function main() {
	const repeat = parseInt(arg("repeat", "1"), 10);
	const paragraphs = parseInt(arg("paragraphs", "12"), 10);
	const slides = parseInt(arg("slides", "8"), 10);
	const rows = parseInt(arg("rows", "40"), 10);

	AscCommon.ApplyEnhancedUnicodeOption({ enhancedUnicode : true });
	console.log("enhancedUnicode =", AscCommon.IsEnhancedUnicodeEnabled());
	console.log("repeat=%d paragraphs=%d slides=%d rows=%d\n", repeat, paragraphs, slides, rows);

	const results = [];
	for (const script of Object.keys(SCRIPTS)) {
		const pool = SCRIPTS[script].lines;
		const pick = n => Array.from({ length : n }, (_, i) => pool[i % pool.length]);
		// document: paragraphs; slideshow: one title per slide; spreadsheet: one value per row
		results.push(runShape("document", script, pick(paragraphs), paragraphs, repeat));
		results.push(runShape("slideshow", script, pick(slides), slides, repeat));
		results.push(runShape("spreadsheet", script, pick(rows), rows, repeat));
	}

	const head = ["shape", "script", "lines", "units", "records", "bytes", "round-trip", "shape ms", "export ms", "units/ms"];
	const widths = [11, 11, 6, 7, 8, 8, 10, 9, 10, 9];
	const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join(" ");
	console.log(line(head));
	console.log(widths.map(w => "-".repeat(w)).join(" "));
	for (const r of results) {
		console.log(line([r.shape, r.script, r.lines, r.units, r.records, r.bytes,
			r.roundTrip, r.shapeMs, r.exportMs, r.unitsPerMs]));
	}

	const jsonPath = arg("json", path.join(__dirname, "results", "enhanced-unicode.json"));
	fs.mkdirSync(path.dirname(jsonPath), { recursive : true });
	fs.writeFileSync(jsonPath, JSON.stringify({
		generatedAt : new Date().toISOString(),
		options : { repeat, paragraphs, slides, rows },
		results
	}, null, 2));
	console.log("\njson:", jsonPath);

	const broke = results.filter(r => r.roundTrip < 0.999);
	if (broke.length) {
		console.log("\nround-trip below 1.0:");
		for (const r of broke) {
			console.log("  %s/%s: %d of %d code points", r.shape, r.script, r.exportedCodePoints, r.codePointsExpected);
		}
	}
}

main();
