# AER-1 errata and interpretation notes

Maintainer notes for draft-zambo-aer1-26 (posted 2026-10-22, closed).
The draft text is final and is not revised; this file records how the
maintainer reads passages where the draft text, the conformance corpus,
and the reference runners could be taken to disagree. In every case
below the resolution is interpretation only: no draft text changes, no
corpus vector changes, and no conformance outcome changes. The corpus
(143 vectors, 146 checks, kit v1.5.7) remains the frozen reference, and
every published conformance result against it, including independent
143/143 runs, stands exactly as reported.

## E-2026-11-15-1: Schema 0.4 receipts without metadata_hash

Reported by astrogilda in probityai/agent-evidence-matrix PR #11
(merged 2026-11-14), from running the conformance kit against the
draft. Verified against the live corpus before this note was written.

The finding: ten vectors in the valid set declare
receipt_schema_version "0.4" and carry no metadata_hash, and the
reference runners accept them. The vectors are bound-04, deep-nesting,
edge-numbers, empty-members, input-hash-multikey-20, large-payload,
maximum-offset-timestamp, optional-members-18, typographic-unicode,
and uuid-v1-core. Against them stands one sentence in Section 6,
step 4: 'A "0.4" receipt without metadata_hash MUST fail.'

The tension is real, and it is a tension inside the draft, not an
error in the corpus. Three other passages govern how the sentence is
read:

1. Table 1 lists metadata_hash as "Cond." (conditional) and states
   the operative verifier rule in the same row: "REQUIRED when
   receipt_schema_version is "0.4" or later; a verifier MUST
   recompute and compare it whenever present." The unconditional
   duty the row imposes on a verifier is recomputation whenever the
   member is present, and a mismatch fails.

2. The draft defines conformance itself, in its Implementation
   Status section: "An implementation is conformant when it produces
   byte-identical verdicts to the reference runners across the full
   vector corpus," and "the v1.5.7 release is the frozen reference
   for the corpus described above." Section 11 repeats the bar and
   names the boundary the kit documents, the one that "separates a
   core-valid receipt from one the reference producer will emit."

3. Section 13 states the consumer-side rule: "Consumers that need
   tamper-evident metadata MUST require metadata_hash (schema "0.4"
   or later), or use chained timelines (Section 7) or workflow
   receipts (Section 8)."

Governing interpretation. The Section 6 step 4 sentence governs the
metadata-binding claim, not the core verification verdict. Read with
Table 1 and the conformance definition, the rules for implementers
are:

- Producer: at schema "0.4" or later, emit metadata_hash. The
  reference producer does (see the valid vector real-04, and
  metadata-hash-non-ascii-tool). A 0.4 receipt without the member is
  outside the reference-producer profile, and its metadata is
  unbound, whether or not its output commitment verifies.
- Verifier, member present: recompute the Section 3.1 canonical
  metadata block from the receipt's stored member values and compare.
  A mismatch MUST fail verification. This recomputation shipped in
  the kit runners (kit -24) and in aer1-verify 0.2.20, after Laurent
  Lemonnier's independent finding of 2026-10-29 that a stored 0.4
  receipt whose metadata was altered after issuance passed every
  check that then existed.
- Verifier, member absent: absence is not a failure. The receipt is
  evaluated on its form, its output commitment, version agreement,
  and provenance binding, exactly as the ten vectors above are
  scored. These are pre-binding vectors: they carry no
  metadata-binding claim. The verifier MUST keep the absence
  visible in its report (the reference verifier records the check as
  "member absent, skipped") and MUST NOT report the receipt's id,
  tool name, version, scope, creation time, or provenance class as
  bound to the output commitment; Section 6 step 4 states that
  unbound consequence expressly for pre-0.4 receipts, and it applies
  to any receipt that carries no metadata_hash.
- Consumer: a verifier profile or a consumer that needs
  tamper-evident metadata MUST require metadata_hash, per Section
  13, and reject receipts that lack it under that profile. That is a
  profile requirement, stated as one, not the core verdict.

## E-2026-11-15-2: entry_count encoded as 5.0 in a chain commitment

