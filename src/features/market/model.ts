import type { Model } from "../execution/api";
export type Query = Model<"ResearchQuery">;
export type Description = Model<"ResearchDescription">;
export type Read = Model<"ResearchRead">;
export type Coverage = Model<"ResearchCoverage">;
export type Security = Query["securities"][number];
export type Field = NonNullable<Query["fields"]>[number];
export const securities: Security[] = ["600000.XSHG", "000001.XSHE"];
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
