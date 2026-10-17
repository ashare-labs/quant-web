import { canonical } from "../../shared/format.ts";
import { isRecord } from "../../shared/json.ts";
import type { PortfolioModel } from "./api";
type ContractDocument = Record<string, unknown> & {
  info: Record<string, unknown> & { version: string };
};


// Optional receipt fields can be absent. Absence means unavailable,
// never an inferred zero in an account receipt.
const optionalPositionFields = new Set([
  "restricted_shares",
  "pending_shares",
  "pending_share_value",
]);
const object = isRecord;

function compatibleNode(
  actual: unknown,
  expected: unknown,
  path = "",
): boolean {
  if (!object(expected)) return canonical(actual) === canonical(expected);
  if (!object(actual)) return false;
  const propertyMap = path.endsWith(".properties");
  const schemaMap = path === ".components.schemas";
  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      if (
        path === ".components.schemas.PortfolioPosition.properties" &&
        optionalPositionFields.has(key)
      )
        continue;
      return false;
    }
    if (!compatibleNode(actual[key], value, `${path}.${key}`)) return false;
  }
  // Added optional properties and their schema definitions are compatible.
  // The containing schema's required list, types, defaults, enums, refs and
  // existing fields are still compared. Added required fields fail that check.
  return Object.keys(actual).every(
    (key) =>
      key in expected || ((propertyMap || schemaMap) && object(actual[key])),
  );
}
function referencesResolve(value: unknown, document: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if ("$ref" in value) {
    if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/"))
      return false;
    const target = value.$ref
      .slice(2)
      .split("/")
      .reduce<unknown>(
        (node, key) =>
          node !== null && typeof node === "object"
            ? Reflect.get(node, key.replace(/~1/g, "/").replace(/~0/g, "~"))
            : undefined,
        document,
      );
    if (!object(target)) return false;
  }
  return Object.values(value).every((child) =>
    referencesResolve(child, document),
  );
}

// Package release labels are evidence, not an API compatibility boundary.
export function contractShape(schema: Record<string, unknown>) {
  const { version: _release, ...info } = isRecord(schema.info)
    ? schema.info
    : {};
  return { ...schema, info };
}
export function verifyContract(
  schema: unknown,
  expected: unknown,
): asserts schema is ContractDocument {
  if (
    !isRecord(schema) ||
    !isRecord(schema.info) ||
    typeof schema.info.version !== "string" ||
    !isRecord(expected) ||
    !isRecord(expected.info) ||
    typeof expected.info.version !== "string" ||
    !referencesResolve(schema, schema) ||
    !compatibleNode(contractShape(schema), contractShape(expected))
  )
    throw Error(
      "PORTFOLIO_CONTRACT_MISMATCH · 服务接口与工作台契约不同，旧结果已隐藏，操作已禁用。",
    );
}
export function verifyIdentity(
  identity: unknown,
): asserts identity is PortfolioModel<"PortfolioIdentity"> {
  if (
    !isRecord(identity) ||
    identity.contract_version !== "portfolio-jobs.v1" ||
    typeof identity.backend_version !== "string" ||
    !identity.backend_version.trim() ||
    !/^[a-f0-9]{64}$/.test(
      typeof identity.source_sha256 === "string" ? identity.source_sha256 : "",
    )
  )
    throw Error(
      "PORTFOLIO_SERVICE_MISMATCH · 服务身份或任务契约无效，旧结果已隐藏，操作已禁用。",
    );
}
export function assertSameService(actual: unknown, expected: unknown) {
  verifyIdentity(actual);
  verifyIdentity(expected);
  if (
    actual.backend_version !== expected.backend_version ||
    actual.source_sha256 !== expected.source_sha256 ||
    actual.contract_version !== expected.contract_version
  )
    throw Error(
      "PORTFOLIO_SERVICE_CHANGED · 服务在读取或提交期间发生变化，请重新读取；不会向新服务重发旧请求。",
    );
}
export const operationKeyFor = (source: string) =>
  `quant-web.portfolio.operation.${source}`;
export function verifyCompatibility(
  catalogue: PortfolioModel<"PortfolioCatalogue">,
  schema: unknown,
  service: PortfolioModel<"PortfolioServiceStatus">,
  expected: unknown,
) {
  verifyIdentity(catalogue?.service_identity);
  verifyContract(schema, expected);
  if (schema.info.version !== catalogue.service_identity.backend_version)
    throw Error(
      "PORTFOLIO_SERVICE_MISMATCH · 接口与目录报告的服务身份不同，操作已禁用。",
    );
  if (
    catalogue.contract_version !== "portfolio-jobs.v1" ||
    service?.contract_version !== "m2-job-service.v1" ||
    service.job_contract_version !== "portfolio-jobs.v1" ||
    catalogue.preflight_required !== true ||
    catalogue.account_policy !== "new_isolated_account_per_job" ||
    catalogue.instrument_scope !== "main_board_ordinary_a_shares" ||
    !Array.isArray(catalogue.strategy_algorithms) ||
    !catalogue.strategy_algorithms.includes("equal-weight") ||
    !catalogue.fee_models?.some((f) => f.id === "fixed-commission-tax.v1")
  )
    throw Error(
      "PORTFOLIO_CAPABILITY_MISMATCH · 服务缺少预检查、独立账户、组合算法或固定费用能力，操作已禁用。",
    );
}
