#!/usr/bin/env python3
"""AER-1 conformance runner.

Checks every vector in test-vectors/ against the core rules of
AER-1 (draft-zambo-aer1-19, Sections 3-6):

  valid/   - every file MUST conform (schema shape + hash recomputation)
  invalid/ - every file MUST fail at least one check, with a reason

plus the version-agreement and provenance-binding rules of the reference
verifier: valid/ vectors MUST also pass binding (or carry a legacy notice
for pre-0.4 envelopes); invalid/ vectors MUST be rejected by the core
check or by binding.

Standard library only. Exit 0 when all expectations hold, 1 otherwise.

v1.2.0: strict UTF-8 decode of canonical_bytes (fail closed), calendar-valid
RFC 3339 timestamps (shape alone is not enough), and a hard error when a
fixture directory matches zero files instead of a silent pass.

v1.3.0: reference-producer profile. check_reference_profile() pins the
payload convention of the reference producer (canonical payload is a JSON
object carrying the 'inputs' member). This is a PRODUCER CONVENTION, not an
interop requirement: core verifiers MUST NOT require it. Vectors under
test-vectors/invalid-profile/ MUST pass the core check and MUST fail the
profile check, proving the boundary fails closed.

v1.4.0: offline workflow verification verify_workflow() (Section 8.2 steps
3-4; steps 1-2 need network and stay the caller's job), including the MM-1
no-duplicate-receipt_id rule. check_merkle_vectors() honors the optional
expected_workflow_verdict / rejected_by vector fields. Section 7 chain
validation verify_chain() with the pinned prev_digest construction and the
close:true suffix-truncation kill, plus the check_chain_vectors()
regression gate over chain-vectors.json.

-07 (draft): hardened chain construction chain_entry_digest_v07() /
verify_chain_v07() binding prev_digest, seq, job_id, close, id, tool,
provenance_class, and output_hash, gated by check_chain_vectors_v07()
over chain-vectors-v07.json. The -06 verify_chain() is kept unchanged
for historical chains; -06 chains do not verify under -07 rules.

-09 (draft): external chain commitment verify_chain_commitment() for the
Section 7.3 commitment artifact (job_id, final_entry_digest,
entry_count, published_at), gated by check_commitment_vectors() over
commitment-vectors.json. The -07/-08 entry-digest construction is
unchanged.

v1.4.4: seq handling. The integer-valued float 1.0 is accepted (it was
wrongly rejected); fractional floats, booleans, strings, null, and missing
seq are rejected. Python normalization no longer mutates the caller's
receipt dict. Three new chain vectors pin the rejections
(v07-seq-string-invalid, v07-seq-null-invalid, v07-seq-missing-invalid).

-10 (draft): exact Section 7.1 string escaping — U+007F (DELETE) escapes as
\\u007f, matching Python json.dumps with ensure_ascii=True. The RFC 3339
created_at check no longer depends on the Python version (manual calendar
validation, any fractional-second digit count). Ten new isolating vectors
from the aer1-perl supplementary corpus: six receipt, three chain v07, one
commitment.

-13 (draft): version-agreement and provenance-binding evaluation
check_version_and_binding(), mirroring the reference verifier. Legacy
envelopes (outer 0.2/0.3 with no inner version commitment) pass with a
notice; non-legacy receipts must carry a matching inner
receipt_schema_version and a bound issuer_claims.provenance_class. New
vectors: legacy-02, legacy-03, bound-04 (valid); tampered-provenance,
version-downgrade (invalid).

-18 (draft): the two structural rejections of Section 6. Fixtures are
now loaded with duplicate-member-name detection (a plain json.loads
silently keeps one value, so the rejection is applied at load time via
find_duplicate_member_name()): a receipt whose JSON text carries a
duplicate member name in any object is rejected. Leap-second
timestamps (seconds value 60) are rejected in _strict_rfc3339();
leap-second validity cannot be checked offline. This aligns the
Python runner with the JavaScript runner, which already rejected
second=60. New vectors: duplicate-member-name, leap-second-created-at
(invalid). Section 4 Unicode vectors: check_unicode_vectors() gates
unicode-vectors.json (NFC form, NFD form, and the NFD payload presented
against the NFC commitment, which MUST NOT match: no normalization).
New valid vector optional-members-18 carries the optional members of
Sections 3.2, 3.3, and 3.4 (execution_context with model, source,
framework, environment, readback, and payment; input_hash;
field_provenance; negative_record; reversal; method_descriptor) and
MUST still verify: a verifier MUST NOT require them and their presence
changes no core outcome.

-19 (kit v1.5.2): the Section 3.3 input commitment is now evaluated
when it is checkable. When a receipt carries input_hash AND its
canonical payload records an 'inputs' member, check() recomputes
SHA-256 over the Section 7.1 canonical JSON of that member (the
producer byte layout published in the README) and a mismatch fails
the core check, the same commitment class as an output_hash
mismatch. A payload with no 'inputs' member leaves the commitment
unevaluated, never confirmed and never a rejection. New vector:
input-hash-mismatch (invalid).

-20 (kit v1.5.3): the three findings of an independent cold-build
verifier review (Genesis, 2026-10-15), each verified against this
runner and its JavaScript twin. (1) The Section 6 metadata checks
(version agreement + provenance binding, enforced here since -13)
are now stated as core-tier rule 9 in AGENT-PROMPT.md, closing the
gap between the quickstart text and the reference behavior.
(2) The Section 3.3 member-ordering rule is pinned by two vectors:
input-hash-multikey-20 (valid; a three-member 'inputs' object whose
input_hash is the digest of the Section 7.1 canonical JSON, member
names in lexicographic order) and input-hash-key-order-20 (invalid;
the same recorded inputs carrying the digest of a different member
order, which MUST NOT confirm). (3) provenance-control-char
(invalid): a provenance_class carrying a U+0001 control character
in an otherwise valid, binding-consistent receipt; rejected by the
core class check in both runners.

-21 (kit v1.5.4): id binding. The receipt id is a label outside the
committed canonical payload; the digest does not cover it, so an
id-swapped copy passed every offline check silently (measured
2026-10-17 in the Gigawatt control run on the Section 3 fixture).
evaluate_id_binding() mirrors the reference verifier (aer1-verify
0.2.7 check 10) and the JS commitment checker: with no external
expectation the id is reported id_state unverified and verification
is not presented as covering it; an externally supplied expected id
or a Section 9 resolution whose record disagrees on the committed
digest is a mismatch and fails. check_id_binding_vectors() gates
id-binding-vectors.json: five vectors over the real Section 3
fixture receipt (artifact alone, expected-id match, expected-id
mismatch on the swapped copy, resolution agreement, resolution
disagreement).

-22 (kit v1.5.5): corpus and id_verdict alignment. (1) The core
check now rejects a canonical_bytes spelling that is not the
canonical base64 spelling (non-canonical pad bits decode
byte-identically and the digest still matches; Skitter's finding,
already enforced by aer1-verify since 0.2.10) and rejects the nil
UUID as a receipt id (draft Section 3; already enforced by
aer1-verify since 0.2.9): new invalid vectors base64-pad-bit and
nil-uuid pin both in the corpus instead of only in verifier unit
tests. (2) Real production shapes join the valid corpus:
legacy-real-2 (the schema 0.3 production shape with 'timestamp'
instead of created_at and the tool as a bare name string alongside
its tool_context object; it passes under the prior legacy rules via
the narrow _is_legacy_production_shape() gate in check()),
real-1-bare (the bare inner receipt of the hosted real-1 fixture),
and real-04 (a current-schema 0.4 receipt carrying a correct
Section 3.1 metadata_hash). (3) id-binding-vectors.json pins the
enumerated id_verdict of draft -22 (Longcat's proposal) alongside
id_state on every vector, plus a new id-absent vector (id member
removed; expected_verdict fail, expected_id_verdict absent);
check_id_binding_vectors() asserts expected_id_verdict wherever it
asserts expected_id_state, via derive_id_verdict(), mirroring
aer1-verify 0.2.11.

-23 (kit v1.5.6): anchor outcome reporting + runner parity.
(1) anchor_report() gives verifier responses a machine-visible
per-anchor report that keeps three states distinct: "absent" (no
anchor member), "not checked" (an anchor is present but the
verifier did not evaluate it), and the evaluated Section 6 step 5
outcomes. The gap was proved against an independent validator on
the anchored-unresolvable-anchor fixture: with no "not checked"
state, a verifier that never attempted resolution was
indistinguishable from one that attempted and failed (Skitter's
finding, a-messenger's framing). check_anchor_vectors() gates
anchor-vectors.json in both runners; aer1-verify 0.2.13 reports
the same shape in its output (check 12). (2) Rejection-detail
strings are normalized across the Python and JavaScript runners:
values in the version-agreement and provenance-binding messages
render via _json_quote() (JSON.stringify semantics) instead of
Python %r, whose single quotes diverged from the JavaScript
runner's double quotes (Skitter's cross-runner diff, 2026-10-18).
aer-1/runner-parity.py asserts byte-identical per-vector detail
lines across both runners so the divergence cannot regress
silently.

Post-23 queue build (2026-10-19): evaluated-set emission. Every run
now ends by printing the exact set of vectors it evaluated: one
[evaluated] line per vector carrying the vector id and the SHA-256
of the vector's content, then a corpus digest over the set. A
claimed pass can therefore be checked as a set difference against
the full corpus from the run's own output, and a run that silently
skipped vectors is detectable (trace_hound, Switchboard post #4355,
credited in rambo's post 4369). Content digest: for a receipt
fixture, the SHA-256 of the exact file bytes; for a vector inside a
suite file, the SHA-256 of the Section 7.1 canonical JSON of the
vector object. The corpus digest is the SHA-256 of the
"<id>:<content digest>" lines in vector-id order. The JavaScript
runner emits the identical set, and runner-parity.py compares the
[evaluated] lines like every other per-vector line. No existing
field, digest construction, or verification rule changes.
"""
import base64
import binascii
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORE = ["id", "receipt_schema_version", "created_at", "tool",
        "provenance_class", "canonical_bytes", "output_hash",
        "verification_status"]
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
                     r"[0-9a-f]{4}-[0-9a-f]{12}\Z")
