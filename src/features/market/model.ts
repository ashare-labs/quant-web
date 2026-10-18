import type { Model } from "../execution/api";
export type Query = Model<"ResearchQuery">;
export type Description = Model<"ResearchDescription">;
export type Read = Model<"ResearchRead">;
export type Coverage = Model<"ResearchCoverage">;
export type Security = Query["securities"][number];
export type Field = NonNullable<Query["fields"]>[number];
export const fields: Field[] = [
  "open",
  "high",
  "low",
  "close",
  "volume",
  "money",
];
export const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

export function descriptorSecurities(descriptor: unknown): string[] {
  const d = record(descriptor), scope = d.scope;
  const candidates = [
    ...(Array.isArray(d.securities) ? d.securities : []),
    ...(Array.isArray(scope) ? scope.map(s => record(s).security) : []),
  ];
  return [...new Set(candidates.filter((s): s is string => typeof s === "string" && /^\d{6}\.(XSHG|XSHE|XBEI)$/.test(s)))].sort();
}

export function parseSecurities(value: string): string[] {
  const securities = value.trim().split(/[\s,，]+/).filter(Boolean);
  if (!securities.length || securities.some(s => !/^\d{6}\.(XSHG|XSHE|XBEI)$/.test(s)))
    throw Error("请输入完整证券标识，例如 600519.XSHG；多个标识用空格或逗号分隔。");
  return [...new Set(securities)].sort();
}
