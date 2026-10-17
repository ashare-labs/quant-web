import type { Source } from "./snapshots";
export const sources: Record<Source, string> = {
  daily: "日频回测任务",
  paper: "连续模拟账户",
};
export const states: Record<string, string> = {
  paused: "已暂停",
  committed: "已提交",
  empty: "尚无已提交日",
  prepared: "等待数据",
  ready: "待执行",
  running: "运行中",
  recovery_required: "需恢复",
  evidence_conflict: "证据冲突",
  queued: "排队中",
  cancelling: "取消待确认",
  cancelled: "已取消",
  failed: "失败",
  succeeded: "已完成",
  sealed: "封存只读",
};
export const short = (v: string) =>
  v.length > 18 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v;
export const pathFor = (source: Source, id = "") =>
  `#/tasks/${source}${id ? `/${encodeURIComponent(id)}` : ""}`;
export function Raw({ title, value }: { title: string; value: unknown }) {
  return (
    <details>
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
