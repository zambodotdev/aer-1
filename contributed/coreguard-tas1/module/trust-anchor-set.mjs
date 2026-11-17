#!/usr/bin/env node
/**
 * trust-anchor-set.mjs — CG-TAS/1
 * Caller-pinned trust anchor set for resolved-record provenance (CG-RRP/1).
 *
 * FROZEN v1 slice. The distribution model is decided here (spec:
 * docs/AER1-TRUST-ANCHOR-SET-SPEC-V1-DRAFT.md):
 *
 *   - The anchor set is a canonical-JSON document supplied by the CALLER
 *     (out-of-band: a repo commit, a config file, an owner-published digest).
 *     The verifier performs NO network access, NO key discovery, NO TOFU.
 *   - An optional sha256 digest pin (over the canonical bytes) binds the
 *     caller to one specific distribution; a mismatch is a hard conflict.
 *   - Rotation: every key carries an optional [notBefore, notAfter] window
 *     judged against the CALLER-INJECTED decision time (never the wall
 *     clock). Rotation = publishing a new set; per-record resolution goes
 *     strictly through the record's declared issuerKeyId.
 *   - Revocation: a revoked key fails closed forever within its set,
 *     regardless of signature validity. `revoked` is decisive;
 *     `revokedAt` is informational and never read for decisions.
 *   - The RECORD never selects or influences the set: resolution uses only
 *     the record's declared keyId, looked up in the caller-pinned set.
 *
 * Verdict axis is unchanged from CG-RRP/1 (PROVENANCE_*); set-level
 * failures map deterministically onto that axis (never a pass).
 *
 * No wall-clock reads. No network access. Deterministic for given inputs.
 */

import { createHash } from "node:crypto";
import {
  verifyResolvedRecordProvenance,
  PROVENANCE_VERDICT_CODES,
} from "./resolved-record-provenance.mjs";

export const ANCHOR_SET_SCHEMA = "CG-TAS/1";

/** Set-level failure reasons (fail-closed; carried in `reason`/`setReason`). */
export const ANCHOR_SET_REASON_CODES = Object.freeze({
  SET_NOT_TEXT_OR_OBJECT: "SET_NOT_TEXT_OR_OBJECT",
  SET_NOT_JSON: "SET_NOT_JSON",
  SET_NOT_OBJECT: "SET_NOT_OBJECT",
  UNKNOWN_SET_FIELD: "UNKNOWN_SET_FIELD",
  UNKNOWN_KEY_FIELD: "UNKNOWN_KEY_FIELD",
  BAD_SPEC: "BAD_SPEC",
  BAD_ANCHOR_SET_ID: "BAD_ANCHOR_SET_ID",
  BAD_KEYS: "BAD_KEYS",
  BAD_KEY_ENTRY: "BAD_KEY_ENTRY",
  BAD_KEY_ID: "BAD_KEY_ID",
  BAD_PUBLIC_KEY_HEX: "BAD_PUBLIC_KEY_HEX",
  BAD_WINDOW: "BAD_WINDOW",
  BAD_REVOCATION: "BAD_REVOCATION",
  BAD_GENERATED_AT: "BAD_GENERATED_AT",
  BAD_ANNOTATIONS: "BAD_ANNOTATIONS",
  DUPLICATE_KEY_ID: "DUPLICATE_KEY_ID",
  DIGEST_MISMATCH: "DIGEST_MISMATCH",
  MISSING_DECISION_TIME: "MISSING_DECISION_TIME",
  CALLER_AMBIGUOUS_INPUT: "CALLER_AMBIGUOUS_INPUT",
  UNKNOWN_KEY_ID: "UNKNOWN_KEY_ID",
  ANCHOR_REVOKED: "ANCHOR_REVOKED",
  ANCHOR_NOT_YET_VALID: "ANCHOR_NOT_YET_VALID",
  ANCHOR_EXPIRED: "ANCHOR_EXPIRED",
});

// Lowercase-only hex: the canonical form must be unique byte-for-byte so the
// digest pin is well defined (uppercase would be a second spelling of the
// same key and a second canonical form).
const HEX64_LOWER = /^[0-9a-f]{64}$/;
const ALLOWED_SET_KEYS = new Set(["spec", "anchorSetId", "keys", "generatedAt", "annotations"]);
const ALLOWED_KEY_KEYS = new Set(["keyId", "publicKeyHex", "notBefore", "notAfter", "revoked", "revokedAt"]);

