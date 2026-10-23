import { DEFAULT_CAPITAL, parseCapital } from './capital.ts';
import { todayInShanghai, validateDateRange } from './dates.ts';

export interface Draft {id: string; name: string; source: string; folder: string; start: string; end: string; capital: string; updated: string; filePath?: string}
const key = 'quantweb-strategy-drafts-v1', foldersKey = 'quantweb-folders-v1';
export function readDrafts(): Draft[] {
  const raw = localStorage.getItem(key); if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(v => v && ['id','name','source','folder','start','end','capital','updated'].every(k => typeof v[k] === 'string') && (v.filePath === undefined || typeof v.filePath === 'string'))) throw new Error('本地草稿格式无法读取；原始内容已保留，请导出浏览器存储后检查。');
  return value as Draft[];
}
export function saveDraft(draft: Draft) { const drafts = readDrafts(); const index = drafts.findIndex(d => d.id === draft.id); if (index >= 0) drafts[index] = draft; else drafts.unshift(draft); localStorage.setItem(key, JSON.stringify(drafts)); }
export function newDraft(name = '未命名策略', folder = ''): Draft {
  return {id: crypto.randomUUID(), name, source: '', folder, start: '', end: '', capital: DEFAULT_CAPITAL, updated: ''};
}
export function readFolders(): string[] { const raw = localStorage.getItem(foldersKey); if (!raw) return []; const list: unknown = JSON.parse(raw); if (!Array.isArray(list) || !list.every(v => typeof v === 'string')) throw new Error('本地文件夹记录无法读取。'); return list; }
export const editorHref = (id: string) => 'strategy-editor.html?draft=' + encodeURIComponent(id);
export function validateDraftConfig(draft: Pick<Draft, 'start' | 'end' | 'capital'>, now = new Date()) {
  validateDateRange(draft, {today: todayInShanghai(now), allowIncomplete: true});
  if (draft.capital.trim()) parseCapital(draft.capital);
}
export function validateConfig(draft: Pick<Draft, 'start' | 'end' | 'capital'>, now = new Date()) {
  validateDateRange(draft, {today: todayInShanghai(now)});
  return parseCapital(draft.capital);
}
