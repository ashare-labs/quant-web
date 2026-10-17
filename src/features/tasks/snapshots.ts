import { api as paper, bootstrap, verify, pin as paperPin, type View, type Report, type Session } from '../paper/api';
import { tasks, taskSchema, taskService, taskPin, type Task } from './api';
import { canonical } from '../../shared/format.ts';
import { requireSamePaperRevision, validatePaperDay, validateTaskEvidence } from './evidence.ts';

export type Source = 'paper' | 'daily';
export type Choice = { id: string; title: string; version: string; mode: string };
export type Index = { choices: Choice[]; taskStatus?: Task<'ServiceStatus'> };
export type Point = { day: string; equity: string; cash: string; positions: { security: string; quantity: number; sellable: number; value: string | null }[] };
export type Fill = { day: string; id: string; order: string; security: string; side: string; quantity: number; price: string; commission: string; tax: string; fee: string; at: string };
export type Snapshot = {
  source: Source; id: string; title: string; mode: string; state: string; strategy: string; dataVersion: string;
  points: Point[]; fills: Fill[]; initialCash: string; issues: string[]; review: string;
  paper?: View; reports?: Report[]; job?: Task<'JobView'>; result?: Task<'JobResult'>;
  manifest?: Task<'JobManifest'>; taskLogs?: Task<'JobLogs'>; taskStatus?: Task<'ServiceStatus'>;
  dataBinding?: string; executionScope?: Task<'ExecutionScope'>; raw: unknown;
};
export const sourcePin = (source: Source) => source === 'paper' ? paperPin.source_sha256 : taskPin.source_sha256;
export const strategyName = (value: string | null) => ({ 'equal-weight': '等权再平衡', momentum: '动量轮换', trend: '趋势过滤' }[value || ''] || value || '外部冻结目标');

export async function readIndex(source: Source, signal: AbortSignal): Promise<Index> {
  if (source === 'paper') {
    const sessions = await bootstrap(signal);
    return { choices: sessions.map((s: Session) => ({ id: s.id, title: `${s.config.account_id} · ${strategyName(s.config.strategy_id)}`, version: s.config.strategy_version, mode: s.config.data_mode })) };
  }
    taskSchema(await tasks('/openapi.json', undefined, signal));
    const [catalogue, list, status] = await Promise.all([
      tasks<Task<'JobCatalogue'>>('/jobs/catalogue', undefined, signal),
      tasks<Task<'JobList'>>('/jobs', undefined, signal),
      tasks<Task<'ServiceStatus'>>('/jobs/service', undefined, signal),
    ]);
    taskService(catalogue.service_identity);
    if (catalogue.contract_version !== taskPin.contract_version || status.contract_version !== 'm2-job-service.v1'
      || status.job_contract_version !== taskPin.contract_version || list.items.some(j => j.contract_version !== taskPin.contract_version)) {
      throw new Error('TASKS_CONTRACT_MISMATCH · 任务目录或服务状态与当前契约不同。');
    }
    return { taskStatus: status, choices: list.items.map(j => ({ id: j.job_id, title: `${j.request.name} · ${j.status}`, version: j.session_sha256, mode: 'conditional_research' })) };
}

