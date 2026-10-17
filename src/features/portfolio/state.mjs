import { canonical } from "../../shared/format.mjs";

export const labels = {
  queued: "排队中",
  running: "运行中",
  cancelling: "取消中",
  cancelled: "已取消",
  failed: "失败",
  succeeded: "已完成",
};
export const canCancel = (job) =>
  ["queued", "running", "cancelling"].includes(job.status) &&
  !job.cancellation_requested_at;
export const sameRequest = (left, right) =>
  canonical(left) === canonical(right);
export function validCash(value) {
  return (
    typeof value === "string" &&
    value.length <= 12 &&
    /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) &&
    Number(value) > 0
  );
}
export function parseParameters(value) {
  const result = JSON.parse(value);
  if (
    !result ||
    Array.isArray(result) ||
    typeof result !== "object" ||
    Object.keys(result).length > 32 ||
    new TextEncoder().encode(JSON.stringify(result)).length > 8192
  )
    throw Error("策略参数应为最多 32 项、8 KiB 的 JSON 对象。");
  for (const [key, item] of Object.entries(result)) {
    if (
      !key ||
      key.length > 80 ||
      !(
        item === null ||
        typeof item === "string" ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isSafeInteger(item))
      )
    )
      throw Error("参数值仅支持字符串、整数、布尔值或 null；小数请用字符串。");
  }
  return result;
}
export function restoreOperation(storage, key, pin) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    !value ||
    value.pin !== pin ||
    !["create", "cancel", "resume"].includes(value.action) ||
    !value.body ||
    !["pending", "done", "rejected"].includes(value.state)
  )
    throw Error("本地请求记录不完整或属于不同服务。请保留记录并核对服务版本。");
  if (
    value.action === "create" &&
    (typeof value.body.idempotency_key !== "string" ||
      !/^[A-Za-z0-9_-]{1,96}$/.test(value.body.idempotency_key))
  )
    throw Error("本地请求幂等键无效，已停止提交。");
  if (value.action !== "create" && !/^m2job-[a-f0-9]{32}$/.test(value.jobId))
    throw Error("本地请求任务 ID 无效，已停止操作。");
  // Older clients persisted an error even after successful reconciliation.
  return value.state === "done" ? completeOperation(value, value.jobId) : value;
}
export function completeOperation(operation, jobId) {
  const { error: _resolvedError, ...rest } = operation;
  return { ...rest, state: "done", jobId };
}
export function actionSatisfied(operation, job) {
  if (operation.action === "create")
    return sameRequest(operation.body, job.request);
  if (operation.jobId !== job.job_id) return false;
  if (operation.action === "cancel")
    return !!job.cancellation_requested_at || job.status === "cancelled";
  return (
    job.attempt_count > operation.attemptCount ||
    ["queued", "running", "succeeded"].includes(job.status)
  );
}

export const validPortfolioCash = value => typeof value === "string" && value.length <= 40
  && /^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/.test(value) && /[1-9]/.test(value);
export const validVolumeRatio = value => value === "" || (typeof value === "string"
  && /^(0\.[0-9]+|1(?:\.0+)?)$/.test(value) && /[1-9]/.test(value));