# -09 strict id profile (draft Section 3): UUID version 4 with RFC 4122
# variant bits. Used by the certifier core and the disinterested tier.
STRICT_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-"
                            r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z")
RFC3339_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:"
                         r"[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})\Z")
HASH_RE = re.compile(r"^sha256:[0-9a-f]{64}\Z")
PROV_RE = re.compile(r"^(EXECUTED BY [A-Z0-9][A-Z0-9 ._-]*|"
                     r"OBSERVED VIA GATEWAY|LOGGED BY AGENT)\Z")
B64_RE = re.compile(r"\A[A-Za-z0-9+/]*={0,2}\Z")
NIL_UUID = "00000000-0000-0000-0000-000000000000"

# Evaluated-set registry (trace_hound, Switchboard post #4355).
# Every vector a run evaluates is noted here as (vector id, content
# digest); main() prints the set and a corpus digest over it at the
# end of the run, so the run's own output states exactly what it
# covered and a claimed pass can be checked as a set difference
# against the full corpus.
EVALUATED = []


def _canonical_json_bytes(value):
    """Section 7.1 canonical JSON bytes of a parsed value: member
    names sorted by Unicode code point, no whitespace, ASCII
    escaping (Python json.dumps defaults), matching canonicalJson()
    in the JavaScript runner. Integer-valued floats serialize as
    integers, as they do in JavaScript, where a parsed 1.0 and 1
    are the same number."""
    def _norm(v):
        if isinstance(v, float) and v.is_integer() and abs(v) < 2 ** 53:
            return int(v)
        if isinstance(v, list):
            return [_norm(x) for x in v]
        if isinstance(v, dict):
            return {k: _norm(x) for k, x in v.items()}
        return v
    return json.dumps(_norm(value), sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def note_evaluated_file(vector_id, data):
    """Note a receipt fixture vector: its content digest is the
    SHA-256 of the exact file bytes the runner read."""
    EVALUATED.append((vector_id, hashlib.sha256(data).hexdigest()))


def note_evaluated_object(vector_id, value):
    """Note a suite vector: its content digest is the SHA-256 of
    the Section 7.1 canonical JSON of the vector object."""
    EVALUATED.append(
        (vector_id,
         hashlib.sha256(_canonical_json_bytes(value)).hexdigest()))


def evaluated_set_lines():
    """Return (lines, corpus_digest) for the evaluated set: one
    "[evaluated] <id>: sha256:<content digest>" line per noted
    vector, sorted by vector id, and the corpus digest, the SHA-256
    of the "<id>:<content digest>" lines in vector-id order."""
    entries = sorted(EVALUATED)
    lines = [f"[evaluated] {vid}: sha256:{digest}"
             for vid, digest in entries]
    blob = "".join(f"{vid}:{digest}\n" for vid, digest in entries)
    corpus_digest = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return lines, corpus_digest


def _strict_rfc3339(s):
    """Return True if s is a strictly valid RFC 3339 timestamp.

    Beyond the RFC3339_RE shape check, this rejects timezone offsets
    with out-of-range values (e.g. +10:60) and non-calendar dates.
    Does NOT depend on datetime.fromisoformat (whose fractional-second
    handling varies by Python version). Fail closed.
    """
    if not isinstance(s, str) or not RFC3339_RE.match(s):
        return False
    # Validate the numeric offset explicitly: HH must be 00-23, MM 00-59.
    # RFC3339_RE guarantees the shape [+-]HH:MM or Z at the end.
    if not s.endswith("Z"):
        off = s[-6:]  # [+-]HH:MM
        try:
            oh, om = int(off[1:3]), int(off[4:6])
        except ValueError:
            return False
        if not (0 <= oh <= 23 and 0 <= om <= 59):
            return False
    # Validate calendar date manually (no fromisoformat version dependence).
    # RFC3339_RE guarantees shape YYYY-MM-DDTHH:MM:SS(.fraction)?(Z|offset).
    try:
        year = int(s[0:4])
        month = int(s[5:7])
        day = int(s[8:10])
        hour = int(s[11:13])
        minute = int(s[14:16])
        second = int(s[17:19])
    except ValueError:
        return False
    if not (1 <= month <= 12):
        return False
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        # second=60 is a leap second. RFC 3339 permits the notation, but
        # draft-zambo-aer1-19 Section 6 requires rejection: leap-second
        # validity cannot be checked offline, so leap-second timestamps
        # are not accepted.
        return False
    # Days per month with Gregorian leap-year rule.
    if month in (1, 3, 5, 7, 8, 10, 12):
        max_day = 31
    elif month in (4, 6, 9, 11):
        max_day = 30
    else:
        # February: leap iff divisible by 4, except centuries not div by 400
        is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
        max_day = 29 if is_leap else 28
    if not (1 <= day <= max_day):
        return False
    return True


def find_duplicate_member_name(text):
    """Return the first duplicate JSON member name in text, or None.

    Draft Section 6: a verifier MUST reject a receipt in which any
    digest-covered object, as received, contains duplicate member
    names. A plain json.loads silently keeps one value and would let
    one byte string carry two meanings, so fixtures are scanned at
    load time with an object_pairs_hook that records duplicates at
    any object level.
    """
    duplicates = []

    def _hook(pairs):
        seen = set()
        for key, _value in pairs:
            if key in seen and not duplicates:
                duplicates.append(key)
            seen.add(key)
        return dict(pairs)

    json.loads(text, object_pairs_hook=_hook)
    return duplicates[0] if duplicates else None


def load_fixture(path):
    """Load a receipt fixture, preserving the Section 6 duplicate
    member name signal that JSON parsing would otherwise erase.

    Returns (receipt, duplicate_name_or_None).
    """
    text = path.read_text(encoding="utf-8")
    duplicate = find_duplicate_member_name(text)
    return json.loads(text), duplicate


def _is_legacy_production_shape(receipt):
    """True for the legacy production shape minted by zambo.dev at
    schema 0.3 (pinned by valid/legacy-real-2.json, a copy of the
    aer1-verifier receipt-real-2 fixture): the creation time is
    carried by 'timestamp' instead of 'created_at', and the tool is
    recorded as a bare name string alongside a 'tool_context' object
    carrying the name/version/scope strings. The gate is narrow by
    construction: created_at MUST be absent, the version MUST be a
    legacy one, and the bare tool string MUST equal the tool_context
    name. Synthetic core-shape receipts (every other vector in this
    corpus carries created_at) never meet it, so the core rules for
    tool shape and creation time are unchanged for them. A receipt in
    this shape is evaluated under the prior (legacy) rules, the same
    treatment aer1-verify gives it: the commitment math is checked
    in full, the creation time is read from 'timestamp', the tool is
    read from 'tool_context', and verification_status is the
    producer's own claim (reported, not a core requirement here).
    """
    if not isinstance(receipt, dict):
        return False
    if "created_at" in receipt:
        return False
    if receipt.get("receipt_schema_version") not in ("0.2", "0.3"):
        return False
    ts = receipt.get("timestamp")
    if not isinstance(ts, str) or not ts:
        return False
    tool = receipt.get("tool")
    ctx = receipt.get("tool_context")
    if not isinstance(tool, str) or not tool:
        return False
    if not isinstance(ctx, dict):
        return False
    if not all(isinstance(ctx.get(k), str) and ctx[k]
               for k in ("name", "version", "scope")):
        return False
    return ctx.get("name") == tool


def check(receipt):
    """Return a list of failure reasons; empty means conformant."""
    failures = []
    if not isinstance(receipt, dict):
        return ["receipt is not a JSON object"]
    legacy_prod = _is_legacy_production_shape(receipt)
    required = CORE
    if legacy_prod:
        required = ([f for f in CORE if f != "created_at"]
                    + ["timestamp", "tool_context"])
    for field in required:
        if field not in receipt:
            failures.append(f"missing required member: {field}")
    if failures:
        return failures
    if not isinstance(receipt["id"], str) or not UUID_RE.match(receipt["id"]):
        failures.append("id is not a lowercase UUID")
    elif receipt["id"] == NIL_UUID:
        # Draft Section 3: the nil UUID MUST NOT be used as a receipt
        # id at any tier, and a verifier MUST reject it. (Pinned by
        # invalid/nil-uuid.json; aer1-verify has screened it since
        # 0.2.9.)
        failures.append("id is the nil UUID")
    if (not isinstance(receipt["receipt_schema_version"], str)
            or not receipt["receipt_schema_version"]):
        failures.append("receipt_schema_version is not a non-empty string")
    created_value = receipt["timestamp"] if legacy_prod else receipt["created_at"]
    if not isinstance(created_value, str):
        failures.append("created_at is not a string")
    elif not RFC3339_RE.match(created_value):
        failures.append("created_at is not RFC 3339")
    elif not _strict_rfc3339(created_value):
        # Shape alone is not enough: "2026-02-30T09:00:00.000Z" matches the
        # RFC 3339 pattern but is not a real calendar date, and offsets like
        # +10:60 are out of range. Fail closed.
        failures.append("created_at is not a valid calendar date/time")
    tool = receipt["tool_context"] if legacy_prod else receipt["tool"]
    if not isinstance(tool, dict) or not all(
            isinstance(tool.get(k), str) and tool[k]
            for k in ("name", "version", "scope")):
        failures.append("tool is not an object with name/version/scope strings")
    if (not isinstance(receipt["provenance_class"], str)
            or not PROV_RE.match(receipt["provenance_class"])):
        failures.append("provenance_class is not a known class")
    cb = receipt["canonical_bytes"]
    raw = None
    if not isinstance(cb, str) or not B64_RE.match(cb):
        failures.append("canonical_bytes is not valid base64")
    else:
        try:
            raw = base64.b64decode(cb, validate=True)
        except (binascii.Error, ValueError):
            failures.append("canonical_bytes is not valid base64")
        else:
            # Canonical spelling, not just decodability: a spelling
            # with non-canonical pad bits decodes byte-identically
            # (and the digest below still matches) but is not the
            # canonical base64 spelling and MUST be rejected.
            # (Pinned by invalid/base64-pad-bit.json; aer1-verify has
            # enforced it since 0.2.10, Skitter's finding.)
            if base64.b64encode(raw).decode("ascii") != cb:
                failures.append(
                    "canonical_bytes is not the canonical base64 spelling")
            # The commitment is over the exact UTF-8 byte sequence
            # (draft Sections 3-4). A decodable base64 payload that is not
            # valid UTF-8 (e.g. b"\xff") fails closed here.
            try:
                raw.decode("utf-8")
            except UnicodeDecodeError:
                failures.append("canonical_bytes is not valid UTF-8")
                raw = None
    oh = receipt["output_hash"]
    if not isinstance(oh, str) or not HASH_RE.match(oh):
        failures.append("output_hash is not sha256: + lowercase hex digest")
    elif raw is not None:
        want = "sha256:" + hashlib.sha256(raw).hexdigest()
        if oh != want:
            failures.append("output_hash does not match sha256(canonical_bytes)")
    # Optional input commitment (draft Section 3.3). The member is
    # optional and outside the core: a verifier MUST NOT require it.
    # When a receipt carries it AND its canonical payload records an
    # 'inputs' member, the layout the reference producer publishes
    # (README, optional-members-18) makes the commitment checkable:
    # the input bytes are the Section 7.1 canonical JSON serialization
    # of that member. A digest that does not match the recorded inputs
    # is a commitment failure, the same "verification failed" class as
    # an output_hash mismatch. When the payload records no 'inputs'
    # member the layout cannot be reproduced from the receipt, so the
    # member is not evaluated (Section 3.3: a verifier that cannot
    # reproduce the layout MUST NOT report the commitment as confirmed;
    # it follows that it MUST NOT reject on it either).
    ih = receipt.get("input_hash")
    if ih is not None:
        if not isinstance(ih, str) or not HASH_RE.match(ih):
            failures.append("input_hash is not sha256: + lowercase hex digest")
        elif raw is not None:
            payload = None
            try:
                payload = json.loads(raw.decode("utf-8"))
            except ValueError:
                payload = None
            if isinstance(payload, dict) and "inputs" in payload:
                blob = json.dumps(payload["inputs"], sort_keys=True,
                                  separators=(",", ":")).encode("utf-8")
                want = "sha256:" + hashlib.sha256(blob).hexdigest()
                if ih != want:
                    failures.append(
                        "input_hash does not match sha256(canonical JSON "
                        "of the recorded inputs)")
    if legacy_prod:
        # Legacy production shape: verification_status is the
        # producer's own claim (receipt-real-2 carries "not_verified"
        # for a not-executed request whose commitment still verifies);
        # the core check requires the member to be present as a
        # string, not to carry a particular claim. Mirrors
        # aer1-verify, which reports the claim and never trusts it.
        if not isinstance(receipt["verification_status"], str) \
                or not receipt["verification_status"]:
            failures.append("verification_status is not a non-empty string")
    elif receipt["verification_status"] != "verified":
        failures.append("verification_status is not verified")
    return failures


def _json_quote(value):
    """Render a value the way JSON.stringify renders it in the
    JavaScript runner, so rejection-detail strings are byte-identical
    across both runners (Skitter's cross-runner diff, 2026-10-18:
    Python %r single-quoted strings where JavaScript double-quoted
    them). Strings carry double quotes; None renders as null.
    ensure_ascii=False matches JSON.stringify, which leaves
    non-ASCII characters unescaped. The parity gate
    aer-1/runner-parity.py keeps the two runners' per-vector detail
    lines identical so this cannot regress silently."""
    return json.dumps(value, ensure_ascii=False)


def check_version_and_binding(receipt):
    """Version agreement + provenance binding, mirroring the reference
    verifier (aer1-verifier/aer1_verify.py checks 9a/9b/9c).

    Returns (is_legacy, failures). Legacy receipts (outer 0.2/0.3 with no
    inner version commitment) predate the binding fields: they pass with
    a notice, never a failure. Non-legacy receipts MUST carry a matching
    inner receipt_schema_version and, when they commit issuer_claims, the
    outer provenance_class MUST equal the committed claim.
    """
    inner_obj = None
    inner_version = None
    try:
        raw = base64.b64decode(receipt.get("canonical_bytes", ""), validate=True)
        inner_obj = json.loads(raw.decode("utf-8"))
    except Exception:
        inner_obj = None
    if isinstance(inner_obj, dict):
        inner_version = inner_obj.get("receipt_schema_version")
    outer_version = receipt.get("receipt_schema_version")
    legacy_version = inner_version if inner_version is not None else outer_version
    is_legacy = (legacy_version is not None
                 and str(legacy_version) in ("0.2", "0.3"))
    if is_legacy:
        return (True, [])
    failures = []
    # 9a. Version agreement.
    if inner_version is not None and outer_version is not None:
        if str(inner_version) != str(outer_version):
            failures.append(
                "receipt_schema_version: outer %s does not match committed %s"
                % (_json_quote(outer_version), _json_quote(inner_version)))
    else:
        failures.append(
            "receipt_schema_version: one side missing (outer=%s committed=%s)"
            % (_json_quote(outer_version), _json_quote(inner_version)))
    # 9c. Provenance binding.
    if isinstance(inner_obj, dict):
        issuer_claims = inner_obj.get("issuer_claims")
        committed = (issuer_claims.get("provenance_class")
                     if isinstance(issuer_claims, dict) else None)
        outer_pc = receipt.get("provenance_class")
        if committed is not None and outer_pc is not None:
            if committed != outer_pc:
                failures.append(
                    "provenance binding: outer %s does not match committed %s"
                    % (_json_quote(outer_pc), _json_quote(committed)))
        else:
            failures.append(
                "provenance binding: one side missing (outer=%s committed=%s)"
                % (_json_quote(outer_pc), _json_quote(committed)))
    else:
        failures.append(
            "provenance binding: canonical payload did not decode to an object")
    return (False, failures)


def check_reference_profile(receipt):
    """Reference-producer profile check. Returns failure reasons; [] = pass.

    The reference producer commits to canonical payloads shaped as a JSON
    object carrying the 'inputs' member (alongside 'tool'/'outputs'). A
    receipt whose payload omits 'inputs' is still core-conformant and MUST be
    accepted by interop verifiers, but it is NOT reference-producer
    conformant. Fail closed at every decode step. Regression rule for the
    missing-inputs finding (independent review, 2026-09-27).
    """
    if not isinstance(receipt, dict):
        return ["receipt is not a JSON object"]
    cb = receipt.get("canonical_bytes")
    if not isinstance(cb, str):
        return ["canonical_bytes is not a string"]
    try:
        raw = base64.b64decode(cb, validate=True)
    except (binascii.Error, ValueError):
        return ["canonical_bytes is not valid base64"]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return ["canonical_bytes is not valid UTF-8"]
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return ["canonical payload is not JSON"]
    if not isinstance(payload, dict):
        return ["canonical payload is not a JSON object"]
    if "inputs" not in payload:
        return ["reference-producer payload omits the 'inputs' member"]
    return []


def check_disinterested_tier(receipt):
    """Check the optional transparency-log anchor profile.

    -09: the strict id profile applies to this tier (draft Section 3) —
    the id MUST be a UUID version 4 with RFC 4122 variant bits, not
    merely a lowercase UUID-shaped string.
    """
    failures = []
    rid = receipt.get("id") if isinstance(receipt, dict) else None
    if not isinstance(rid, str) or not STRICT_UUID_RE.match(rid):
        failures.append("id is not a UUID v4 (strict profile)")
    anchor = receipt.get("anchor") if isinstance(receipt, dict) else None
    if not isinstance(anchor, dict):
        return ["anchor is not an object"]
    if set(anchor) != {"log", "leaf_hash", "anchored_at", "proof"}:
        failures.append("anchor has members other than log/leaf_hash/anchored_at/proof")
    if not isinstance(anchor.get("log"), str) or not anchor["log"]:
        failures.append("anchor.log is not a non-empty string")
    leaf = anchor.get("leaf_hash")
    if not isinstance(leaf, str) or not HASH_RE.match(leaf):
        failures.append("anchor.leaf_hash is not sha256: + lowercase hex digest")
    else:
        cb = receipt.get("canonical_bytes")
        raw = None
        if not isinstance(cb, str) or not B64_RE.match(cb):
            failures.append("canonical_bytes is not valid base64")
        else:
            try:
                raw = base64.b64decode(cb, validate=True)
                raw.decode("utf-8")
            except (binascii.Error, ValueError, UnicodeDecodeError):
                failures.append("canonical_bytes is not valid UTF-8 base64")
        if raw is not None:
            want = "sha256:" + hashlib.sha256(raw).hexdigest()
            if leaf != want:
                failures.append("anchor.leaf_hash does not match canonical_bytes")
    anchored_at = anchor.get("anchored_at")
    if not isinstance(anchored_at, str) or not RFC3339_RE.match(anchored_at):
        failures.append("anchor.anchored_at is not RFC 3339")
    elif not _strict_rfc3339(anchored_at):
        failures.append("anchor.anchored_at is not a valid calendar date/time")
    if not isinstance(anchor.get("proof"), dict):
        failures.append("anchor.proof is not an object")
    return failures


def _uri_host(uri):
    """Host part of a URI string, lowercased, or None if there is none."""
    m = re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]+)", uri)
    if not m:
        return None
    host = m.group(1).rsplit("@", 1)[-1].split(":", 1)[0].lower()
    return host or None


