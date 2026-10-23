import type { Factor, Source, Submission } from './api';

export interface Draft { source: string; securities: string; history: string; start: string; end: string; parameters: Record<string, string>; rank: 'strict' | 'available'; evaluate: boolean; labelEnd: string; horizons: string; quantiles: string; lag: string; direction: '1' | '-1'; minAssets: string; costs: string; rolling: string }
export const draftKey = 'qw-factor-draft-v2';
export const pendingKey = 'qw-factor-pending-v2';
export const emptyDraft: Draft = { source: '', securities: '', history: '', start: '', end: '', parameters: {}, rank: 'strict', evaluate: false, labelEnd:'', horizons:'1, 5, 10', quantiles:'5', lag:'1', direction:'1', minAssets:'5', costs:'0, 5, 10, 20', rolling:'20' };
export function readDraft(): Draft {
  try { const value = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (value && ['source','securities','history','start','end'].every(k => typeof value[k] === 'string') && value.parameters && typeof value.parameters === 'object') return { ...emptyDraft, ...value };
  } catch { /* Keep an unreadable draft untouched. */ }
  return emptyDraft;
}
export function compatible(source: Source, factor: Factor) {
  if (!source.ready) return false;
  return ['alpha191','qlib_alpha158'].includes(factor.library) ? source.capabilities.includes(factor.library) : source.capabilities.includes(factor.entrypoint.endsWith('compute_panel') ? 'joinquant_panel' : 'joinquant_research');
}
const validDate = (d:string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function submission(draft: Draft, factor: Factor, environment: string, key: string): Submission {
  const securities = draft.securities.split(/[,，\s]+/).filter(Boolean);
  if (!draft.source) throw new Error('请选择真实数据来源。');
  if (!securities.length || securities.length > 100 || new Set(securities).size !== securities.length || securities.some(s => !/^(?:[0-9]{6}\.X(?:SHG|SHE)|BJ\.[0-9]{6})$/.test(s))) throw new Error('请选择 1–100 个不重复的证券，格式如 600000.XSHG。');
  if (![draft.history,draft.start,draft.end].every(validDate) || draft.history > draft.start || draft.start > draft.end) throw new Error('日期应满足：历史起点 ≤ 展示起点 ≤ 结束日期。');
  const parameters: Record<string, number> = {};
  for (const p of factor.parameters) {
    const text = draft.parameters[p.name]; const v = Number(text);
    if (!text?.trim() || !Number.isFinite(v) || (p.kind === 'integer' && !Number.isInteger(v)) || (p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum)) throw new Error(`请填写有效的${p.label}。`);
    parameters[p.name] = v;
  }
  let evaluation: Submission['evaluation'] = null;
  if (draft.evaluate) {
    if (!validDate(draft.labelEnd)||draft.labelEnd<draft.end) throw new Error('评价标签结束日期必须不早于信号结束日期。');
    const integer = (text:string,min:number,max:number) => { const v=Number(text); if (!text.trim()||!Number.isInteger(v)||v<min||v>max) throw new Error(`评价参数应是 ${min}–${max} 的整数。`); return v; };
    const horizons=draft.horizons.split(/[,，\s]+/).filter(Boolean).map(v=>integer(v,1,252)), costs=draft.costs.split(/[,，\s]+/).filter(Boolean).map(Number);
    if (!horizons.length||horizons.length>8||new Set(horizons).size!==horizons.length||!costs.length||costs.length>8||new Set(costs).size!==costs.length||costs.some(v=>!Number.isFinite(v)||v<0||v>1000)) throw new Error('请填写 1–8 个不重复的收益观察期和成本情景。');
    evaluation={horizons,quantiles:integer(draft.quantiles,2,20),lag:integer(draft.lag,1,252),direction:draft.direction==='-1'?-1:1,min_assets:integer(draft.minAssets,2,100),cost_bps:costs,rolling_window:integer(draft.rolling,2,2520)};
  }
  return { environment_id: environment, idempotency_key: key, name: factor.name + ' · 因子探索', factor_id: factor.id, definition: factor.definition, source_id: draft.source, securities, history_start: draft.history, start_date: draft.start, end_date: draft.end, label_end:draft.evaluate?draft.labelEnd:null, parameters, rank_policy: draft.rank, evaluation };
}
export const reasonText: Record<string,string> = { OK: '有效', QLIB_NAN: 'Qlib 输出未定义或缺失', POSITIVE_INFINITY: 'Qlib 正无穷', NEGATIVE_INFINITY: 'Qlib 负无穷', ok: '有效', computed: '有效', missing: '缺失', WARMUP: '预热不足', MISSING_INPUT: '缺少输入', UNDEFINED_MATH: '数学上未定义', OUT_OF_UNIVERSE: '不在股票范围', INCOMPLETE_RANK_POOL: '截面成员不完整', AMBIGUOUS_FORMULA: '原文公式有歧义', MISSING_DEPENDENCY: '缺少外部依赖' };
export const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN',{maximumSignificantDigits:7}) : '—';
export const factorHref = (id: string) => 'factors.html?factor=' + encodeURIComponent(id);
export function containsRequest(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (!actual || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length===expected.length && expected.every((v,i)=>containsRequest(actual[i],v));
  return Object.entries(expected).every(([key,v])=>containsRequest((actual as Record<string,unknown>)[key],v));
}
