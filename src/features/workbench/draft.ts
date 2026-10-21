import type { Submission } from './api';
export interface Draft { name: string; source: string; parameters: string; securities: string; start: string; end: string; cash: string }
export const initialDraft: Draft = { name: '我的分钟策略', source: '', parameters: '{"lookback": 5, "shares": 100}', securities: '000001.XSHE, 600000.XSHG', start: '2024-03-04', end: '2024-03-05', cash: '100000' };
export const draftKey = 'aq-python-workbench-draft-v1';
export const pendingKey = 'aq-python-workbench-pending-v1';
export function readDraft(): Draft {
  try { const raw = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (raw && Object.keys(initialDraft).every(k => typeof raw[k] === 'string')) return raw as Draft;
  } catch { /* An unreadable draft never overwrites the old value on initial render. */ }
  return initialDraft;
}
export function submission(draft: Draft, key: string, environmentId: string): Submission {
  const parameters: unknown = JSON.parse(draft.parameters);
  if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') throw new Error('参数需要 JSON 对象，例如 {"lookback": 5}。');
  const securities = draft.securities.split(/[,，\s]+/).filter(Boolean);
  if (!securities.length || securities.some(s => !/^\d{6}\.(XSHE|XSHG)$/.test(s))) throw new Error('股票格式示例：000001.XSHE，600000.XSHG。');
  if (new Set(securities).size !== securities.length) throw new Error('股票池中有重复证券，请去重。');
  if (!draft.source.trim()) throw new Error('请编写或导入 Python 策略。');
  if (!draft.start || !draft.end || draft.start > draft.end) throw new Error('请选择有效的起止日期。');
  if (!Number.isFinite(Number(draft.cash)) || Number(draft.cash) <= 0) throw new Error('初始资金必须大于零。');
  return { environment_id: environmentId, name: draft.name, source: draft.source, parameters: parameters as Submission['parameters'], securities, start_date: draft.start, end_date: draft.end, initial_cash: Number(draft.cash), idempotency_key: key, trusted_local_code: true, accept_research_model: true };
}
export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
