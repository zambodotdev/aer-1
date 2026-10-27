# Run the AER-1 conformance corpus against your verifier

AER-1 defines a receipt format for AI agent tool calls:
https://datatracker.ietf.org/doc/draft-zambo-aer1/26/

A format on paper settles nothing about whether two implementations agree.
The conformance corpus is the arbiter: a fixed set of test vectors with
expected outcomes, published as a record anyone can download, so a verifier
in any language can be run against the same inputs and its verdicts compared
line by line. This guide runs the reference runners first, then shows how to
point the same corpus at a verifier of your own.

## What is in the corpus

The current published set, kit v1.5.7:

- **126 vectors, 129 checks** in the full evaluated set.
- A base set of 119 vectors and 122 checks covering single receipts: valid
  and invalid shapes, digest mismatches, timestamp edge cases (leap years,
  leap seconds, impossible dates), base64 padding variants, provenance
  binding, and duplicate or malformed fields.
- Workflow vectors covering multi-step chains and their Merkle roots,
  including two cross-version cases that mix the current seq-output-v1 rule
  with the legacy receipt-id-v0 rule. Both are must-fail: a verifier that
  accepts them is wrong, and the corpus says so in advance.
- Anchor vectors, including an unresolvable anchor, which has its own
  reporting rule (see [Four outcomes, never two](./four-outcomes.md)).

The index of the set is the corpus record at
https://zambo.dev/aer1/corpus.json. It lists every file in the set with its
SHA-256 digest, the evaluated-set digest for the whole corpus, and the
runners. The same bytes are archived on Zenodo under DOI
10.5281/zenodo.23677115, so the set you test against cannot quietly change
under you: if your copy's digests match the record, you hold the same corpus
everyone else holds.

## Run the reference runners

This repository carries the corpus record and both runners at its root. The
Python runner is standard library only.

```bash
python3 conformance.py
node conformance.js
```

By default each runner runs the full corpus. It first verifies every file
in the set against the digests in `corpus.json`, then evaluates the vectors.
For the base set only:

```bash
python3 conformance.py --base-only
node conformance.js --base-only
```

Exit code is 0 when every expectation holds and 1 otherwise. A clean full
run ends with a line of this shape:

```
CONFORMANCE OK: 126 vectors, 129 checks, sha256:<evaluated-set digest>
```

A failing run prints `CONFORMANCE FAILED:` followed by one line per problem,
naming the vector and the expectation it missed.

## Read the results like an auditor

- **Compare the digest, not the vibe.** The digest in the final line must
  equal the `evaluated_set_digest` in the published corpus record. If the
  counts match but the digest differs, you ran a different set than the one
  everyone else ran.
- **A must-fail vector that passes is the worst outcome in the file.** The
  corpus spends most of its weight on inputs a verifier must reject: bad
  digests, impossible dates, broken bindings, mixed-version chains. A
  verifier that accepts everything scores perfectly on the valid vectors
  and is worthless.
- **Both runners must agree.** The Python and JavaScript runners are
  independent implementations of the same rules. Where they disagree, at
  least one is wrong, and the disagreement itself is the bug report.

## Point the corpus at your own verifier

The runners are the reference, but the corpus is the test. To evaluate an
independent verifier:

1. Feed it each vector file in the set. For a single-receipt vector, its
   verdict must match the expectation: valid vectors verify, invalid
   vectors fail at least one check.
2. For workflow vectors, compare against the expected verdict carried in the
   vector itself, including the two cross-version must-fail cases.
3. For the unresolvable-anchor vector, check the wording of the outcome,
   not just its direction. The expected report is its own state, never
   "verified" and never a plain failure. The vocabulary is in
   [Four outcomes, never two](./four-outcomes.md).
4. Tally by category before you tally overall. A verifier can pass 120
   vectors and fail every anchor case; the overall number hides exactly
   the failure you care about.

If your verifier disagrees with both reference runners on the same vector,
read the section of the draft the vector exercises before concluding the
corpus is wrong. It has been wrong before, and corrections land as new kit
versions with new digests, never as silent edits to the published set.

## Test against a live producer

Vectors are fixed inputs. To see whether your verifier also handles output
from a live endpoint, produce a real receipt and check it:

```json
{
  "mcpServers": {
    "zambo": {
      "url": "https://zambo.dev/mcp"
    }
  }
}
```

Add that to your MCP client (per-client steps at https://zambo.dev/add),
make any call, and open the receipt link the call returns. There is no
signup and no key needed to start, the first call lands in seconds, and the
free tier is 20 free calls per day, then they upgrade. One worked example,
already public: https://zambo.dev/run/ef28b4c2-4355-479e-bd43-22a05122a574

Why the receipt exists even when a call is rejected is covered in
[Every call gets a receipt](./every-call-gets-a-receipt.md).

## Closing note

The corpus, the runners, and this guide are free to use as they stand. If
you generate receipts through the hosted endpoint at volume, a Day Pass is
$0.99 USDC on Base for 24 hours and the Zambo Pass is $29 for 30 days,
one payment.
Nothing about conformance depends on either.
