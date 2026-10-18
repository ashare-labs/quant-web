import { ApiError, requestJson } from "./http.ts";
import { isRecord } from "./json.ts";
import type { components } from "../generated/api";

export type ProductConfig = components["schemas"]["ProductConfiguration"];

export async function readProductConfig(signal?: AbortSignal): Promise<ProductConfig> {
  const value = await requestJson<unknown>("/execution-api", "/product/config", undefined, signal);
  if (!isRecord(value) || typeof value.profile !== "string" || (value.kind !== null && typeof value.kind !== "string") ||
      typeof value.configured !== "boolean" || !isRecord(value.capabilities) ||
      !Array.isArray(value.limitations) || !value.limitations.every(v => typeof v === "string") ||
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