def anchor_resolvable(receipt):
    """Whether the anchor's log reference can be resolved at all.

    Draft Section 6 step 5: an anchor whose record cannot be resolved
    is "rejected: unresolvable record", a resource outcome, never
    "verification failed". The corpus runs offline, so resolvability
    is decided by construction: a log URI whose host is in the
    RFC 2606 .invalid TLD cannot resolve, ever; any other well-formed
    log URI stands for a resolvable log (the corpus's .example logs).
    A missing or malformed log member is a structural matter for the
    tier check, not a resolution failure.
    """
    anchor = receipt.get("anchor") if isinstance(receipt, dict) else None
    if not isinstance(anchor, dict):
        return True
    log = anchor.get("log")
    if not isinstance(log, str) or not log:
        return True
    host = _uri_host(log)
    if host is None:
        return True
    return not host.endswith(".invalid")


def anchor_outcome(receipt, tier_fails):
    """Classify the per-anchor outcome per draft Section 6 step 5.

    Resolution is evaluated first: an anchor that cannot be resolved
    cannot be evaluated, whatever its stored fields say. A resolvable
    anchor with tier failures is "verification failed" (a recomputed
    or stored value does not match what was committed); a resolvable
    anchor with no tier failures is "verified". The receipt's own
    commitment check (the core check) is independent of this outcome
    per Section 6 step 4.
    """
    if not anchor_resolvable(receipt):
        return "rejected: unresolvable record"
    if tier_fails:
        return "verification failed"
    return "verified"


