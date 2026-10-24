import type { components } from '../generated/api';
import { api, ApiError, object, type PythonJob } from '../shared/api.ts';
import { pythonBacktestConfig, type Draft } from '../shared/drafts.ts';
import { isStrategyId } from './history-api.ts';
import { randomId } from '../shared/random-id.ts';

// OpenAPI defaults appear required in generated output types; this request
// deliberately omits the two legacy pre-preparation hints.
export type Submission = Omit<components['schemas']['PythonCreate'], 'securities'|'warmup_sessions'>;
type EditorRequest = Pick<Draft, 'id'|'name'|'source'|'start'|'end'|'capital'|'filePath'> & {frequency: string};
const attemptPrefix = 'quantweb-python-idempotency-v1:';
const legacyKey = 'quantweb-python-pending-v1';
export function environment(catalogue: unknown): string {
  const value = object(catalogue);
  if (value.external_securities_required !== false || value.universe !== 'strategy_subscription' || typeof value.environment_id !== 'string' || !/^[a-f0-9]{64}$/.test(value.environment_id)) {
    throw new Error('当前服务尚未提供策略按需取数接口，请检查连接的研究服务。');
  }
  return value.environment_id;
}
export function submission(draft: Pick<Draft, 'name'|'source'|'start'|'end'|'capital'|'filePath'> & {frequency: string}, catalogue: unknown, key: string): Submission {
  if (!draft.name.trim()) throw new Error('请填写策略名称。');
  if (!draft.source.trim()) throw new Error('请编写或导入 Python 策略。');
  if (new TextEncoder().encode(draft.source).length > 262144) throw new Error('源码不能超过 256 KiB。');
  if (draft.frequency !== '1d' && draft.frequency !== '1m') throw new Error('请选择日频或分钟模式。');
  const config = pythonBacktestConfig({...draft, frequency: draft.frequency});
  if (draft.filePath !== undefined && !isStrategyId(draft.filePath)) throw new Error('策略文件标识无效，请重新打开该策略。');
  return {environment_id: environment(catalogue), idempotency_key: key, name: draft.name, source: draft.source,
    ...(draft.filePath ? {strategy_id: draft.filePath} : {}),
    ...config, parameters: {},
    accept_research_model: true, trusted_local_code: true};
}
function signature(request: Submission): string {
  // Compare all current fields; cached content is never used to build a request.
  return JSON.stringify(Object.entries(request).filter(([key]) => key !== 'idempotency_key').sort(([a],[b])=>a.localeCompare(b)));
}
function stored(key: string): Record<string, unknown> {
  try { return object(JSON.parse(localStorage.getItem(key) || 'null')); }
  catch { return {}; } // An obsolete/corrupt token must not lock the editor.
}
export async function submitCurrent(draft: EditorRequest, catalogue: unknown): Promise<PythonJob> {
  const request = submission(draft, catalogue, randomId()), current = signature(request);
  const key = attemptPrefix + draft.id, attempt = stored(key), legacy = stored(legacyKey);
  if (attempt.signature === current && typeof attempt.key === 'string') request.idempotency_key = attempt.key;
  // One-way compatibility for an unacknowledged pre-upgrade POST. Only its key
  // can be reused, and only when the CURRENT editor constructs the same body.
  else if (typeof legacy.idempotency_key === 'string' && signature(legacy as Submission) === current) request.idempotency_key = legacy.idempotency_key;
  localStorage.setItem(key, JSON.stringify({signature: current, key: request.idempotency_key}));
  try { localStorage.removeItem(legacyKey); } catch { /* No UI depends on this obsolete entry. */ }
  function forget() {
    // Do not erase a newer, different attempt made in another editor/tab.
    if (stored(key).key === request.idempotency_key) {
      try { localStorage.removeItem(key); }
      catch { try { localStorage.setItem(key, 'null'); } catch { /* Storage is unavailable. */ } }
    }
  }
  try {
    const job = await submit(request);
    forget();
    return job;
  } catch (error) {
    if (error instanceof ApiError && !error.uncertain) forget();
    throw error;
  }
}
export function matchesRequest(job: unknown, request: Submission): boolean {
  const value = object(job), accepted = object(value.request);
  return value.contract_version === 'python-minute-jobs.v1' && typeof value.job_id === 'string' && /^m2job-[a-f0-9]{32}$/.test(value.job_id)
    && Object.entries(request).every(([key, item]) => JSON.stringify(accepted[key]) === JSON.stringify(item));
}
export function matchesCanonicalRequest(job: unknown, request: Submission, manifest: unknown): boolean {
  const value=object(job),accepted=object(value.request),frozen=object(manifest),session=object(frozen.session);
  if(!isStrategyId(request.strategy_id)||!isStrategyId(accepted.strategy_id)||accepted.strategy_id===request.strategy_id
    ||frozen.schema_version!=='python-demand-job.v2'||frozen.job_id!==value.job_id||session.submitted_strategy_id!==request.strategy_id)return false;
  const canonical={...request,strategy_id:accepted.strategy_id};
  return matchesRequest(job,canonical)&&matchesRequest({...value,request:frozen.request},canonical);
}
export async function submit(request: Submission): Promise<PythonJob> {
  const job = await api<PythonJob>('/python/jobs', request);
  if (!matchesRequest(job, request)) {
    // A submitted request may contain an alias. Verify the frozen alias
    // evidence, not today's file lookup: the file may since have disappeared.
    let verified=false;
    const canonical=object(object(job).request).strategy_id;
    if(isStrategyId(request.strategy_id)&&isStrategyId(canonical)&&matchesRequest(job,{...request,strategy_id:canonical})){
      try{
        const manifest=await api('/history/jobs/'+encodeURIComponent(job.job_id)+'/manifest');
        verified=matchesCanonicalRequest(job,request,manifest);
      }catch{/* Acceptance is uncertain without the frozen identity evidence. */}
    }
    if(!verified)throw new ApiError('服务返回的任务与本次提交不一致，或缺少规范身份凭据。请稍后重试或查看回测记录。','INVALID_JOB_RESPONSE',true);
  }
  return job;
}