Reported in the same PR, and likewise verified first-hand.

The finding: Section 7.3 defines the chain commitment member
entry_count as "the number of entries in the timeline, a JSON number
with an integer value." The corpus vector x-entry-count-float carries
a commitment whose entry_count is written 5.0, an integer value in
float encoding, and its expected verdict is "invalid." The reference
runner rejects it with the reason "commitment entry_count is not an
integer," and the same commitment with entry_count written 5 passes.
Section 7.1 uses the same phrase for seq and there accepts both
forms expressly: "The representations 1 and 1.0 are equivalent; both
are accepted, and the digest serializes the value in integer form
(1, never 1.0)."

Governing interpretation. The difference between the two members is
what happens to the value next. seq is canonicalized into integer
form before it feeds the entry digest, so its recorded encoding
cannot change any verdict, and the draft says so. entry_count is
never canonicalized: it is a recorded member of a standalone
commitment artifact, compared as recorded against the number of
entries in the timeline. For such a member, "a JSON number with an
integer value" is read with the draft's own form discipline ("in
integer form (1, never 1.0)") and with the corpus, which the draft
makes the conformance bar: entry_count MUST be encoded as a JSON
integer. An integer-valued float encoding such as 5.0 is a mistyped
member, the commitment check fails closed on it, and producers MUST
NOT emit it. The corpus is normative on this member;
x-entry-count-float stays "invalid," and no outcome changes.

## E-2026-11-15-3: entry_count in exponent notation (5e0) splits the reference runners

Reported by glitchfox on the Get Posting Board errata thread
(seq 122652, 2026-11-15), with the fix shape proposed by
antigravity-gemini-wanderer (seq 122680). Verified first-hand the
same day by running both reference runners (kit v1.5.7) on the
frozen vector x-entry-count-float with entry_count rewritten in
the raw JSON text.

The finding: E-2026-11-15-2 settles 5.0, but entry_count can also
be written in exponent notation (5e0, 5E+0, 50e-1), the same
integer value in a different encoding. The two reference runners
disagree on it. The Python runner parses every non-integer
notation as a float, so isinstance(count, int) fails and the
commitment is rejected with "commitment entry_count is not an
integer." The JS runner cannot recover the distinction from
JSON.parse, so its vector loader marks float-written values in
the raw text; the marker at conformance.js lines 1397-1399 is
/("entry_count"\s*:\s*)(\d+\.\d+)/g, which matches only digits, a
dot, and digits. None of these exponent forms (without a dot) is marked, JSON.parse
collapses each to an integer, and the JS check accepts. Run table
(frozen vector, only the entry_count token rewritten):

5.0: Python rejects, JS rejects.
5 (control): both accept.
5e0: Python rejects, JS accepts.
5E+0: Python rejects, JS accepts.
50e-1: Python rejects, JS accepts.
5.00: both reject.
-0: both runners read it as the integer 0 and reject this vector
on the following check (entry_count 0 does not match the timeline
length 5), with the same reason; no split.

Governing interpretation. The Python verdict governs: an
exponent-notation entry_count is a float encoding of the member
in the sense of E-2026-11-15-2 and MUST be rejected. The split is
a defect in the JS runner's loader, not a reading of the draft
and not a corpus gap: the marker must treat exponent notation as
float-written (the value pattern must cover an exponent part, e or E with an optional sign, and not the
dot alone). The governing interpretation is the Python verdict;
the loader fix is its mechanical consequence in the JS runner,
and it is queued for the kit's next release. The corpus is
unchanged: the frozen commitment vectors contain no
exponent-notation entry_count (the recorded forms are integers,
5.0, and one string form), so no published conformance verdict
changes, and every result reported against kit v1.5.7 stands.

## Status

These findings are closed by this note. Draft -26 is unchanged and
closed; the corpus and kit v1.5.7 are unchanged; conformance outcomes
are unchanged. E-2026-11-15-3 additionally records a JS runner loader
defect whose fix is queued for the kit's next release; it changes no
verdict on the frozen corpus. Questions and further findings are welcome in this
repo's discussions:
https://github.com/zambodotdev/aer-1/discussions
