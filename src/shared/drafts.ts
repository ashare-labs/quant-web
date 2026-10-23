import { DEFAULT_CAPITAL, parseCapital } from './capital.ts';
import { todayInShanghai, validateDateRange } from './dates.ts';
import type { components } from '../generated/api';

export type Frequency = components['schemas']['PythonCreate']['frequency'];
// The source design selects its first option, 分钟. Never infer this from Python code.
export const DEFAULT_FREQUENCY: Frequency = '1m';
export function resolveFrequency(value: unknown = DEFAULT_FREQUENCY): Frequency {
  if (value === '1m' || value === '1d') return value;
  throw new Error('请选择有效的运行频率（分钟或日）。');
}
export interface Draft {id: string; name: string; source: string; folder: string; start: string; end: string; capital: string; updated: string; filePath?: string; frequency?: Frequency}
const key = 'quantweb-strategy-drafts-v1', foldersKey = 'quantweb-folders-v1';
export function readDrafts(): Draft[] {
  const raw = localStorage.getItem(key); if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(v => v && ['id','name','source','folder','start','end','capital','updated'].every(k => typeof v[k] === 'string') && (v.filePath === undefined || typeof v.filePath === 'string') && (v.frequency === undefined || v.frequency === '1m' || v.frequency === '1d'))) throw new Error('本地草稿格式无法读取；原始内容已保留，请导出浏览器存储后检查。');
  return value as Draft[];
}
export function saveDraft(draft: Draft) { const drafts = readDrafts(); const next = {...draft, frequency: resolveFrequency(draft.frequency)}; const index = drafts.findIndex(d => d.id === draft.id); if (index >= 0) drafts[index] = next; else drafts.unshift(next); localStorage.setItem(key, JSON.stringify(drafts)); }
export function newDraft(name = '未命名策略', folder = ''): Draft {
  return {id: crypto.randomUUID(), name, source: '', folder, start: '', end: '', capital: DEFAULT_CAPITAL, frequency: DEFAULT_FREQUENCY, updated: ''};
}
export function readFolders(): string[] { const raw = localStorage.getItem(foldersKey); if (!raw) return []; const list: unknown = JSON.parse(raw); if (!Array.isArray(list) || !list.every(v => typeof v === 'string')) throw new Error('本地文件夹记录无法读取。'); return list; }
export const editorHref = (id: string) => 'strategy-editor.html?draft=' + encodeURIComponent(id);
type StrategyConfig = Pick<Draft, 'start' | 'end' | 'capital' | 'frequency'>;
export function validateDraftConfig(draft: StrategyConfig, now = new Date()) {
  validateDateRange(draft, {today: todayInShanghai(now), allowIncomplete: true});
  if (draft.capital.trim()) parseCapital(draft.capital);
  resolveFrequency(draft.frequency);
}
export function validateConfig(draft: StrategyConfig, now = new Date()) {
  validateDateRange(draft, {today: todayInShanghai(now)});
  resolveFrequency(draft.frequency);
  return parseCapital(draft.capital);
}
export function pythonBacktestConfig(draft: StrategyConfig, now = new Date()): Pick<components['schemas']['PythonCreate'], 'start_date' | 'end_date' | 'initial_cash' | 'frequency'> {
  return {start_date: draft.start, end_date: draft.end, initial_cash: validateConfig(draft, now), frequency: resolveFrequency(draft.frequency)};
}
