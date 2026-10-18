import { canonical } from "../../shared/format.ts";
import { isRecord, parseJson } from "../../shared/json.ts";
import { environmentKey, type ProductConfig } from "../../shared/product-config.ts";
export const base = "#/portfolio";
export const draftKey = "quant-web.portfolio.portfolio-draft.v1";
const defaultRules = JSON.stringify(
  { template: "daily_portfolio.v1", algorithm: "equal-weight" },
  null,
  2,
);
export type Draft = {
  name: string;
  code: string;
  version: string;
  dataset: string;
  environment: string;
  publication: string;
  securities: string[];
  start: string;
  end: string;
  cash: string;
  volume: string;
  mode: "covered_research" | "price_only_no_limits";
  retrospective: boolean;
  ack: string;
  updatedAt: string;
};
export function freshDraft(): Draft {
  return {
    name: "组合策略",
    code: defaultRules,
    version: "",
    dataset: "",
    environment: "",
    publication: "",
    securities: [],
    start: "",
    end: "",
    cash: "1000000.00",
    volume: "",
    mode: "covered_research",
    retrospective: false,
    ack: "",
    updatedAt: "",
  };
}
export function definitionAlgorithm(code: string): string {
  try {
    const value = parseJson(code);
    return isRecord(value) && typeof value.algorithm === "string"
      ? value.algorithm
      : "";
  } catch {
    return "";
  }
}

export function restoreDraft(raw: string): Draft {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    (value.mode !== "covered_research" &&
      value.mode !== "price_only_no_limits") ||
    typeof value.code !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.securities) ||
    !value.securities.every((item): item is string => typeof item === "string")
  )
    throw Error("草稿格式无效");
  const defaults = freshDraft();
  // Missing optional legacy fields use their defaults; wrong stored types fail closed.
  for (const [key, fallback] of Object.entries(defaults)) {
    if (
      key !== "securities" &&
      key in value &&
      typeof value[key] !== typeof fallback
    )
      throw Error("草稿格式无效");
  }
  return {
    ...defaults,
    ...value,
    mode: value.mode,
    code: value.code,
    name: value.name,
    securities: value.securities,
  };
}
export function safeCanonical(value: string) {
  try {
    return canonical(parseJson(value));
  } catch {
    return "";
  }
}
export const changesScope = (patch: Partial<Draft>) =>
  ["dataset", "environment", "securities", "start", "end", "mode", "retrospective"].some(
    (key) => key in patch,
  );

export function draftEnvironmentError(draft: Draft, config: ProductConfig, datasetExists: boolean) {
  if (!draft.dataset) return "";
  if (!draft.environment) return "已有草稿未记录运行环境，已停止提交。请明确重选当前环境的数据窗口，或从正式数据入口重新发布。策略代码已保留。";
  if (draft.environment !== environmentKey(config)) return `已有草稿属于另一运行环境，当前为 ${config.profile}。已停止提交并保留原选择；请切回原环境，或明确选择当前环境的数据。`;
  if (!datasetExists) return "草稿数据集不在当前状态库中，已停止提交。请恢复对应数据与状态，或明确重新选择；不会改用首个数据集。";
  return "";
}

export function draftPublication(draft: Draft) {
  if (!draft.publication) return null;
  try {
    const value = parseJson(draft.publication);
    return isRecord(value) && value.dataset_id === draft.dataset && value.environment === draft.environment && isRecord(value.manifest)
      ? value.manifest : null;
  } catch { return null; }
}
