import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyCompatibility, assertSameService, operationKeyFor } from "../../src/features/portfolio/compatibility.mjs";
import { restoreOperation } from "../../src/features/portfolio/state.mjs";

const schema = JSON.parse(readFileSync(new URL("../../contracts/portfolio.openapi.json", import.meta.url)));
const fixture = () => ({
  catalogue: { contract_version: "portfolio-jobs.v1", service_identity: {
    backend_version: schema.info.version, source_sha256: "a".repeat(64), contract_version: "portfolio-jobs.v1",
  }, preflight_required: true, account_policy: "new_isolated_account_per_job",
  instrument_scope: "main_board_ordinary_a_shares", strategy_algorithms: ["equal-weight"],
  fee_models: [{ id: "fixed-commission-tax.v1" }], native_ready: false },
  schema: structuredClone(schema), service: { contract_version: "m2-job-service.v1", job_contract_version: "portfolio-jobs.v1" },
});
const check = f => verifyCompatibility(f.catalogue, f.schema, f.service, schema);
test("compatible release/source changes are accepted; actual version remains available and no contract is mutated", () => {
  for (const version of ["0.12.0.dev1", "0.12.0.dev2", "0.12.1", "0.13.0"]) {
    const f = fixture(); f.schema.info.version = version;
    f.catalogue.service_identity.backend_version = version;
    f.catalogue.service_identity.source_sha256 = "b".repeat(64);
    const before = structuredClone(f);
    check(f); assert.deepEqual(f, before);
  }
});
test("changed paths, monetary types, required acknowledgements and contract enums remain incompatible", () => {
  for (const mutate of [
    f => delete f.schema.paths["/api/v1/portfolio/preflight"],
    f => f.schema.components.schemas.PortfolioCreate.properties.initial_cash.type = "number",
    f => f.schema.components.schemas.PortfolioCreate.required = [],
    f => f.schema.components.schemas.PortfolioIdentity.properties.contract_version.const = "portfolio-jobs.v2",
    f => f.schema.components.schemas.PortfolioPosition.properties.pending_share_value.type = "number",
    f => f.schema.components.schemas.PortfolioPosition.properties.restricted_shares.type = "string",
    f => delete f.schema.components.schemas.PortfolioPosition.properties.dividend_receivable,
    f => f.schema.components.schemas.PortfolioPosition.required.push("pending_shares"),
    f => f.schema.components.schemas.PortfolioCreate.required.push("new_request_field"),
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f), /PORTFOLIO_CONTRACT_MISMATCH/); }
});
test("optional additive fields and referenced schemas are accepted without altering actual evidence", () => {
  const f = fixture();
  f.schema.components.schemas.PortfolioPosition.properties.future_stage = { $ref: "#/components/schemas/FutureStage" };
  f.schema.components.schemas.FutureStage = { type: "object", properties: { name: { type: "string" } } };
  const before = structuredClone(f);
  check(f); assert.deepEqual(f, before);
  delete f.schema.components.schemas.FutureStage;
  assert.throws(() => check(f), /PORTFOLIO_CONTRACT_MISMATCH/);
});
test("compatible services may omit only the explicitly supported optional position fields", () => {
  const f = fixture();
  for (const key of ["restricted_shares", "pending_shares", "pending_share_value"])
    delete f.schema.components.schemas.PortfolioPosition.properties[key];
  check(f);
  delete f.schema.components.schemas.PortfolioCreate.properties.initial_cash;
  assert.throws(() => check(f), /PORTFOLIO_CONTRACT_MISMATCH/);
});
test("missing required runtime capabilities or contradictory service metadata stay blocked", () => {
  for (const mutate of [
    f => f.catalogue.preflight_required = false,
    f => f.catalogue.account_policy = "shared_account",
    f => f.catalogue.fee_models = [],
    f => f.catalogue.strategy_algorithms = [],
    f => f.service.job_contract_version = "m2-jobs.v6",
    f => f.catalogue.service_identity.source_sha256 = "unavailable",
    f => f.catalogue.service_identity.backend_version = "different-from-schema",
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f), /PORTFOLIO_(CAPABILITY|SERVICE)_MISMATCH/); }
});
test("compatible services cannot mix frozen evidence or retry each other's stored requests", () => {
  const a = fixture().catalogue.service_identity, b = { ...a, source_sha256: "b".repeat(64) };
  assertSameService(a, structuredClone(a));
  assert.throws(() => assertSameService(b, a), /PORTFOLIO_SERVICE_CHANGED/);
  const oldKey = operationKeyFor(a.source_sha256), newKey = operationKeyFor(b.source_sha256);
  assert.notEqual(oldKey, newKey);
  const old = JSON.stringify({ pin: a.source_sha256, action: "create", state: "pending", body: { idempotency_key: "original-request" } });
  const storage = { getItem: key => key === oldKey ? old : null };
  assert.equal(restoreOperation(storage, newKey, b.source_sha256), null);
  assert.throws(() => restoreOperation(storage, oldKey, b.source_sha256), /不同服务/);
  assert.equal(restoreOperation(storage, oldKey, a.source_sha256).body.idempotency_key, "original-request");
});
