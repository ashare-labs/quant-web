import type { components } from '../generated/api';
import { accountMode, accountSession } from '../auth/session.ts';
import { readResponse, type ReadProgress } from './response-read.ts';
export type PythonJob = components['schemas']['PythonJobView'];
export type PythonResult = components['schemas']['PythonResult'];
export type JobLogs = components['schemas']['JobLogs'];
export type Row = Record<string, unknown>;
export const object = (value: unknown): Row => value
  && typeof value === 'object'
  && !Array.isArray(value)
  ? value as Row
  : {};
export const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter(v => v
    && typeof v === 'object'
    && !Array.isArray(v)) as Row[]
  : [];
export class ApiError extends Error {
  code: string;
  uncertain: boolean;
  status?: number;
  contentType?: string;
  requestId?: string;
  constructor(message: string, code: string, uncertain: boolean, response?: Response) {
    super(message);
    this.code = code;
    this.uncertain = uncertain;
    this.status = response?.status;
    this.contentType = response?.headers.get('content-type') || undefined;
    this.requestId = response?.headers.get('x-quantweb-request-id') || undefined;
  }
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal, paper = false, method?: 'PUT', onRead?: (progress: ReadProgress) => void): Promise<T> {
  const authority = accountSession.requireCurrent();
  const current = () => {
    if (accountMode && accountSession.snapshot().epoch !== authority.epoch)
      throw new ApiError('账号会话已变化，旧请求的响应已丢弃。', 'SESSION_CHANGED', body !== undefined);
  };
  let response: Response;
  const prefix = accountMode
    ? '/api/v1/client' + (paper
      ? '/paper'
      : '')
    : (paper
      ? '/paper-api/api/v1/paper'
      : '/api/v1');
  try {
    response = await fetch(prefix + path, {
      method: method
        || (body === undefined
          ? 'GET'
          : 'POST'), signal, cache: 'no-store', credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(accountMode ? accountSession.headers() : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  catch (error) {
    if (signal?.aborted)
      throw error;
    if (accountMode)
      accountSession.unavailable(authority.epoch);
    throw new ApiError(body === undefined
      ? '无法连接服务，请检查服务状态后重试。'
      : '未能确认提交结果，请检查连接后重试。', 'NETWORK_ERROR', body !== undefined);
  }
  current();
  if (accountMode && response.status === 401) {
    accountSession.rejectUnauthorized(authority.epoch);
    throw new ApiError('会话已过期或被撤销，请重新登录。', 'AUTHENTICATION_REQUIRED', false, response);
  }
  let raw: string;
  try {
    raw = onRead ? await readResponse(response, signal, onRead) : await response.text();
  }
  catch (error) {
    if (signal?.aborted)
      throw error;
    throw new ApiError(`读取服务响应时连接中断（HTTP ${response.status}）。` + (body === undefined
      ? '请恢复连接后重试。'
      : '提交结果尚未确认，请在连接恢复后重试。'), 'RESPONSE_INTERRUPTED', body !== undefined, response);
  }
  current();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  }
  catch {
    const kind = !raw.trim()
      ? '空响应'
      : /text\/html/i.test(response.headers.get('content-type')
        || '')
        || /^\s*</.test(raw)
        ? 'HTML 页面'
        : '非 JSON 响应';
    const requestId = response.headers.get('x-quantweb-request-id');
    const message = `访问服务失败（HTTP ${response.status}；${kind}）。请检查访问地址、代理连接和服务状态。`
      + (body === undefined ? '' : '提交结果尚未确认，请在连接恢复后重试。')
      + (requestId ? `请求编号：${requestId}` : '');
    throw new ApiError(message, response.ok
      ? 'INVALID_RESPONSE'
      : `HTTP_${response.status}`, body !== undefined, response);
  }
  if (!response.ok) {
    const e = object(object(value).error);
    if (accountMode && response.status === 503 && e.code === 'IDENTITY_UNAVAILABLE')
      accountSession.unavailable(authority.epoch);
    if (accountMode && response.status === 409 && e.code === 'SESSION_CHANGED') {
      await accountSession.synchronize();
      throw new ApiError('账号已切换，请在当前账号中重新确认操作。', 'SESSION_CHANGED', false, response);
    }
    const validation = rows(object(value).detail).slice(0, 3).map(item => `${Array.isArray(item.loc)
      ? item.loc.filter(part => part !== 'body').join('.')
      : '请求'}：${String(item.msg
        || '无效值')}`).join('；');
    throw new ApiError(String(e.message
      || (validation
        ? `请求校验未通过：${validation}`
        : `请求失败（HTTP ${response.status}）。`)), String(e.code
          || response.status), body !== undefined
          && (response.status >= 500
            || e.code === 'DATABASE_OPERATION_REFUSED')
    && object(e.details).save_state !== 'not_saved', response);
  }
  return value as T;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败。';
export interface HistoryJob {
  job_id: string;
  family: string;
  request: Row;
  status: string;
  display_status?: string | null;
  stored_status?: string | null;
  execution_state?: string;
  execution_reason?: Row | null;
  created_at: string;
  updated_at: string;
  read_only: true;
  can_resume: false;
  result: Row | null;
  error: Row | null;
  progress?: components['schemas']['TaskProgress'] | null;
}
export const statusLabels: Record<string, string> = {
  queued: '等待运行', running: '运行中', cancelling: '正在取消', cancelled: '已取消', failed: '运行失败', succeeded: '已完成',
  retired: '已退役', runtime_unavailable: '旧运行时不可执行',
};
export const shownStatus = (job: {
  status: string;
  display_status?: string | null;
}) => job.display_status || job.status;
export const active = (job: {
  status: string;
  display_status?: string | null;
  execution_state?: string;
}) => [
  'queued',
  'running',
  'cancelling'
].includes(shownStatus(job))
  && (!job.execution_state
    || job.execution_state === 'current_runtime');
export const num = (v: unknown, decimals = 3) => typeof v === 'number'
  && Number.isFinite(v)
  ? v.toLocaleString('zh-CN', { maximumFractionDigits: decimals })
  : '—';
export const pct = (v: unknown) => typeof v === 'number'
  && Number.isFinite(v)
  ? (v * 100).toFixed(2) + '%'
  : '—';
export const dateTime = (v: unknown) => typeof v === 'string'
  && Number.isFinite(Date.parse(v))
  ? new Date(v).toLocaleString('zh-CN', { hour12: false })
  : '—';
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120)
  || 'QuantWeb';
export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csv = (data: unknown[][]) => '\uFEFF' + data.map(row => row.map(value => {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value !== 'number'
    && (/^[=+@\t\r]/.test(text)
      || (/^-/.test(text)
        && !/^-\d+(\.\d+)?$/.test(text))))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}).join(',')).join('\r\n');
