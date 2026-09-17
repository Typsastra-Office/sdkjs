# Khmer spellcheck runtime

This directory contains the browser artifacts for
[`Sovichea/khmer_segmenter`](https://github.com/Sovichea/khmer_segmenter), pinned
to tag `v0.2.0rc3` / commit `031fc60bcf29dbdd117d9ab04c5b746032d6ab0a`.

The artifacts were produced with:

```text
python scripts/build_dictionary_kdict.py
wasm-pack build --target no-modules --release --out-dir pkg-no-modules \
  --no-default-features --features wasm
```

`khmer_segmenter.js` and `khmer_segmenter_bg.wasm` are generated from the
MIT-licensed Rust implementation. `khmer_dictionary.kdict` is generated from
the linguistic data described in `DATA_LICENSE.md` and is subject to those
separate data terms.

Euro Office loads these files lazily when Khmer spellchecking is initialized.
