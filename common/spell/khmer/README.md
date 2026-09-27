# Khmer spellcheck runtime

This directory contains the browser artifacts for
[`Sovichea/khmer_segmenter`](https://github.com/Sovichea/khmer_segmenter), pinned
to tag `v0.2.0` / commit `d52f302fabad`.

The artifacts were produced with:

```text
cd port/rust
wasm-pack build --target no-modules --release --out-dir pkg-no-modules \
  --no-default-features --features wasm
```

`khmer_segmenter.js` and `khmer_segmenter_bg.wasm` are generated from the
MIT-licensed Rust implementation (see `LICENSE-MIT.txt`). The wasm-pack
`no-modules` output does not emit a global binding, so
`window["AscKhmerSegmenterWasm"] = wasm_bindgen;` is appended to the glue.

`khmer_dictionary.kdict` is the compiled KDIC language pack (the repository
commits it under `port/rust/data/`; it can also be rebuilt with
`python scripts/build_dictionary_kdict.py`). It is generated from the linguistic
data described in `DATA_LICENSE.md` and is subject to those separate data terms.

Euro Office loads these files lazily when Khmer spellchecking is initialized.
