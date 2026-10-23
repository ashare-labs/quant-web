import type { components } from '../generated/api';
import { api, ApiError, object, type PythonJob } from '../shared/api.ts';
import { pythonBacktestConfig, type Draft } from '../shared/drafts.ts';

// OpenAPI defaults appear required in generated output types; this request
// deliberately omits the two legacy pre-preparation hints.
export type Submission = Omit<components['schemas']['PythonCreate'], 'securities'|'warmup_sessions'>;
export const pendingKey = 'quantweb-python-pending-v1';
export function environment(catalogue: unknown): string {
  const value = object(catalogue);
  if (value.external_securities_required !== false || value.universe !== 'strategy_subscription' || typeof value.environment_id !== 'string' || !/^[a-f0-9]{64}$/.test(value.environment_id)) {
    throw new Error('当前服务尚未提供策略按需取数接口，请检查连接的研究服务。');
  }
  return value.environment_id;
}
export function submission(draft: Pick<Draft, 'name'|'source'|'start'|'end'|'capital'> & {frequency: string}, catalogue: unknown, key: string): Submission {
  if (!draft.name.trim()) throw new Error('请填写策略名称。');
  if (!draft.source.trim()) throw new Error('请编写或导入 Python 策略。');
  if (new TextEncoder().encode(draft.source).length > 262144) throw new Error('源码不能超过 256 KiB。');
  if (draft.frequency !== '1d' && draft.frequency !== '1m') throw new Error('请选择日频或分钟模式。');
  const config = pythonBacktestConfig({...draft, frequency: draft.frequency});
  return {environment_id: environment(catalogue), idempotency_key: key, name: draft.name, source: draft.source,
    ...config, parameters: {},
    accept_research_model: true, trusted_local_code: true};
}
export function readPending(): Submission | null {
  const raw = localStorage.getItem(pendingKey);
  if (!raw) return null;
  const value = object(JSON.parse(raw));
  if (!['idempotency_key','environment_id','name','source','start_date','end_date'].every(k => typeof value[k] === 'string') || !['1d','1m'].includes(String(value.frequency)) || typeof value.initial_cash !== 'number' || value.accept_research_model !== true || value.trusted_local_code !== true) {
    throw new Error('未确认的回测请求无法读取；原内容已保留，请检查浏览器存储。');
  }
  return value as Submission;
}
export function matchesRequest(job: unknown, request: Submission): job is PythonJob {
  const value = object(job), accepted = object(value.request);
  return value.contract_version === 'python-minute-jobs.v1' && typeof value.job_id === 'string' && /^m2job-[a-f0-9]{32}$/.test(value.job_id)
    && Object.entries(request).every(([key, item]) => JSON.stringify(accepted[key]) === JSON.stringify(item));
}
export async function submit(request: Submission): Promise<PythonJob> {
  // Persist the exact request before sending: an uncertain response must never
  // create a new key or re-read edited source during recovery.
  localStorage.setItem(pendingKey, JSON.stringify(request));
  let job: PythonJob;
  try {
    job = await api<PythonJob>('/python/jobs', request);
    if (!matchesRequest(job, request)) throw new ApiError('服务返回的任务与原请求不一致。请按原请求找回。', 'INVALID_JOB_RESPONSE', true);
  } catch (error) {
    if (error instanceof ApiError && !error.uncertain) localStorage.removeItem(pendingKey);
    throw error;
  }
  // Acceptance is known even if the browser cannot remove its recovery record.
  try { localStorage.removeItem(pendingKey); } catch { /* The same key remains safe to recover. */ }
  return job;
}