ANCHOR_PROFILE_MEMBERS = {"log", "leaf_hash", "anchored_at", "proof"}


def anchor_profile_present(receipt):
    """Whether the receipt carries the Section 3.3 anchor profile.

    The report is scoped to that profile: the anchor member must be
    an object carrying at least one of the profile's members. An
    "anchor" member in any other shape is a different anchoring
    record riding the same member name (production receipts carry a
    Nostr publication record there, with event_id / pubkey /
    relays members) and is not this profile's anchor, so the report
    reads "absent" for it rather than failing a profile it never
    claimed. A partial profile anchor (some profile members, the
    rest missing or wrong) IS present and fails the tier check."""
    if not isinstance(receipt, dict):
        return False
    anchor = receipt.get("anchor")
    return (isinstance(anchor, dict)
            and bool(set(anchor) & ANCHOR_PROFILE_MEMBERS))


def anchor_report(receipt, tier_fails, evaluate=True):
    """Machine-visible per-anchor outcome report (draft -23).

    A verifier response must keep three anchor states distinct:
    "absent" (the receipt carries no Section 3.3 anchor profile;
    see anchor_profile_present()), "not checked" (an anchor is
    present but this verifier did not evaluate it), and the
    evaluated outcomes of Section 6 step 5 ("verified",
    "verification failed", "rejected: unresolvable record"). The
    gap this closes: an independent validator, exercised on the
    anchored-unresolvable-anchor fixture, had no way to say "not
    checked" and so could not be distinguished from a verifier that
    attempted resolution and failed (Skitter's finding; a-messenger
    sharpened it into the reporting rule: "not checked" is not
    "attempted but unresolved"). Additive only: the report is a new
    field in verifier responses; no existing verdict changes."""
    if not anchor_profile_present(receipt):
        return {"present": False, "evaluated": False,
                "outcome": "absent"}
    if not evaluate:
        return {"present": True, "evaluated": False,
                "outcome": "not checked"}
    return {"present": True, "evaluated": True,
            "outcome": anchor_outcome(receipt, tier_fails)}


def _merkle_root_canonical(receipt_ids):
    """Section 8.1 normative construction: leaf = SHA-256 over the UTF-8
    bytes of receipt_id; internal node = SHA-256 over raw 32-byte left ||
    raw 32-byte right; odd trailing node duplicated."""
    if not receipt_ids:
        return hashlib.sha256(b"").hexdigest()
    level = [hashlib.sha256(rid.encode("utf-8")).digest()
             for rid in receipt_ids]
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [hashlib.sha256(level[i] + level[i + 1]).digest()
                for i in range(0, len(level), 2)]
    return level[0].hex()


def verify_workflow(workflow):
    """Section 8.2 steps 3-4: offline workflow verification.

    Returns a list of failure reasons; empty means valid.

    Steps 1-2 (fetch each step's receipt over the network and confirm each
    receipt exists and is addressed) need network access and STAY THE
    CALLER'S JOB: this function verifies only the offline mechanics, in
    order: workflow is an object; Table 2 members (type, version,
    workflow_id, receipt_id, session_id, goal, status, steps,
    merkle_root, output_hash, verify_url) are present and well-formed;
    steps is a non-empty list; every step carries Table 3 members (seq,
    tool, receipt_id, receipt_hash, started_at, ended_at, status) with
    correct types; seq values are exactly 1..n in order with no gaps and
    no duplicate seq; NO two steps share the same receipt_id value (the
    MM-1 rule); the workflow's merkle_root equals the recomputed
    Section 8.1 root over the ordered receipt_id strings.
    """
    if not isinstance(workflow, dict):
        return ["workflow is not a JSON object"]
    failures = []
    # Table 2: workflow receipt members (all MUST per draft Section 8).
    if workflow.get("type") != "verifiable-workflow-receipt":
        failures.append('workflow type is not "verifiable-workflow-receipt"')
    version = workflow.get("version")
    if not isinstance(version, str) or not version:
        failures.append("workflow version is not a non-empty string")
    wid = workflow.get("workflow_id")
    if not isinstance(wid, str) or not UUID_RE.match(wid):
        failures.append("workflow workflow_id is not a lowercase UUID")
    wrid = workflow.get("receipt_id")
    if not isinstance(wrid, str) or not UUID_RE.match(wrid):
        failures.append("workflow receipt_id is not a lowercase UUID")
    if not isinstance(workflow.get("session_id"), str) or not workflow.get("session_id"):
        failures.append("workflow session_id is not a non-empty string")
    if not isinstance(workflow.get("goal"), str) or not workflow.get("goal"):
        failures.append("workflow goal is not a non-empty string")
    if not isinstance(workflow.get("status"), str) or not workflow.get("status"):
        failures.append("workflow status is not a non-empty string")
    oh = workflow.get("output_hash")
    if not isinstance(oh, str) or not re.fullmatch(r"[0-9a-f]{64}", oh):
        failures.append("workflow output_hash is not a 64-char lowercase hex SHA-256 digest")
    vu = workflow.get("verify_url")
    if not isinstance(vu, str) or not (vu.startswith("http://") or vu.startswith("https://")):
        failures.append("workflow verify_url is not an http(s) URL string")
    steps = workflow.get("steps")
    if not isinstance(steps, list) or not steps:
        failures.append("workflow steps is not a non-empty list")
        return failures
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            failures.append(f"step {i + 1} is not an object")
            continue
        seq = step.get("seq")
        if isinstance(seq, bool) or not (
            isinstance(seq, int)
            or (isinstance(seq, float) and seq.is_integer())
        ):
            failures.append(f"step {i + 1} seq is not an integer")
        rid = step.get("receipt_id")
        if not isinstance(rid, str):
            failures.append(f"step {i + 1} receipt_id is not a string")
        # Table 3: workflow step members (all MUST per draft Section 8).
        if not isinstance(step.get("tool"), str) or not step.get("tool"):
            failures.append(f"step {i + 1} tool is not a non-empty string")
        rh = step.get("receipt_hash")
        if not isinstance(rh, str) or not re.fullmatch(r"[0-9a-f]{64}", rh):
            failures.append(f"step {i + 1} receipt_hash is not a 64-char lowercase hex SHA-256 digest")
        sa = step.get("started_at")
        if not isinstance(sa, str) or not _strict_rfc3339(sa):
            failures.append(f"step {i + 1} started_at is not a valid RFC 3339 timestamp")
        ea = step.get("ended_at")
        if not isinstance(ea, str) or not _strict_rfc3339(ea):
            failures.append(f"step {i + 1} ended_at is not a valid RFC 3339 timestamp")
        if not isinstance(step.get("status"), str) or not step.get("status"):
            failures.append(f"step {i + 1} status is not a non-empty string")
    if failures:
        return failures
    n = len(steps)
    for i, step in enumerate(steps):
        if step["seq"] != i + 1:
            failures.append(f"step seq values are not 1..{n} in order "
                            f"(index {i} carries seq {step['seq']})")
            break
    seen = set()
    for step in steps:
        rid = step["receipt_id"]
        if rid in seen:
            failures.append(f"duplicate receipt_id: {rid}")
            break
        seen.add(rid)
    root = _merkle_root_canonical([step["receipt_id"] for step in steps])
    mr = workflow.get("merkle_root")
    if not isinstance(mr, str) or mr != root:
        failures.append("merkle_root does not match the recomputed "
                        "Section 8.1 root")
    return failures


