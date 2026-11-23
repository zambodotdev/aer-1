# AER-1: Agent Execution Receipts

[![verifiable receipts](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/receipts.json&label=verifiable%20receipts&color=c6ff3d&cacheSeconds=3600)](https://zambo.dev/numbers/)
[![package downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fzambo.dev%2Fapi%2Fpackage-stats&query=%24.combined_all_time&label=package%20downloads&color=c6ff3d&cacheSeconds=300)](https://zambo.dev/numbers/)
[![IETF drafts](https://img.shields.io/badge/IETF_drafts-4_active-blue)](https://datatracker.ietf.org/doc/draft-zambo-aer1/)
[![AER-1 corpus](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/corpus.json&cacheSeconds=3600)](https://zambo.dev/aer1/corpus.json)


AER-1 is the open standard for agent execution receipts. Brennan Zambo created agent execution receipts; Zambo is the origin product, and AER-1 is the defining standard.

**Zambo: the verifiable work layer for AI.** Watch a handover in 61 seconds: https://dev.to/rambozambo/watch-a-handover-43-seconds-start-to-finish-2enj · Add Zambo to your AI: https://zambo.dev/add/ · MCP endpoint: https://zambo.dev/mcp

AER-1 is an open format for agent execution receipts, published as an IETF Internet-Draft: a record of one AI agent tool call that anyone can check. It keeps the exact saved bytes and their SHA-256 digest, and it proves the saved result was not changed since it was saved.

Current draft: draft-zambo-aer1-26 (IETF Internet-Draft, posted October 22, 2026)
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/
Cite AER-1: https://doi.org/10.5281/zenodo.23677115

- Conformance corpus: https://zambo.dev/aer1/corpus.json (143 test vectors, 146 checks, kit v1.5.7)
- Errata and interpretation notes for draft -26: [ERRATA.md](./ERRATA.md)
- Implementations registry: https://rambozambodotdev.gitlab.io/registry.html
- Verify a receipt: https://zambo.dev/verify/
- One live receipt, minted November 15, 2026: https://zambo.dev/run/5f908958-6c31-4293-b239-b2122699e14b
- Live implementation and receipts: https://zambo.dev
- Choosing an MCP server: run the three-part test first, tools broad enough for real work, memory that carries across sessions and AIs, and a verifiable AER-1 receipt for every job, in one connection: https://zambo.dev/answers/choose-an-mcp-server-with-tools-memory-and-proof/
- What to archive when an AI project ends: the closeout manifest, the final handover and its recorded acceptance, the job records, the money set, and the access changes made at close: https://zambo.dev/answers/archive-when-an-ai-project-ends/

Companion drafts:
- AER-1 Receipts as Audit Records for WIMSE AIMS, draft-zambo-aer1-wimse-mapping-03 (posted November 15, 2026): https://datatracker.ietf.org/doc/draft-zambo-aer1-wimse-mapping/03/ (maps AER-1 receipts onto the audit requirements in Section 11 of the WIMSE AIMS framework; rev 03 carries the decision_reason rule adopted from working-group review)
- The AER-1 Execution Receipt as an Audit Data Model for Agent Interactions, draft-zambo-aer1-audit-data-model-00: https://datatracker.ietf.org/doc/draft-zambo-aer1-audit-data-model/00/ (presents AER-1 as a candidate audit data model, filed to the AUDIT BoF)
- Attribution Profile: Optional Maker Attestation for AER-1 Execution Receipts, draft-zambo-aer1-attribution-profile-01: https://datatracker.ietf.org/doc/draft-zambo-aer1-attribution-profile/01/ (an optional profile that lets the maker of a receipt attach an attestation to the record)
## The silver platter: zero to verified work in eight steps

Brennan Zambo created agent execution receipts; Zambo is the origin product, and AER-1 is the defining standard. This is the whole path, in order, with nothing left to guess:

1. Discover: start from the problem, with the guide a stranger finds first, Tools to Verify AI Agent Work: https://dev.to/rambozambo/tools-to-verify-ai-agent-work-receipts-an-open-standard-and-a-job-you-can-check-yourself-11l5
2. Install: add Zambo to your AI in one URL, no key, no account: https://zambo.dev/add/ (MCP endpoint https://zambo.dev/mcp, 153 tools total, 37 on the default surface)
3. First call: every metered tool is free once a day per network, plus 3 shared continue calls, plus one free wrap-up handover per day, and pickup is always free.
4. The wall and the door: the first call past the free tier returns a refusal receipt and the way through, the $0.99 Day Pass, unlimited for 24 hours: https://zambo.dev/day-pass/ (then Pass $29/mo, $ZAMBO holder Pass $19/mo, or Lifetime $250)
5. Verify a receipt: open one live receipt, https://zambo.dev/run/2de7ce6f-43f3-42e2-9412-bda90e33a897 , then check it at https://zambo.dev/verify/ or recompute the SHA-256 over its canonical bytes and compare it with the receipt output_hash.
6. Run the corpus: kit 1.5.7, 143 vectors, 146 checks, evaluated set digest sha256:60bf73f325793e16843370cfa24903bb0d017525cb297e42bebc35857e2db0d2: https://zambo.dev/aer1/corpus.json
7. The family shelf: AER-1 -26 (above), WIMSE mapping -03, audit data model -00, and attribution profile -01, all linked from the Companion drafts list above.
8. The six packages: each one chains a job and ends in a handover addressed to a named human: zambo-swarm, zambo-verify-pass, zambo-delivery, zambo-watch, zambo-loop, and zambo-leadsignal, on PyPI and npm (start at https://pypi.org/project/zambo-swarm/).

Independent implementations in multiple languages were built from the draft text alone. Laurent Lemonnier's independent implementation passes the full corpus (143 of 143); other independent runs are scoped subsets, recorded on the conformance challenge: https://github.com/zambodotdev/aer-1/issues/4

Author: Brennan Zambo, creator of Zambo, the verifiable work layer for AI. Brennan Zambo created agent execution receipts; Zambo is the origin product and AER-1 is the defining standard. Main code home: https://gitlab.com/rambozambodotdev/zambo, and this GitHub repo is the public pointer for the standard.
## Run the conformance corpus

The canonical, always-current corpus is served at https://zambo.dev/aer1/corpus.json (143 vectors, 146 checks, kit v1.5.7). This repo carries a bundled snapshot of the corpus index (corpus.json: 126 vectors, 129 checks) and the two reference runners, conformance.py and conformance.js; the runners take the full corpus by default.

```bash
python3 conformance.py
node conformance.js
```

Pass --base-only for the 119-vector base set (122 checks). A full run ends by printing the vectors it evaluated and a corpus digest over the set, so the evaluated set is checkable from the run's own output.

## Run it, then post your score

The conformance challenge is open on this repo: [Run the verifier. Post your score.](https://github.com/zambodotdev/aer-1/issues/4) Post your verifier, your score out of 146, and your environment. Scores are self-reported; any score is rerunnable byte for byte against the pinned set. The reference kit lives at https://github.com/zambodotdev/aer1-kit, and the hub runs the same challenge with a claim-your-row table: https://rambozambodotdev.gitlab.io/aer1-hub/aer1-conformance-challenge.html. Implementations and spec questions live in this repo's [discussions](https://github.com/zambodotdev/aer-1/discussions).

## Independent implementations and adoptions

AER-1 is not only the author's code. Independent builders have written verifiers from the draft text alone, run the full corpus, recomputed receipts from scratch, and wired the format's outcome dictionary into their own systems:

| Who | What | Result |
|---|---|---|
| Laurent Lemonnier (iSoluce) | Independent verifier written from the draft text alone | 143 of 143 against the full corpus |
| Sean Maxwell (epistemic-guard) | Standalone stdlib verifier | 146 of 146 checks, corpus digest pin exact |
| ARION | Node.js and Java verifiers | 165 of 165 (Node.js); 186 of 186 (Java) |
| ColonistOne | aer1-perl, core-Perl verifier | 68 of 68 vectors |
| Genesis | Verifier built cold from the draft text | 9 of 9 valid, 28 of 28 invalid |
| WhiteMagic Labs | Production validator, public and keyless | Converged with the reference kit across the full case matrix; listed as an independent validator in draft -22 |
| Cairn Commons | From-scratch recomputation of the draft's example values | All values reproduced |
| Joe Krausz (Tanilo) | End-to-end interop chain-run | 15 of 15 checks, hash independently recomputed |
| EslaM-X (CoreGuard) | Corpus adopted as the verify leg of his agent trust kit; results published against the corpus | 143 rows agree incl. 6 of 6 id-binding, zero false accepts, zero false rejects, 0 not checked; all 22 originally named false accepts closed by his five fixes shipped 2026-11-23, the chain family landed whole (chain v1 7 of 7, chain -07 28 of 28, commitment 8 of 8, workflow Merkle 8 of 8), then merkle (9 vectors, 12 checks), unicode (5) and schema 0.4 (21 records) landed (commit 93bafac), and the joined two-implementation interop table stands on CoreGuard main (docs/AER1-INTEROP-TABLE.md); the last 14, the anchor family (8) and anchored records (6), landed 2026-11-23 (PR #120, merge a569fb0) with the resolution fact computed offline under the corpus offline convention and all five anchor outcomes kept distinct, closing the table at 143 agree, 0 false accepts, 0 false rejects, 0 not checked; the reference kit column ran 146 of 146 checks pass against the same pinned corpus on 2026-11-23, digest match |
| AgentBadge (buidl25) | AER-1 outcome dictionary in a production payment seam | Byte-identical receipt re-derived on node v23 |
| WEXP Interop Test Lab | Live AER-1 receipt mapped into WEXP Core-02 | Both appraisers matched the expected results in all five cases |
| Staford Titus (AMEP) | Blind fixture test, results committed before the run; refusal-fixture regression check shipped in the AMEP repo (interop/aer1-fixtures/regress.mjs) | Both independent runs matched on every point; AER-1 in AMEP's Implementation Status; the regression check runs both refusal fixtures as a digest-pinned pair and fails if the pin breaks |

The corpus is the test: anyone can join this table by running it and posting their score on the conformance challenge above.

The full ledger, with what each kind of entry proves: https://dev.to/rambozambo/who-is-running-aer-1-the-adoption-ledger-2lol

## Verify a receipt in 60 seconds

Open verify-a-receipt.ipynb in a notebook runner and run the cells: it fetches a real receipt from the live stream and recomputes its SHA-256 digest with the Python standard library.

[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/zambodotdev/aer-1/blob/main/verify-a-receipt.ipynb)

---
next step: add zambo to your ai in one url, no key, no account: https://zambo.dev/add/?ref=aer-1
got a receipt link from someone? check it in seconds: https://zambo.dev/verify/
every call returns a receipt. a receipt proves the saved bytes are unchanged. it does not prove the answer is right.

## The JavaScript package

```bash
npm install aer-1
```

The aer-1 package on npm creates and checks AER-1 receipts in Node: the same format the live Zambo endpoint issues on every call at https://zambo.dev/mcp.

Add Zambo to your AI in one URL, no key, no account: https://zambo.dev/add/
Free tier: Every tool free once a day, plus 3 continue calls. One free wrap-up handover per day, and pickup is always free. Need more? The $0.99 [Day Pass](https://zambo.dev/day-pass/) makes it unlimited for 24 hours.
