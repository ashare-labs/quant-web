// Read-only integration check against a running, isolated API.
// Usage: node scripts/verify-portfolio.mjs BASE_URL NEW_OUTPUT_DIR [EXPECTED_CONFLICT_JOB_ID...]
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyCompatibility, assertSameService } from "../src/features/portfolio/compatibility.ts";
import { validatePortfolioEvidence } from "../src/features/portfolio/evidence.ts";
import { positionRows } from "../src/features/portfolio/positions.ts";
import { loopbackUrl } from './proxy-config.mjs';

const [base, destination, ...expectedConflicts] = process.argv.slice(2);
assert(base && destination, "Provide BASE_URL and a new output directory");
const origin = loopbackUrl(base);
const out = path.resolve(destination);
await mkdir(out); // Preserve earlier evidence; require a new destination.
const expected = JSON.parse(await readFile(new URL("../contracts/portfolio.openapi.json", import.meta.url)));
const get = async suffix => {
  const response = await fetch(`${origin}/api/v1/portfolio${suffix}`, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `${suffix}: HTTP ${response.status}`);
  return response.json();
};
const save = (name, value) => writeFile(path.join(out, `${name}.json`), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const [catalogue, schema, service, jobs] = await Promise.all([get("/catalogue"), get("/openapi.json"), get("/service"), get("/jobs")]);
verifyCompatibility(catalogue, schema, service, expected);
await save("service", { catalogue, schema, service });
const report = { identity: catalogue.service_identity, compatible: true, jobs: [] };
for (const item of jobs.items) {
  const id = item.job_id;
  assert.match(id, /^m2job-[a-f0-9]{32}$/);
  const [job, manifest, logs, result] = await Promise.all([
    get(`/jobs/${id}`), get(`/jobs/${id}/manifest`), get(`/jobs/${id}/logs`),
    item.status === "succeeded" ? get(`/jobs/${id}/result`) : null,
  ]);
  assertSameService(manifest.service_identity, catalogue.service_identity);
  if (result) assertSameService(result.service_identity, catalogue.service_identity);
  assert.deepEqual(await get(`/jobs/${id}`), job, `${id}: task changed during the read; rerun in a new output directory`);
  await save(id, { job, manifest, logs, result });
  let conflict;
  try { validatePortfolioEvidence(id, job, manifest, logs, result); }
  catch (error) { conflict = error.message; }
  if (expectedConflicts.includes(id)) assert.match(conflict || "", /^PORTFOLIO_RESULT_CONFLICT/);
  else assert.equal(conflict, undefined, `${id}: unexpected evidence conflict`);
  report.jobs.push({ id, status: job.status, evidence: conflict || "verified",
    days: result?.days.length, trades: result?.trades.length,
    final_equity: result?.account.equity,
    positions: result ? positionRows(result.days) : [] });
}
assert(expectedConflicts.every(id => report.jobs.some(job => job.id === id)), "Expected conflict job was not found");
await save("verification", report);
console.log(JSON.stringify({ identity: report.identity, jobs: report.jobs.map(({ positions, ...job }) => job) }, null, 2));
