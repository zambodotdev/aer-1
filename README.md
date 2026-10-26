# AER-1: Agent Execution Receipts

AER-1 is the open standard for agent execution receipts: a record of one AI agent tool call that anyone can check. It keeps the exact saved bytes and their SHA-256 digest, and it proves the saved result was not changed since it was saved.

Current draft: draft-zambo-aer1-26 (IETF Internet-Draft, posted October 22, 2026)
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/

- Conformance corpus: https://zambo.dev/aer1/corpus.json (126 test vectors, 129 checks, kit v1.5.7)
- Verify a receipt: https://zambo.dev/verify/
- Live implementation and receipts: https://zambo.dev

Independent implementations in multiple languages were built from the draft text alone.

Author: Brennan Zambo (Zambo). Main code home: https://gitlab.com/rambozambodotdev/zambo — this GitHub repo is the public pointer for the standard.
