import { canonical } from "../../shared/format.ts";
import { isRecord } from "../../shared/json.ts";
import type { Report, View } from "../paper/api";
import type { Task } from "./api";

// Snapshot coherence and display geometry only. Never derive balances or returns.
export function paperRevision(view: View) {
  const { selected_day, decision, report, ...revision } = view;
  return canonical(revision);
}

export function requireSamePaperRevision(before: View, after: View) {
  if (paperRevision(before) !== paperRevision(after)) {
    throw new Error(
      "TASKS_SNAPSHOT_CHANGED · 读取期间会话发生变化，请重新读取整份证据。",
    );
  }
}

export function validatePaperDay(view: View, report: Report, day: string) {
  const row = view.days.find((item) => item.day === day);
  if (
    !row ||
    row.status !== "committed" ||
    report.day !== day ||
    report.session_id !== view.session_id ||
    report.schema !== "paper-report.v1" ||
    report.data_mode !== view.config.data_mode ||
    report.checkpoint_sha256 !== row.checkpoint_sha ||
    report.intent_id !== row.intent_id ||
    report.native?.reconciliation?.status !== "passed" ||
    (view.config.cash_dividend_policy === "gross_zero_withholding_0900" &&
      report.native?.opening_reconciliation?.status !== "passed")
  ) {
    throw new Error(
      "TASKS_REPORT_CONFLICT · 日报与会话、日期或检查点不匹配，整份证据已隐藏。",
    );
  }
}

export function curveGeometry(points: readonly { equity: unknown }[]) {
  // Number conversion is limited to SVG coordinates; labels/tables keep API text.
  if (!points.length) return null;
  const values = points.map((p) =>
    typeof p.equity === "string" && /^-?\d+(\.\d+)?$/.test(p.equity)
      ? Number(p.equity)
      : NaN,
  );
  if (values.some((v) => !Number.isFinite(v))) return null;
  const low = Math.min(...values),
    high = Math.max(...values);
  const span = high - low || Math.max(Math.abs(high) * 0.01, 1);
  return {
    lowIndex: values.indexOf(low),
    highIndex: values.indexOf(high),
    coordinates: values.map((v, i) => ({
      x: 64 + (points.length === 1 ? 356 : (i * 712) / (points.length - 1)),
      y: high === low ? 101 : 26 + ((high - v) / span) * 150,
    })),
  };
}

export function pendingMatches(
  value: unknown,
  source: string,
  id: string,
  pin: string,
) {
  return (
    isRecord(value) &&
    value.source === source &&
    value?.id === id &&
    value?.pin === pin &&
    typeof value?.action === "string" &&
    typeof value?.body === "object" &&
    value.body !== null
  );
}

export function validateTaskEvidence(
  id: string,
  job: Task<"JobView">,
  manifest: Task<"JobManifest">,
  logs: Task<"JobLogs">,
  result?: Task<"JobResult">,
) {
  if (
    job.contract_version !== "m2-jobs.v6" ||
    manifest.schema_version !== "m2-job-manifest.v6" ||
    job.job_id !== id ||
    manifest.job_id !== id ||
    logs.job_id !== id ||
    job.session_sha256 !== manifest.session_sha256 ||
    canonical(job.request) !== canonical(manifest.request) ||
    job.request.data_binding_sha256 !== manifest.data_binding_sha256 ||
    manifest.data_binding_sha256 !==
      manifest.approved_window.data_identity.data_binding_sha256
  ) {
    throw new Error(
      "TASKS_JOB_CONFLICT · 日频任务、清单、日志或数据绑定不一致。",
    );
  }
  if (
    result &&
    (result.contract_version !== "m2-job-result.v6" ||
      result.job_id !== id ||
      result.manifest_sha256 !== job.manifest_sha256 ||
      canonical(result.request) !== canonical(job.request) ||
      result.execution_identity.session_sha256 !== job.session_sha256 ||
      canonical(result.strategy) !== canonical(manifest.strategy) ||
      canonical(result.execution_scope) !==
        canonical(manifest.execution_scope) ||
      canonical(result.data_identity) !==
        canonical(manifest.approved_window.data_identity))
  ) {
    throw new Error(
      "TASKS_RESULT_CONFLICT · 日频结果与任务的策略、窗口、Session 或数据身份不一致。",
    );
  }
}
