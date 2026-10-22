// A checked projection of AD's JSON result; no client-side evaluation calculations.
type Point = { date: string; horizon: number; value: number | null; n?: number };
type Moment = { mean: number | null; std: number | null; n: number; positive_fraction: number | null; mean_over_std: number | null };
export interface Evaluation {
  schema: 'ad.factor-evaluation.v1';
  config: { horizons: number[]; quantiles: number; lag: number; direction: number; min_assets: number; rolling_window: number; price_basis: string; universe_label: string };
  engine: { library: string; version: string };
  summary: { horizon: number; ic: Moment; rank_ic: Moment; spread: Moment; quantile_means: (Moment & {quantile: number})[] }[];
  ic: Point[]; rank_ic: Point[]; spread: Point[];
  quantile_returns: { date: string; horizon: number; quantile: number; mean_return: number | null; n: number; selected_n: number }[];
  turnover: { date: string; quantile: number; value: number | null; n: number }[];
  stability: { kind: string; period: string; horizon: number; ic_mean: number | null; rank_ic_mean: number | null; spread_mean: number | null; observations: number }[];
  cost_sensitivity: { horizon: number; cost_bps: number; top_mean: number | null; bottom_mean: number | null; spread_mean: number | null; n: number }[];
  coverage: { input_cells: number; finite_factor_cells: number; quantized_cells: number; by_horizon: {horizon: number; eligible: number; paired: number; excluded: Record<string,number>}[]; rejected_quantile_dates: { date: string; reason: string; n: number }[] };
  warnings: string[];
}
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const nullable = (v: unknown) => v === null || num(v);
const list = (v: unknown, check: (r: Record<string,unknown>) => boolean): boolean => Array.isArray(v) && v.every(r=>object(r)&&check(r));
const moment = (v: unknown): boolean => object(v) && num(v.n) && ['mean','std','positive_fraction','mean_over_std'].every(k=>nullable(v[k]));
export function evaluation(value: unknown): Evaluation {
  const fail = () => { throw new Error('评价结果格式无法确认，请保留运行记录并检查后端版本。'); };
  if (!object(value) || value.schema !== 'ad.factor-evaluation.v1') return fail();
  const c = value.config, coverage = value.coverage;
  if (!object(c) || !Array.isArray(c.horizons) || !c.horizons.length || !c.horizons.every(num) || !['quantiles','lag','direction','min_assets','rolling_window'].every(k=>num(c[k])) || typeof c.price_basis !== 'string' || typeof c.universe_label !== 'string') return fail();
  if (!object(value.engine) || typeof value.engine.library !== 'string' || typeof value.engine.version !== 'string' || !Array.isArray(value.warnings) || !value.warnings.every(s=>typeof s==='string')) return fail();
  if (!object(coverage) || !['input_cells','finite_factor_cells','quantized_cells'].every(k=>num(coverage[k])) || !list(coverage.by_horizon,r=>num(r.horizon)&&num(r.eligible)&&num(r.paired)&&object(r.excluded)&&Object.values(r.excluded).every(num)) || !list(coverage.rejected_quantile_dates,r=>typeof r.date==='string'&&typeof r.reason==='string'&&num(r.n))) return fail();
  if (!list(value.summary,r=>num(r.horizon)&&moment(r.ic)&&moment(r.rank_ic)&&moment(r.spread)&&list(r.quantile_means,q=>num(q.quantile)&&moment(q)))) return fail();
  if (!['ic','rank_ic','spread'].every(k=>list(value[k],r=>typeof r.date==='string'&&num(r.horizon)&&nullable(r.value)))) return fail();
  if (!list(value.quantile_returns,r=>typeof r.date==='string'&&num(r.horizon)&&num(r.quantile)&&nullable(r.mean_return)&&num(r.n)&&num(r.selected_n))) return fail();
  if (!list(value.turnover,r=>typeof r.date==='string'&&num(r.quantile)&&nullable(r.value)&&num(r.n))) return fail();
  if (!list(value.stability,r=>typeof r.kind==='string'&&typeof r.period==='string'&&num(r.horizon)&&num(r.observations)&&['ic_mean','rank_ic_mean','spread_mean'].every(k=>nullable(r[k])))) return fail();
  if (!list(value.cost_sensitivity,r=>num(r.horizon)&&num(r.cost_bps)&&num(r.n)&&['top_mean','bottom_mean','spread_mean'].every(k=>nullable(r[k])))) return fail();
  return value as unknown as Evaluation;
}
export const percent = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) ? (v*100).toFixed(2)+'%' : '—';
export const excludedReason: Record<string,string> = { insufficient_label_buffer:'标签缓冲不足', missing_entry_price:'缺少入场收盘价', missing_exit_price:'缺少退出收盘价', missing_path_price:'持有区间存在缺失价', nonfinite_return:'收益数值不可用', insufficient_factor_cross_section:'截面有效股票不足', tied_quantile_edges:'因子并列导致分组边界重合', empty_quantile:'存在空分组' };
