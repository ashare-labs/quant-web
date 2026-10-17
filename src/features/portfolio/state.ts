import { canonical } from "../../shared/format.ts";
import { isRecord } from "../../shared/json.ts";
import type { Job } from "./api";

export type Operation = {
  pin: string;
  action: "create" | "cancel" | "resume";
  body: Record<string, unknown>;
  jobId?: string;
  attemptCount?: number;
  state: "pending" | "done" | "rejected";
  error?: string;
};


export const labels: Record<Job["status"], string> = {
  queued: "排队中",
  running: "运行中",
  cancelling: "取消中",
  cancelled: "已取消",
  failed: "失败",
  succeeded: "已完成",
};
export const canCancel = (
  job: Pick<Job, "status" | "cancellation_requested_at">,
) =>
  ["queued", "running", "cancelling"].includes(job.status) &&
  !job.cancellation_requested_at;
export const sameRequest = (left: unknown, right: unknown) =>
  canonical(left) === canonical(right);
export function restoreOperation(
  storage: Pick<Storage, "getItem">,
  key: string,
  pin: string,
): Operation | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    value.pin !== pin ||
    (value.action !== "create" &&
      value.action !== "cancel" &&
      value.action !== "resume") ||
    !isRecord(value.body) ||
    (value.state !== "pending" &&
      value.state !== "done" &&
      value.state !== "rejected")
  )
    throw Error("本地请求记录不完整或属于不同服务。请保留记录并核对服务版本。");
  if (
    value.action === "create" &&
    (typeof value.body.idempotency_key !== "string" ||
      !/^[A-Za-z0-9_-]{1,96}$/.test(value.body.idempotency_key))
  )
    throw Error("本地请求幂等键无效，已停止提交。");
  if (
    value.action !== "create" &&
    !/^m2job-[a-f0-9]{32}$/.test(String(value.jobId))
  )
    throw Error("本地请求任务 ID 无效，已停止操作。");
  // Older clients persisted an error even after successful reconciliation.
  const operation: Operation = {
    pin,
    action: value.action,
    body: value.body,
    state: value.state,
    ...(typeof value.jobId === "string" ? { jobId: value.jobId } : {}),
    ...(typeof value.attemptCount === "number"
      ? { attemptCount: value.attemptCount }
      : {}),
    ...(typeof value.error === "string" ? { error: value.error } : {}),
  };
  return operation.state === "done"
    ? completeOperation(operation, operation.jobId)
    : operation;
}
export function completeOperation(
  operation: Operation,
  jobId?: string,
): Operation {
  const { error: _resolvedError, ...rest } = operation;
  return { ...rest, state: "done", jobId };
}
export function actionSatisfied(operation: Operation, job: Job) {
  if (operation.action === "create")
    return sameRequest(operation.body, job.request);
  if (operation.jobId !== job.job_id) return false;
  if (operation.action === "cancel")
    return !!job.cancellation_requested_at || job.status === "cancelled";
  return (
    job.attempt_count > (operation.attemptCount ?? NaN) ||
    ["queued", "running", "succeeded"].includes(job.status)
  );
}

export const validPortfolioCash = (value: unknown) =>
  typeof value === "string" &&
  value.length <= 40 &&
  /^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/.test(value) &&
  /[1-9]/.test(value);
export const validVolumeRatio = (value: unknown) =>
  value === "" ||
  (typeof value === "string" &&
    /^(0\.[0-9]+|1(?:\.0+)?)$/.test(value) &&
    /[1-9]/.test(value));
