import type { components } from '../../generated/api';
import backend from '../../../contracts/api.identity.json';
import { requestJson } from '../../shared/http';
export { ApiError, errorText } from '../../shared/http';
export type Model<K extends keyof components['schemas']> = components['schemas'][K];
export const PIN = backend.source_sha256;
export const api = <T>(path: string, body?: unknown, readOnly = false) =>
  requestJson<T>('/execution-api', path, body, undefined, { timeoutMs: 10000, codePrefix: 'EXECUTION',
    uncertainMessage: readOnly ? '公开数据读取失败或超时。未创建运行，请恢复连接后重新读取。' : undefined });

// The browser route is #/execution/runs; the API contract owns /runs.
const runPath = (id: string) => `/runs/${encodeURIComponent(id)}`;
export async function readRunDetail(id: string) {
  const path = runPath(id);
  const [state, manifest, logs, execution] = await Promise.all([
    api<Model<'StateView'>>(`${path}/state`),
    api<Model<'Manifest'>>(`${path}/manifest`),
    api<Model<'LogEntry'>[]>(`${path}/logs?after=0`),
    api<Model<'ExecutionStatus'>>(`${path}/execution`),
  ]);
  return { state, manifest, logs, execution };
}
export const cancelRun = (id: string) => api<Model<'RunView'>>(`${runPath(id)}/cancel`, {});
export const readRunEvents = (id: string, after: number) => api<Model<'EventPage'>>(`${runPath(id)}/events?after=${after}&limit=25`);
export const readRunReceipt = (id: string) => api<Record<string, unknown>>(`${runPath(id)}/receipt`);
