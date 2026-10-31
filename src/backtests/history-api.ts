import type { components } from '../generated/api';
import { api, ApiError, object, type HistoryJob } from '../shared/api.ts';
import { displayName, readStrategyFile } from '../shared/strategy-files.ts';
import { isProjectId, isStrategyId } from '../shared/strategy-path.ts';
import { readProject } from '../strategies/project-api.ts';
export { isStrategyId } from '../shared/strategy-path.ts';
import { readDrafts } from '../shared/drafts.ts';
import type { BacktestRecord, StrategyBacktests, StrategyIdentity } from './history-model.ts';
type Response = components['schemas']['StrategyBacktests'];
type Item = components['schemas']['StrategyBacktest'];
const jobPattern = /^m2job-[a-f0-9]{32}$/;
export function requestStrategy(request: unknown) {
  const id = object(request).strategy_id;
  return isStrategyId(id) ? id : null;
}
export function strategyIdentity(id: string): StrategyIdentity {
  return {
    id,
    path: isProjectId(id) ? null : id,
    name: isProjectId(id) ? '策略项目' : displayName(id)
  };
}
export function backtestQuery(strategyId: string, offset = 0) {
  if (!isStrategyId(strategyId))
    throw new Error('策略标识无效，请从策略文件重新打开回测列表。');
  return '/python/backtests?' + new URLSearchParams({
    strategy_id: strategyId,
    limit: '100',
    offset: String(offset),
    analysis_version: 'returns-v2'
  }).toString();
}
export async function resolveStrategy(params: URLSearchParams, signal?: AbortSignal): Promise<StrategyIdentity> {
  for (const key of ['strategy', 'file', 'job', 'draft'])
    if (params.getAll(key).length > 1)
      throw new Error('策略上下文不明确，请从策略文件重新打开回测列表。');
  const explicit = params.get('strategy');
  const file = params.get('file');
  const job = params.get('job');
  // A file entry is current filesystem context. An explicit strategy/job is a
  // frozen identity and must stay exact, including old alias identities.
  const resolvedFile = file ? (await readStrategyFile(file, signal)).strategy_id : null;
  if (explicit && resolvedFile && explicit !== resolvedFile)
    throw new Error('策略标识与文件路径不一致。');
  let identity = explicit || resolvedFile;
  if (job) {
    if (!jobPattern.test(job))
      throw new Error('任务编号无效。');
    const record = await api<HistoryJob>('/history/jobs/' + encodeURIComponent(job), undefined, signal);
    if (record.job_id !== job || record.family !== 'python')
      throw new Error('此记录不是所选 Python 策略的回测。');
    const recorded = requestStrategy(record.request);
    if (!recorded)
      throw new Error('这条历史回测未记录策略归属，暂不能确定所属策略。原记录和冻结源码仍保留，不会按同名策略自动归类。');
    if (identity && identity !== recorded)
      throw new Error('回测记录与所选策略不一致。');
    identity = recorded;
  }
  if (!identity && params.get('draft')) {
    const draft = readDrafts().find(d => d.id === params.get('draft'));
    if (!draft)
      throw new Error('找不到此浏览器草稿，请返回策略列表。');
    if (!draft.filePath)
      throw new Error('此草稿尚未保存为策略文件。保存后开始的回测会归入该策略，已有记录保留。');
    identity = (await readStrategyFile(draft.filePath, signal)).strategy_id;
  }
  if (!isStrategyId(identity))
    throw new Error('请从一个策略的“回测列表”入口查看记录。');
  if (isProjectId(identity)) {
    try {
      const project = await readProject(identity, signal);
      return { id: identity, path: project.path, name: displayName(project.path) };
    }
    catch (error) {
      if (signal?.aborted)
        throw error; /* Frozen history remains available after a project is removed. */
    }
  }
  return strategyIdentity(identity);
}
export function normalizeBacktest(item: Item, strategyId: string): BacktestRecord {
  if (!item
    || item.strategy_id !== strategyId
    || !jobPattern.test(item.job_id)
    || typeof item.name !== 'string'
    || typeof item.created_at !== 'string' || !Number.isFinite(Date.parse(item.created_at))
    || typeof item.start_date !== 'string'
    || typeof item.end_date !== 'string'
    || typeof item.frequency !== 'string'
    || typeof item.stored_status !== 'string'
    || typeof item.execution_state !== 'string'
    || typeof item.result_available !== 'boolean') {
    throw new ApiError('返回的回测记录与当前策略不一致或格式无效，已停止显示。', 'INVALID_STRATEGY_BACKTEST', false);
  }
  const error = object(item.error);
  const resultError = object(item.result_error);
  const analysisError = object(item.analysis_error);
  const snapshot = object(item.result).snapshot_sha256;
  const progress = object(item.progress);
  const timestamp = (value: unknown) => typeof value === 'string'
    && Number.isFinite(Date.parse(value));
  const durationSeconds = progress.job_id === item.job_id
    && timestamp(progress.started_at)
    && timestamp(progress.sampled_at)
    && typeof progress.elapsed_seconds === 'number'
    && Number.isFinite(progress.elapsed_seconds)
    && progress.elapsed_seconds >= 0
    ? progress.elapsed_seconds : null;
  const ended = ['succeeded', 'failed', 'cancelled'].includes(item.stored_status);
  const durationState: BacktestRecord['durationState'] = durationSeconds === null ? 'unknown'
    : ended && progress.terminal === true && timestamp(progress.finished_at) ? 'finished'
      : item.execution_state === 'current_runtime'
        && [
          'running',
          'cancelling'
        ].includes(item.stored_status)
        && progress.terminal === false
        ? 'running'
        : 'observed';
  return {
    id: item.job_id, name: item.name, createdAt: item.created_at, start: item.start_date, end: item.end_date,
    frequency: item.frequency, initialCash: typeof item.initial_cash === 'number'
      && Number.isFinite(item.initial_cash)
      ? item.initial_cash
      : null,
    // Use the server's monotonic execution sample, never queue lifetime or a
    // browser timer. Missing legacy observations and Python versions stay unknown.
    durationSeconds, durationState, pythonVersion: null, status: item.display_status
      || item.stored_status,
    executionState: item.execution_state, error: typeof error.message === 'string'
      ? error.message
      : typeof resultError.message === 'string'
        ? resultError.message
        : null,
    analysisError: typeof analysisError.message === 'string' ? analysisError.message : null,
    hasResult: item.result_available, sourceSha256: typeof snapshot === 'string'
      && /^[a-f0-9]{64}$/.test(snapshot)
      ? snapshot
      : null,
    summary: item.result_available ? object(item.summary) : {}
  };
}
export async function readStrategyBacktests(identity: StrategyIdentity, signal?: AbortSignal): Promise<StrategyBacktests> {
  const records: BacktestRecord[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  let unassociatedCount = 0;
  for (let offset = 0; total === undefined || offset < total; offset += 100) {
    const response = await api<Response>(backtestQuery(identity.id, offset), undefined, signal);
    if (!response
      || response.analysis_version !== 'returns-v2'
      || response.strategy_id !== identity.id
      || String(response.identity_model) !== (isProjectId(identity.id)
        ? 'stable_project_id'
        : 'saved_relative_path')
      || !Array.isArray(response.items)
      || !Number.isSafeInteger(response.total)
      || response.total < 0
      || response.offset !== offset
      || response.limit !== 100
      || !Number.isSafeInteger(response.unassigned_count) || response.unassigned_count < 0) {
      throw new ApiError('服务未返回所选策略的完整回测列表，请检查策略回测接口。', 'INVALID_STRATEGY_HISTORY', false);
    }
    if (total !== undefined && total !== response.total)
      throw new Error('回测列表在读取时发生变化，请刷新后重试。');
    total = response.total;
    unassociatedCount = response.unassigned_count;
    if (response.items.length !== Math.min(100, total - offset))
      throw new Error('回测列表返回不完整，请刷新后重试。');
    for (const item of response.items) {
      const record = normalizeBacktest(item, identity.id);
      if (ids.has(record.id))
        throw new Error('回测列表在读取时发生变化，请刷新后重试。');
      ids.add(record.id);
      records.push(record);
    }
  }
  return { strategy: identity, records, unassociatedCount };
}
