import type { PortfolioModel } from "../portfolio/api";
import type { components } from "../../generated/api";
import { ApiError, requestJson } from "../../shared/http";
import { isRecord } from "../../shared/json";
import { assertSameEnvironment, readProductConfig, requireProduct, type ProductConfig } from "../../shared/product-config";

export type Security = {
  security: string; name: string; first_bar: string | null; last_bar: string | null;
  sources: { source: string; rows: number; first: string; last: string }[];
};
export type Catalogue = {
  schema: string; query: string; limit: number; offset: number; total: number;
  securities: Security[]; receipt: unknown; limitations: string[];
};
export type Selection = components["schemas"]["ProductSelection"];
export type Prices = {
  rows: Record<string, unknown>[]; gaps: unknown[]; coverage: unknown; receipt: unknown;
  limitations?: string[];
};
export type Release = {
  release: { dataset_id: string; portfolio_input_path: string; manifest: unknown };
  dataset: PortfolioModel<"PortfolioDataset">;
};

const request = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
  requestJson<T>("/execution-api/product", path, body, signal, { timeoutMs: 120000 });

export async function inEnvironment<T>(config: ProductConfig, read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const before = await readProductConfig(signal);
  assertSameEnvironment(before, config);
  requireProduct(before);
  const value = await read();
  assertSameEnvironment(await readProductConfig(signal), config);
  return value;
}

export async function readCatalogue(config: ProductConfig, query: string, offset = 0, signal?: AbortSignal) {
  return inEnvironment(config, async () => {
    const value = await request<Catalogue>(`/catalogue?${new URLSearchParams({ query, limit: "50", offset: String(offset) })}`, undefined, signal);
    if (!Array.isArray(value.securities) || !Number.isInteger(value.total) || value.total < 0 ||
        !value.securities.every(s => typeof s.security === "string" && Array.isArray(s.sources)))
      throw new ApiError("PRODUCT_CATALOGUE_INVALID", "证券目录响应无效，没有使用默认证券。");
    return value;
  }, signal);
}

export async function readPrices(config: ProductConfig, selection: Selection) {
  return inEnvironment(config, async () => {
    const value = await request<Prices>("/prices", selection);
    if (!Array.isArray(value.rows) || !value.rows.every(isRecord) || !Array.isArray(value.gaps) || !value.receipt)
      throw new ApiError("PRODUCT_PRICES_INVALID", "行情或来源回执无效，不能发布此读取结果。");
    return value;
  });
}

export async function publishSelection(config: ProductConfig, selection: Selection) {
  return inEnvironment(config, async () => {
    const value = await request<Release>("/releases", selection);
    if (!value.release?.dataset_id || !value.dataset?.dataset_id || !Array.isArray(value.dataset.securities) ||
        !selection.securities.every(s => value.dataset.securities.includes(s)))
      throw new ApiError("PRODUCT_RELEASE_INVALID", "发布响应与证券选择不一致，请核对已导入数据。", true);
    return value;
  });
}
