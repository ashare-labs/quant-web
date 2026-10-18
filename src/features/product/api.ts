import type { components } from "../../generated/api";
import { ApiError, requestJson } from "../../shared/http";
import { isRecord } from "../../shared/json";
import { assertSameEnvironment, readProductConfig, requireProduct, type ProductConfig } from "../../shared/product-config";
import type { DeclaredDataset, ResearchMode } from "../portfolio/dataset-mode";
import { validateCoverage, validateRelease } from "./selection";

export type Security = {
  security: string; name: string; first_bar: string | null; last_bar: string | null;
  sources: { source: string; rows: number; first: string; last: string }[];
};
export type Catalogue = {
  schema: string; query: string; limit: number; offset: number; total: number;
  securities: Security[]; receipt: unknown; limitations: string[];
};
export type Selection = components["schemas"]["ProductSelection"];
export type CoverageSelection = Selection & { reference_set: string | null };
export type ReleaseSelection = CoverageSelection & { mode: ResearchMode };
export type Coverage = {
  schema: "ad-local-daily-coverage.v1";
  scope: Selection;
  ready: boolean;
  gaps: unknown[];
  assumptions: unknown[];
  limitations: string[];
  reference_set: { name: string; kind: string } | null;
  source_bindings: Record<string, unknown>;
  coverage_sha256: string;
};
export type Prices = {
  rows: Record<string, unknown>[]; gaps: unknown[]; coverage: unknown; receipt: unknown;
  limitations?: string[];
};
export type Release = {
  release: { dataset_id: string; mode: ResearchMode; reference_set: unknown; portfolio_input_path: string;
    corporate_schedule_path?: string | null; source_bindings?: unknown; coverage_sha256?: string; manifest: unknown };
  dataset: DeclaredDataset;
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

export async function readCoverage(config: ProductConfig, selection: CoverageSelection) {
  return inEnvironment(config, async () => {
    const value = await request<Coverage>("/coverage", selection);
    validateCoverage(config, selection, value);
    return value;
  });
}

export async function publishSelection(config: ProductConfig, selection: ReleaseSelection) {
  return inEnvironment(config, async () => {
    const value = await request<Release>("/releases", selection);
    validateRelease(config, selection, value);
    return value;
  });
}
