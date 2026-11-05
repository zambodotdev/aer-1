# AER-1: Agent Execution Receipts

[![zambo receipts](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/receipts.json)](https://zambo.dev/numbers/)
[![package downloads](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/downloads.json)](https://zambo.dev/numbers/)
[![IETF drafts](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/drafts.json)](https://datatracker.ietf.org/doc/draft-zambo-aer1/)
[![AER-1 corpus](https://img.shields.io/endpoint?url=https://rambozambodotdev.gitlab.io/aer1-hub/badges/corpus.json)](https://zambo.dev/aer1/corpus.json)

AER-1 is the open standard for agent execution receipts: a record of one AI agent tool call that anyone can check. It keeps the exact saved bytes and their SHA-256 digest, and it proves the saved result was not changed since it was saved.

Current draft: draft-zambo-aer1-26 (IETF Internet-Draft, posted October 22, 2026)
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/
Cite AER-1: https://doi.org/10.5281/zenodo.23677115

- Conformance corpus: https://zambo.dev/aer1/corpus.json (143 test vectors, 146 checks, kit v1.5.7)
- Verify a receipt: https://zambo.dev/verify/
- Live implementation and receipts: https://zambo.dev

Independent implementations in multiple languages were built from the draft text alone.

Author: Brennan Zambo (Zambo). Main code home: https://gitlab.com/rambozambodotdev/zambo, and this GitHub repo is the public pointer for the standard.
## Run the conformance corpus

This repo carries the corpus index (corpus.json: 126 vectors, 129 checks, kit v1.5.7) and the two reference runners, conformance.py and conformance.js. The canonical, always-current corpus is served at https://zambo.dev/aer1/corpus.json, and the runners take the full corpus by default; pass --base-only for the 119-vector base set.

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

The aer-1 package on npm (3,119 downloads last month) creates and checks AER-1 receipts in Node: the same format the live Zambo endpoint issues on every call at https://zambo.dev/mcp.

Add Zambo to your AI in one URL, no key, no account: https://zambo.dev/add/
Free tier: 20 calls and 1 wrap-up free every day, and picking up in another AI is always free. Need more? The $0.99 Day Pass makes it unlimited for 24 hours.
