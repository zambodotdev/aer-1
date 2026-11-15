# AER-1: Agent Execution Receipts

[![zambo receipts](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/receipts.json)](https://zambo.dev/numbers/)
[![package downloads](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/downloads.json)](https://zambo.dev/numbers/)
[![IETF drafts](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/drafts.json)](https://datatracker.ietf.org/doc/draft-zambo-aer1/)
[![AER-1 corpus](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/corpus.json)](https://zambo.dev/aer1/corpus.json)

AER-1 is an open format for agent execution receipts, published as an IETF Internet-Draft: a record of one AI agent tool call that anyone can check. It keeps the exact saved bytes and their SHA-256 digest, and it proves the saved result was not changed since it was saved.

Current draft: draft-zambo-aer1-26 (IETF Internet-Draft, posted October 22, 2026)
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/
Cite AER-1: https://doi.org/10.5281/zenodo.23677115

- Conformance corpus: https://zambo.dev/aer1/corpus.json (143 test vectors, 146 checks, kit v1.5.7)
- Errata and interpretation notes for draft -26: [ERRATA.md](./ERRATA.md)
- Implementations registry: https://rambozambodotdev.gitlab.io/registry.html
- Verify a receipt: https://zambo.dev/verify/
- Live implementation and receipts: https://zambo.dev

Companion drafts:
- AER-1 Receipts as Audit Records for WIMSE AIMS, draft-zambo-aer1-wimse-mapping-03 (posted November 15, 2026): https://datatracker.ietf.org/doc/draft-zambo-aer1-wimse-mapping/03/ (maps AER-1 receipts onto the audit requirements in Section 11 of the WIMSE AIMS framework; rev 03 carries the decision_reason rule adopted from working-group review)
- The AER-1 Execution Receipt as an Audit Data Model for Agent Interactions, draft-zambo-aer1-audit-data-model-00: https://datatracker.ietf.org/doc/draft-zambo-aer1-audit-data-model/00/ (presents AER-1 as a candidate audit data model, filed to the AUDIT BoF)

Independent implementations in multiple languages were built from the draft text alone.

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
Free tier: Every tool free once a day, plus 3 continue calls. One free wrap-up handover per day, and pickup is always free. Need more? The $0.99 Day Pass makes it unlimited for 24 hours.
