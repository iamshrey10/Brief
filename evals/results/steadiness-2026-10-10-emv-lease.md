# Steadiness evaluation, 2026-10-10, emv-lease

One real, already read lease document of 41 pieces, read 4 times each way with the real model and the real quote and number checks. Nothing was saved. Only field and question ids and counts are recorded here, never values or quotes, because the document is private.

| Way of reading | Found per run | Ids that changed between runs |
|---|---|---|
| key terms, one unseeded read | [8, 9, 9, 9] | 5: monthly_rent, nonrefundable_fees, property_address, security_deposit, utilities |
| key terms, voted | [9, 9, 9, 9] | 0 |
| questions, one unseeded read | [3, 3, 3, 3] | 0 |
| questions, voted | [3, 3, 3, 3] | 0 |

## Caveats

- One document and a handful of runs. Fewer changes means steadier, not more accurate: a mistake the model makes in most runs is still a mistake, and I have not read this document to say which answers are right.
- The voted reads make about ten model calls per document and were slower, see the README.
