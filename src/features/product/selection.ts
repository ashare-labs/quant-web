import { environmentKey, type ProductConfig } from "../../shared/product-config.ts";
import { freshDraft, type Draft } from "../portfolio/draft.ts";
import type { Release, Selection } from "./api.ts";

export function validSelection(selection: Selection) {
  return selection.securities.length > 0 && new Set(selection.securities).size === selection.securities.length &&
    selection.securities.every(s => /^\d{6}\.(XSHG|XSHE|XBEI)$/.test(s)) &&
    [selection.start, selection.end].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s)) && selection.start <= selection.end;
}

export function draftFromRelease(config: ProductConfig, release: Release, selection: Selection, acknowledged: boolean, previous = freshDraft()): Draft {
  if (!acknowledged) throw Error("请明确确认价格诊断范围。");
  if (!validSelection(selection) || !selection.securities.every(s => release.dataset.securities.includes(s)))
    throw Error("发布数据与证券选择不一致。");
  // Use the actual dates returned by this release. Weekends are not fabricated as bars.
  const dates = release.dataset.trading_dates.filter(d => d >= selection.start && d <= selection.end);
  if (!dates.length) throw Error("发布窗口中没有可用交易日，不能进入回测。");
  return {
    ...previous, environment: environmentKey(config), dataset: release.dataset.dataset_id,
    publication: JSON.stringify({ environment: environmentKey(config), dataset_id: release.dataset.dataset_id,
      store_dataset_id: release.release.dataset_id, manifest: release.release.manifest }),
    securities: [...selection.securities].sort(), start: dates[0], end: dates.at(-1)!,
    mode: "price_only_no_limits", retrospective: false, ack: "", updatedAt: new Date().toISOString(),
  };
}
