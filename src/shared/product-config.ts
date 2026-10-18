import { ApiError, requestJson } from "./http.ts";
import { isRecord } from "./json.ts";
import type { components } from "../generated/api";

export type ReferenceSet = { name: string; kind: "daily_execution" | "historical_market"; source_bindings: Record<string, unknown> };
export type ProductConfig = Omit<components["schemas"]["ProductConfiguration"], "reference_sets"> & {
  reference_sets: ReferenceSet[];
};

function isReferenceSet(value: unknown): value is ReferenceSet {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim() ||
      (value.kind !== "daily_execution" && value.kind !== "historical_market") || !isRecord(value.source_bindings)) return false;
  const bindings = value.source_bindings;
  const required = value.kind === "daily_execution"
    ? { research: "daily_research", execution: "daily_execution", corporate: "corporate_history" }
    : { market: "historical_market", corporate: "corporate_history" };
  return Object.entries(required).every(([role, kind]) => {
    const binding = bindings[role];
    return isRecord(binding) && binding.kind === kind && typeof binding.binding_sha256 === "string" && /^[a-f0-9]{64}$/.test(binding.binding_sha256);
  });
}

export async function readProductConfig(signal?: AbortSignal): Promise<ProductConfig> {
  const value = await requestJson<unknown>("/execution-api", "/product/config", undefined, signal);
  if (!isRecord(value) || typeof value.profile !== "string" || (value.kind !== null && typeof value.kind !== "string") ||
      typeof value.configured !== "boolean" || !isRecord(value.capabilities) ||
      !Array.isArray(value.limitations) || !value.limitations.every(v => typeof v === "string") ||
      (value.default_reference_set != null && typeof value.default_reference_set !== "string") ||
      !Array.isArray(value.reference_sets) || !value.reference_sets.every(isReferenceSet) ||
      new Set(value.reference_sets.map(v => v.name)).size !== value.reference_sets.length ||
      (value.configured && (typeof value.configuration_id !== "string" || !/^[a-f0-9]{64}$/.test(value.configuration_id)))) {
    throw new ApiError("PRODUCT_CONFIG_INVALID", "正式数据配置响应无效，操作已停止。");
  }
  return value as ProductConfig;
}

export function requireProduct(config: ProductConfig) {
  if (!config.configured || config.kind !== "product")
    throw new ApiError(config.error?.code || "PRODUCT_NOT_CONFIGURED",
      config.error?.message || "当前环境未配置正式数据。请使用统一部署清单启动产品服务。", false, config.error?.details);
}

export function assertSameEnvironment(actual: ProductConfig, expected: ProductConfig) {
  if (actual.configuration_id !== expected.configuration_id || actual.profile !== expected.profile || actual.kind !== expected.kind)
    throw new ApiError("PRODUCT_ENVIRONMENT_CHANGED", "运行环境或状态库已变化。请重新读取；原选择和请求不会自动转到另一环境。");
}

export const environmentKey = (config: ProductConfig) =>
  config.configuration_id || `${config.kind}:${config.profile}:unconfigured`;
