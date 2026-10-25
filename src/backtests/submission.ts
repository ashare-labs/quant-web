import { accountStorage } from '../auth/session.ts';
import type { components } from '../generated/api';
import { api, ApiError, object, type PythonJob } from '../shared/api.ts';
import { pythonBacktestConfig, type Draft } from '../shared/drafts.ts';
import { isStrategyFilePath } from '../shared/strategy-path.ts';
import { projectSource, type ProjectSource } from '../strategies/project-model.ts';
import type { ProjectDraft } from '../strategies/project-state.ts';
import { randomId } from '../shared/random-id.ts';

// OpenAPI defaults appear required in generated output types; this request
// deliberately omits the two legacy pre-preparation hints.
export type Submission = Omit<components['schemas']['PythonCreate'], 'securities'|'warmup_sessions'|'source'|'project'> & {source?:string;project?:ProjectSource};
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
  checkSourceBudget({'strategy.py':draft.source},catalogue);
  if (draft.frequency !== '1d' && draft.frequency !== '1m') throw new Error('请选择日频或分钟模式。');
  const config = pythonBacktestConfig({...draft, frequency: draft.frequency});
  if (draft.filePath !== undefined && !isStrategyFilePath(draft.filePath)) throw new Error('策略文件标识无效，请重新打开该策略。');
  return {environment_id: environment(catalogue), idempotency_key: key, name: draft.name, source: draft.source,
    ...(draft.filePath ? {strategy_id: draft.filePath} : {}),
    ...config, parameters: {},
    accept_research_model: true, trusted_local_code: true};
}
export function canonicalValue(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonicalValue(item)]));
  return value;
}
export function checkSourceBudget(files:Record<string,string>,catalogue:unknown){
  const budget=object(object(catalogue).resource_budget);let total=0;
  for(const source of Object.values(files)){
    const bytes=new TextEncoder().encode(source).length;total+=bytes;
  }
  if(typeof budget.artifact_bytes==='number'&&budget.artifact_bytes>0&&total>budget.artifact_bytes)throw new Error('项目源码超过当前服务资源预算（'+budget.artifact_bytes+' 字节）。');
}
export function projectRunName(path:string):string {
  const name=path.split('/').at(-1)!,characters=Array.from(name);
  return characters.length>80?characters.slice(0,79).join('')+'…':name;
}
export function projectSubmission(draft:ProjectDraft,catalogue:unknown,key:string):Submission {
  const project=projectSource({...draft,project_id:draft.strategy_id});
  if(!project.files[project.entrypoint].trim())throw new Error('请编写项目入口 Python 策略。');
  checkSourceBudget(project.files,catalogue);
  return {environment_id:environment(catalogue),idempotency_key:key,name:projectRunName(draft.path),strategy_id:draft.strategy_id,project,...pythonBacktestConfig(draft),parameters:{},accept_research_model:true,trusted_local_code:true};
}
function signature(request: Submission): string {
  // Compare all current fields; cached content is never used to build a request.
  return JSON.stringify(Object.entries(request).filter(([key]) => key !== 'idempotency_key').sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonicalValue(value)]));
}
function stored(key: string, storage:ReturnType<typeof accountStorage>): Record<string, unknown> {
  try { return object(JSON.parse(storage.getItem(key) || 'null')); }
  catch { return {}; } // An obsolete/corrupt token must not lock the editor.
}
export async function submitCurrent(draft: EditorRequest, catalogue: unknown): Promise<PythonJob> {
  return submitAttempt(draft.id,submission(draft,catalogue,randomId()));
}
export async function submitProjectCurrent(draft:ProjectDraft,catalogue:unknown):Promise<PythonJob>{
  return submitAttempt(draft.strategy_id,projectSubmission(draft,catalogue,randomId()));
}
async function submitAttempt(identity:string,request:Submission):Promise<PythonJob>{
  const storage=accountStorage();
  const current=signature(request);
  const key = attemptPrefix + identity, attempt = stored(key,storage), legacy = stored(legacyKey,storage);
  if (attempt.signature === current && typeof attempt.key === 'string') request.idempotency_key = attempt.key;
  // One-way compatibility for an unacknowledged pre-upgrade POST. Only its key
  // can be reused, and only when the CURRENT editor constructs the same body.
  else if (typeof legacy.idempotency_key === 'string' && signature(legacy as Submission) === current) request.idempotency_key = legacy.idempotency_key;
  storage.setItem(key, JSON.stringify({signature: current, key: request.idempotency_key}));
  try { storage.removeItem(legacyKey); } catch { /* No UI depends on this obsolete entry. */ }
  function forget() {
    // Do not erase a newer, different attempt made in another editor/tab.
    if (stored(key,storage).key === request.idempotency_key) {
      try { storage.removeItem(key); }
      catch { try { storage.setItem(key, 'null'); } catch { /* Storage is unavailable. */ } }
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
    && Object.entries(request).every(([key, item]) => JSON.stringify(canonicalValue(accepted[key])) === JSON.stringify(canonicalValue(item)));
}
export function matchesCanonicalRequest(job: unknown, request: Submission, manifest: unknown): boolean {
  const value=object(job),accepted=object(value.request),frozen=object(manifest),session=object(frozen.session);
  if(!isStrategyFilePath(request.strategy_id)||!isStrategyFilePath(accepted.strategy_id)||accepted.strategy_id===request.strategy_id
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
    if(isStrategyFilePath(request.strategy_id)&&isStrategyFilePath(canonical)&&matchesRequest(job,{...request,strategy_id:canonical})){
      try{
        const manifest=await api('/history/jobs/'+encodeURIComponent(job.job_id)+'/manifest');
        verified=matchesCanonicalRequest(job,request,manifest);
      }catch{/* Acceptance is uncertain without the frozen identity evidence. */}
    }
    if(!verified)throw new ApiError('服务返回的任务与本次提交不一致，或缺少规范身份凭据。请稍后重试或查看回测记录。','INVALID_JOB_RESPONSE',true);
  }
  return job;
}
