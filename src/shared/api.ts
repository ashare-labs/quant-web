import type { components } from '../generated/api';
export type PythonJob = components['schemas']['PythonJobView'];
export type PythonResult = components['schemas']['PythonResult'];
export type JobLogs = components['schemas']['JobLogs'];
export type Row = Record<string, unknown>;
export const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
export const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) as Row[] : [];
export class ApiError extends Error {
  code: string; uncertain: boolean;
  constructor(message: string, code: string, uncertain: boolean) { super(message); this.code = code; this.uncertain = uncertain; }
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal, paper = false, method?: 'PUT'): Promise<T> {
  let response: Response;
  try { response = await fetch((paper ? '/paper-api/api/v1/paper' : '/api/v1') + path, {
    method: method || (body === undefined ? 'GET' : 'POST'), signal, cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type': 'application/json'}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }); } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(body === undefined ? '无法连接服务，请检查服务状态后重试。' : '未能确认提交结果，请先找回原请求，避免重复提交。', 'NETWORK_ERROR', body !== undefined);
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new ApiError('服务返回了无法识别的响应。', 'INVALID_RESPONSE', body !== undefined); }
  if (!response.ok) {
    const e = object(object(value).error);
    throw new ApiError(String(e.message || '请求失败，请稍后重试。'), String(e.code || response.status), body !== undefined && (response.status >= 500 || e.code === 'DATABASE_OPERATION_REFUSED') && object(e.details).save_state !== 'not_saved');
  }
  return value as T;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败。';
export interface HistoryJob {
  job_id: string; family: string; request: Row; status: string; display_status?: string | null; stored_status?: string | null;
  execution_state?: string; execution_reason?: Row | null; created_at: string; updated_at: string;
  read_only: true; can_resume: false; result: Row | null; error: Row | null;
}
export const statusLabels: Record<string, string> = {
  queued: '等待运行', running: '运行中', cancelling: '正在取消', cancelled: '已取消', failed: '运行失败', succeeded: '已完成',
  retired: '已退役', runtime_unavailable: '旧运行时不可执行',
};
export const shownStatus = (job: {status: string; display_status?: string | null}) => job.display_status || job.status;
export const active = (job: {status: string; display_status?: string | null; execution_state?: string}) =>
  ['queued', 'running', 'cancelling'].includes(shownStatus(job)) && (!job.execution_state || job.execution_state === 'current_runtime');
export const num = (v: unknown, decimals = 3) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('zh-CN', {maximumFractionDigits: decimals}) : '—';
export const pct = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? (v * 100).toFixed(2) + '%' : '—';
export const dateTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('zh-CN', {hour12: false}) : '—';
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'QuantWeb';
export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], {type})); const link = document.createElement('a');
  link.href = url; link.download = safeName(name); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csv = (data: unknown[][]) => '\uFEFF' + data.map(row => row.map(value => {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value !== 'number' && (/^[=+@\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(\.\d+)?$/.test(text)))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}).join(',')).join('\r\n');
