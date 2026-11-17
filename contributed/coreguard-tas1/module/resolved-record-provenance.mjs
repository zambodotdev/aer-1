#!/usr/bin/env node
/**
 * resolved-record-provenance.mjs — CG-RRP/1
 * Minimal, fail-closed provenance verification for resolved records.
 *
 * Verifies (separately from identity/digest binding) that a resolved record's
 * payload is authentically signed by a caller-pinned external trust anchor and
 * bound to the expected context. It NEVER lets the record select its trust key.
 *
 * Verdicts are separate from BOUND/MISMATCH/UNKNOWN binding semantics:
 *   VERIFIED  / PROVENANCE_VERIFIED
 *   INVALID   / PROVENANCE_MALFORMED | PROVENANCE_UNTRUSTED_ISSUER |
 *               PROVENANCE_BAD_SIGNATURE | PROVENANCE_CONTEXT_MISMATCH |
 *               PROVENANCE_NOT_YET_VALID | PROVENANCE_EXPIRED | PROVENANCE_CONFLICT
 *   UNKNOWN   / PROVENANCE_UNVERIFIABLE (fail-closed, never a pass)
 *
 * No wall-clock reads. No network access. Deterministic for given inputs.
 */

import { createPublicKey, verify as edVerify } from "node:crypto";

export const PROVENANCE_SCHEMA = "CG-RRP/1";

export const PROVENANCE_VERDICT_CODES = Object.freeze({
  PROVENANCE_VERIFIED: "PROVENANCE_VERIFIED",
  PROVENANCE_MALFORMED: "PROVENANCE_MALFORMED",
  PROVENANCE_UNTRUSTED_ISSUER: "PROVENANCE_UNTRUSTED_ISSUER",
  PROVENANCE_BAD_SIGNATURE: "PROVENANCE_BAD_SIGNATURE",
  PROVENANCE_CONTEXT_MISMATCH: "PROVENANCE_CONTEXT_MISMATCH",
  PROVENANCE_NOT_YET_VALID: "PROVENANCE_NOT_YET_VALID",
  PROVENANCE_EXPIRED: "PROVENANCE_EXPIRED",
  PROVENANCE_CONFLICT: "PROVENANCE_CONFLICT",
  PROVENANCE_UNVERIFIABLE: "PROVENANCE_UNVERIFIABLE",
});

const HEX64 = /^[0-9a-fA-F]{64}$/;
const HEX128 = /^[0-9a-fA-F]{128}$/;
const ALLOWED_ENVELOPE_KEYS = new Set(["payload", "signature"]);
const ALLOWED_PAYLOAD_KEYS = new Set(["v", "recordId", "artifactDigest", "context", "issuerKeyId", "issuedAt", "expiresAt"]);
const ALLOWED_CONTEXT_KEYS = new Set(["network", "chainId"]);

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

function res(verdict, verdictCode, reason) {
  return { verdict, verdictCode, reason };
}

function malformed(reason) { return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_MALFORMED, reason); }
function unverifiable(reason) { return res("UNKNOWN", PROVENANCE_VERDICT_CODES.PROVENANCE_UNVERIFIABLE, reason); }

function normalizeChainId(v) {
  if (typeof v === "string" && v.length > 0) return v;
  if (isSafeInt(v)) return String(v);
  return null;
}

function validateAndNormalizePayload(payload) {
  if (!isPlainObject(payload)) return { ok: false, err: malformed("payload must be a plain object") };
  for (const k of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(k)) return { ok: false, err: malformed(`unknown payload field: ${k}`) };
  }
  if (payload.v !== PROVENANCE_SCHEMA) return { ok: false, err: malformed("unsupported or missing payload version") };
  if (typeof payload.recordId !== "string" || payload.recordId.length === 0) return { ok: false, err: malformed("recordId must be a non-empty string") };
  if (typeof payload.artifactDigest !== "string" || payload.artifactDigest.length === 0) return { ok: false, err: malformed("artifactDigest must be a non-empty string") };
  if (typeof payload.issuerKeyId !== "string" || payload.issuerKeyId.length === 0) return { ok: false, err: malformed("issuerKeyId must be a non-empty string") };

  if (!isPlainObject(payload.context)) return { ok: false, err: malformed("context must be a plain object") };
  for (const k of Object.keys(payload.context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(k)) return { ok: false, err: malformed(`unknown context field: ${k}`) };
  }
  if (typeof payload.context.network !== "string" || payload.context.network.length === 0) return { ok: false, err: malformed("context.network must be a non-empty string") };
  const chainId = normalizeChainId(payload.context.chainId);
  if (chainId === null) return { ok: false, err: malformed("context.chainId must be a non-empty string or safe integer") };

  let issuedAt = null;
  let expiresAt = null;
  if ("issuedAt" in payload) {
    if (!isSafeInt(payload.issuedAt) || payload.issuedAt < 0) return { ok: false, err: malformed("issuedAt must be a non-negative safe integer") };
    issuedAt = payload.issuedAt;
  }
  if ("expiresAt" in payload) {
    if (!isSafeInt(payload.expiresAt) || payload.expiresAt < 0) return { ok: false, err: malformed("expiresAt must be a non-negative safe integer") };
    expiresAt = payload.expiresAt;
  }
  if (issuedAt !== null && expiresAt !== null && expiresAt < issuedAt) return { ok: false, err: malformed("expiresAt must be >= issuedAt") };

  const normalized = {
    v: PROVENANCE_SCHEMA,
    recordId: payload.recordId,
    artifactDigest: payload.artifactDigest,
    context: { network: payload.context.network, chainId },
    issuerKeyId: payload.issuerKeyId,
  };
  if (issuedAt !== null) normalized.issuedAt = issuedAt;
  if (expiresAt !== null) normalized.expiresAt = expiresAt;
  return { ok: true, payload: normalized, issuedAt, expiresAt };
}

