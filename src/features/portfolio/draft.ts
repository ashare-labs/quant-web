import { canonical } from "../../shared/format.ts";
import { isRecord, parseJson } from "../../shared/json.ts";
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
  ["dataset", "securities", "start", "end", "mode", "retrospective"].some(
    (key) => key in patch,
  );