function isPlainObject(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

function isSafeInt(n) {
  return typeof n === "number" && Number.isInteger(n) && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER;
}

/** Canonical bytes of a parsed anchor set (the digest-pin identity). */
export function canonicalAnchorSetJson(setObject) {
  return canonicalJson(setObject);
}

/** sha256 hex digest over the canonical bytes of a parsed anchor set. */
export function anchorSetDigestOf(setObject) {
  return createHash("sha256").update(Buffer.from(canonicalJson(setObject), "utf8")).digest("hex");
}

function failSet(verdictCode, code, detail) {
  return {
    verdict: "INVALID",
    verdictCode,
    reason: `CG-TAS/1 reason: ${code}${detail ? ` — ${detail}` : ""}`,
    setReason: code,
  };
}

/** Parse a caller-pinned anchor-set source (JSON text or parsed object). */
function parseAnchorSetSource(source) {
  if (typeof source === "string") {
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch (e) {
      return { ok: false, code: "SET_NOT_JSON", detail: e && e.message ? e.message : String(e) };
    }
    return parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
      ? { ok: false, code: "SET_NOT_OBJECT", detail: "anchor set must be a JSON object" }
      : { ok: true, set: parsed };
  }
  if (isPlainObject(source)) return { ok: true, set: source };
  return { ok: false, code: "SET_NOT_TEXT_OR_OBJECT", detail: "anchor set must be JSON text or a plain object" };
}

/** Strict shape/type validation of a parsed anchor set (fail-closed). */
export function validateAnchorSet(set) {
  if (!isPlainObject(set)) return { ok: false, code: "SET_NOT_OBJECT", detail: "anchor set must be a plain object" };
  for (const k of Object.keys(set)) {
    if (!ALLOWED_SET_KEYS.has(k)) return { ok: false, code: "UNKNOWN_SET_FIELD", detail: `unknown anchor-set field: ${k}` };
  }
  if (set.spec !== ANCHOR_SET_SCHEMA) return { ok: false, code: "BAD_SPEC", detail: `spec must be "${ANCHOR_SET_SCHEMA}"` };
  if (typeof set.anchorSetId !== "string" || set.anchorSetId.length === 0) {
    return { ok: false, code: "BAD_ANCHOR_SET_ID", detail: "anchorSetId must be a non-empty string" };
  }
  if (!Array.isArray(set.keys)) return { ok: false, code: "BAD_KEYS", detail: "keys must be an array" };
  for (const entry of set.keys) {
    if (!isPlainObject(entry)) return { ok: false, code: "BAD_KEY_ENTRY", detail: "every key entry must be a plain object" };
    for (const k of Object.keys(entry)) {
      if (!ALLOWED_KEY_KEYS.has(k)) return { ok: false, code: "UNKNOWN_KEY_FIELD", detail: `unknown key field: ${k}` };
    }
    if (typeof entry.keyId !== "string" || entry.keyId.length === 0) {
      return { ok: false, code: "BAD_KEY_ID", detail: "keyId must be a non-empty string" };
    }
    if (typeof entry.publicKeyHex !== "string" || !HEX64_LOWER.test(entry.publicKeyHex)) {
      return { ok: false, code: "BAD_PUBLIC_KEY_HEX", detail: "publicKeyHex must be 64 lowercase hex chars (32-byte Ed25519 public key)" };
    }
    if (entry.notBefore !== undefined && (!isSafeInt(entry.notBefore) || entry.notBefore < 0)) {
      return { ok: false, code: "BAD_WINDOW", detail: "notBefore must be a non-negative safe integer" };
    }
    if (entry.notAfter !== undefined && (!isSafeInt(entry.notAfter) || entry.notAfter < 0)) {
      return { ok: false, code: "BAD_WINDOW", detail: "notAfter must be a non-negative safe integer" };
    }
    if (entry.notBefore !== undefined && entry.notAfter !== undefined && entry.notAfter < entry.notBefore) {
      return { ok: false, code: "BAD_WINDOW", detail: "notAfter must be >= notBefore" };
    }
    if (entry.revoked !== undefined && typeof entry.revoked !== "boolean") {
      return { ok: false, code: "BAD_REVOCATION", detail: "revoked must be a boolean" };
    }
    if (entry.revoked === true) {
      if (!isSafeInt(entry.revokedAt) || entry.revokedAt < 0) {
        return { ok: false, code: "BAD_REVOCATION", detail: "revokedAt (non-negative safe integer) is required when revoked is true" };
      }
    } else if (entry.revokedAt !== undefined) {
      return { ok: false, code: "BAD_REVOCATION", detail: "revokedAt must be absent unless revoked is true" };
    }
  }
  if (set.generatedAt !== undefined && (!isSafeInt(set.generatedAt) || set.generatedAt < 0)) {
    return { ok: false, code: "BAD_GENERATED_AT", detail: "generatedAt must be a non-negative safe integer (informational only)" };
  }
  if (set.annotations !== undefined && !isPlainObject(set.annotations)) {
    return { ok: false, code: "BAD_ANNOTATIONS", detail: "annotations must be a plain object (non-decisional)" };
  }
  return { ok: true };
}

/**
 * Deterministic resolution of the record's declared keyId inside a validated
 * set, against the caller-injected decision time. Ambiguity and revocation
 * fail closed; window bounds are inclusive.
 */
export function resolveAnchorKey(set, keyId, decisionTime) {
  if (!Array.isArray(set.keys)) return { ok: false, code: "BAD_KEYS", detail: "keys must be an array" };
  const matches = set.keys.filter((e) => isPlainObject(e) && e.keyId === keyId);
  if (matches.length < 1) return { ok: false, code: "UNKNOWN_KEY_ID", detail: `keyId "${keyId}" is not in the caller-pinned anchor set` };
  if (matches.length !== 1) {
    return { ok: false, code: "DUPLICATE_KEY_ID", detail: `keyId "${keyId}" appears ${matches.length} times in the anchor set (ambiguous distribution)` };
  }
  const entry = matches[0];
  if (entry.revoked === true) {
    return { ok: false, code: "ANCHOR_REVOKED", detail: `keyId "${keyId}" is revoked in the caller-pinned anchor set` };
  }
  if (entry.notBefore !== undefined && decisionTime < entry.notBefore) {
    return { ok: false, code: "ANCHOR_NOT_YET_VALID", detail: `keyId "${keyId}" is not valid before notBefore=${entry.notBefore}` };
  }
  if (entry.notAfter !== undefined && decisionTime > entry.notAfter) {
    return { ok: false, code: "ANCHOR_EXPIRED", detail: `keyId "${keyId}" is not valid after notAfter=${entry.notAfter}` };
  }
  return { ok: true, key: { keyId: entry.keyId, publicKeyHex: entry.publicKeyHex } };
}

/** Map a set-level failure onto the frozen CG-RRP/1 verdict axis (never a pass). */
function mapSetFailure(code) {
  switch (code) {
    case "UNKNOWN_KEY_ID":
      return PROVENANCE_VERDICT_CODES.PROVENANCE_UNTRUSTED_ISSUER;
    case "ANCHOR_REVOKED":
      return PROVENANCE_VERDICT_CODES.PROVENANCE_UNTRUSTED_ISSUER;
    case "ANCHOR_NOT_YET_VALID":
      return PROVENANCE_VERDICT_CODES.PROVENANCE_NOT_YET_VALID;
    case "ANCHOR_EXPIRED":
      return PROVENANCE_VERDICT_CODES.PROVENANCE_EXPIRED;
    case "MISSING_DECISION_TIME":
      return PROVENANCE_VERDICT_CODES.PROVENANCE_MALFORMED;
    default:
      // Set-shape, ambiguity, digest and parse failures are trust-configuration
      // conflicts: deterministic, fail-closed, never guessed around.
      return PROVENANCE_VERDICT_CODES.PROVENANCE_CONFLICT;
  }
}

/**
 * verifyResolvedRecordProvenanceViaAnchorSet — CG-RRP/1 verification with the
 * trust anchor resolved from a caller-pinned CG-TAS/1 anchor set.
 *
 * anchorSetSource: the pinned set as JSON text or a parsed object.
 * options: { nowSeconds: safe int (REQUIRED — the decision time),
 *            anchorSetDigest?: sha256 hex pin over the canonical bytes }
 *
 * No trustAnchor option exists here by design: a caller that pins both a set
 * and a separate single anchor is ambiguous and fails closed.
 */
export function verifyResolvedRecordProvenanceViaAnchorSet(provenantRecord, anchorSetSource, expectedContext, options = {}) {
  try {
    if (options && options.trustAnchor !== undefined) {
      return failSet(PROVENANCE_VERDICT_CODES.PROVENANCE_CONFLICT, "CALLER_AMBIGUOUS_INPUT", "pin either an anchor set or a single trust anchor, never both");
    }

    // 1) The caller-pinned set must parse and satisfy the strict CG-TAS/1 shape.
    const parsedSource = parseAnchorSetSource(anchorSetSource);
    if (!parsedSource.ok) {
      return failSet(mapSetFailure(parsedSource.code), parsedSource.code, parsedSource.detail);
    }
    const set = parsedSource.set;
    const shape = validateAnchorSet(set);
    if (!shape.ok) return failSet(mapSetFailure(shape.code), shape.code, shape.detail);

    // 2) Digest pin (over canonical bytes) — binds the caller to one distribution.
    const digest = anchorSetDigestOf(set);
    const expectedDigest = options && options.anchorSetDigest !== undefined ? options.anchorSetDigest : undefined;
    if (expectedDigest !== undefined) {
      if (typeof expectedDigest !== "string" || !/^[0-9a-f]{64}$/.test(expectedDigest)) {
        return failSet(PROVENANCE_VERDICT_CODES.PROVENANCE_CONFLICT, "DIGEST_MISMATCH", "anchorSetDigest pin must be 64 lowercase hex chars");
      }
      if (expectedDigest !== digest) {
        return failSet(PROVENANCE_VERDICT_CODES.PROVENANCE_CONFLICT, "DIGEST_MISMATCH", "pinned digest does not match the canonical bytes of the presented anchor set");
      }
    }

    // 3) Decision time: the set path always requires a caller-injected time
    //    (rotation windows and revocation epochs are intrinsic to the set).
    const now = options && Object.prototype.hasOwnProperty.call(options, "nowSeconds") ? options.nowSeconds : undefined;
    if (!isSafeInt(now) || now < 0) {
      return failSet(PROVENANCE_VERDICT_CODES.PROVENANCE_MALFORMED, "MISSING_DECISION_TIME", "nowSeconds (non-negative safe integer) is required for anchor-set verification");
    }

    // 4) The record must declare a resolvable keyId — extracted defensively,
    //    full record validation stays with CG-RRP/1 below.
    if (!isPlainObject(provenantRecord) || !isPlainObject(provenantRecord.payload)) {
      return {
        verdict: "INVALID",
        verdictCode: PROVENANCE_VERDICT_CODES.PROVENANCE_MALFORMED,
        reason: "provenantRecord and payload must be plain objects",
      };
    }
    const declaredKeyId = provenantRecord.payload.issuerKeyId;
    if (typeof declaredKeyId !== "string" || declaredKeyId.length === 0) {
      return {
        verdict: "INVALID",
        verdictCode: PROVENANCE_VERDICT_CODES.PROVENANCE_MALFORMED,
        reason: "payload.issuerKeyId must be a non-empty string",
      };
    }

    // 5) Deterministic resolution inside the caller-pinned set.
    const resolved = resolveAnchorKey(set, declaredKeyId, now);
    if (!resolved.ok) return failSet(mapSetFailure(resolved.code), resolved.code, resolved.detail);

    // 6) CG-RRP/1 does the frozen per-record verification (signature, context,
    //    record time window) under the resolved external anchor.
    return verifyResolvedRecordProvenance(provenantRecord, resolved.key, expectedContext, { nowSeconds: now });
  } catch (e) {
    return {
      verdict: "UNKNOWN",
      verdictCode: PROVENANCE_VERDICT_CODES.PROVENANCE_UNVERIFIABLE,
      reason: `provenance anchor-set verification error: ${e && e.message ? e.message : String(e)}`,
    };
  }
}
