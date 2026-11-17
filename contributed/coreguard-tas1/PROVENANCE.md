# CG-TAS/1 data vectors — provenance

Vendored contribution from CoreGuard (EslaM-X), accepted on
[CoreGuard issue #56](https://github.com/coreguard-global/CoreGuard/issues/56#issuecomment-6953047211)
(2026-11-17) under the terms stated there: the source repository is MIT-licensed,
and the author offered the anchor-set corpus vectors for vendoring into this
repository in-thread (issue #56, comment 6952735850, 2026-11-17: "just a file
copy, same terms as always").

## Source

- Repository: https://github.com/coreguard-global/CoreGuard
- Commit: `b92d4d32835dd6f79e4c4ec0d1876c5f0787f243` ("CG-TAS/1: owner-authorized
  provenance v2 foundation - trust-anchor set, fuzz and mutation campaigns")
- Specification: `docs/AER1-TRUST-ANCHOR-SET-SPEC-V1-DRAFT.md` in the source repo
- Vectors extracted from: `test/integrations/trust-anchor-set.test.mjs`
  (sha256 `66d4c23c1f9b198b41810acbaabefa8e97f0f0fb294b1f01ee60064bc05bb12c`,
  21 tests, all passing at the source commit)
- Module under test: `scripts/ladder/trust-anchor-set.mjs`, composing over the
  unchanged CG-RRP/1 verifier `scripts/ladder/resolved-record-provenance.mjs`

## What is vendored here

| File | sha256 | Origin |
| --- | --- | --- |
| `vectors.json` | `d067ac152e66b4e9afa93f105e5444755b487a5b31528e849b1affb5d670fc3b` | Extracted data vectors (this repo; see method) |
| `module/trust-anchor-set.mjs` | `3e200343ff7758e57c800eeff13d6177f1c0b84a37e9cc3d4da2dfb87818ee08` | Byte-identical copy of the source file at the pinned commit |
| `module/resolved-record-provenance.mjs` | `eb6414c48736a3f046189f3e38f5ff6cebeb0a6d05f5c977c9e831182f0575e1` | Byte-identical copy of the source file at the pinned commit |
| `run-vectors.mjs` | `857c83f247699ed7949958b34320f8c2e3847b28d89a49f84e3bc59e67c830d5` | Runner (this repo) |

## Extraction method

The source vectors are code-embedded: the test file constructs Ed25519
keypairs from fixed seeds (`aa`/`bb`/`cc` repeated 32 times, public test
material, recorded in `vectors.json` under `key_material`), builds anchor-set
documents and signed CG-RRP/1 record envelopes, and asserts verdicts. The
extraction rebuilt every scenario deterministically from those seeds, ran each
one against the source module, and froze the concrete inputs (record envelope,
anchor-set text, context, options) plus exactly the outcomes the source test
asserts into 49 data vectors covering all 21 tests (multi-run tests expand to
one vector per run). Extraction produced zero mismatches against the source
test's stated expectations.

## Verification

From this directory:

```
node run-vectors.mjs
```

Result at landing (2026-11-17): **49 pass, 0 fail, 49 total**, run against the
vendored module copies in `module/`. The source test suite at the pinned
commit was also re-run independently in a clean clone: 21 tests, 21 pass.

## Scope

These vectors exercise CG-TAS/1 anchor-set resolution over CG-RRP/1 provenance
records, a different record type from AER-1 receipt records. They live in this
companion directory on purpose: they are **not** part of `corpus.json` and
carry no AER-1 conformance meaning. CoreGuard's fuzz and mutation campaigns
(`scripts/ladder/provenance-fuzz.mjs`, `test/integrations/provenance-mutations.test.mjs`
in the source repo) are generators, not fixed vectors, and were not vendored;
they run in the source repository.
