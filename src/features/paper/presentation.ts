import { PaperError, type Failure } from "./api";
export const names: Record<string, string> = {
  "equal-weight": "等权再平衡",
  momentum: "动量轮换",
  trend: "趋势过滤",
  committed: "已提交 / 对账通过",
  prepared: "等待当日数据",
  ready: "待执行",
  running: "执行中",
  recovery_required: "需恢复",
  evidence_conflict: "证据冲突",
};
export const short = (value: string | null | undefined) =>
  value ? value.slice(0, 12) : "—";
export const failure = (e: unknown): Failure =>
  e instanceof PaperError
    ? e.failure
    : { code: "PAPER_UI_ERROR", message: String(e) };
