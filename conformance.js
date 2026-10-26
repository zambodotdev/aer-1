#!/usr/bin/env node
"use strict";
/* AER-1 conformance runner (JavaScript port of conformance.py).
 *
 * Checks every vector in test-vectors/ against the core rules of
 * AER-1 (draft-zambo-aer1-19, Sections 3-6):
 *
 *   valid/   - every file MUST conform (schema shape + hash recomputation)
 *   invalid/ - every file MUST fail at least one check, with a reason
 *
 * plus the version-agreement and provenance-binding rules of the reference
 * verifier: valid/ vectors MUST also pass binding (or carry a legacy notice
 * for pre-0.4 envelopes); invalid/ vectors MUST be rejected by the core
 * check or by binding.
 *
 * Node.js standard library only (fs, path, crypto). Exit 0 when all
 * expectations hold, 1 otherwise.
 *
 * Faithful port of conformance.py v1.3.0: strict UTF-8 decode of
 * canonical_bytes (fail closed), calendar-valid RFC 3339 timestamps
 * (shape alone is not enough), a hard error when a fixture
 * directory matches zero files instead of a silent pass, and the
 * reference-producer profile check (checkReferenceProfile) with the
 * test-vectors/invalid-profile/ boundary fixtures.
 *
 * v1.4.0 additions (faithful port of conformance.py v1.4.0): offline
 * workflow verification verifyWorkflow() (Section 8.2 steps 3-4; steps 1-2
 * need network and stay the caller's job) with the MM-1
 * no-duplicate-receipt_id rule; checkMerkleVectors() mirroring the Python
 * gate, including the optional expected_workflow_verdict / rejected_by
 * vector fields; Section 7 chain validation verifyChain() with the pinned
 * prev_digest construction and the close:true suffix-truncation kill;
 * checkChainVectors() regression gate over chain-vectors.json.
 *
 * -09 (draft) additions (faithful port of conformance.py): external
 * chain commitment verifyChainCommitment() for the Section 7.3
 * commitment artifact (job_id, final_entry_digest, entry_count,
 * published_at), with the checkCommitmentVectors() regression gate
 * over commitment-vectors.json. The -07/-08 entry-digest construction
 * is unchanged.
 *
 * v1.4.4 additions (faithful port of conformance.py v1.4.4): seq handling —
 * the integer-valued float 1.0 is accepted (it was wrongly rejected);
 * fractional floats, booleans, strings, null, and missing seq are
 * rejected; normalization no longer mutates the caller's receipt dict.
 *
 * -10 (draft) additions (faithful port of conformance.py): exact
 * Section 7.1 string escaping — U+007F (DELETE) escapes as \u007f,
 * matching the reference behavior; version-independent RFC 3339
 * created_at calendar validation; the ten new isolating vectors from
 * the aer1-perl supplementary corpus.
 *
 * -18 (draft) additions (faithful port of conformance.py): the two
 * structural rejections of Section 6. Fixtures are scanned as received
 * text by findDuplicateMemberName() because JSON.parse silently keeps
 * one value: a receipt carrying a duplicate member name in any object
 * is rejected. Leap-second timestamps (seconds value 60) are rejected
 * by validCalendarDateTime(), as this runner already did; the Python
 * runner now matches (leap-second validity cannot be checked
 * offline). New vectors: duplicate-member-name,
 * leap-second-created-at (invalid). Section 4 Unicode vectors:
 * checkUnicodeVectors() gates unicode-vectors.json (NFC form, NFD
 * form, and the NFD payload against the NFC commitment, which MUST
 * NOT match: no normalization). New valid vector optional-members-18
 * carries the optional members of Sections 3.2, 3.3, and 3.4 and MUST
 * still verify.
 *
 * -19 (kit v1.5.2): the Section 3.3 input commitment is now evaluated
 * when it is checkable. When a receipt carries input_hash AND its
 * canonical payload records an 'inputs' member, check() recomputes
 * SHA-256 over the Section 7.1 canonical JSON of that member (the
 * producer byte layout published in the README) and a mismatch fails
 * the core check, the same commitment class as an output_hash
 * mismatch. A payload with no 'inputs' member leaves the commitment
 * unevaluated, never confirmed and never a rejection. New vector:
 * input-hash-mismatch (invalid).
 *
 * -20 (kit v1.5.3): the three findings of an independent cold-build
 * verifier review (Genesis, 2026-10-15), each verified against this
 * runner and its Python twin. (1) The Section 6 metadata checks
 * (version agreement + provenance binding, enforced here since -13)
 * are now stated as core-tier rule 9 in AGENT-PROMPT.md, closing the
 * gap between the quickstart text and the reference behavior.
 * (2) The Section 3.3 member-ordering rule is pinned by two vectors:
 * input-hash-multikey-20 (valid; a three-member 'inputs' object whose
 * input_hash is the digest of the Section 7.1 canonical JSON, member
 * names in lexicographic order) and input-hash-key-order-20 (invalid;
 * the same recorded inputs carrying the digest of a different member
 * order, which MUST NOT confirm). (3) provenance-control-char
 * (invalid): a provenance_class carrying a U+0001 control character
 * in an otherwise valid, binding-consistent receipt; rejected by the
 * core class check in both runners.
 *
 * -21 (kit v1.5.4): id binding. The receipt id is a label outside the
 * committed canonical payload; the digest does not cover it, so an
 * id-swapped copy passed every offline check silently (measured
 * 2026-10-17 in the Gigawatt control run on the Section 3 fixture).
 * evaluateIdBinding() mirrors the reference verifier (aer1-verify
 * 0.2.7 check 10) and the JS commitment checker: with no external
 * expectation the id is reported id_state unverified and verification
 * is not presented as covering it; an externally supplied expected id
 * or a Section 9 resolution whose record disagrees on the committed
 * digest is a mismatch and fails. checkIdBindingVectors() gates
 * id-binding-vectors.json: five vectors over the real Section 3
 * fixture receipt (artifact alone, expected-id match, expected-id
 * mismatch on the swapped copy, resolution agreement, resolution
 * disagreement).
 *
 * -22 (kit v1.5.5): corpus and id_verdict alignment (faithful port of
 * conformance.py). (1) The core check now rejects a canonical_bytes
 * spelling that is not the canonical base64 spelling (non-canonical
 * pad bits decode byte-identically and the digest still matches;
 * Skitter's finding, already enforced by aer1-verify since 0.2.10)
 * and rejects the nil UUID as a receipt id (draft Section 3; already
 * enforced by aer1-verify since 0.2.9): new invalid vectors
 * base64-pad-bit and nil-uuid pin both in the corpus. (2) Real
 * production shapes join the valid corpus: legacy-real-2 (the schema
 * 0.3 production shape with 'timestamp' instead of created_at and
 * the tool as a bare name string alongside its tool_context object;
 * it passes under the prior legacy rules via the narrow
 * isLegacyProductionShape() gate in check()), real-1-bare (the bare
 * inner receipt of the hosted real-1 fixture), and real-04 (a
 * current-schema 0.4 receipt carrying a correct Section 3.1
 * metadata_hash). (3) id-binding-vectors.json pins the enumerated
 * id_verdict of draft -22 (Longcat's proposal) alongside id_state on
 * every vector, plus a new id-absent vector (id member removed;
 * expected_verdict fail, expected_id_verdict absent);
 * checkIdBindingVectors() asserts expected_id_verdict wherever it
 * asserts expected_id_state, via deriveIdVerdict(), mirroring
 * aer1-verify 0.2.11.
 *
 * -23 (kit v1.5.6) additions (faithful port of conformance.py):
 * anchor outcome reporting + runner parity. (1) anchorReport()
 * gives verifier responses a machine-visible per-anchor report
 * that keeps three states distinct: "absent" (no anchor member),
 * "not checked" (an anchor is present but the verifier did not
 * evaluate it), and the evaluated Section 6 step 5 outcomes. The
 * gap was proved against an independent validator on the
 * anchored-unresolvable-anchor fixture: with no "not checked"
 * state, a verifier that never attempted resolution was
 * indistinguishable from one that attempted and failed (Skitter's
 * finding, a-messenger's framing). checkAnchorVectors() gates
 * anchor-vectors.json in both runners; aer1-verify 0.2.13 reports
 * the same shape in its output (check 12). (2) Rejection-detail
 * strings are normalized across the Python and JavaScript runners:
 * values in the version-agreement and provenance-binding messages
 * render via jsonQuote() (JSON.stringify semantics, with absent
 * members rendered as null) instead of diverging from the Python
 * runner's rendering (Skitter's cross-runner diff, 2026-10-18).
 * aer-1/runner-parity.py asserts byte-identical per-vector detail
 * lines across both runners so the divergence cannot regress
 * silently.
 *
 * Post-23 queue build (2026-10-19): evaluated-set emission
 * (faithful port of conformance.py). Every run ends by printing
 * the exact set of vectors it evaluated: one [evaluated] line per
 * vector (id plus the SHA-256 of the vector's content), then a
 * corpus digest over the set, so a claimed pass can be checked as
 * a set difference against the full corpus from the run's own
 * output (trace_hound, Switchboard post #4355). Definitions match
 * the Python runner exactly: a receipt fixture digests the exact
 * file bytes; a suite vector digests the Section 7.1 canonical
 * JSON of the vector object; the corpus digest is the SHA-256 of
 * the "<id>:<content digest>" lines in vector-id order.
 * runner-parity.py compares the [evaluated] lines like every
 * other per-vector line.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HERE = __dirname;
const CORE = ["id", "receipt_schema_version", "created_at", "tool",
              "provenance_class", "canonical_bytes", "output_hash",
              "verification_status"];

// Python's re `$` also matches just before a single trailing "\n"; the
// (?:\n)? preserves that quirk exactly.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// -09 strict id profile (draft Section 3): UUID version 4 with RFC 4122
// variant bits. Used by the disinterested tier check, mirroring the
// certifier core.
const STRICT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const PROV_RE = /^(EXECUTED BY [A-Z0-9][A-Z0-9 ._-]*|OBSERVED VIA GATEWAY|LOGGED BY AGENT)$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
// Strict component parse used for calendar validation (no trailing-newline
// tolerance here: Python's datetime.fromisoformat rejects it).
const TS_PARTS_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/;

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
    switch (m) {
        case 2: return isLeapYear(y) ? 29 : 28;
        case 4: case 6: case 9: case 11: return 30;
        default: return 31;
    }
}

// Mirrors datetime.fromisoformat(s.replace("Z", "+00:00")) range checks:
// hour 0..23, minute 0..59, second 0..59 (no leap seconds), month 1..12,
// day valid for month/year (proleptic Gregorian), year >= 1, and the UTC
// offset strictly between -24h and +24h (offset minutes are NOT capped at
// 59 -- e.g. +00:99 is a valid 99-minute offset in CPython).
function validCalendarDateTime(s) {
    const t = s.replace("Z", "+00:00");
    const m = TS_PARTS_RE.exec(t);
    if (!m) return false;
    const year = +m[1], mon = +m[2], day = +m[3];
    const hh = +m[4], mi = +m[5], ss = +m[6];
    if (year < 1 || year > 9999) return false;
    if (mon < 1 || mon > 12) return false;
    if (day < 1 || day > daysInMonth(year, mon)) return false;
    if (hh > 23 || mi > 59 || ss > 59) return false;
    const off = m[8];
    if (off !== "Z") {
        const oh = +off.slice(1, 3), om = +off.slice(4, 6);
        if (oh > 23 || om > 59) return false;
        const sign = off[0] === "-" ? -1 : 1;
        const totalMinutes = sign * (oh * 60 + om);
        if (!(totalMinutes > -1440 && totalMinutes < 1440)) return false;
    }
    return true;
}

function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// Draft Section 6: a verifier MUST reject a receipt in which any
// digest-covered object, as received, contains duplicate member
// names. JSON.parse silently keeps one value, so the fixture text is
// scanned token by token before parsing: strings are decoded (escapes
// included, so "a" and "\u0061" are the same member name), and each
// object frame tracks the member names it has already seen. Returns
// the first duplicate member name, or null. Mirrors
// find_duplicate_member_name() in conformance.py.
function findDuplicateMemberName(text) {
    let i = 0;
    const n = text.length;
    const stack = []; // {obj:true, keys:Set, expectKey:bool} or {obj:false}
    function skipWs() {
        while (i < n && (text[i] === " " || text[i] === "\t" ||
                         text[i] === "\n" || text[i] === "\r")) i++;
    }
    function readString() {
        // text[i] is the opening quote; returns the decoded string.
        i++;
        let out = "";
        while (i < n) {
            const c = text[i];
            if (c === "\\") {
                const e = text[i + 1];
                if (e === "u") {
                    out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16));
                    i += 6;
                } else {
                    const map = { "\"": "\"", "\\": "\\", "/": "/",
                                  b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
                    out += (e in map) ? map[e] : e;
                    i += 2;
                }
            } else if (c === "\"") {
                i++;
                return out;
            } else {
                out += c;
                i++;
            }
        }
        return out;
    }
    while (i < n) {
        skipWs();
        if (i >= n) break;
        const c = text[i];
        const top = stack[stack.length - 1];
        if (c === "{") {
            stack.push({ obj: true, keys: new Set(), expectKey: true });
            i++;
        } else if (c === "}" || c === "]") {
            stack.pop();
            i++;
        } else if (c === "[") {
            stack.push({ obj: false });
            i++;
        } else if (c === ",") {
            if (top && top.obj) top.expectKey = true;
            i++;
        } else if (c === ":") {
            if (top && top.obj) top.expectKey = false;
            i++;
        } else if (c === "\"") {
            const s = readString();
            if (top && top.obj && top.expectKey) {
                if (top.keys.has(s)) return s;
                top.keys.add(s);
            }
        } else {
            // Number or literal: skip to the next delimiter.
            while (i < n && !",}] \t\n\r".includes(text[i])) i++;
        }
    }
    return null;
}

// Section 7.1 canonical JSON helpers for the input commitment check:
// member names sorted by Unicode code point at every object level, no
// whitespace, string escaping matched to Python json.dumps with
// ensure_ascii=True via jsonAsciiV07 (defined below; hoisted).
function compareCodePoints(a, b) {
    const aa = Array.from(a);
    const bb = Array.from(b);
    const n = Math.min(aa.length, bb.length);
    for (let i = 0; i < n; i++) {
        const d = aa[i].codePointAt(0) - bb[i].codePointAt(0);
        if (d) return d;
    }
    return aa.length - bb.length;
}

function sortKeysDeep(v) {
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    if (v !== null && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort(compareCodePoints)) {
            out[k] = sortKeysDeep(v[k]);
        }
        return out;
    }
    return v;
}

function canonicalJson(value) {
    return jsonAsciiV07(JSON.stringify(sortKeysDeep(value)));
}

// Evaluated-set registry (trace_hound, Switchboard post #4355):
// every vector a run evaluates is noted here as [vector id,
// content digest]; main() prints the set and a corpus digest over
// it at the end of the run. Mirrors EVALUATED in conformance.py.
const EVALUATED = [];

function sha256Hex(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function noteEvaluatedFile(vectorId, data) {
    // Content digest of a receipt fixture: the SHA-256 of the
    // exact file bytes the runner read.
    EVALUATED.push([vectorId, sha256Hex(data)]);
}

function noteEvaluatedObject(vectorId, value) {
    // Content digest of a suite vector: the SHA-256 of the
    // Section 7.1 canonical JSON of the vector object.
    EVALUATED.push([vectorId,
        sha256Hex(Buffer.from(canonicalJson(value), "utf8"))]);
}

function evaluatedSetLines() {
    const entries = EVALUATED.slice().sort(
        (a, b) => compareCodePoints(a[0], b[0]));
    const lines = entries.map(
        (e) => "[evaluated] " + e[0] + ": sha256:" + e[1]);
    const blob = entries.map((e) => e[0] + ":" + e[1] + "\n").join("");
    return { lines: lines,
             corpusDigest: sha256Hex(Buffer.from(blob, "utf8")) };
}

// True for the legacy production shape minted by zambo.dev at
// schema 0.3 (pinned by valid/legacy-real-2.json, a copy of the
// aer1-verifier receipt-real-2 fixture): the creation time is
// carried by 'timestamp' instead of 'created_at', and the tool is
// recorded as a bare name string alongside a 'tool_context' object
// carrying the name/version/scope strings. The gate is narrow by
// construction: created_at MUST be absent, the version MUST be a
// legacy one, and the bare tool string MUST equal the tool_context
// name. Synthetic core-shape receipts (every other vector in this
// corpus carries created_at) never meet it, so the core rules for
// tool shape and creation time are unchanged for them. A receipt in
// this shape is evaluated under the prior (legacy) rules, the same
// treatment aer1-verify gives it. Mirrors _is_legacy_production_shape()
// in conformance.py.
function isLegacyProductionShape(receipt) {
    if (!isObject(receipt)) {
        return false;
    }
    if ("created_at" in receipt) {
        return false;
    }
    if (receipt["receipt_schema_version"] !== "0.2" &&
            receipt["receipt_schema_version"] !== "0.3") {
        return false;
    }
    const ts = receipt["timestamp"];
    if (typeof ts !== "string" || !ts) {
        return false;
    }
    const tool = receipt["tool"];
    const ctx = receipt["tool_context"];
    if (typeof tool !== "string" || !tool) {
        return false;
    }
    if (!isObject(ctx)) {
        return false;
    }
    if (!["name", "version", "scope"].every(
            (k) => typeof ctx[k] === "string" && ctx[k])) {
        return false;
    }
    return ctx["name"] === tool;
}

function check(receipt) {
    // Return a list of failure reasons; empty means conformant.
    const failures = [];
    if (!isObject(receipt)) {
        return ["receipt is not a JSON object"];
    }
    const legacyProd = isLegacyProductionShape(receipt);
    let required = CORE;
    if (legacyProd) {
        required = CORE.filter((f) => f !== "created_at")
            .concat(["timestamp", "tool_context"]);
    }
    for (const field of required) {
        if (!(field in receipt)) {
            failures.push("missing required member: " + field);
        }
    }
    if (failures.length) {
        return failures;
    }
    if (typeof receipt["id"] !== "string" || !UUID_RE.test(receipt["id"])) {
        failures.push("id is not a lowercase UUID");
    } else if (receipt["id"] === NIL_UUID) {
        // Draft Section 3: the nil UUID MUST NOT be used as a receipt
        // id at any tier, and a verifier MUST reject it. (Pinned by
        // invalid/nil-uuid.json; aer1-verify has screened it since
        // 0.2.9.)
        failures.push("id is the nil UUID");
    }
    if (!isNonEmptyString(receipt["receipt_schema_version"])) {
        failures.push("receipt_schema_version is not a non-empty string");
    }
    const createdValue = legacyProd ? receipt["timestamp"] : receipt["created_at"];
    if (typeof createdValue !== "string") {
        failures.push("created_at is not a string");
    } else if (!RFC3339_RE.test(createdValue)) {
        failures.push("created_at is not RFC 3339");
    } else if (!validCalendarDateTime(createdValue)) {
        // Shape alone is not enough: "2026-02-30T09:00:00.000Z" matches the
        // RFC 3339 pattern but is not a real calendar date. Fail closed.
        failures.push("created_at is not a valid calendar date/time");
    }
    const tool = legacyProd ? receipt["tool_context"] : receipt["tool"];
    if (!isObject(tool) ||
            !["name", "version", "scope"].every(
                (k) => typeof tool[k] === "string" && tool[k])) {
        failures.push("tool is not an object with name/version/scope strings");
    }
    if (typeof receipt["provenance_class"] !== "string" ||
            !PROV_RE.test(receipt["provenance_class"])) {
        failures.push("provenance_class is not a known class");
    }
    const cb = receipt["canonical_bytes"];
    let raw = null;
    // Python's base64.b64decode(cb, validate=True) rejects anything the
    // shape regex misses only via incorrect padding, i.e. length % 4 != 0.
    if (typeof cb !== "string" || !B64_RE.test(cb) || cb.length % 4 !== 0) {
        failures.push("canonical_bytes is not valid base64");
    } else {
        raw = Buffer.from(cb, "base64");
        // Canonical spelling, not just decodability: a spelling with
        // non-canonical pad bits decodes byte-identically (and the
        // digest below still matches) but is not the canonical base64
        // spelling and MUST be rejected. (Pinned by
        // invalid/base64-pad-bit.json; aer1-verify has enforced it
        // since 0.2.10, Skitter's finding.)
        if (raw.toString("base64") !== cb) {
            failures.push("canonical_bytes is not the canonical base64 spelling");
        }
        // The commitment is over the exact UTF-8 byte sequence
        // (draft Sections 3-4). A decodable base64 payload that is not
        // valid UTF-8 (e.g. b"\xff") fails closed here.
        try {
            utf8Decoder.decode(raw);
        } catch (e) {
            failures.push("canonical_bytes is not valid UTF-8");
            raw = null;
        }
    }
    const oh = receipt["output_hash"];
    if (typeof oh !== "string" || !HASH_RE.test(oh)) {
        failures.push("output_hash is not sha256: + lowercase hex digest");
    } else if (raw !== null) {
        const want = "sha256:" + crypto.createHash("sha256").update(raw).digest("hex");
        if (oh !== want) {
            failures.push("output_hash does not match sha256(canonical_bytes)");
        }
    }
    // Optional input commitment (draft Section 3.3). The member is
    // optional and outside the core: a verifier MUST NOT require it.
    // When a receipt carries it AND its canonical payload records an
    // 'inputs' member, the layout the reference producer publishes
    // (README, optional-members-18) makes the commitment checkable:
    // the input bytes are the Section 7.1 canonical JSON serialization
    // of that member. A digest that does not match the recorded inputs
    // is a commitment failure, the same "verification failed" class as
    // an output_hash mismatch. When the payload records no 'inputs'
    // member the layout cannot be reproduced from the receipt, so the
    // member is not evaluated (Section 3.3: a verifier that cannot
    // reproduce the layout MUST NOT report the commitment as confirmed;
    // it follows that it MUST NOT reject on it either).
    const ih = receipt["input_hash"];
    if (ih !== undefined && ih !== null) {
        if (typeof ih !== "string" || !HASH_RE.test(ih)) {
            failures.push("input_hash is not sha256: + lowercase hex digest");
        } else if (raw !== null) {
            let payload = null;
            try {
                payload = JSON.parse(raw.toString("utf8"));
            } catch (e) {
                payload = null;
            }
            if (payload !== null && typeof payload === "object" &&
                    !Array.isArray(payload) && "inputs" in payload) {
                const blob = Buffer.from(canonicalJson(payload["inputs"]), "utf8");
                const want = "sha256:" + crypto.createHash("sha256").update(blob).digest("hex");
                if (ih !== want) {
                    failures.push("input_hash does not match sha256(canonical JSON of the recorded inputs)");
                }
            }
        }
    }
    if (legacyProd) {
        // Legacy production shape: verification_status is the
        // producer's own claim (receipt-real-2 carries "not_verified"
        // for a not-executed request whose commitment still verifies);
        // the core check requires the member to be present as a
        // string, not to carry a particular claim. Mirrors
        // aer1-verify, which reports the claim and never trusts it.
        if (typeof receipt["verification_status"] !== "string" ||
                !receipt["verification_status"]) {
            failures.push("verification_status is not a non-empty string");
        }
    } else if (receipt["verification_status"] !== "verified") {
        failures.push("verification_status is not verified");
    }
    return failures;
}

// Reference-producer profile check. Returns failure reasons; [] = pass.
//
// The reference producer commits to canonical payloads shaped as a JSON
// object carrying the 'inputs' member (alongside 'tool'/'outputs'). A
// receipt whose payload omits 'inputs' is still core-conformant and MUST be
// accepted by interop verifiers, but it is NOT reference-producer
// conformant. Fail closed at every decode step. Regression rule for the
// missing-inputs finding (independent review, 2026-09-27).
// Render a value for a rejection-detail string the way the Python
// runner's _json_quote() does (JSON.dumps with ensure_ascii=False),
// so per-vector detail lines are byte-identical across both runners
// (Skitter's cross-runner diff, 2026-10-18). The one place raw
// JSON.stringify diverges from JSON.dumps is an absent member:
// JSON.stringify(undefined) is undefined, which string-concatenation
// renders as "undefined", while Python renders None as null. Map
// undefined to "null" so both runners agree. The parity gate
// aer-1/runner-parity.py keeps the lines identical.
function jsonQuote(value) {
    return value === undefined ? "null" : JSON.stringify(value);
}

// Version agreement + provenance binding, mirroring the reference verifier
// (aer1-verifier/aer1_verify.py checks 9a/9b/9c). Returns
// { isLegacy: bool, failures: [] }. Legacy receipts (outer 0.2/0.3 with no
// inner version commitment) predate the binding fields: they pass with a
// notice, never a failure.
function checkVersionAndBinding(receipt) {
    let innerObj = null;
    let innerVersion = null;
    try {
        const raw = Buffer.from(receipt["canonical_bytes"] || "", "base64");
        innerObj = JSON.parse(raw.toString("utf8"));
    } catch (e) {
        innerObj = null;
    }
    if (isObject(innerObj)) {
        innerVersion = innerObj["receipt_schema_version"];
    } else {
        innerObj = null;
    }
    const outerVersion = receipt["receipt_schema_version"];
    const legacyVersion = innerVersion !== null && innerVersion !== undefined
        ? innerVersion : outerVersion;
    const isLegacy = legacyVersion !== null && legacyVersion !== undefined &&
        (String(legacyVersion) === "0.2" || String(legacyVersion) === "0.3");
    if (isLegacy) {
        return { isLegacy: true, failures: [] };
    }
    const failures = [];
    // 9a. Version agreement.
    if (innerVersion !== null && innerVersion !== undefined &&
            outerVersion !== null && outerVersion !== undefined) {
        if (String(innerVersion) !== String(outerVersion)) {
            failures.push("receipt_schema_version: outer " + jsonQuote(outerVersion) +
                " does not match committed " + jsonQuote(innerVersion));
        }
    } else {
        failures.push("receipt_schema_version: one side missing (outer=" +
            jsonQuote(outerVersion) + " committed=" + jsonQuote(innerVersion) + ")");
    }
    // 9c. Provenance binding.
    if (innerObj !== null) {
        const issuerClaims = innerObj["issuer_claims"];
        const committed = isObject(issuerClaims) ? issuerClaims["provenance_class"] : null;
        const outerPc = receipt["provenance_class"];
        if (committed !== null && committed !== undefined &&
                outerPc !== null && outerPc !== undefined) {
            if (committed !== outerPc) {
                failures.push("provenance binding: outer " + jsonQuote(outerPc) +
                    " does not match committed " + jsonQuote(committed));
            }
        } else {
            failures.push("provenance binding: one side missing (outer=" +
                jsonQuote(outerPc) + " committed=" + jsonQuote(committed) +
                ")");
        }
    } else {
        failures.push("provenance binding: canonical payload did not decode to an object");
    }
    return { isLegacy: false, failures };
}

function checkReferenceProfile(receipt) {
    if (!isObject(receipt)) {
        return ["receipt is not a JSON object"];
    }
    const cb = receipt["canonical_bytes"];
    if (typeof cb !== "string") {
        return ["canonical_bytes is not a string"];
    }
    // Mirror Python's base64.b64decode(cb, validate=True): the shape regex
    // misses only incorrect padding, i.e. length % 4 !== 0.
    if (!B64_RE.test(cb) || cb.length % 4 !== 0) {
        return ["canonical_bytes is not valid base64"];
    }
    const raw = Buffer.from(cb, "base64");
    try {
        utf8Decoder.decode(raw);
    } catch (e) {
        return ["canonical_bytes is not valid UTF-8"];
    }
    let payload;
    try {
        payload = JSON.parse(raw.toString("utf8"));
    } catch (e) {
        return ["canonical payload is not JSON"];
    }
    if (!isObject(payload)) {
        return ["canonical payload is not a JSON object"];
    }
    if (!("inputs" in payload)) {
        return ["reference-producer payload omits the 'inputs' member"];
    }
    return [];
}

function checkDisinterestedTier(receipt) {
    const failures = [];
    // -09: the strict id profile applies to this tier (draft Section 3).
    const rid = isObject(receipt) ? receipt.id : null;
    if (typeof rid !== "string" || !STRICT_UUID_RE.test(rid)) {
        failures.push("id is not a UUID v4 (strict profile)");
    }
    const anchor = isObject(receipt) ? receipt.anchor : null;
    if (!isObject(anchor)) return ["anchor is not an object"];
    if (Object.keys(anchor).sort().join(",") !== "anchored_at,leaf_hash,log,proof") {
        failures.push("anchor has members other than log/leaf_hash/anchored_at/proof");
    }
    if (!isNonEmptyString(anchor.log)) failures.push("anchor.log is not a non-empty string");
    const leaf = anchor.leaf_hash;
    if (typeof leaf !== "string" || !HASH_RE.test(leaf)) {
        failures.push("anchor.leaf_hash is not sha256: + lowercase hex digest");
    } else {
        const cb = receipt.canonical_bytes;
        let raw = null;
        if (typeof cb !== "string" || !B64_RE.test(cb) || cb.length % 4 !== 0) {
            failures.push("canonical_bytes is not valid base64");
        } else {
            raw = Buffer.from(cb, "base64");
            try { utf8Decoder.decode(raw); } catch (e) {
                failures.push("canonical_bytes is not valid UTF-8 base64");
                raw = null;
            }
        }
        if (raw !== null) {
            const want = "sha256:" + crypto.createHash("sha256").update(raw).digest("hex");
            if (leaf !== want) failures.push("anchor.leaf_hash does not match canonical_bytes");
        }
    }
    const anchoredAt = anchor.anchored_at;
    if (typeof anchoredAt !== "string" || !RFC3339_RE.test(anchoredAt)) {
        failures.push("anchor.anchored_at is not RFC 3339");
    } else if (!validCalendarDateTime(anchoredAt)) {
        failures.push("anchor.anchored_at is not a valid calendar date/time");
    }
    if (!isObject(anchor.proof)) failures.push("anchor.proof is not an object");
    return failures;
}

function uriHost(uri) {
    // Host part of a URI string, lowercased, or null if there is none.
    const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]+)/.exec(uri);
    if (!m) return null;
    const host = m[1].split("@").pop().split(":")[0].toLowerCase();
    return host || null;
}

function anchorResolvable(receipt) {
    // Whether the anchor's log reference can be resolved at all.
    // Draft Section 6 step 5: an anchor whose record cannot be
    // resolved is "rejected: unresolvable record", a resource
    // outcome, never "verification failed". The corpus runs offline,
    // so resolvability is decided by construction: a log URI whose
    // host is in the RFC 2606 .invalid TLD cannot resolve, ever; any
    // other well-formed log URI stands for a resolvable log (the
    // corpus's .example logs). A missing or malformed log member is
    // a structural matter for the tier check, not a resolution
    // failure.
    const anchor = isObject(receipt) ? receipt.anchor : null;
    if (!isObject(anchor)) return true;
    if (!isNonEmptyString(anchor.log)) return true;
    const host = uriHost(anchor.log);
    if (host === null) return true;
    return !host.endsWith(".invalid");
}

function anchorOutcome(receipt, tierFails) {
    // Classify the per-anchor outcome per draft Section 6 step 5.
    // Resolution is evaluated first: an anchor that cannot be
    // resolved cannot be evaluated, whatever its stored fields say.
    // A resolvable anchor with tier failures is "verification
    // failed" (a recomputed or stored value does not match what was
    // committed); a resolvable anchor with no tier failures is
    // "verified". The receipt's own commitment check (the core
    // check) is independent of this outcome per Section 6 step 4.
    if (!anchorResolvable(receipt)) return "rejected: unresolvable record";
    if (tierFails.length) return "verification failed";
    return "verified";
}

const ANCHOR_PROFILE_MEMBERS = ["log", "leaf_hash", "anchored_at", "proof"];

function anchorProfilePresent(receipt) {
    // Whether the receipt carries the Section 3.3 anchor profile,
    // mirrors anchor_profile_present() in conformance.py. The
    // report is scoped to that profile: the anchor member must be an
    // object carrying at least one of the profile's members. An
    // "anchor" member in any other shape is a different anchoring
    // record riding the same member name (production receipts carry
    // a Nostr publication record there, with event_id / pubkey /
    // relays members) and is not this profile's anchor, so the
    // report reads "absent" for it rather than failing a profile it
    // never claimed. A partial profile anchor (some profile members,
    // the rest missing or wrong) IS present and fails the tier
    // check.
    if (!isObject(receipt) || !isObject(receipt.anchor)) return false;
    return Object.keys(receipt.anchor)
        .some((k) => ANCHOR_PROFILE_MEMBERS.includes(k));
}

function anchorReport(receipt, tierFails, evaluate = true) {
    // Machine-visible per-anchor outcome report (draft -23), mirrors
    // anchor_report() in conformance.py. A verifier response keeps
    // three anchor states distinct: "absent" (the receipt carries no
    // Section 3.3 anchor profile; see anchorProfilePresent()), "not
    // checked" (an anchor is present but this verifier did not
    // evaluate it), and the evaluated outcomes of Section 6 step 5
    // ("verified", "verification failed", "rejected: unresolvable
    // record"). The gap this closes: an independent validator,
    // exercised on the anchored-unresolvable-anchor fixture, had no
    // way to say "not checked" and so could not be distinguished
    // from a verifier that attempted resolution and failed
    // (Skitter's finding; a-messenger sharpened it into the
    // reporting rule: "not checked" is not "attempted but
    // unresolved"). Additive only: the report is a new field in
    // verifier responses; no existing verdict changes.
    if (!anchorProfilePresent(receipt)) {
        return { present: false, evaluated: false, outcome: "absent" };
    }
    if (!evaluate) {
        return { present: true, evaluated: false, outcome: "not checked" };
    }
    return { present: true, evaluated: true,
        outcome: anchorOutcome(receipt, tierFails) };
}

// Section 8.1 normative construction: leaf = SHA-256 over the UTF-8
// bytes of receipt_id; internal node = SHA-256 over raw 32-byte left ||
// raw 32-byte right; odd trailing node duplicated.
function merkleRootCanonical(receiptIds) {
    if (!receiptIds.length) {
        return crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex");
    }
    let level = receiptIds.map((rid) =>
        crypto.createHash("sha256").update(rid, "utf8").digest());
    while (level.length > 1) {
        if (level.length % 2) level.push(level[level.length - 1]);
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            next.push(crypto.createHash("sha256")
                .update(Buffer.concat([level[i], level[i + 1]])).digest());
        }
        level = next;
    }
    return level[0].toString("hex");
}

// Section 8.2 steps 3-4: offline workflow verification. Returns a list of
// failure reasons; empty means valid.
//
// Steps 1-2 (fetch each step's receipt over the network and confirm each
// receipt exists and is addressed) need network access and STAY THE
// CALLER'S JOB: this function verifies only the offline mechanics, in
// order: workflow is an object; steps is a non-empty list; every step
// carries an integer seq and a string receipt_id; seq values are exactly
// 1..n in order with no gaps and no duplicate seq; NO two steps share the
// same receipt_id value (the MM-1 rule); the workflow's merkle_root equals
// the recomputed Section 8.1 root over the ordered receipt_id strings.
function verifyWorkflow(w) {
    if (!isObject(w)) {
        return ["workflow is not a JSON object"];
    }
    const failures = [];
    // Table 2: workflow receipt members (all MUST per draft Section 8).
    if (w.type !== "verifiable-workflow-receipt") {
        failures.push('workflow type is not "verifiable-workflow-receipt"');
    }
    if (!isNonEmptyString(w.version)) {
        failures.push("workflow version is not a non-empty string");
    }
    if (typeof w.workflow_id !== "string" || !UUID_RE.test(w.workflow_id)) {
        failures.push("workflow workflow_id is not a lowercase UUID");
    }
    if (typeof w.receipt_id !== "string" || !UUID_RE.test(w.receipt_id)) {
        failures.push("workflow receipt_id is not a lowercase UUID");
    }
    if (!isNonEmptyString(w.session_id)) {
        failures.push("workflow session_id is not a non-empty string");
    }
    if (!isNonEmptyString(w.goal)) {
        failures.push("workflow goal is not a non-empty string");
    }
    if (!isNonEmptyString(w.status)) {
        failures.push("workflow status is not a non-empty string");
    }
    if (typeof w.output_hash !== "string" || !/^[0-9a-f]{64}$/.test(w.output_hash)) {
        failures.push("workflow output_hash is not a 64-char lowercase hex SHA-256 digest");
    }
    if (typeof w.verify_url !== "string" ||
            !(w.verify_url.startsWith("http://") || w.verify_url.startsWith("https://"))) {
        failures.push("workflow verify_url is not an http(s) URL string");
    }
    const steps = w.steps;
    if (!Array.isArray(steps) || !steps.length) {
        failures.push("workflow steps is not a non-empty list");
        return failures;
    }
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!isObject(step)) {
            failures.push("step " + (i + 1) + " is not an object");
            continue;
        }
        if (typeof step.seq !== "number" || !Number.isInteger(step.seq)) {
            failures.push("step " + (i + 1) + " seq is not an integer");
        }
        if (typeof step.receipt_id !== "string") {
            failures.push("step " + (i + 1) + " receipt_id is not a string");
        }
        // Table 3: workflow step members (all MUST per draft Section 8).
        if (!isNonEmptyString(step.tool)) {
            failures.push("step " + (i + 1) + " tool is not a non-empty string");
        }
        if (typeof step.receipt_hash !== "string" || !/^[0-9a-f]{64}$/.test(step.receipt_hash)) {
            failures.push("step " + (i + 1) + " receipt_hash is not a 64-char lowercase hex SHA-256 digest");
        }
        if (typeof step.started_at !== "string" || !RFC3339_RE.test(step.started_at) ||
                !validCalendarDateTime(step.started_at)) {
            failures.push("step " + (i + 1) + " started_at is not a valid RFC 3339 timestamp");
        }
        if (typeof step.ended_at !== "string" || !RFC3339_RE.test(step.ended_at) ||
                !validCalendarDateTime(step.ended_at)) {
            failures.push("step " + (i + 1) + " ended_at is not a valid RFC 3339 timestamp");
        }
        if (!isNonEmptyString(step.status)) {
            failures.push("step " + (i + 1) + " status is not a non-empty string");
        }
    }
    if (failures.length) {
        return failures;
    }
    const n = steps.length;
    for (let i = 0; i < n; i++) {
        if (steps[i].seq !== i + 1) {
            failures.push("step seq values are not 1.." + n + " in order " +
                "(index " + i + " carries seq " + steps[i].seq + ")");
            break;
        }
    }
    const seen = new Set();
    for (const step of steps) {
        const rid = step.receipt_id;
        if (seen.has(rid)) {
            failures.push("duplicate receipt_id: " + rid);
            break;
        }
        seen.add(rid);
    }
    const root = merkleRootCanonical(steps.map((s) => s.receipt_id));
    if (typeof w.merkle_root !== "string" || w.merkle_root !== root) {
        failures.push("merkle_root does not match the recomputed " +
            "Section 8.1 root");
    }
    return failures;
}

// Regression gate for the Section 8.1 Merkle construction, locked to
// merkle-vectors.json. Mirrors check_merkle_vectors() faithfully,
// including the legacy-construction vectors and the optional
// expected_workflow_verdict / rejected_by vector fields. Returns a list of
// problem strings (empty = green).
function checkMerkleVectors() {
    const problems = [];
    const p = path.join(HERE, "merkle-vectors.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["merkle-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["merkle-vectors.json contains no vectors (no silent pass)"];
    }
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("merkle/" + name, v);
        if ("receipt_ids" in v) {
            const got = merkleRootCanonical(v.receipt_ids);
            const ok = got === v.expected_root;
            console.log("[merkle]  " + name + ": " + (ok ? "PASS" : "FAIL") +
                (ok ? "" : " (got " + got + ")"));
            if (!ok) {
                problems.push("merkle vector " + name + ": expected " +
                    v.expected_root + ", got " + got);
            }
        } else if ("leaves" in v) {
            // Legacy-construction vector: recompute from the documented
            // preimages and require the historical root, never the canonical.
            let lvl = v.leaves.slice().sort((a, b) => a.seq - b.seq)
                .map((l) => crypto.createHash("sha256").update(l.preimage, "utf8").digest());
            while (lvl.length > 1) {
                if (lvl.length % 2) lvl.push(lvl[lvl.length - 1]);
                const next = [];
                for (let i = 0; i < lvl.length; i += 2) {
                    next.push(crypto.createHash("sha256")
                        .update(Buffer.concat([lvl[i], lvl[i + 1]])).digest());
                }
                lvl = next;
            }
            const got = lvl.length ? lvl[0].toString("hex")
                : crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex");
            const ok = got === v.expected_root && got !== v.must_not_equal;
            console.log("[merkle]  " + name + ": " + (ok ? "PASS" : "FAIL") +
                (ok ? "" : " (got " + got + ")"));
            if (!ok) {
                problems.push("merkle vector " + name + ": legacy root mismatch (got " + got + ")");
            }
        }
        if (v.must_not_equal && "receipt_ids" in v) {
            if (v.expected_root === v.must_not_equal) {
                problems.push("merkle vector " + name + ": root must differ from " +
                    "the canonical/legacy counterpart");
            }
        }
        // Workflow-verdict extension: a vector may carry
        // expected_workflow_verdict ("valid" or "invalid"). Build the
        // workflow exactly as specified and require the verifyWorkflow()
        // checks to agree with the expected verdict. The root-recompute
        // check above STILL runs: a duplicate vector's root MUST recompute
        // to expected_root even though its workflow verdict is invalid
        // (the root matches but the workflow is rejected, which is the
        // point of the MM-1 rule).
        const verdictField = v.expected_workflow_verdict;
        if (verdictField !== undefined && verdictField !== null) {
            if (!("receipt_ids" in v)) {
                problems.push("merkle vector " + name + ": " +
                    "expected_workflow_verdict needs receipt_ids (no silent pass)");
                console.log("[merkle-workflow] " + name + ": FAIL (no receipt_ids)");
                continue;
            }
            const wf = {
                type: "verifiable-workflow-receipt",
                version: "1",
                workflow_id: "11111111-1111-1111-1111-111111111111",
                receipt_id: "22222222-2222-2222-2222-222222222222",
                session_id: "test-session",
                goal: "test workflow",
                status: "ok",
                steps: v.receipt_ids.map((rid, i) => ({
                    seq: i + 1,
                    tool: "test-tool",
                    receipt_id: rid,
                    receipt_hash: "a".repeat(64),
                    started_at: "2026-01-01T00:00:00Z",
                    ended_at: "2026-01-01T00:00:01Z",
                    status: "ok",
                })),
                merkle_root: v.expected_root,
                output_hash: "b".repeat(64),
                verify_url: "https://example.com/workflow/test",
            };
            const wfFails = verifyWorkflow(wf);
            const verdict = wfFails.length ? "invalid" : "valid";
            let wok = verdict === verdictField;
            if (wok && verdict === "invalid") {
                const rb = v.rejected_by;
                if (!(typeof rb === "string" && wfFails.some((f) => f.includes(rb)))) {
                    wok = false;
                }
            }
            console.log("[merkle-workflow] " + name + ": " + (wok ? "PASS" : "FAIL") +
                (wok ? "" : " (verdict " + verdict + ")"));
            if (!wok) {
                problems.push("merkle vector " + name + ": expected workflow " +
                    "verdict " + verdictField + ", got " + verdict);
            }
        }
    }
    return problems;
}

// Section 7 chain mechanics. Returns failure reasons; [] = valid.
//
// Pinned construction, implemented exactly: entry digest = SHA-256 over
// the raw bytes obtained by base64-decoding the entry's canonical_bytes
// member (strict decode, fail closed on bad base64); entry 0's prev_digest
// MUST be exactly 64 zero characters; each later entry's prev_digest MUST
// be a string equal to the lowercase hex digest of the previous entry
// (mismatch names the entry index); the LAST entry MUST carry close: true
// (boolean true), anything else is a failure (this is the
// suffix-truncation kill); an empty timeline is a failure.
//
// Chain mechanics only: entries are NOT required to be full valid
// receipts here. Per-entry receipt verification (schema, hashes) is the
// caller's job, not this function's.
function verifyChain(timeline) {
    if (!Array.isArray(timeline) || !timeline.length) {
        return ["timeline is not a non-empty list"];
    }
    const failures = [];
    let prev = null;
    for (let i = 0; i < timeline.length; i++) {
        const entry = timeline[i];
        if (!isObject(entry)) {
            failures.push("entry " + i + " is not an object");
            break;
        }
        const cb = entry.canonical_bytes;
        // Strict base64 decode, fail closed. Mirrors Python's
        // base64.b64decode(cb, validate=True): the shape regex misses only
        // incorrect padding, i.e. length % 4 !== 0.
        if (typeof cb !== "string" || !B64_RE.test(cb) || cb.length % 4 !== 0) {
            failures.push("entry " + i + " canonical_bytes is not valid base64");
            break;
        }
        const raw = Buffer.from(cb, "base64");
        const digest = crypto.createHash("sha256").update(raw).digest("hex");
        const pd = entry.prev_digest;
        if (i === 0) {
            if (typeof pd !== "string" || pd !== "0".repeat(64)) {
                failures.push("entry 0 prev_digest is not 64 zero characters");
            }
        } else if (typeof pd !== "string" || pd !== prev) {
            failures.push("entry " + i + " prev_digest does not match the digest " +
                "of entry " + (i - 1));
        }
        prev = digest;
    }
    // The suffix-truncation kill: the chain is not closed without it.
    const last = timeline[timeline.length - 1];
    if (isObject(last) && last.close !== true) {
        failures.push("last entry does not carry close: true");
    }
    return failures;
}

// Regression gate for the Section 7 chain construction, locked to
// chain-vectors.json. Mirrors check_chain_vectors() faithfully. Returns a
// list of problem strings (empty = green). Fail closed: missing file,
// empty vector list, or an unknown expected_verdict are problems, never
// silent passes.
function checkChainVectors() {
    const problems = [];
    const p = path.join(HERE, "chain-vectors.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["chain-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["chain-vectors.json contains no vectors (no silent pass)"];
    }
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("chain/" + name, v);
        const expected = v.expected_verdict;
        if (expected !== "valid" && expected !== "invalid") {
            problems.push("chain vector " + name + ": unknown expected_verdict " +
                JSON.stringify(expected) + " (no silent pass)");
            console.log("[chain]  " + name + ": FAIL (unknown expected_verdict)");
            continue;
        }
        // The corpus names the timeline member "timeline". Accept "entries"
        // as a fallback alias. Fail closed: neither key present yields
        // null/undefined, which verifyChain rejects, so a "valid" vector
        // can never silently pass on a missing member.
        let tl = v.timeline;
        if (tl === undefined || tl === null) tl = v.entries;
        const fails = verifyChain(tl);
        const ok = (!fails.length) === (expected === "valid");
        console.log("[chain]  " + name + ": " + (ok ? "PASS" : "FAIL") +
            (ok ? "" : " (" + fails.join("; ") + ")"));
        if (!ok) {
            problems.push("chain vector " + name + ": expected " + expected +
                ", got " + (fails.length ? "invalid" : "valid"));
        }
    }
    return problems;
}
// -07 hardened entry digest. Returns lowercase hex SHA-256.
//
// digest_i = SHA-256 over the UTF-8 bytes of the canonical JSON object
// {prev_digest, seq, job_id, close, id, tool, provenance_class,
// output_hash} with keys sorted by Unicode code point and no whitespace,
// where output_hash = lowercase hex SHA-256 of the base64-decoded
// canonical_bytes. A missing close member digests as false. Throws on
// bad base64 (fail closed).
function jsonAsciiV07(s){return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u007F-\uD7FF\uE000-\uFFFF]/g,function(m){var o="",i;for(i=0;i<m.length;i++){o+="\\u"+m.charCodeAt(i).toString(16).padStart(4,"0")}return o})}
function chainEntryDigestV07(entry) {
    const raw = Buffer.from(entry.canonical_bytes, "base64");
    const outputHash = crypto.createHash("sha256").update(raw).digest("hex");
    // Keys inserted in sorted order; JSON.stringify emits string keys in
    // insertion order. Values are strings, integers, and booleans only.
    const payload = {
        close: entry.close === undefined ? false : entry.close,
        id: entry.id,
        job_id: entry.job_id,
        output_hash: outputHash,
        prev_digest: entry.prev_digest,
        provenance_class: entry.provenance_class,
        seq: entry.seq,
        tool: entry.tool,
    };
    const blob = Buffer.from(jsonAsciiV07(JSON.stringify(payload)), "utf8");
    return crypto.createHash("sha256").update(blob).digest("hex");
}

// Section 7 chain mechanics, -07 hardened construction. Returns failure
// reasons; [] = valid. Mirrors verify_chain_v07() in conformance.py
// exactly: the digest binds prev_digest, seq, job_id, close, id, tool,
// provenance_class, and output_hash; entry 0 needs the 64-zero genesis
// digest and seq 1; seq contiguous from 1; one job_id per chain; close is
// boolean, true only on the last entry; links must match recomputed
// digests; strict base64, fail closed. Same honest limit as the Python
// twin: truncation with re-linking needs an anchored endpoint.
function verifyChainV07(timeline) {
    if (!Array.isArray(timeline) || !timeline.length) {
        return ["timeline is not a non-empty list"];
    }
    const failures = [];
    let job = null;
    let prev = null;
    for (let i = 0; i < timeline.length; i++) {
        const entry = timeline[i];
        if (!isObject(entry)) {
            return ["entry " + i + " is not an object"];
        }
        const cb = entry.canonical_bytes;
        // Strict base64 decode, fail closed. Mirrors Python's
        // base64.b64decode(cb, validate=True) the way the -06 JS
        // verifier does: shape regex plus a length % 4 guard. No
        // re-encode round-trip: Python accepts non-canonical trailing
        // bits, so a round-trip would make JS stricter than Python.
        if (typeof cb !== "string" || !B64_RE.test(cb) || cb.length % 4 !== 0) {
            return ["entry " + i + " canonical_bytes is not valid base64"];
        }
        const raw = Buffer.from(cb, "base64");
        for (const m of ["id", "tool", "provenance_class", "job_id", "prev_digest"]) {
            if (typeof entry[m] !== "string" || !entry[m].length) {
                return ["entry " + i + " missing " + m];
            }
        }
        const seq = entry.seq;
        if (typeof seq !== "number" || !Number.isInteger(seq)) {
            return ["entry " + i + " seq is not an integer"];
        }
        if (seq !== i + 1) {
            failures.push("entry " + i + " seq " + seq +
                " breaks contiguity (expected " + (i + 1) + ")");
        }
        if (job === null) {
            job = entry.job_id;
        } else if (entry.job_id !== job) {
            failures.push("entry " + i + " job_id mixes jobs");
        }
        const pd = entry.prev_digest;
        if (i === 0) {
            if (pd !== "0".repeat(64)) {
                failures.push("entry 0 prev_digest is not 64 zero characters");
            }
        } else if (pd !== prev) {
            failures.push("entry " + i + " prev_digest does not match the digest " +
                "of entry " + (i - 1));
        }
        if ("close" in entry && typeof entry.close !== "boolean") {
            failures.push("entry " + i + " close is not a boolean");
        } else if (i < timeline.length - 1 && entry.close === true) {
            failures.push("entry " + i + " carries close:true before the last entry");
        }
        prev = chainEntryDigestV07(entry);
    }
    const last = timeline[timeline.length - 1];
    if (!isObject(last) || last.close !== true) {
        failures.push("last entry does not carry close: true");
    }
    return failures;
}

const COMMIT_DIGEST_RE = /^[0-9a-f]{64}$/;

// Section 7.3 (-09) external chain commitment check. Returns failure
// reasons; [] = valid. Mirrors verify_chain_commitment() in
// conformance.py exactly: a commitment is a JSON document published
// OUTSIDE the chain carrying job_id (non-empty string, must match every
// entry), final_entry_digest (64 lowercase hex, must equal the Section
// 7.1 recomputed digest of the last entry), entry_count (integer, must
// equal the timeline length), and published_at (RFC 3339 with a real
// calendar date/time). Fail closed on a non-object commitment, a
// missing or mistyped member, or any mismatch. Additional members are
// ignored. This check verifies the commitment binds THIS timeline; it
// does not re-verify chain mechanics (that is verifyChainV07's job).
function verifyChainCommitment(timeline, commitment) {
    if (!Array.isArray(timeline) || !timeline.length) {
        return ["timeline is not a non-empty list"];
    }
    if (!isObject(commitment)) {
        return ["commitment is not a JSON object"];
    }
    const failures = [];
    const jobId = commitment.job_id;
    if (!isNonEmptyString(jobId)) {
        failures.push("commitment job_id is not a non-empty string");
    }
    const digest = commitment.final_entry_digest;
    if (typeof digest !== "string" || !COMMIT_DIGEST_RE.test(digest)) {
        failures.push("commitment final_entry_digest is not 64 lowercase " +
            "hex characters");
    }
    const count = commitment.entry_count;
    // __float__ marker: entry_count was written as 5.0 in JSON (see vector loader).
    // JS cannot distinguish 5 from 5.0 after parse, so we mark it at load time.
    if ((count !== null && typeof count === "object" && count.__float__ !== undefined) ||
        typeof count !== "number" || !Number.isInteger(count)) {
        failures.push("commitment entry_count is not an integer");
    }
    const published = commitment.published_at;
    if (typeof published !== "string" || !RFC3339_RE.test(published)) {
        failures.push("commitment published_at is not RFC 3339");
    } else if (!validCalendarDateTime(published)) {
        failures.push("commitment published_at is not a valid calendar " +
            "date/time");
    }
    if (failures.length) return failures;
    // Member shapes are sound; now bind them to the timeline.
    if (count !== timeline.length) {
        failures.push("commitment entry_count " + count +
            " does not match the timeline length " + timeline.length);
    }
    for (let i = 0; i < timeline.length; i++) {
        const entry = timeline[i];
        if (!isObject(entry) || !isNonEmptyString(entry.job_id)) {
            failures.push("entry " + i + " has no usable job_id");
        } else if (entry.job_id !== jobId) {
            failures.push("entry " + i +
                " job_id does not match the commitment job_id");
        }
    }
    // Recompute the last entry's digest, fail closed the way
    // verifyChainV07 does (shape regex plus the length % 4 guard).
    const last = timeline[timeline.length - 1];
    let want = null;
    try {
        const cb = isObject(last) ? last.canonical_bytes : undefined;
        if (typeof cb !== "string" || !B64_RE.test(cb) || cb.length % 4 !== 0) {
            throw new Error("bad base64");
        }
        want = chainEntryDigestV07(last);
    } catch (e) {
        failures.push("final entry digest could not be recomputed: " +
            e.message);
    }
    if (want !== null && digest !== want) {
        failures.push("commitment final_entry_digest does not match the " +
            "recomputed digest of the last entry");
    }
    return failures;
}

// Regression gate for the -07 hardened Section 7 chain construction,
// locked to chain-vectors-v07.json. Mirrors check_chain_vectors_v07()
// faithfully. Fail closed: missing file, empty vector list, or an
// unknown expected_verdict are problems, never silent passes.
function checkChainVectorsV07() {
    const problems = [];
    const p = path.join(HERE, "chain-vectors-v07.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["chain-vectors-v07.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["chain-vectors-v07.json contains no vectors (no silent pass)"];
    }
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("chain-v07/" + name, v);
        const expected = v.expected_verdict;
        if (expected !== "valid" && expected !== "invalid") {
            problems.push("chain-v07 vector " + name + ": unknown expected_verdict " +
                JSON.stringify(expected) + " (no silent pass)");
            console.log("[chain-v07] " + name + ": FAIL (unknown expected_verdict)");
            continue;
        }
        let tl = v.timeline;
        if (tl === undefined || tl === null) tl = v.entries;
        const fails = verifyChainV07(tl);
        const ok = (!fails.length) === (expected === "valid");
        console.log("[chain-v07] " + name + ": " + (ok ? "PASS" : "FAIL") +
            (ok ? "" : " (" + fails.join("; ") + ")"));
        if (!ok) {
            problems.push("chain-v07 vector " + name + ": expected " + expected +
                ", got " + (fails.length ? "invalid" : "valid"));
        }
    }
    return problems;
}

// Regression gate for the -09 Section 7.3 chain commitment check,
// locked to commitment-vectors.json. Each vector carries a timeline
// and a commitment; verifyChainCommitment() must accept exactly the
// "valid" ones. Mirrors check_commitment_vectors() faithfully. Fail
// closed: missing file, empty vector list, or an unknown
// expected_verdict are problems, never silent passes.
function checkCommitmentVectors() {
    const problems = [];
    const p = path.join(HERE, "commitment-vectors.json");
    let corpus;
    let rawCorpus = null;
    try {
        const rawText = fs.readFileSync(p, "utf8");
        // The evaluated-set digest (noteEvaluatedObject below) is
        // taken over the vector object as written in the file, so
        // keep an unmarked parse beside the marked one.
        rawCorpus = JSON.parse(rawText);
        // Detect entry_count written as float (e.g. 5.0): JS JSON.parse
        // loses the int/float distinction, so mark them for rejection.
        // This mirrors Python's isinstance(count, int) check.
        const floatMarker = rawText.replace(
            /("entry_count"\s*:\s*)(\d+\.\d+)/g,
            '$1{"__float__": $2}'
        );
        corpus = JSON.parse(floatMarker);
    } catch (e) {
        return ["commitment-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["commitment-vectors.json contains no vectors (no silent pass)"];
    }
    let rawIndex = 0;
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("commitment/" + name,
            rawCorpus ? rawCorpus.vectors[rawIndex] : v);
        rawIndex++;
        const expected = v.expected_verdict;
        if (expected !== "valid" && expected !== "invalid") {
            problems.push("commitment vector " + name + ": unknown expected_verdict " +
                JSON.stringify(expected) + " (no silent pass)");
            console.log("[commitment] " + name + ": FAIL (unknown expected_verdict)");
            continue;
        }
        const fails = verifyChainCommitment(v.timeline, v.commitment);
        const ok = (!fails.length) === (expected === "valid");
        console.log("[commitment] " + name + ": " + (ok ? "PASS" : "FAIL") +
            (ok ? "" : " (" + fails.join("; ") + ")"));
        if (!ok) {
            problems.push("commitment vector " + name + ": expected " + expected +
                ", got " + (fails.length ? "invalid" : "valid"));
        }
    }
    return problems;
}

// Regression gate for the Section 4 Unicode rule of draft -18,
// locked to unicode-vectors.json. Mirrors check_unicode_vectors() in
// conformance.py: the NFC and NFD payloads must hash to their stated
// commitments, and the NFD payload presented against the NFC
// commitment MUST NOT match. Fail closed on a missing file, an empty
// vector list, malformed base64 or hex, or an unknown expected value.
function checkUnicodeVectors() {
    const problems = [];
    const p = path.join(HERE, "unicode-vectors.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["unicode-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["unicode-vectors.json contains no vectors (no silent pass)"];
    }
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("unicode/" + name, v);
        const expected = v.expected;
        if (expected !== "match" && expected !== "mismatch") {
            problems.push("unicode vector " + name + ": unknown expected " +
                JSON.stringify(expected) + " (no silent pass)");
            console.log("[unicode] " + name + ": FAIL (unknown expected)");
            continue;
        }
        const fails = [];
        let raw = null;
        const b64 = v.payload_base64 || "";
        if (!B64_RE.test(b64)) {
            fails.push("payload_base64 is not valid base64");
        } else {
            raw = Buffer.from(b64, "base64");
            // Buffer.from tolerates some malformed input; re-encoding
            // must reproduce the input exactly (strict decode).
            if (raw.toString("base64") !== b64) {
                fails.push("payload_base64 is not valid base64");
                raw = null;
            }
        }
        if (raw !== null) {
            if (raw.toString("hex") !== v.payload_utf8_hex) {
                fails.push("decoded payload bytes do not match payload_utf8_hex");
            }
            const digest = crypto.createHash("sha256").update(raw).digest("hex");
            if (expected === "match" && digest !== v.sha256) {
                fails.push("sha256(payload) does not match the stated commitment");
            }
            if (expected === "mismatch" && digest === v.sha256) {
                fails.push("sha256(payload) matches a commitment it MUST NOT " +
                    "match (normalization would be required to report agreement)");
            }
        }
        const ok = !fails.length;
        console.log("[unicode] " + name + ": " + (ok ? "PASS" : "FAIL") +
            (ok ? "" : " (" + fails.join("; ") + ")"));
        if (!ok) {
            problems.push("unicode vector " + name + ": " + fails.join("; "));
        }
    }
    return problems;
}
// Id binding evaluation, mirroring the reference verifier
// (aer1_verify.py check 10, v0.2.7). Returns {idState, failures}.
// The receipt id is a label outside the committed canonical payload
// (draft -21 Sections 6 and 13): with no external expectation the
// state is "unverified" and nothing fails; an expected id that
// differs, or a resolved record whose committed digest disagrees
// (or whose id, when present, differs), is a mismatch and fails.
function evaluateIdBinding(receipt, expectedId, resolvedRecord) {
    const rid = (receipt && typeof receipt === "object") ? receipt.id : null;
    const hasExpected = expectedId !== undefined && expectedId !== null;
    const hasResolved = resolvedRecord !== undefined && resolvedRecord !== null;
    if (!hasExpected && !hasResolved) {
        return { idState: "unverified", failures: [] };
    }
    const failures = [];
    let state = null;
    if (hasExpected) {
        if (rid !== expectedId) {
            failures.push("id mismatch: artifact id " + JSON.stringify(rid) +
                " does not match the externally supplied expected id " +
                JSON.stringify(expectedId));
            state = "mismatch";
        } else {
            state = "verified-expected";
        }
    }
    if (hasResolved) {
        let rrec = resolvedRecord;
        if (rrec && typeof rrec === "object" &&
                rrec.receipt && typeof rrec.receipt === "object") {
            rrec = rrec.receipt;
        }
        if (!rrec || typeof rrec !== "object") {
            failures.push("resolved record is not a JSON object");
            state = "mismatch";
        } else {
            const artifactDigest = (receipt && typeof receipt === "object")
                ? receipt.output_hash : null;
            if (rrec.output_hash !== artifactDigest) {
                failures.push("id mismatch: resolved record digest " +
                    JSON.stringify(rrec.output_hash) + " disagrees with " +
                    "the artifact's committed digest " +
                    JSON.stringify(artifactDigest));
                state = "mismatch";
            } else if (rrec.id !== undefined && rrec.id !== null && rrec.id !== rid) {
                failures.push("id mismatch: resolved record carries id " +
                    JSON.stringify(rrec.id) + ", not the artifact's id " +
                    JSON.stringify(rid));
                state = "mismatch";
            } else if (!failures.length) {
                state = "verified-resolved";
            }
        }
    }
    return { idState: state === null ? "unverified" : state, failures };
}

// Map an idState to the enumerated id_verdict of draft -22
// (Longcat's proposal), mirroring derive_id_verdict() in
// conformance.py and aer1-verify 0.2.11. An artifact with no id
// member at all is "absent"; otherwise verified-expected becomes
// "matched", verified-resolved becomes "resolved", mismatch becomes
// "mismatched", and unverified stays "unverified".
function deriveIdVerdict(receipt, idState) {
    if (!receipt || typeof receipt !== "object" ||
            receipt.id === undefined || receipt.id === null) {
        return "absent";
    }
    return {
        "unverified": "unverified",
        "verified-expected": "matched",
        "verified-resolved": "resolved",
        "mismatch": "mismatched",
    }[idState] || "unverified";
}

// Regression gate for the id binding rule of draft -21 (Sections 6
// and 13), locked to id-binding-vectors.json. Mirrors
// check_id_binding_vectors() in conformance.py: each vector presents
// the Section 3 fixture receipt (or its id-swapped copy) alone,
// against an externally supplied expected id, or against the record
// its claimed id resolves to; the core digest verdict, the reported
// id_state, the enumerated id_verdict of draft -22 (asserted
// wherever expected_id_state is asserted), and the overall verdict
// MUST all match. Fail closed: missing file, empty vector list, or
// an unknown expected value are problems, never silent passes.
function checkIdBindingVectors() {
    const problems = [];
    const p = path.join(HERE, "id-binding-vectors.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["id-binding-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["id-binding-vectors.json contains no vectors (no silent pass)"];
    }
    const states = ["unverified", "verified-expected", "verified-resolved", "mismatch"];
    const verdicts = ["absent", "unverified", "matched", "resolved", "mismatched"];
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("id-binding/" + name, v);
        const expDigest = v.expected_digest;
        const expState = v.expected_id_state;
        const expIdVerdict = v.expected_id_verdict;
        const expVerdict = v.expected_verdict;
        if ((expDigest !== "pass" && expDigest !== "fail") ||
                !states.includes(expState) ||
                !verdicts.includes(expIdVerdict) ||
                (expVerdict !== "pass" && expVerdict !== "fail")) {
            problems.push("id-binding vector " + name + ": unknown expectation " +
                "(digest=" + JSON.stringify(expDigest) + " id_state=" +
                JSON.stringify(expState) + " id_verdict=" +
                JSON.stringify(expIdVerdict) + " verdict=" + JSON.stringify(expVerdict) +
                ") (no silent pass)");
            console.log("[id-binding] " + name + ": FAIL (unknown expectation)");
            continue;
        }
        const receipt = v.receipt;
        const coreFails = check(receipt);
        const vb = checkVersionAndBinding(receipt);
        const digestOk = !(coreFails.length + vb.failures.length);
        const ev = evaluateIdBinding(receipt, v.expected_id, v.resolved_record);
        const idVerdict = deriveIdVerdict(receipt, ev.idState);
        const verdictOk = digestOk && !ev.failures.length;
        const ok = (digestOk === (expDigest === "pass") &&
            ev.idState === expState &&
            idVerdict === expIdVerdict &&
            verdictOk === (expVerdict === "pass"));
        let detail = "id_state=" + ev.idState + ", id_verdict=" + idVerdict;
        if (!ok) {
            detail += " (digest " + (digestOk ? "pass" : "fail") + ", verdict " +
                (verdictOk ? "pass" : "fail") + "; expected digest=" + expDigest +
                " id_state=" + expState + " id_verdict=" + expIdVerdict +
                " verdict=" + expVerdict + ")";
        }
        console.log("[id-binding] " + name + ": " + (ok ? "PASS" : "FAIL") +
            " (" + detail + ")");
        if (!ok) {
            problems.push("id-binding vector " + name + ": expected digest " +
                expDigest + ", id_state " + expState + ", id_verdict " +
                expIdVerdict + ", verdict " + expVerdict +
                "; got digest " + (digestOk ? "pass" : "fail") + ", id_state " +
                ev.idState + ", id_verdict " + idVerdict + ", verdict " +
                (verdictOk ? "pass" : "fail"));
        }
    }
    return problems;
}

// Regression gate for the anchor outcome report of draft -23, locked
// to anchor-vectors.json. Mirrors check_anchor_vectors() in
// conformance.py: each vector loads a fixture and pins the
// machine-visible report (anchor presence, whether the anchor was
// evaluated, and the resulting outcome). The load-bearing case is
// anchor-not-checked: a present but unevaluated anchor MUST report
// "not checked", never the "rejected: unresolvable record" outcome
// of an evaluated anchor whose record could not be resolved (Skitter
// / a-messenger, 2026-10-19). Fail closed: missing file, empty
// vector list, or an unknown expectation are problems, never silent
// passes.
function checkAnchorVectors() {
    const problems = [];
    const p = path.join(HERE, "anchor-vectors.json");
    let corpus;
    try {
        corpus = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
        return ["anchor-vectors.json is missing (no silent pass)"];
    }
    const vectors = corpus.vectors || [];
    if (!vectors.length) {
        return ["anchor-vectors.json contains no vectors (no silent pass)"];
    }
    const outcomes = ["verified", "verification failed",
        "rejected: unresolvable record", "not checked", "absent"];
    for (const v of vectors) {
        const name = v.name || "?";
        noteEvaluatedObject("anchor/" + name, v);
        const expPresent = v.expected_present;
        const expEvaluated = v.expected_evaluated;
        const expOutcome = v.expected_anchor_outcome;
        const evaluate = v.evaluate === undefined ? true : v.evaluate;
        if (typeof expPresent !== "boolean" ||
                typeof expEvaluated !== "boolean" ||
                typeof evaluate !== "boolean" ||
                !outcomes.includes(expOutcome) ||
                !(typeof v.file === "string" || isObject(v.receipt))) {
            problems.push("anchor vector " + name + ": unknown expectation " +
                "(present=" + JSON.stringify(expPresent) + " evaluated=" +
                JSON.stringify(expEvaluated) + " outcome=" +
                JSON.stringify(expOutcome) + ") (no silent pass)");
            console.log("[anchor] " + name + ": FAIL (unknown expectation)");
            continue;
        }
        const receipt = isObject(v.receipt) ? v.receipt : JSON.parse(
            fs.readFileSync(path.join(HERE, v.file), "utf8"));
        const tierFails = checkDisinterestedTier(receipt);
        const report = anchorReport(receipt, tierFails, evaluate);
        const ok = report.present === expPresent &&
            report.evaluated === expEvaluated &&
            report.outcome === expOutcome;
        let detail = "present=" + JSON.stringify(report.present) +
            ", evaluated=" + JSON.stringify(report.evaluated) +
            ", outcome=" + report.outcome;
        if (!ok) {
            detail += " (expected present=" + JSON.stringify(expPresent) +
                " evaluated=" + JSON.stringify(expEvaluated) +
                " outcome=" + expOutcome + ")";
        }
        console.log("[anchor] " + name + ": " + (ok ? "PASS" : "FAIL") +
            " (" + detail + ")");
        if (!ok) {
            problems.push("anchor vector " + name + ": expected present " +
                expPresent + ", evaluated " + expEvaluated + ", outcome " +
                expOutcome + "; got present " + report.present +
                ", evaluated " + report.evaluated + ", outcome " +
                report.outcome);
        }
    }
    return problems;
}

function globJson(dir) {    let names;
    try {
        names = fs.readdirSync(dir);
    } catch (e) {
        return [];
    }
    // Like Python's glob("*.json"): case-sensitive, no dotfiles.
    return names
        .filter((n) => n.endsWith(".json") && !n.startsWith("."))
        .sort()
        .map((n) => path.join(dir, n));
}

function main() {
    const problems = [];
    const validPaths = globJson(path.join(HERE, "test-vectors", "valid"));
    const invalidPaths = globJson(path.join(HERE, "test-vectors", "invalid"));
    const profileInvalidPaths = globJson(path.join(HERE, "test-vectors", "invalid-profile"));
    const anchoredPaths = globJson(path.join(HERE, "test-vectors", "anchored"));
    // An empty fixture set must never silently pass: a runner that checks
    // nothing and reports OK is worse than a runner that errors.
    if (!validPaths.length) {
        problems.push("no fixtures in test-vectors/valid (empty glob)");
    }
    if (!invalidPaths.length) {
        problems.push("no fixtures in test-vectors/invalid (empty glob)");
    }
    if (!profileInvalidPaths.length) {
        problems.push("no fixtures in test-vectors/invalid-profile (empty glob)");
    }
    if (!anchoredPaths.length) {
        problems.push("no fixtures in test-vectors/anchored (empty glob)");
    }
    for (const p of validPaths) {
        noteEvaluatedFile("valid/" + path.basename(p), fs.readFileSync(p));
        const text = fs.readFileSync(p, "utf8");
        const receipt = JSON.parse(text);
        const fails = check(receipt);
        const dupName = findDuplicateMemberName(text);
        if (dupName !== null) fails.push("duplicate member name: " + dupName);
        const vb = checkVersionAndBinding(receipt);
        const allFails = fails.concat(vb.failures);
        const name = path.basename(p);
        const status = allFails.length ? "FAIL" : "PASS";
        const legacyNote = (vb.isLegacy && !allFails.length) ? " (legacy notice)" : "";
        console.log("[valid]   " + name + ": " + status + legacyNote +
            (allFails.length ? " (" + allFails.join("; ") + ")" : ""));
        if (allFails.length) {
            problems.push(name + " should conform but does not");
        }
    }
    for (const p of invalidPaths) {
        noteEvaluatedFile("invalid/" + path.basename(p), fs.readFileSync(p));
        const text = fs.readFileSync(p, "utf8");
        const receipt = JSON.parse(text);
        const fails = check(receipt);
        const dupName = findDuplicateMemberName(text);
        if (dupName !== null) fails.push("duplicate member name: " + dupName);
        const vb = checkVersionAndBinding(receipt);
        // Legacy is never a rejection: a legacy receipt is valid by definition.
        const allFails = fails.concat(vb.failures);
        const name = path.basename(p);
        const status = allFails.length ? "PASS" : "FAIL";
        console.log("[invalid] " + name + ": " + status +
            (allFails.length ? " (rejected: " + allFails[0] + ")" : " (accepted!)"));
        if (!allFails.length) {
            problems.push(name + " should be rejected but was accepted");
        }
    }
    // Profile boundary vectors: core-valid by design (the boundary is real),
    // but MUST fail the reference-producer profile check.
    for (const p of profileInvalidPaths) {
        noteEvaluatedFile("invalid-profile/" + path.basename(p),
            fs.readFileSync(p));
        const text = fs.readFileSync(p, "utf8");
        const receipt = JSON.parse(text);
        const name = path.basename(p);
        const coreFails = check(receipt);
        const dupName = findDuplicateMemberName(text);
        if (dupName !== null) coreFails.push("duplicate member name: " + dupName);
        const profFails = checkReferenceProfile(receipt);
        if (coreFails.length) {
            problems.push(name + " should be core-valid but fails core: " + coreFails[0]);
            console.log("[profile-invalid] " + name + ": FAIL (unexpected core failure: " + coreFails[0] + ")");
        } else if (!profFails.length) {
            problems.push(name + " should be profile-rejected but was accepted");
            console.log("[profile-invalid] " + name + ": FAIL (profile accepted!)");
        } else {
            console.log("[profile-invalid] " + name + ": PASS (core accepted, profile rejected: " + profFails[0] + ")");
        }
    }
    for (const p of anchoredPaths) {
        noteEvaluatedFile("anchored/" + path.basename(p), fs.readFileSync(p));
        const text = fs.readFileSync(p, "utf8");
        const receipt = JSON.parse(text);
        const name = path.basename(p);
        const coreFails = check(receipt);
        const dupName = findDuplicateMemberName(text);
        if (dupName !== null) coreFails.push("duplicate member name: " + dupName);
        const tierFails = checkDisinterestedTier(receipt);
        const outcome = anchorOutcome(receipt, tierFails);
        let expectedOutcome;
        if (name === "anchored-valid.json") {
            expectedOutcome = "verified";
        } else if (name === "anchored-unresolvable-anchor.json") {
            expectedOutcome = "rejected: unresolvable record";
        } else {
            expectedOutcome = "verification failed";
        }
        const passed = !coreFails.length && outcome === expectedOutcome;
        console.log("[anchored] " + name + ": " + (passed ? "PASS" : "FAIL") +
            " (outcome: " + outcome + ")" +
            (tierFails.length ? " (tier: " + tierFails[0] + ")" : ""));
        if (coreFails.length) problems.push(name + " should be core-valid but fails core");
        if (outcome !== expectedOutcome) {
            problems.push(name + " anchor outcome is " + outcome +
                ", expected " + expectedOutcome);
        }
    }
    problems.push(...checkMerkleVectors());
    problems.push(...checkChainVectors());
    problems.push(...checkChainVectorsV07());
    problems.push(...checkCommitmentVectors());
    problems.push(...checkUnicodeVectors());
    problems.push(...checkIdBindingVectors());
    problems.push(...checkAnchorVectors());
    const evaluatedSet = evaluatedSetLines();
    for (const line of evaluatedSet.lines) {
        console.log(line);
    }
    console.log("EVALUATED SET: " + evaluatedSet.lines.length +
        " vectors evaluated, corpus digest sha256:" +
        evaluatedSet.corpusDigest);
    console.log();
    if (problems.length) {
        console.log("CONFORMANCE FAILED:");
        for (const pr of problems) {
            console.log(" -", pr);
        }
        return 1;
    }
    if (process.argv.includes("--base-only")) {
        console.log("CONFORMANCE OK: all vectors behave as expected.");
        return 0;
    }
    const full = fullCorpusSection();
    if (full.problems.length) {
        console.log("CONFORMANCE FAILED:");
        for (const pr of full.problems) {
            console.log(" -", pr);
        }
        return 1;
    }
    console.log("CONFORMANCE OK: " + full.vectors + " vectors, " +
        full.checks + " checks, sha256:" + full.digest);
    return 0;
}

// Kit v1.5.7 full corpus: verify every file against corpus.json (the
// published corpus record), then evaluate the workflow-root vectors in
// workflow-merkle-seq-output-v1.json. Prints one [workflow-root] line
// per vector. Returns {problems, vectors, checks, digest}.
function fullCorpusSection() {
    const problems = [];
    const hash = bytes => crypto.createHash("sha256").update(bytes).digest();
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "corpus.json")));
    } catch (e) {
        return { problems: ["corpus.json (the published corpus record) is missing"],
                 vectors: 0, checks: 0, digest: "" };
    }
    const entries = [];
    let vectors = 0, checks = 0;
    for (const f of manifest.files) {
        const rel = f.path.startsWith("base/") ? f.path.slice(5) : f.path;
        let raw;
        try {
            raw = fs.readFileSync(path.join(__dirname, rel));
        } catch (e) {
            problems.push("corpus file missing: " + f.path);
            continue;
        }
        const value = JSON.parse(raw);
        const n = Array.isArray(value.vectors) ? value.vectors.length : 1;
        const c = n + (f.path === "base/merkle-vectors.json"
            ? value.vectors.filter(v => Object.hasOwn(v, "expected_workflow_verdict")).length : 0);
        entries.push({ path: f.path, sha256: hash(raw).toString("hex"), vectors: n, checks: c });
        vectors += n;
        checks += c;
    }
    if (JSON.stringify(entries) !== JSON.stringify(manifest.files)) {
        problems.push("evaluated files differ from corpus.json (bytes or counts)");
    }
    const digest = hash(Buffer.from(entries.map(e => `${e.path}\0${e.sha256}\n`).join(""), "utf8")).toString("hex");
    if (vectors !== manifest.vector_count || checks !== manifest.check_count ||
        `sha256:${digest}` !== manifest.evaluated_set_digest) {
        problems.push("evaluated-set totals differ from corpus.json");
    }
    if (problems.length) return { problems, vectors, checks, digest };
    const workflows = JSON.parse(fs.readFileSync(
        path.join(__dirname, "workflow-merkle-seq-output-v1.json"))).vectors;
    for (const v of workflows) {
        let level = [];
        let ok = true;
        for (let i = 0; i < v.steps.length; i++) {
            const step = v.steps[i];
            if (step.seq !== i + 1) {
                problems.push(v.name + ": noncontiguous sequence");
                ok = false;
                break;
            }
            let leaf;
            if (v.merkle_version === "receipt-id-v0") {
                leaf = step.receipt_id;
            } else if (v.merkle_version === "seq-output-v1") {
                const hex = step.output_hash.replace(/^sha256:/, "").toLowerCase();
                if (!/^[0-9a-f]{64}$/.test(hex)) {
                    problems.push(v.name + ": invalid output hash");
                    ok = false;
                    break;
                }
                leaf = `${i + 1}:${hex}`;
            } else {
                problems.push(v.name + ": unsupported merkle_version " + v.merkle_version);
                ok = false;
                break;
            }
            level.push(hash(Buffer.from(leaf, "utf8")));
        }
        if (!ok) continue;
        while (level.length > 1) {
            if (level.length % 2) level.push(level.at(-1));
            level = Array.from({ length: level.length / 2 },
                (_, i) => hash(Buffer.concat([level[i * 2], level[i * 2 + 1]])));
        }
        if (!level.length || v.expected_verdict !== "valid" ||
            level[0].toString("hex") !== v.merkle_root) {
            problems.push(v.name + ": root mismatch");
            continue;
        }
        console.log(`[workflow-root] ${v.name}: PASS`);
    }
    return { problems, vectors, checks, digest };
}

process.exitCode = main();