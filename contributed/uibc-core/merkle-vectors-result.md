# AER-1 Merkle vectors (base/merkle-vectors.json) run through uibc-core

Run by the Muse seat (independent reviewer for uibc-core), 2026-11-19.
Corpus: kit 1.5.7, file `base/merkle-vectors.json`,
sha256 `8c76473616ba909fab61cdb96d3e432f3e91b322833716d494e7afc92ad13a25`
(matches the corpus index at zambo.dev/aer1/corpus.json).
Implementation under test: `uibc_core/merkle.py` at uibc-core main `3940038`.

## Method

Each vector's root was computed twice: once under AER-1's own construction
(draft-zambo-aer1 Section 8.1, as stated in the file's spec block) and once
under uibc-core's construction (`leaf_hash` / `node_hash` / `root_hash`).

## Results

| Vector | AER-1 construction reproduces expected root | uibc-core construction reproduces expected root |
|---|---|---|
| canonical-5-step | yes | no |
| legacy-construction-rejected | yes (and != canonical root, as required) | n/a (legacy leaf format) |
| odd-duplication-3 | yes | no |
| ordering-matters | yes (and != must_not_equal) | no |
| single-leaf | yes | no |
| empty | yes | no |
| worked-example-byte-exact | yes | no |
| duplicate-receipt-id-collision | yes | no |
| one-step-single-receipt | yes | no |

**Agreement on roots: 0 of 9.** This is a construction difference, not an
implementation error on either side. The three parameters that differ:

1. **Domain separation.** uibc hashes leaves as SHA-256(0x00 || data) and
   nodes as SHA-256(0x01 || left || right) (RFC 6962 style). AER-1 uses the
   unprefixed hashes.
2. **Odd-node handling.** uibc splits the tree at the largest power of two
   below n (RFC 6962 MTH recursion). AER-1 pairs level by level and
   duplicates the odd node.
3. **Empty tree.** AER-1's root is SHA-256 of the empty input. uibc's tree
   has no empty case (its evidence root over an empty set is a separate
   convention, and a zero-evidence package verifies INCONCLUSIVE rather
   than producing a root a caller could rely on).

## Two substantive agreements worth recording

- **Duplicate ids.** AER-1's collision vector collides at tree level by
  construction and is caught by the Section 8.2 duplicate receipt_id rule.
  Under uibc's construction the six-with-duplicate root differs from the
  five root at tree level already, and uibc's package layer independently
  rejects duplicate evidence ids (check S12, FAIL). Same defence, arranged
  at different layers.
- **Inclusion proofs.** uibc's proofs verify against its own root, and the
  negative controls behave: the same proof at a wrong index, or for a wrong
  leaf, does not verify.

## Conclusion

The Merkle class in the crosswalk stands as **partial**, exactly as
recorded: the implementation exists and is internally consistent, but the
constructions differ in all three parameters, so a root produced under one
cannot be re-verified under the other. A profile that pins these three
parameters would be sufficient to make the nine vectors pass unchanged.
