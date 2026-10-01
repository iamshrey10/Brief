# Retrieval evaluation, 2026-10-01

24 questions over a 17-clause mixed loan and lease fixture, real Gemini embeddings, real Postgres. Fixture and questions were written before any results were seen and not tuned afterward.

## Overall

| Strategy | hit@1 | hit@3 | MRR |
|---|---|---|---|
| keyword only | 4% | 4% | 0.04 |
| vector only | 96% | 100% | 0.98 |
| hybrid (keyword + vector) | 96% | 100% | 0.98 |
| hybrid + rerank (TinyBERT) | 58% | 79% | 0.71 |
| hybrid + rerank (MiniLM) | 67% | 83% | 0.79 |

## hit@1 by question difficulty

| Strategy | lexical | paraphrase | hard |
|---|---|---|---|
| keyword only | 17% | 0% | 0% |
| vector only | 100% | 100% | 88% |
| hybrid (keyword + vector) | 100% | 100% | 88% |
| hybrid + rerank (TinyBERT) | 100% | 50% | 38% |
| hybrid + rerank (MiniLM) | 100% | 50% | 62% |

## Questions the final pipeline (hybrid + rerank (MiniLM)) got wrong at rank 1

- 'Can I pay off my loan early without being charged extra?' expected `prepayment`, put `late_fee_loan` first
- 'Do I get all the money upfront or in installments?' expected `disbursement`, put `late_fee_loan` first
- 'Can my parent come off the loan later?' expected `cosigner_release`, put `default_loan` first
- 'Does the lease continue on its own at the end?' expected `renewal`, put `early_termination` first
- 'Can the landlord just walk in whenever?' expected `entry`, put `subletting` first
- 'What if I stop paying for three months?' expected `default_loan`, put `early_termination` first
- 'Is the money I actually receive less than what I borrowed?' expected `origination_fee`, put `default_loan` first
- 'Is the rate going to change over time?' expected `interest_rate`, put `late_fee_loan` first

## Caveats

- The fixture has 17 clauses, so the rerank shortlist covers the whole document. On a real 100-page agreement the shortlist step matters and this fixture cannot show it.
- 24 questions is a small sample, differences of a question or two are not strong evidence.
