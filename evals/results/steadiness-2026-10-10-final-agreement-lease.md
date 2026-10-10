# Steadiness evaluation, 2026-10-10, final-agreement-lease

One real, already read lease document of 286 pieces, read 3 times each way with the real model and the real quote and number checks. Nothing was saved. Only field and question ids and counts are recorded here, never values or quotes, because the document is private.

| Way of reading | Found per run | Ids that changed between runs |
|---|---|---|
| key terms, one unseeded read | [8, 10, 10] | 5: landlord, renewal, security_deposit, tenant, utilities |
| key terms, voted | [10, 10, 9] | 2: landlord, renewal |
| questions, one unseeded read | [9, 6, 8] | 4: early_termination, late_fee, rent_increase, repairs |
| questions, voted | [5, 5, 5] | 0 |

## Caveats

- One document and a handful of runs. Fewer changes means steadier, not more accurate: a mistake the model makes in most runs is still a mistake, and I have not read this document to say which answers are right.
- The voted reads make about ten model calls per document and were slower, see the README.
