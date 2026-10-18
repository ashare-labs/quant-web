import { environmentKey, type ProductConfig } from "../../shared/product-config.ts";
import { freshDraft, type Draft } from "../portfolio/draft.ts";
import { datasetModeError } from "../portfolio/dataset-mode.ts";
import { canonical } from "../../shared/format.ts";
import { ApiError } from "../../shared/http.ts";
import { isRecord } from "../../shared/json.ts";
import type { Coverage, CoverageSelection, Prices, Release, ReleaseSelection, Selection } from "./api.ts";

export function validSelection(selection: Selection) {
  return selection.securities.length > 0 && new Set(selection.securities).size === selection.securities.length &&
    selection.securities.every(s => /^\d{6}\.(XSHG|XSHE|XBEI)$/.test(s)) &&
    [selection.start, selection.end].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s)) && selection.start <= selection.end;
}

export const selectionKey = (selection: Selection) => canonical({
  securities: [...selection.securities].sort(), start: selection.start, end: selection.end, source: selection.source || "auto",
})!;

export function selectedReference(config: ProductConfig, name: string | null) {
  const selected = name ?? config.default_reference_set;
  return config.reference_sets?.find(item => item.name === selected) ?? null;
}

export function validateCoverage(config: ProductConfig, selection: CoverageSelection, value: Coverage) {
  const invalid = () => { throw new ApiError("PRODUCT_COVERAGE_INVALID", "覆盖检查响应与当前窗口或参考来源不一致，请重新检查。"); };
  if (!value || value.schema !== "ad-local-daily-coverage.v1" || !isRecord(value.scope) ||
      !Array.isArray(value.scope.securities) || selectionKey(value.scope) !== selectionKey(selection) ||
      typeof value.ready !== "boolean" || !Array.isArray(value.gaps) || !Array.isArray(value.assumptions) ||
      !Array.isArray(value.limitations) || !value.limitations.every(v => typeof v === "string") ||
      !isRecord(value.source_bindings) || !/^[a-f0-9]{64}$/.test(value.coverage_sha256 || "")) invalid();
  const reference = selectedReference(config, selection.reference_set);
  if (value.ready && (!reference || value.gaps.length ||
      !value.reference_set || value.reference_set.name !== reference.name || value.reference_set.kind !== reference.kind ||
      canonical(value.source_bindings) !== canonical(reference.source_bindings))) invalid();
}

export function publicationReady(config: ProductConfig | null, selection: ReleaseSelection, coverage: Coverage | null, prices: Prices | null, acknowledged: boolean) {
  if (!config?.configured || config.kind !== "product" || !validSelection(selection)) return false;
  if (selection.mode === "price_only_no_limits") return !!prices && !prices.gaps.length && acknowledged;
  if (!coverage?.ready || coverage.gaps.length) return false;
  try { validateCoverage(config, selection, coverage); return true; }
  catch { return false; }
}

export function validateRelease(config: ProductConfig, selection: ReleaseSelection, value: Release) {
  const reference = selectedReference(config, selection.reference_set);
  const bindingsMatch = selection.mode !== "covered_research" || (reference &&
    canonical(value.release?.reference_set) === canonical({ name: reference.name, kind: reference.kind }) &&
    canonical(value.release?.source_bindings) === canonical(reference.source_bindings) &&
    /^[a-f0-9]{64}$/.test(value.release?.coverage_sha256 || ""));
  if (!value.release?.dataset_id || !value.dataset?.dataset_id || !Array.isArray(value.dataset.securities) ||
      !Array.isArray(value.dataset.trading_dates) || !validSelection(selection) ||
      !selection.securities.every(s => value.dataset.securities.includes(s)) ||
      value.release.mode !== selection.mode || datasetModeError(value.dataset, selection.mode) ||
      !bindingsMatch || (selection.mode === "covered_research" && !value.release.corporate_schedule_path))
    throw new ApiError("PRODUCT_RELEASE_INVALID", "发布响应与所选证券或研究模式不一致，请核对已导入数据。", true);
}

export function draftFromRelease(config: ProductConfig, release: Release, selection: ReleaseSelection, acknowledged: boolean, previous = freshDraft()): Draft {
  if (selection.mode === "price_only_no_limits" && !acknowledged) throw Error("请明确确认价格诊断范围。");
  validateRelease(config, selection, release);
  // Use the actual dates returned by this release. Weekends are not fabricated as bars.
  const dates = release.dataset.trading_dates.filter(d => d >= selection.start && d <= selection.end);
  if (!dates.length) throw Error("发布窗口中没有可用交易日，不能进入回测。");
  return {
    ...previous, environment: environmentKey(config), dataset: release.dataset.dataset_id,
    publication: JSON.stringify({ environment: environmentKey(config), dataset_id: release.dataset.dataset_id,
      store_dataset_id: release.release.dataset_id, manifest: release.release.manifest }),
    securities: [...selection.securities].sort(), start: dates[0], end: dates.at(-1)!,
    mode: selection.mode, retrospective: false, ack: "", updatedAt: new Date().toISOString(),
  };
}
