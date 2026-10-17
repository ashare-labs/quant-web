import type { Model } from "./api";
export type Run = Model<"RunView">;
export type Engine = "rqalpha" | "fixture-replay-v1";
export type Strategy = Model<"StrategyVersion">;
export type Scenario = Model<"StrategyCreate">["scenario"];
export const labels: Record<Scenario, string> = {
  buy_hold: "买入持有",
  t_plus_one: "T+1 拒绝与次日卖出",
  insufficient_cash: "资金不足拒绝",
  partial_fill: "部分成交与撤销",
  cross_day: "跨日买卖",
  corporate_action: "公司行动入账",
  restart: "进程恢复规格",
};
export const statuses: Record<Run["status"], string> = {
  queued: "已排队",
  running: "运行中",
  succeeded: "已完成",
  failed: "运行失败",
  cancelled: "已停止",
};
export const isActive = (r: Run) =>
  r.status === "queued" || r.status === "running";
export const record = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};

export type Bootstrap = {
  capabilities: Model<"Capabilities">;
  scenarios: Record<string, unknown>;
  nativeScenarios: Record<string, unknown>;
  compatible: boolean;
};