def check_merkle_vectors():
    """Regression gate for the Section 8.1 Merkle construction, locked to
    merkle-vectors.json. Returns a list of problem strings (empty = green)."""
    problems = []
    path = HERE / "merkle-vectors.json"
    if not path.exists():
        return ["merkle-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["merkle-vectors.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"merkle/{name}", v)
        if "receipt_ids" in v:
            got = _merkle_root_canonical(v["receipt_ids"])
            ok = got == v["expected_root"]
            print(f"[merkle]  {name}: {'PASS' if ok else 'FAIL'}"
                  + ("" if ok else f" (got {got})"))
            if not ok:
                problems.append(f"merkle vector {name}: expected "
                                f"{v['expected_root']}, got {got}")
        elif "leaves" in v:
            # Legacy-construction vector: recompute from the documented
            # preimages and require the historical root, never the canonical.
            leaves = [hashlib.sha256(l["preimage"].encode("utf-8")).digest()
                      for l in sorted(v["leaves"], key=lambda x: x["seq"])]
            lvl = list(leaves)
            while len(lvl) > 1:
                if len(lvl) % 2:
                    lvl.append(lvl[-1])
                lvl = [hashlib.sha256(lvl[i] + lvl[i + 1]).digest()
                       for i in range(0, len(lvl), 2)]
            got = lvl[0].hex() if lvl else hashlib.sha256(b"").hexdigest()
            ok = (got == v["expected_root"]
                  and got != v.get("must_not_equal"))
            print(f"[merkle]  {name}: {'PASS' if ok else 'FAIL'}"
                  + ("" if ok else f" (got {got})"))
            if not ok:
                problems.append(f"merkle vector {name}: legacy root mismatch "
                                f"(got {got})")
        if v.get("must_not_equal") and "receipt_ids" in v:
            if v["expected_root"] == v["must_not_equal"]:
                problems.append(f"merkle vector {name}: root must differ from "
                                f"the canonical/legacy counterpart")
        # Workflow-verdict extension: a vector may carry
        # expected_workflow_verdict ("valid" or "invalid"). Build the
        # workflow exactly as specified and require the verify_workflow()
        # checks to agree with the expected verdict. The root-recompute
        # check above STILL runs: a duplicate vector's root MUST recompute
        # to expected_root even though its workflow verdict is invalid
        # (the root matches but the workflow is rejected, which is the
        # point of the MM-1 rule).
        verdict_field = v.get("expected_workflow_verdict")
        if verdict_field is not None:
            if "receipt_ids" not in v:
                problems.append(f"merkle vector {name}: "
                                f"expected_workflow_verdict needs receipt_ids "
                                f"(no silent pass)")
                print(f"[merkle-workflow] {name}: FAIL (no receipt_ids)")
                continue
            wf = {"type": "verifiable-workflow-receipt",
                  "version": "1",
                  "workflow_id": "11111111-1111-1111-1111-111111111111",
                  "receipt_id": "22222222-2222-2222-2222-222222222222",
                  "session_id": "test-session",
                  "goal": "test workflow",
                  "status": "ok",
                  "steps": [{"seq": i + 1,
                             "tool": "test-tool",
                             "receipt_id": rid,
                             "receipt_hash": "a" * 64,
                             "started_at": "2026-01-01T00:00:00Z",
                             "ended_at": "2026-01-01T00:00:01Z",
                             "status": "ok"}
                            for i, rid in enumerate(v["receipt_ids"])],
                  "merkle_root": v["expected_root"],
                  "output_hash": "b" * 64,
                  "verify_url": "https://example.com/workflow/test"}
            wf_fails = verify_workflow(wf)
            verdict = "valid" if not wf_fails else "invalid"
            ok = verdict == verdict_field
            if ok and verdict == "invalid":
                rb = v.get("rejected_by")
                if not (isinstance(rb, str)
                        and any(rb in f for f in wf_fails)):
                    ok = False
            print(f"[merkle-workflow] {name}: {'PASS' if ok else 'FAIL'}"
                  + ("" if ok else f" (verdict {verdict})"))
            if not ok:
                problems.append(f"merkle vector {name}: expected workflow "
                                f"verdict {verdict_field}, got {verdict}")
    return problems


def verify_chain(timeline):
    """Section 7 chain mechanics. Returns failure reasons; [] = valid.

    Pinned construction, implemented exactly: entry digest = SHA-256 over
    the raw bytes obtained by base64-decoding the entry's canonical_bytes
    member (strict decode, fail closed on bad base64); entry 0's
    prev_digest MUST be exactly 64 zero characters; each later entry's
    prev_digest MUST be a string equal to the lowercase hex digest of the
    previous entry (mismatch names the entry index); the LAST entry MUST
    carry close: true (boolean true), anything else is a failure (this is
    the suffix-truncation kill); an empty timeline is a failure.

    Chain mechanics only: entries are NOT required to be full valid
    receipts here. Per-entry receipt verification (schema, hashes) is the
    caller's job, not this function's.
    """
    if not isinstance(timeline, list) or not timeline:
        return ["timeline is not a non-empty list"]
    failures = []
    prev = None
    for i, entry in enumerate(timeline):
        if not isinstance(entry, dict):
            failures.append(f"entry {i} is not an object")
            break
        cb = entry.get("canonical_bytes")
        if not isinstance(cb, str) or not B64_RE.match(cb):
            failures.append(f"entry {i} canonical_bytes is not valid base64")
            break
        try:
            raw = base64.b64decode(cb, validate=True)
        except (binascii.Error, ValueError):
            failures.append(f"entry {i} canonical_bytes is not valid base64")
            break
        digest = hashlib.sha256(raw).hexdigest()
        pd = entry.get("prev_digest")
        if i == 0:
            if not isinstance(pd, str) or pd != "0" * 64:
                failures.append("entry 0 prev_digest is not 64 zero characters")
        elif not isinstance(pd, str) or pd != prev:
            failures.append(f"entry {i} prev_digest does not match the digest "
                            f"of entry {i - 1}")
        prev = digest
    # The suffix-truncation kill: the chain is not closed without it.
    last = timeline[-1]
    if isinstance(last, dict) and last.get("close") is not True:
        failures.append("last entry does not carry close: true")
    return failures


