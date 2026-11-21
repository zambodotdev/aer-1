# uibc-core — cross-mapping report provenance

Contributed by Steven Zhao (uibc-core maintainer) following the
implementation-report exchange of 2026-11-18 with Brennan Zambo, who
confirmed in reply that a PR with the mapping JSON would be linked from
the AER-1 implementation registry as a cross-mapping report, recorded as
a mapping and not a conformance pass.

## Source

- Repository: https://github.com/zhaoxinghua09-cell/uibc-core (Apache-2.0)
- Mapping tool: `tools/aer1_crosswalk.py` in that repository
- Corpus: AER-1 kit 1.5.7 (`https://zambo.dev/aer1/corpus.json`),
  143 vectors / 146 checks,
  evaluated set digest `sha256:60bf73f325793e16843370cfa24903bb0d017525cb297e42bebc35857e2db0d2`
- Merkle run: `uibc_core/merkle.py` at uibc-core main commit `3940038`,
  run 2026-11-19; vector file sha256
  `8c76473616ba909fab61cdb96d3e432f3e91b322833716d494e7afc92ad13a25`

## What is contributed here

| File | What it is |
| --- | --- |
| `aer1_crosswalk.json` | The class-level mapping exactly as emailed on 2026-11-18: 34 classes covered (66 vectors / 69 checks), 8 classes not applicable, 77 positive vectors unmapped and excluded from the coverage figure. Brennan Zambo's team reproduced these figures from the tool before replying. |
| `merkle-vectors-result.md` | The follow-up run the reply invited: AER-1's 9 Merkle vectors computed under both constructions. Result: divergence (0 of 9 roots agree), three construction parameters named, Merkle class stands as partial. |

## What this is not

uibc-core is not an AER-1 implementation and this report does not claim
conformance. It is a mapping between two verifiers' check classes, plus
one vector-level run (Merkle) whose result is a documented divergence.
