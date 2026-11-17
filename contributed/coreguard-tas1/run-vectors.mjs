#!/usr/bin/env node
/**
 * run-vectors.mjs — re-runs the vendored CG-TAS/1 data vectors against the
 * vendored CG-TAS/1 module (byte-identical copies of CoreGuard commit
 * b92d4d32835dd6f79e4c4ec0d1876c5f0787f243; see PROVENANCE.md).
 *
 * Usage: node run-vectors.mjs [path-to-vectors.json]
 * Exit code 0 iff every vector's expected outcome holds.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyResolvedRecordProvenance, PROVENANCE_VERDICT_CODES } from "./module/resolved-record-provenance.mjs";
import { verifyResolvedRecordProvenanceViaAnchorSet, validateAnchorSet, resolveAnchorKey, anchorSetDigestOf } from "./module/trust-anchor-set.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(process.argv[2] ?? join(here, "vectors.json"), "utf8"));
const keysById = Object.fromEntries((doc.key_material?.keys ?? []).map((k) => [k.keyId, k]));
let pass = 0, fail = 0;
const failures = [];

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function checkFields(id, actual, expected) {
  for (const [k, v] of Object.entries(expected)) {
    if (!eq(actual[k], v)) { failures.push(`${id}: field ${k} actual=${JSON.stringify(actual[k])} expected=${JSON.stringify(v)}`); return false; }
  }
  return true;
}

for (const vec of doc.vectors) {
  let ok = false;
  try {
    if (vec.mode === "verify") {
      const { record, anchorSetText, context, options } = vec.inputs;
      const out = verifyResolvedRecordProvenanceViaAnchorSet(record, anchorSetText, context, options);
      const exp = { ...vec.expected };
      if (exp.verdictCodeNot !== undefined) {
        ok = out.verdictCode !== exp.verdictCodeNot;
        if (exp.verdictCodeInEnum) ok = ok && Object.values(PROVENANCE_VERDICT_CODES).includes(out.verdictCode);
      } else if (exp.directVerdictCode !== undefined) {
        const key = keysById[record.payload.issuerKeyId];
        const direct = verifyResolvedRecordProvenance(record, { keyId: key.keyId, publicKeyHex: key.publicKeyHex }, context, { nowSeconds: options.nowSeconds });
        const { directVerdictCode, ...viaExpected } = exp;
        ok = checkFields(vec.id, out, viaExpected) && eq(direct.verdictCode, directVerdictCode);
        if (!ok && failures[failures.length - 1]?.startsWith(vec.id) !== true) failures.push(`${vec.id}: direct parity actual=${direct.verdictCode} expected=${exp.directVerdictCode}`);
      } else {
        ok = checkFields(vec.id, out, exp);
      }
    } else if (vec.mode === "validate") {
      ok = checkFields(vec.id, validateAnchorSet(vec.inputs.anchorSet), vec.expected);
    } else if (vec.mode === "resolve") {
      const out = resolveAnchorKey(vec.inputs.anchorSet, vec.inputs.keyId, vec.inputs.nowSeconds);
      ok = checkFields(vec.id, out, vec.expected);
    } else if (vec.mode === "digest") {
      const d = anchorSetDigestOf(vec.inputs.anchorSet);
      ok = eq(d, vec.expected.digest);
      if (!ok) failures.push(`${vec.id}: digest actual=${d} expected=${vec.expected.digest}`);
    } else if (vec.mode === "determinism") {
      const { record, anchorSetText, context, options } = vec.inputs;
      const first = JSON.stringify(verifyResolvedRecordProvenanceViaAnchorSet(record, anchorSetText, context, options));
      ok = true;
      for (let i = 1; i < (vec.expected.repetitions ?? 11); i++) {
        if (JSON.stringify(verifyResolvedRecordProvenanceViaAnchorSet(record, anchorSetText, context, options)) !== first) { ok = false; failures.push(`${vec.id}: run ${i} drifted`); break; }
      }
    } else {
      failures.push(`${vec.id}: unknown mode ${vec.mode}`);
    }
  } catch (err) {
    failures.push(`${vec.id}: threw ${err.message}`);
  }
  if (ok) pass++; else fail++;
}
console.log(`CG-TAS/1 data vectors: ${pass} pass, ${fail} fail, ${doc.vectors.length} total`);
for (const f of failures) console.log("FAIL", f);
process.exit(fail === 0 ? 0 : 1);