function validateExpectedContext(expectedContext) {
  if (!isPlainObject(expectedContext)) return { ok: false, err: malformed("expectedContext must be a plain object") };
  const keys = Object.keys(expectedContext);
  if (keys.length !== 2 || !("network" in expectedContext) || !("chainId" in expectedContext)) {
    return { ok: false, err: malformed("expectedContext must contain exactly network and chainId") };
  }
  if (typeof expectedContext.network !== "string" || expectedContext.network.length === 0) return { ok: false, err: malformed("expectedContext.network must be a non-empty string") };
  const chainId = normalizeChainId(expectedContext.chainId);
  if (chainId === null) return { ok: false, err: malformed("expectedContext.chainId must be a non-empty string or safe integer") };
  return { ok: true, context: { network: expectedContext.network, chainId } };
}

function validateTrustAnchor(trustAnchor) {
  if (!isPlainObject(trustAnchor)) return { ok: false, err: null };
  if (typeof trustAnchor.keyId !== "string" || trustAnchor.keyId.length === 0) return { ok: false, err: null };
  if (typeof trustAnchor.publicKeyHex !== "string" || !HEX64.test(trustAnchor.publicKeyHex)) return { ok: false, err: null };
  return { ok: true, anchor: { keyId: trustAnchor.keyId, publicKeyHex: trustAnchor.publicKeyHex } };
}

function makePublicKey(anchor) {
  try {
    // Ed25519 SPKI: 12-byte prefix + 32-byte raw public key
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const raw = Buffer.from(anchor.publicKeyHex, "hex");
    if (raw.length !== 32) return null;
    return createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

export function verifyResolvedRecordProvenance(provenantRecord, trustAnchor, expectedContext, options = {}) {
  try {
    // Conflict: explicit multiple-record sets are not accepted (no selection)
    if (Array.isArray(provenantRecord) || Array.isArray(trustAnchor)) {
      return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_CONFLICT, "multiple or ambiguous provenance inputs are not accepted");
    }

    // Validate envelope
    if (!isPlainObject(provenantRecord)) return malformed("provenantRecord must be a plain object");
    for (const k of Object.keys(provenantRecord)) {
      if (!ALLOWED_ENVELOPE_KEYS.has(k)) return malformed(`unknown envelope field: ${k}`);
    }
    if (!("payload" in provenantRecord) || !("signature" in provenantRecord)) return malformed("envelope must contain payload and signature");
    if (typeof provenantRecord.signature !== "string" || !HEX128.test(provenantRecord.signature)) return malformed("signature must be 64-byte hex");

    const p = validateAndNormalizePayload(provenantRecord.payload);
    if (!p.ok) return p.err;

    const ec = validateExpectedContext(expectedContext);
    if (!ec.ok) return ec.err;

    // Trust anchor must be external and match issuerKeyId (record cannot select trust)
    const ta = validateTrustAnchor(trustAnchor);
    if (!ta.ok) return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_UNTRUSTED_ISSUER, "valid external trust anchor is required");
    if (ta.anchor.keyId !== p.payload.issuerKeyId) {
      return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_UNTRUSTED_ISSUER, "issuerKeyId does not match external trust anchor");
    }

    // Context binding
    if (p.payload.context.network !== ec.context.network || p.payload.context.chainId !== ec.context.chainId) {
      return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_CONTEXT_MISMATCH, "record context does not match expected context");
    }

    // Time window (deterministic, injected)
    if (p.issuedAt !== null || p.expiresAt !== null) {
      const now = options && Object.prototype.hasOwnProperty.call(options, "nowSeconds") ? options.nowSeconds : undefined;
      if (!isSafeInt(now) || now < 0) return malformed("nowSeconds (non-negative safe integer) is required when a time window is present");
      if (p.issuedAt !== null && now < p.issuedAt) return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_NOT_YET_VALID, "record is not yet valid");
      if (p.expiresAt !== null && now > p.expiresAt) return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_EXPIRED, "record is expired");
    }

    // Signature verification
    const pub = makePublicKey(ta.anchor);
    if (!pub) return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_UNTRUSTED_ISSUER, "trust anchor public key is invalid");

    const bytes = Buffer.from(canonicalJson(p.payload), "utf8");
    const sig = Buffer.from(provenantRecord.signature, "hex");
    let ok = false;
    try {
      ok = edVerify(null, bytes, pub, sig) === true;
    } catch {
      ok = false;
    }
    if (!ok) return res("INVALID", PROVENANCE_VERDICT_CODES.PROVENANCE_BAD_SIGNATURE, "signature does not verify against external trust anchor");

    return res("VERIFIED", PROVENANCE_VERDICT_CODES.PROVENANCE_VERIFIED, "provenance verified against external trust anchor and expected context");
  } catch (e) {
    return unverifiable(`provenance verification error: ${e && e.message ? e.message : String(e)}`);
  }
}