def chain_entry_digest_v07(entry):
    """Section 7 (-07) entry digest. Returns lowercase hex SHA-256.

    digest_i = SHA-256 over the UTF-8 bytes of the canonical JSON object
    {prev_digest, seq, job_id, close, id, tool, provenance_class,
    output_hash} with keys sorted by Unicode code point and no
    whitespace, where output_hash = lowercase hex SHA-256 of the
    base64-decoded canonical_bytes. A missing close member digests as
    false. Raises ValueError on bad base64 (fail closed).
    """
    raw = base64.b64decode(entry["canonical_bytes"], validate=True)
    output_hash = hashlib.sha256(raw).hexdigest()
    seq = entry["seq"]
    if isinstance(seq, float) and seq.is_integer():
        seq = int(seq)
    payload = {
        "prev_digest": entry["prev_digest"],
        "seq": seq,
        "job_id": entry["job_id"],
        "close": entry.get("close", False),
        "id": entry["id"],
        "tool": entry["tool"],
        "provenance_class": entry["provenance_class"],
        "output_hash": output_hash,
    }
    blob = json.dumps(payload, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def verify_chain_v07(timeline):
    """Section 7 chain mechanics, -07 hardened construction. Returns
    failure reasons; [] = valid.

    Hardened construction, implemented exactly: the entry digest binds
    prev_digest, seq, job_id, close, id, tool, provenance_class, and
    output_hash (SHA-256 hex of the base64-decoded canonical_bytes), so
    relabeling an entry's metadata, moving close:true, or splicing
    entries across jobs breaks the links. Entry 0's prev_digest MUST be
    exactly 64 zero characters AND seq MUST be 1; seq MUST be contiguous
    from 1; every entry MUST carry the same job_id; close MUST be a
    boolean and MUST be true only on the last entry; each entry's
    prev_digest MUST equal the recomputed digest of the previous entry;
    canonical_bytes MUST be strict-valid base64 (fail closed).

    Honest limit, stated not hidden: a prefix or suffix of a valid chain
    re-linked end to end IS a valid chain, so truncation of either end by
    an attacker who rebuilds the links is NOT detectable by chain
    mechanics alone. Truncation resistance needs an anchored endpoint
    (witness/timestamp the head, or bind the step list or count in the
    workflow manifest). Chain mechanics only: entries are NOT required
    to be full valid receipts here.
    """
    if not isinstance(timeline, list) or not timeline:
        return ["timeline is not a non-empty list"]
    failures = []
    job = None
    prev = None
    for i, entry in enumerate(timeline):
        if not isinstance(entry, dict):
            return ["entry %d is not an object" % i]
        cb = entry.get("canonical_bytes")
        if not isinstance(cb, str) or not B64_RE.match(cb):
            return ["entry %d canonical_bytes is not valid base64" % i]
        try:
            base64.b64decode(cb, validate=True)
        except (binascii.Error, ValueError):
            return ["entry %d canonical_bytes is not valid base64" % i]
        for m in ("id", "tool", "provenance_class", "job_id", "prev_digest"):
            if not isinstance(entry.get(m), str) or not entry[m]:
                return ["entry %d missing %s" % (i, m)]
        seq = entry.get("seq")
        if isinstance(seq, bool) or not (
            isinstance(seq, int)
            or (isinstance(seq, float) and seq.is_integer())
        ):
            return ["entry %d seq is not an integer" % i]
        seq = int(seq)
        if seq != i + 1:
            failures.append("entry %d seq %d breaks contiguity (expected %d)"
                            % (i, seq, i + 1))
        if job is None:
            job = entry["job_id"]
        elif entry["job_id"] != job:
            failures.append("entry %d job_id mixes jobs" % i)
        pd = entry["prev_digest"]
        if i == 0:
            if pd != "0" * 64:
                failures.append("entry 0 prev_digest is not 64 zero "
                                "characters")
        elif pd != prev:
            failures.append("entry %d prev_digest does not match the digest "
                            "of entry %d" % (i, i - 1))
        if "close" in entry and not isinstance(entry["close"], bool):
            failures.append("entry %d close is not a boolean" % i)
        elif i < len(timeline) - 1 and entry.get("close") is True:
            failures.append("entry %d carries close:true before the last "
                            "entry" % i)
        prev = chain_entry_digest_v07(entry)
    last = timeline[-1]
    if not isinstance(last, dict) or last.get("close") is not True:
        failures.append("last entry does not carry close: true")
    return failures


COMMIT_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


def verify_chain_commitment(timeline, commitment):
    """Section 7.3 (-09) external chain commitment check. Returns failure
    reasons; [] = valid.

    A chain commitment is a JSON document published OUTSIDE the chain that
    binds a timeline's identity, length, and final entry digest, so that
    truncation (or a rewritten final entry) is detectable even when the
    chain mechanics alone verify. The commitment carries exactly these
    members:

      job_id: non-empty string, MUST match the job_id of every entry
      final_entry_digest: 64 lowercase hex characters, MUST equal the
        Section 7.1 recomputed digest of the timeline's last entry
      entry_count: integer, MUST equal the number of timeline entries
      published_at: RFC 3339 timestamp with a real calendar date/time

    Fail closed: a non-object commitment, a missing or mistyped member, or
    any mismatch against the timeline fails. Additional members are
    ignored. This check verifies the commitment binds THIS timeline; it
    does not re-verify chain mechanics (that is verify_chain_v07's job).
    """
    if not isinstance(timeline, list) or not timeline:
        return ["timeline is not a non-empty list"]
    if not isinstance(commitment, dict):
        return ["commitment is not a JSON object"]
    failures = []
    job_id = commitment.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        failures.append("commitment job_id is not a non-empty string")
    digest = commitment.get("final_entry_digest")
    if not isinstance(digest, str) or not COMMIT_DIGEST_RE.match(digest):
        failures.append("commitment final_entry_digest is not 64 lowercase "
                        "hex characters")
    count = commitment.get("entry_count")
    if isinstance(count, bool) or not isinstance(count, int):
        failures.append("commitment entry_count is not an integer")
    published = commitment.get("published_at")
    if not isinstance(published, str) or not RFC3339_RE.match(published):
        failures.append("commitment published_at is not RFC 3339")
    elif not _strict_rfc3339(published):
        failures.append("commitment published_at is not a valid calendar "
                        "date/time")
    if failures:
        return failures
    # Member shapes are sound; now bind them to the timeline.
    if count != len(timeline):
        failures.append("commitment entry_count %d does not match the "
                        "timeline length %d" % (count, len(timeline)))
    for i, entry in enumerate(timeline):
        if not isinstance(entry, dict) or not isinstance(
                entry.get("job_id"), str) or not entry["job_id"]:
            failures.append("entry %d has no usable job_id" % i)
        elif entry["job_id"] != job_id:
            failures.append("entry %d job_id does not match the commitment "
                            "job_id" % i)
    try:
        want = chain_entry_digest_v07(timeline[-1])
    except (KeyError, ValueError, TypeError, binascii.Error) as e:
        failures.append("final entry digest could not be recomputed: %s" % e)
    else:
        if digest != want:
            failures.append("commitment final_entry_digest does not match "
                            "the recomputed digest of the last entry")
    return failures


def check_chain_vectors():
    """Regression gate for the Section 7 chain construction, locked to
    chain-vectors.json. Returns a list of problem strings (empty = green).
    Fail closed: missing file, empty vector list, or an unknown
    expected_verdict are problems, never silent passes."""
    problems = []
    path = HERE / "chain-vectors.json"
    if not path.exists():
        return ["chain-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["chain-vectors.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"chain/{name}", v)
        expected = v.get("expected_verdict")
        if expected not in ("valid", "invalid"):
            problems.append(f"chain vector {name}: unknown expected_verdict "
                            f"{expected!r} (no silent pass)")
            print(f"[chain]  {name}: FAIL (unknown expected_verdict)")
            continue
        # The corpus names the timeline member "timeline". Accept "entries"
        # as a fallback alias. Fail closed: neither key present yields
        # None, which verify_chain rejects, so a "valid" vector can
        # never silently pass on a missing member.
        tl = v.get("timeline")
        if tl is None:
            tl = v.get("entries")
        fails = verify_chain(tl)
        ok = (not fails) == (expected == "valid")
        print(f"[chain]  {name}: {'PASS' if ok else 'FAIL'}"
              + ("" if ok else f" ({'; '.join(fails)})"))
        if not ok:
            problems.append(f"chain vector {name}: expected {expected}, got "
                            f"{'valid' if not fails else 'invalid'}")
    return problems


def check_chain_vectors_v07():
    """Regression gate for the -07 hardened Section 7 chain construction,
    locked to chain-vectors-v07.json. Mirrors check_chain_vectors() but
    runs verify_chain_v07(). Fail closed: missing file, empty vector
    list, or an unknown expected_verdict are problems, never silent
    passes."""
    problems = []
    path = HERE / "chain-vectors-v07.json"
    if not path.exists():
        return ["chain-vectors-v07.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["chain-vectors-v07.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"chain-v07/{name}", v)
        expected = v.get("expected_verdict")
        if expected not in ("valid", "invalid"):
            problems.append(f"chain-v07 vector {name}: unknown "
                            f"expected_verdict {expected!r} (no silent pass)")
            print(f"[chain-v07] {name}: FAIL (unknown expected_verdict)")
            continue
        tl = v.get("timeline")
        if tl is None:
            tl = v.get("entries")
        fails = verify_chain_v07(tl)
        ok = (not fails) == (expected == "valid")
        print(f"[chain-v07] {name}: {'PASS' if ok else 'FAIL'}"
              + ("" if ok else f" ({'; '.join(fails)})"))
        if not ok:
            problems.append(f"chain-v07 vector {name}: expected {expected}, "
                            f"got {'valid' if not fails else 'invalid'}")
    return problems


def check_commitment_vectors():
    """Regression gate for the -09 Section 7.3 chain commitment check,
    locked to commitment-vectors.json. Each vector carries a timeline and
    a commitment; verify_chain_commitment() must accept exactly the
    "valid" ones. Fail closed: missing file, empty vector list, or an
    unknown expected_verdict are problems, never silent passes."""
    problems = []
    path = HERE / "commitment-vectors.json"
    if not path.exists():
        return ["commitment-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["commitment-vectors.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"commitment/{name}", v)
        expected = v.get("expected_verdict")
        if expected not in ("valid", "invalid"):
            problems.append(f"commitment vector {name}: unknown "
                            f"expected_verdict {expected!r} (no silent pass)")
            print(f"[commitment] {name}: FAIL (unknown expected_verdict)")
            continue
        fails = verify_chain_commitment(v.get("timeline"), v.get("commitment"))
        ok = (not fails) == (expected == "valid")
        print(f"[commitment] {name}: {'PASS' if ok else 'FAIL'}"
              + ("" if ok else f" ({'; '.join(fails)})"))
        if not ok:
            problems.append(f"commitment vector {name}: expected {expected}, "
                            f"got {'valid' if not fails else 'invalid'}")
    return problems


def check_unicode_vectors():
    """Regression gate for the Section 4 Unicode rule of draft -18,
    locked to unicode-vectors.json. Producers and verifiers MUST NOT
    apply Unicode normalization to the canonical bytes: the NFC and
    NFD forms of the same visible string are different payloads with
    different digests, and the NFD payload presented against the NFC
    commitment MUST NOT match. Fail closed: missing file, empty
    vector list, malformed base64 or hex, or an unknown expected
    outcome are problems, never silent passes."""
    problems = []
    path = HERE / "unicode-vectors.json"
    if not path.exists():
        return ["unicode-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["unicode-vectors.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"unicode/{name}", v)
        expected = v.get("expected")
        if expected not in ("match", "mismatch"):
            problems.append(f"unicode vector {name}: unknown "
                            f"expected {expected!r} (no silent pass)")
            print(f"[unicode] {name}: FAIL (unknown expected)")
            continue
        fails = []
        try:
            raw = base64.b64decode(v.get("payload_base64", ""), validate=True)
        except (binascii.Error, ValueError):
            raw = None
            fails.append("payload_base64 is not valid base64")
        if raw is not None:
            if raw.hex() != v.get("payload_utf8_hex"):
                fails.append("decoded payload bytes do not match "
                             "payload_utf8_hex")
            digest = hashlib.sha256(raw).hexdigest()
            if expected == "match" and digest != v.get("sha256"):
                fails.append("sha256(payload) does not match the "
                             "stated commitment")
            if expected == "mismatch" and digest == v.get("sha256"):
                fails.append("sha256(payload) matches a commitment it "
                             "MUST NOT match (normalization would be "
                             "required to report agreement)")
        ok = not fails
        print(f"[unicode] {name}: {'PASS' if ok else 'FAIL'}"
              + ("" if ok else f" ({'; '.join(fails)})"))
        if not ok:
            problems.append(f"unicode vector {name}: {'; '.join(fails)}")
    return problems


def evaluate_id_binding(receipt, expected_id=None, resolved_record=None):
    """Id binding evaluation, mirroring the reference verifier
    (aer1-verifier/aer1_verify.py check 10, v0.2.7).

    Returns (id_state, failures). The receipt id is a label outside
    the committed canonical payload (draft -21 Sections 6 and 13):
    with no external expectation the state is "unverified" and
    nothing fails; an expected id that differs, or a resolved record
    whose committed digest disagrees (or whose id, when present,
    differs), is a mismatch and fails.
    """
    rid = receipt.get("id") if isinstance(receipt, dict) else None
    if expected_id is None and resolved_record is None:
        return ("unverified", [])
    failures = []
    state = None
    if expected_id is not None:
        if rid != expected_id:
            failures.append(
                "id mismatch: artifact id %r does not match the "
                "externally supplied expected id %r" % (rid, expected_id))
            state = "mismatch"
        else:
            state = "verified-expected"
    if resolved_record is not None:
        rrec = resolved_record
        if isinstance(rrec, dict) and isinstance(rrec.get("receipt"), dict):
            rrec = rrec["receipt"]
        if not isinstance(rrec, dict):
            failures.append("resolved record is not a JSON object")
            state = "mismatch"
        else:
            r_digest = rrec.get("output_hash")
            r_id = rrec.get("id")
            artifact_digest = (receipt.get("output_hash")
                               if isinstance(receipt, dict) else None)
            if r_digest != artifact_digest:
                failures.append(
                    "id mismatch: resolved record digest %r disagrees "
                    "with the artifact's committed digest %r"
                    % (r_digest, artifact_digest))
                state = "mismatch"
            elif r_id is not None and r_id != rid:
                failures.append(
                    "id mismatch: resolved record carries id %r, not "
                    "the artifact's id %r" % (r_id, rid))
                state = "mismatch"
            elif not failures:
                state = "verified-resolved"
    return (state if state is not None else "unverified", failures)


def derive_id_verdict(receipt, id_state):
    """Map an id_state to the enumerated id_verdict of draft -22
    (Longcat's proposal), mirroring derive_id_verdict() in
    aer1-verify 0.2.11. An artifact with no id member at all is
    "absent"; otherwise verified-expected becomes "matched",
    verified-resolved becomes "resolved", mismatch becomes
    "mismatched", and unverified stays "unverified"."""
    if not isinstance(receipt, dict) or receipt.get("id") is None:
        return "absent"
    return {"unverified": "unverified",
            "verified-expected": "matched",
            "verified-resolved": "resolved",
            "mismatch": "mismatched"}.get(id_state, "unverified")


def check_id_binding_vectors():
    """Regression gate for the id binding rule of draft -21 (Sections
    6 and 13), locked to id-binding-vectors.json. Each vector presents
    the Section 3 fixture receipt (or its id-swapped copy) alone,
    against an externally supplied expected id, or against the record
    its claimed id resolves to; the core digest verdict, the reported
    id_state, the enumerated id_verdict of draft -22 (asserted
    wherever expected_id_state is asserted), and the overall verdict
    MUST all match the vector's expectations. Fail closed: missing
    file, empty vector list, or an unknown expected value are
    problems, never silent passes."""
    problems = []
    path = HERE / "id-binding-vectors.json"
    if not path.exists():
        return ["id-binding-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["id-binding-vectors.json contains no vectors (no silent pass)"]
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"id-binding/{name}", v)
        exp_digest = v.get("expected_digest")
        exp_state = v.get("expected_id_state")
        exp_id_verdict = v.get("expected_id_verdict")
        exp_verdict = v.get("expected_verdict")
        if (exp_digest not in ("pass", "fail")
                or exp_state not in ("unverified", "verified-expected",
                                     "verified-resolved", "mismatch")
                or exp_id_verdict not in ("absent", "unverified", "matched",
                                          "resolved", "mismatched")
                or exp_verdict not in ("pass", "fail")):
            problems.append(f"id-binding vector {name}: unknown expectation "
                            f"(digest={exp_digest!r} id_state={exp_state!r} "
                            f"id_verdict={exp_id_verdict!r} "
                            f"verdict={exp_verdict!r}) (no silent pass)")
            print(f"[id-binding] {name}: FAIL (unknown expectation)")
            continue
        receipt = v.get("receipt")
        core_fails = check(receipt)
        _is_legacy, bind_fails = check_version_and_binding(receipt)
        digest_ok = not (core_fails + bind_fails)
        id_state, id_fails = evaluate_id_binding(
            receipt, v.get("expected_id"), v.get("resolved_record"))
        id_verdict = derive_id_verdict(receipt, id_state)
        verdict_ok = digest_ok and not id_fails
        ok = (digest_ok == (exp_digest == "pass")
              and id_state == exp_state
              and id_verdict == exp_id_verdict
              and verdict_ok == (exp_verdict == "pass"))
        detail = f"id_state={id_state}, id_verdict={id_verdict}"
        if not ok:
            detail += (f" (digest {'pass' if digest_ok else 'fail'}, "
                       f"verdict {'pass' if verdict_ok else 'fail'}; "
                       f"expected digest={exp_digest} id_state={exp_state} "
                       f"id_verdict={exp_id_verdict} "
                       f"verdict={exp_verdict})")
        print(f"[id-binding] {name}: {'PASS' if ok else 'FAIL'} ({detail})")
        if not ok:
            problems.append(f"id-binding vector {name}: expected digest "
                            f"{exp_digest}, id_state {exp_state}, "
                            f"id_verdict {exp_id_verdict}, verdict "
                            f"{exp_verdict}; got digest "
                            f"{'pass' if digest_ok else 'fail'}, id_state "
                            f"{id_state}, id_verdict {id_verdict}, verdict "
                            f"{'pass' if verdict_ok else 'fail'}")
    return problems


def check_anchor_vectors():
    """Regression gate for the anchor outcome report of draft -23,
    locked to anchor-vectors.json. Each vector loads a fixture and
    pins the machine-visible report: whether an anchor is present,
    whether this verifier evaluated it, and the resulting outcome.
    The load-bearing case is anchor-not-checked: a present but
    unevaluated anchor MUST report "not checked", never the
    "rejected: unresolvable record" outcome of an evaluated anchor
    whose record could not be resolved (Skitter / a-messenger,
    2026-10-19). Fail closed: missing file, empty vector list, or an
    unknown expectation are problems, never silent passes."""
    problems = []
    path = HERE / "anchor-vectors.json"
    if not path.exists():
        return ["anchor-vectors.json is missing (no silent pass)"]
    corpus = json.loads(path.read_text(encoding="utf-8"))
    vectors = corpus.get("vectors", [])
    if not vectors:
        return ["anchor-vectors.json contains no vectors (no silent pass)"]
    outcomes = ("verified", "verification failed",
                "rejected: unresolvable record", "not checked", "absent")
    for v in vectors:
        name = v.get("name", "?")
        note_evaluated_object(f"anchor/{name}", v)
        exp_present = v.get("expected_present")
        exp_evaluated = v.get("expected_evaluated")
        exp_outcome = v.get("expected_anchor_outcome")
        evaluate = v.get("evaluate", True)
        if (not isinstance(exp_present, bool)
                or not isinstance(exp_evaluated, bool)
                or not isinstance(evaluate, bool)
                or exp_outcome not in outcomes
                or not (isinstance(v.get("file"), str)
                        or isinstance(v.get("receipt"), dict))):
            problems.append(f"anchor vector {name}: unknown expectation "
                            f"(present={exp_present!r} "
                            f"evaluated={exp_evaluated!r} "
                            f"outcome={exp_outcome!r}) (no silent pass)")
            print(f"[anchor] {name}: FAIL (unknown expectation)")
            continue
        if isinstance(v.get("receipt"), dict):
            receipt = v["receipt"]
        else:
            receipt, _duplicate = load_fixture(HERE / v["file"])
        tier_fails = check_disinterested_tier(receipt)
        report = anchor_report(receipt, tier_fails, evaluate=evaluate)
        ok = (report["present"] == exp_present
              and report["evaluated"] == exp_evaluated
              and report["outcome"] == exp_outcome)
        detail = (f"present={json.dumps(report['present'])}, "
                  f"evaluated={json.dumps(report['evaluated'])}, "
                  f"outcome={report['outcome']}")
        if not ok:
            detail += (f" (expected present={json.dumps(exp_present)} "
                       f"evaluated={json.dumps(exp_evaluated)} "
                       f"outcome={exp_outcome})")
        print(f"[anchor] {name}: {'PASS' if ok else 'FAIL'} ({detail})")
        if not ok:
            problems.append(f"anchor vector {name}: expected present "
                            f"{exp_present}, evaluated {exp_evaluated}, "
                            f"outcome {exp_outcome}; got present "
                            f"{report['present']}, evaluated "
                            f"{report['evaluated']}, outcome "
                            f"{report['outcome']}")
    return problems


def main():
    problems = []
    valid_paths = sorted((HERE / "test-vectors" / "valid").glob("*.json"))
    invalid_paths = sorted((HERE / "test-vectors" / "invalid").glob("*.json"))
    profile_invalid_paths = sorted(
        (HERE / "test-vectors" / "invalid-profile").glob("*.json"))
    anchored_paths = sorted((HERE / "test-vectors" / "anchored").glob("*.json"))
    # An empty fixture set must never silently pass: a runner that checks
    # nothing and reports OK is worse than a runner that errors.
    if not valid_paths:
        problems.append("no fixtures in test-vectors/valid (empty glob)")
    if not invalid_paths:
        problems.append("no fixtures in test-vectors/invalid (empty glob)")
    if not profile_invalid_paths:
        problems.append("no fixtures in test-vectors/invalid-profile (empty glob)")
    if not anchored_paths:
        problems.append("no fixtures in test-vectors/anchored (empty glob)")
    for path in valid_paths:
        note_evaluated_file(f"valid/{path.name}", path.read_bytes())
        receipt, duplicate = load_fixture(path)
        fails = check(receipt)
        if duplicate is not None:
            fails = fails + [f"duplicate member name: {duplicate}"]
        is_legacy, bind_fails = check_version_and_binding(receipt)
        fails = fails + bind_fails
        status = "PASS" if not fails else "FAIL"
        legacy_note = " (legacy notice)" if is_legacy and not fails else ""
        print(f"[valid]   {path.name}: {status}{legacy_note}"
              + ("" if not fails else f" ({'; '.join(fails)})"))
        if fails:
            problems.append(f"{path.name} should conform but does not")
    for path in invalid_paths:
        note_evaluated_file(f"invalid/{path.name}", path.read_bytes())
        receipt, duplicate = load_fixture(path)
        fails = check(receipt)
        if duplicate is not None:
            fails = fails + [f"duplicate member name: {duplicate}"]
        is_legacy, bind_fails = check_version_and_binding(receipt)
        # Legacy is never a rejection: a legacy receipt is valid by definition.
        rejected = bool(fails) or bool(bind_fails)
        all_reasons = fails + bind_fails
        status = "PASS" if rejected else "FAIL"
        print(f"[invalid] {path.name}: {status}"
              + (f" (rejected: {all_reasons[0]})" if rejected else " (accepted!)"))
        if not rejected:
            problems.append(f"{path.name} should be rejected but was accepted")
    # Profile boundary vectors: core-valid by design (the boundary is real),
    # but MUST fail the reference-producer profile check.
    for path in profile_invalid_paths:
        note_evaluated_file(f"invalid-profile/{path.name}",
                            path.read_bytes())
        receipt, duplicate = load_fixture(path)
        core_fails = check(receipt)
        if duplicate is not None:
            core_fails = core_fails + [f"duplicate member name: {duplicate}"]
        prof_fails = check_reference_profile(receipt)
        if core_fails:
            problems.append(
                f"{path.name} should be core-valid but fails core: "
                f"{core_fails[0]}")
            print(f"[profile-invalid] {path.name}: FAIL "
                  f"(unexpected core failure: {core_fails[0]})")
        elif not prof_fails:
            problems.append(f"{path.name} should be profile-rejected "
                            f"but was accepted")
            print(f"[profile-invalid] {path.name}: FAIL (profile accepted!)")
        else:
            print(f"[profile-invalid] {path.name}: PASS "
                  f"(core accepted, profile rejected: {prof_fails[0]})")
    for path in anchored_paths:
        note_evaluated_file(f"anchored/{path.name}", path.read_bytes())
        receipt, duplicate = load_fixture(path)
        core_fails = check(receipt)
        if duplicate is not None:
            core_fails = core_fails + [f"duplicate member name: {duplicate}"]
        tier_fails = check_disinterested_tier(receipt)
        outcome = anchor_outcome(receipt, tier_fails)
        if path.name == "anchored-valid.json":
            expected_outcome = "verified"
        elif path.name == "anchored-unresolvable-anchor.json":
            expected_outcome = "rejected: unresolvable record"
        else:
            expected_outcome = "verification failed"
        passed = not core_fails and outcome == expected_outcome
        status = "PASS" if passed else "FAIL"
        detail = ("" if not tier_fails else f" (tier: {tier_fails[0]})")
        print(f"[anchored] {path.name}: {status} (outcome: {outcome}){detail}")
        if core_fails:
            problems.append(f"{path.name} should be core-valid but fails core")
        if outcome != expected_outcome:
            problems.append(
                f"{path.name} anchor outcome is {outcome}, "
                f"expected {expected_outcome}")
    problems.extend(check_merkle_vectors())
    problems.extend(check_chain_vectors())
    problems.extend(check_chain_vectors_v07())
    problems.extend(check_commitment_vectors())
    problems.extend(check_unicode_vectors())
    problems.extend(check_id_binding_vectors())
    problems.extend(check_anchor_vectors())
    set_lines, corpus_digest = evaluated_set_lines()
    for line in set_lines:
        print(line)
    print(f"EVALUATED SET: {len(set_lines)} vectors evaluated, "
          f"corpus digest sha256:{corpus_digest}")
    print()
    if problems:
        print("CONFORMANCE FAILED:")
        for p in problems:
            print(" -", p)
        return 1
    if "--base-only" in sys.argv:
        print("CONFORMANCE OK: all vectors behave as expected.")
        return 0
    full_problems, vectors, checks, digest = full_corpus_section()
    if full_problems:
        print("CONFORMANCE FAILED:")
        for p in full_problems:
            print(" -", p)
        return 1
    print(f"CONFORMANCE OK: {vectors} vectors, {checks} checks, "
          f"sha256:{digest}")
    return 0


def full_corpus_section():
    """Kit v1.5.7 full corpus: verify every file against corpus.json
    (the published corpus record), then evaluate the workflow-root
    vectors in workflow-merkle-seq-output-v1.json. Prints one
    [workflow-root] line per vector. Returns
    (problems, vectors, checks, evaluated_set_digest)."""
    problems = []
    try:
        manifest = json.loads((HERE / "corpus.json").read_bytes())
    except OSError:
        return (["corpus.json (the published corpus record) is missing"],
                0, 0, "")
    entries = []
    vectors = checks = 0
    for f in manifest["files"]:
        name = f["path"]
        rel = name[5:] if name.startswith("base/") else name
        try:
            raw = (HERE / rel).read_bytes()
        except OSError:
            problems.append(f"corpus file missing: {name}")
            continue
        value = json.loads(raw)
        n = len(value["vectors"]) if "vectors" in value else 1
        c = n + (sum("expected_workflow_verdict" in v
                     for v in value["vectors"])
                 if name == "base/merkle-vectors.json" else 0)
        entries.append({"path": name,
                        "sha256": hashlib.sha256(raw).hexdigest(),
                        "vectors": n, "checks": c})
        vectors += n
        checks += c
    if entries != manifest["files"]:
        problems.append("evaluated files differ from corpus.json "
                        "(bytes or counts)")
    digest = hashlib.sha256(
        "".join(f'{e["path"]}\0{e["sha256"]}\n'
                for e in entries).encode()).hexdigest()
    if (vectors, checks, "sha256:" + digest) != (
            manifest["vector_count"], manifest["check_count"],
            manifest["evaluated_set_digest"]):
        problems.append("evaluated-set totals differ from corpus.json")
    if problems:
        return problems, vectors, checks, digest
    workflows = json.loads(
        (HERE / "workflow-merkle-seq-output-v1.json").read_bytes())["vectors"]
    for v in workflows:
        level = []
        ok = True
        for i, step in enumerate(v["steps"], 1):
            if step["seq"] != i:
                problems.append(f'{v["name"]}: noncontiguous sequence')
                ok = False
                break
            if v["merkle_version"] == "receipt-id-v0":
                leaf = step["receipt_id"]
            elif v["merkle_version"] == "seq-output-v1":
                output_hash = step["output_hash"].removeprefix(
                    "sha256:").lower()
                if not re.fullmatch(r"[0-9a-f]{64}", output_hash):
                    problems.append(f'{v["name"]}: invalid output hash')
                    ok = False
                    break
                leaf = f"{i}:{output_hash}"
            else:
                problems.append(
                    f'{v["name"]}: unsupported merkle_version '
                    f'{v["merkle_version"]}')
                ok = False
                break
            level.append(hashlib.sha256(leaf.encode("utf-8")).digest())
        if not ok:
            continue
        while len(level) > 1:
            if len(level) % 2:
                level.append(level[-1])
            level = [hashlib.sha256(level[i] + level[i + 1]).digest()
                     for i in range(0, len(level), 2)]
        if not level or v["expected_verdict"] != "valid" \
                or level[0].hex() != v["merkle_root"]:
            problems.append(f'{v["name"]}: root mismatch')
            continue
        print(f'[workflow-root] {v["name"]}: PASS')
    return problems, vectors, checks, digest


if __name__ == "__main__":
    sys.exit(main())