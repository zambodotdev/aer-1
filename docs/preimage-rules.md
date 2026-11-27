# Preimage rules: steps_digest and metadata_hash

Two AER-1 fields commit to values whose preimages were not written
down in one place. This page states both constructions in full, with
worked vectors a third party can recompute without any Zambo source.
The vectors also ship as machine-readable files in the conformance
kit repository (zambodotdev/aer1-kit, tests/preimage-vectors/).

Both rules were first published in answer to CoreGuard's conformance
questions (coreguard-global/CoreGuard issues #161 and #162,
2026-11-27), and every vector on this page was re-verified against
the live records on 2026-11-27.

## steps_digest (handover bundle field)

`steps_digest` appears nowhere in draft-zambo-aer1-26: the workflow
summary in Section 8 defines `merkle_root`, a different field.
`steps_digest` is a handover-bundle field, and its construction is:

> The lowercase hex SHA-256 of the UTF-8 bytes of the step receipt
> ids joined by a single newline (U+000A), in steps-array order, with
> no trailing newline. Coverage is exactly the ids of the steps array
> as published: receipt ids only. It does not cover output hashes,
> statuses, or the Merkle root. A refused receipt is not a
> steps-array row (refused receipts are listed separately in
> `refused_receipt_ids`), so it is not covered.

Worked vectors (full step id lists in steps-digest-vectors.json):

- zamback, 41 steps, bundle sha256
  9ff930d5e074ce193a5074ddfbc491eb0dbc86bc05a15e9eba5c1560e31f3720:
  steps_digest
  258dc2ec13ba1ea6e9a55d28a21276ad63abe069754e3b456d0c144751343127
- adctx, 4 steps, bundle sha256
  5f3a41ab3e7004e555c31741ae4f25fe328596f34049904b18f54d7448aa4f41:
  steps_digest
  116a8d85e28e19118c664b1e2e6860179f67f833540e2b0d19d7377017a1420f

Order is load-bearing. Swapping the first two ids of the zamback
record yields
3b55d85a58d63db0c062dec1d7c9ee0551b794ee443f3e1fd7fbfb541cb9312f,
and dropping the last id yields
b7dbfc3b8833797045ebd53328c8d4298c2b6700d617407f4b6104c9c72dd336;
neither matches the published value.

## metadata_hash (draft-zambo-aer1-26, Section 3.1)

The canonical metadata block is a JSON object with exactly the
members `created_at`, `id`, `output_hash`, `provenance_class`,
`receipt_schema_version`, and `tool` (an object with exactly `name`,
`scope`, `version`). Member names are sorted by Unicode code point
at every object level, including nested objects; there is no
whitespace outside strings; string escaping follows Section 7.1;
every member value is a JSON string. `metadata_hash` is `"sha256:"`
plus the lowercase hex SHA-256 of the UTF-8 encoding of that block.
Section 6, step 4 makes the recompute mandatory for schema 0.4: a
mismatch MUST cause verification to fail.

### The member mapping

The step that was not written down in one place: how a deployed
receipt's stored members map onto the block.

- `created_at`: the receipt's creation time. Zambo's deployed
  receipts carry it in the `timestamp` member (Section 6 names
  `timestamp` as the carrier of the creation time when `created_at`
  is absent).
- `id`, `output_hash`, `provenance_class`,
  `receipt_schema_version`: the receipt's members of the same name.
- `tool`: the receipt's `tool_context`, which holds exactly `name`,
  `scope`, `version`.

Worked vectors (full canonical blocks in metadata-hash-vectors.json):

- zamback workflow-close receipt
  ff7b6cd3-871e-4fdc-9186-e6e60e0e36fd: metadata_hash
  sha256:edd66244b6ffd7f5edd957b3890d2ad1f97bc3a2fce40c2b02de9c7bd7ca61be
- adctx workflow-close receipt
  16ee3524-d83f-4348-9ccf-77f35714b640: metadata_hash
  sha256:50f3d8054ea094fc70d050dcf9d237b2406696997d0d26c519c2a33483f60137

Negative vector: the same zamback block with `provenance_class`
changed to `LOGGED BY AGENT` hashes to
sha256:c60279230fbcc9f02a6cbe4f050ae5bacd696a85fbace6d5fb1e4152b2ec6037,
which does not match the published value: a verifier reports
verification failed, exactly as Section 6 requires.

Both bundles' blocks are pure ASCII, so the Section 7.1 escaping
choice does not change these two digests; it governs any non-ASCII
value.

## About

AER-1 is the agent execution receipt standard created by Brennan
Zambo. Zambo is the origin product, and the handovers and receipts
above are its records. A receipt proves the saved result was not
changed after it was saved; it does not prove the answer was right.
