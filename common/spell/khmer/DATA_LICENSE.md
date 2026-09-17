# Linguistic Data Notice

The software source code in this repository is licensed under the MIT License.
That license does not apply to the bundled Khmer linguistic data.

## Dictionary source and credit

The dictionary is derived from **Khmer Dictionary 2022** of the National
Council of Khmer Language, Royal Academy of Cambodia, as extracted and
published by **Seanghay Hay (`seanghay`)**:

https://huggingface.co/datasets/seanghay/khmer-dictionary-44k

This dictionary dataset may be redistributed for **noncommercial use with
attribution**.

## Included adaptations

The deployed `khmer_dictionary.kdict` contains normalized or generated
adaptations for runtime use, including segmentation costs, curated spelling
flags, and approved typo corrections.

The segmentation frequencies are generated only from RAC definitions and
examples: definition occurrences have weight 1, examples weight 3, and a
headword's occurrence in its own record has weight 0.25. Supplemental entries
are segmentation evidence only: they cannot make a spelling valid or enter
correction results. No uncurated corpus is used to accept spellings.

The typo-correction table is separate from dictionary and frequency data.
Entries derived from Pisethan's Khmer spelling dataset are credited to that
CC BY 4.0 source. Maintainer-approved exact pairs are project curation and must
retain their per-row provenance when redistributed.

These bundled linguistic files remain under the same noncommercial and
attribution conditions. Redistribution must retain this notice and credit
Seanghay Hay and the Royal Academy of Cambodia source.

No restriction in this notice applies to independently supplied dictionaries
used with the MIT-licensed segmentation code.