export async function readSnapshot(source: Source, id: string, index: Index, signal: AbortSignal): Promise<Snapshot> {
  if (!index.choices.some(c => c.id === id)) throw new Error('TASKS_SELECTION_MISSING · 所选版本已不在当前目录中，请重新选择。');
  if (source === 'paper') {
    const path = `/sessions/${encodeURIComponent(id)}/view`;
    const first = await paper<View>(path, undefined, signal);
    verify(first, id);
    const days = first.days.filter(d => d.status === 'committed').map(d => d.day).sort();
    if (days.length > 500) throw new Error('TASKS_HISTORY_LIMIT · 当前接口未分页，超过500日的会话需要后端提供分页证据。');
    const reports: Report[] = [];
    // Bounded reads avoid saturating the native service; no partial chart is published.
    for (let i = 0; i < days.length; i += 4) {
      reports.push(...await Promise.all(days.slice(i, i + 4).map(async day => {
        const r = await paper<Report>(`/sessions/${encodeURIComponent(id)}/days/${day}/report`, undefined, signal);
        validatePaperDay(first, r, day);
        return r;
      })));
    }
    const last = await paper<View>(path, undefined, signal);
    verify(last, id); requireSamePaperRevision(first, last);
    const delivery = first.replay?.delivery;
    const gaps = first.replay?.preflight.gaps || [];
    const issues = [...(first.replay?.limitations || [])];
    if (gaps.length) issues.unshift(`来源缺口 ${gaps.length} 项：${first.replay?.preflight.ready ? '允许观察，实际订单仍须逐笔许可' : '尚未满足数据前置条件'}`);
    if (delivery && !delivery.ad_admission.ready) issues.unshift('AD 整窗准入未通过；观察输入可接收不授予订单执行许可。');
    return {
      source, id, title: first.config.account_id, mode: first.config.data_mode,
      state: first.paused ? 'paused' : first.days.at(-1)?.status || 'empty', strategy: first.config.strategy_version,
      dataVersion: first.replay?.binding.input_sha256 || first.config.scenario_manifest_sha256,
      initialCash: first.config.initial_cash, issues, review: '当前会话未完成人类验收；真实在线持续模拟未通过',
      points: reports.map(r => ({ day: r.day, equity: r.native.account.nav, cash: r.native.account.total_cash,
        positions: first.config.universe.map(security => ({ security, quantity: r.native.account.positions[security]?.quantity, sellable: r.native.account.positions[security]?.sellable, value: r.native.account.positions[security]?.market_value ?? null })) })),
      fills: reports.flatMap(r => r.native.trades.map(t => ({ day: r.day, id: String(t.id), order: String(t.order_id), security: t.security, side: t.side, quantity: t.quantity, price: t.price, commission: t.commission, tax: t.tax, fee: t.cost, at: t.at }))),
      paper: first, reports, raw: { view: first, reports },
    };
  }
  return readTaskSnapshot(id, index, signal);
}

async function readTaskSnapshot(id: string, index: Index, signal: AbortSignal): Promise<Snapshot> {
  const path = `/jobs/${encodeURIComponent(id)}`;
  const [job, manifest, logs] = await Promise.all([
    tasks<Task<'JobView'>>(path, undefined, signal),
    tasks<Task<'JobManifest'>>(`${path}/manifest`, undefined, signal),
    tasks<Task<'JobLogs'>>(`${path}/logs`, undefined, signal),
  ]);
  taskService(manifest.service_identity);
  const result = job.status === 'succeeded' ? await tasks<Task<'JobResult'>>(`${path}/result`, undefined, signal) : undefined;
  if (result) taskService(result.service_identity);
  validateTaskEvidence(id, job, manifest, logs, result);
  const after = await tasks<Task<'JobView'>>(path, undefined, signal);
  if (canonical(job) !== canonical(after)) throw new Error('TASKS_SNAPSHOT_CHANGED · 读取期间任务发生变化，请重新读取。');
  return {
    source: 'daily', id, title: job.request.name, mode: 'conditional_research', state: job.status,
    strategy: manifest.strategy.version_id, dataVersion: manifest.approved_window.data_identity.dataset_id,
    dataBinding: manifest.data_binding_sha256, executionScope: manifest.execution_scope,
    initialCash: job.request.parameters.initial_cash,
    review: result ? `本次任务：${result.result_status}；执行范围：${result.executor_review_scope}` : '尚无完成结果',
    points: result?.days.map(d => ({ day: d.trading_date, equity: d.account_at_day_close.equity, cash: d.account_at_day_close.cash,
      positions: [{ security: result.scope.security, quantity: d.account_at_day_close.quantity, sellable: d.account_at_day_close.sellable, value: null }] })) || [],
    fills: result?.days.flatMap(d => d.fills.map(f => ({ day: d.trading_date, id: f.fill_id, order: f.order_id, security: result.scope.security, side: f.side, quantity: f.quantity, price: f.price, commission: f.commission, tax: f.tax, fee: f.fee, at: f.filled_at }))) || [],
    issues: result?.limitations || ['任务尚未提供完成结果；不能推断账户、持仓或成交为零。'],
    job, manifest, result, taskLogs: logs, taskStatus: index.taskStatus,
    raw: { job, manifest, logs, result, service_status_at_index_read: index.taskStatus },
  };
}
