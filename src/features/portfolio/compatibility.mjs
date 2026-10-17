import { canonical } from "../../shared/format.mjs";

// Optional receipt fields can be absent. Absence means unavailable,
// never an inferred zero in an account receipt.
const optionalPositionFields = new Set(["restricted_shares", "pending_shares", "pending_share_value"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function compatibleNode(actual, expected, path = "") {
  if (!object(expected)) return canonical(actual) === canonical(expected);
  if (!object(actual)) return false;
  const propertyMap = path.endsWith(".properties");
  const schemaMap = path === ".components.schemas";
  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      if (path === ".components.schemas.PortfolioPosition.properties" && optionalPositionFields.has(key)) continue;
      return false;
    }
    if (!compatibleNode(actual[key], value, `${path}.${key}`)) return false;
  }
  // Added optional properties and their schema definitions are compatible.
  // The containing schema's required list, types, defaults, enums, refs and
  // existing fields are still compared. Added required fields fail that check.
  return Object.keys(actual).every(key => key in expected
    || ((propertyMap || schemaMap) && object(actual[key])));
}
function referencesResolve(value, document) {
  if (!value || typeof value !== "object") return true;
  if ("$ref" in value) {
    if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) return false;
    const target = value.$ref.slice(2).split("/").reduce((node, key) =>
      node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], document);
    if (!object(target)) return false;
  }
  return Object.values(value).every(child => referencesResolve(child, document));
}

// Package release labels are evidence, not an API compatibility boundary.
export function contractShape(schema) {
  const { version: _release, ...info } = schema.info || {};
  return { ...schema, info };
}
export function verifyContract(schema, expected) {
  if (!schema?.info || typeof schema.info.version !== "string"
    || !referencesResolve(schema, schema)
    || !compatibleNode(contractShape(schema), contractShape(expected)))
    throw Error("PORTFOLIO_CONTRACT_MISMATCH · 服务接口与工作台契约不同，旧结果已隐藏，操作已禁用。");
}
export function verifyIdentity(identity) {
  if (identity?.contract_version !== "portfolio-jobs.v1"
    || typeof identity.backend_version !== "string" || !identity.backend_version.trim()
    || !/^[a-f0-9]{64}$/.test(identity.source_sha256 || ""))
    throw Error("PORTFOLIO_SERVICE_MISMATCH · 服务身份或任务契约无效，旧结果已隐藏，操作已禁用。");
}
export function assertSameService(actual, expected) {
  verifyIdentity(actual);
  verifyIdentity(expected);
  if (actual.backend_version !== expected.backend_version
    || actual.source_sha256 !== expected.source_sha256
    || actual.contract_version !== expected.contract_version)
    throw Error("PORTFOLIO_SERVICE_CHANGED · 服务在读取或提交期间发生变化，请重新读取；不会向新服务重发旧请求。");
}
export const operationKeyFor = (source) => `quant-web.portfolio.operation.${source}`;
export function verifyCompatibility(catalogue, schema, service, expected) {
  verifyIdentity(catalogue?.service_identity);
  verifyContract(schema, expected);
  if (schema.info.version !== catalogue.service_identity.backend_version)
    throw Error("PORTFOLIO_SERVICE_MISMATCH · 接口与目录报告的服务身份不同，操作已禁用。");
  if (catalogue.contract_version !== "portfolio-jobs.v1"
    || service?.contract_version !== "m2-job-service.v1"
    || service.job_contract_version !== "portfolio-jobs.v1"
    || catalogue.preflight_required !== true
    || catalogue.account_policy !== "new_isolated_account_per_job"
    || catalogue.instrument_scope !== "main_board_ordinary_a_shares"
    || !Array.isArray(catalogue.strategy_algorithms) || !catalogue.strategy_algorithms.includes("equal-weight")
    || !catalogue.fee_models?.some(f => f.id === "fixed-commission-tax.v1"))
    throw Error("PORTFOLIO_CAPABILITY_MISMATCH · 服务缺少预检查、独立账户、组合算法或固定费用能力，操作已禁用。");
}
