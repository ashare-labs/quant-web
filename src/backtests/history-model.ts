import { num, pct, type Row } from '../shared/api.ts';

export interface StrategyIdentity { id: string; name: string; path: string | null }
export interface BacktestRecord {
  id: string;
  name: string;
  createdAt: string;
  start: string;
  end: string;
  frequency: string;
  initialCash: number | null;
  durationSeconds: number | null;
  durationState: 'running' | 'finished' | 'observed' | 'unknown';
  pythonVersion: string | null;
  status: string;
  executionState: string;
  error: string | null;
  analysisError: string | null;
  hasResult: boolean;
  sourceSha256: string | null;
  summary: Row;
}
export interface StrategyBacktests {
  strategy: StrategyIdentity;
  records: BacktestRecord[];
  unassociatedCount: number;
}

export const backtestsHref = (context: {strategy?: string; file?: string; job?: string; draft?: string}) => {
  const params = new URLSearchParams();
  for (const key of ['strategy', 'file', 'job', 'draft'] as const) if (context[key]) params.set(key, context[key]!);
  return 'backtests.html' + (params.size ? '?' + params.toString() : '');
};
export function resultHref(record: Pick<BacktestRecord, 'id'|'executionState'>, strategy?: string) {
  const params = new URLSearchParams({job:record.id});
  if (record.executionState !== 'current_runtime') params.set('history', '1');
  if (strategy) params.set('strategy', strategy);
  return 'backtest-results.html?' + params.toString();
}
export function selectRecords(records: BacktestRecord[], search: string) {
  const needle = search.trim().toLocaleLowerCase();
  return records.filter(record => record.name.toLocaleLowerCase().includes(needle))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
export const pageSize = 20;
export const lastPage = (count: number) => Math.max(1, Math.ceil(count / pageSize));
export const pageOf = (records: BacktestRecord[], page: number) => records.slice((page-1)*pageSize, page*pageSize);
export function duration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const rounded = Math.floor(seconds);
  return (rounded >= 3600 ? Math.floor(rounded/3600)+'时' : '') + String(Math.floor(rounded/60)%60).padStart(2,'0')+'分'+String(rounded%60).padStart(2,'0')+'秒';
}
export function recordDuration(record: Pick<BacktestRecord, 'durationSeconds'|'durationState'>) {
  const text = duration(record.durationSeconds);
  return record.durationState === 'observed' && text !== '—' ? '≥ '+text : text;
}
export function durationTitle(record: Pick<BacktestRecord, 'durationState'>) {
  return {running:'运行中：截至最新采样的执行用时，不含排队时间',
    finished:'已结束：从开始执行至结束采样的用时，不含排队时间',
    observed:'仅有最后一次采样：实际执行用时至少为此值，完整用时未知',
    unknown:'此回测没有可靠的执行耗时记录'}[record.durationState];
}
export function createdTime(value: string) {
  if (!Number.isFinite(Date.parse(value))) return ['—', ''];
  const parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)).split(' ');
  return [parts[0], parts[1] || ''];
}
export const frequencyLabel = (value: string) => value === '1d' ? '每天' : value === '1m' ? '分钟' : '—';
export const recordStatus = (status: string) => ({succeeded:'完成',failed:'失败',cancelled:'已取消',queued:'等待运行',running:'运行中',cancelling:'正在取消',retired:'已退役',runtime_unavailable:'不可运行'}[status] || status);

export const optionalColumns = [
  {key:'created',label:'创建时间'}, {key:'capital',label:'初始资金'}, {key:'sharpe',label:'夏普比率'},
  {key:'excess_return',label:'超额收益'}, {key:'daily_excess_return',label:'日均超额收益'},
  {key:'excess_max_drawdown',label:'超额收益最大回撤'}, {key:'excess_sharpe',label:'超额收益夏普比率'},
  {key:'python',label:'Python版本'},
] as const;
export type OptionalColumn = typeof optionalColumns[number]['key'];
export function optionalValue(record: BacktestRecord, column: OptionalColumn) {
  if (column === 'capital') return num(record.initialCash,2);
  if (column === 'python') return record.pythonVersion || '—';
  if (column === 'sharpe' || column === 'excess_sharpe') return num(record.summary[column]);
  return pct(record.summary[column]);
}
export const returnClass = (value: unknown) => typeof value !== 'number' || !Number.isFinite(value) || value === 0 ? '' : value > 0 ? 'return-positive' : 'return-negative';
