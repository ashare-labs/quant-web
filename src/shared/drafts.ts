export interface Draft {id: string; name: string; source: string; folder: string; start: string; end: string; capital: string; updated: string}
const key = 'quantweb-strategy-drafts-v1', foldersKey = 'quantweb-folders-v1';
export function readDrafts(): Draft[] {
  const raw = localStorage.getItem(key); if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(v => v && ['id','name','source','folder','start','end','capital','updated'].every(k => typeof v[k] === 'string'))) throw new Error('本地草稿格式无法读取；原始内容已保留，请导出浏览器存储后检查。');
  return value as Draft[];
}
export function saveDraft(draft: Draft) { const drafts = readDrafts(); const index = drafts.findIndex(d => d.id === draft.id); if (index >= 0) drafts[index] = draft; else drafts.unshift(draft); localStorage.setItem(key, JSON.stringify(drafts)); }
export function uniqueName(name: string, names: string[]) { const base = name.trim().slice(0, 80); if (!base) throw new Error('请填写策略名称。'); let result = base, suffix = 2; while (names.includes(result)) { const tail = ` (${suffix++})`; result = base.slice(0, 80 - tail.length) + tail; } return result; }
export function createDraft(name: string, knownNames: string[] = [], folder = '') {
  const drafts = readDrafts(); const draft: Draft = {id: crypto.randomUUID(), name: uniqueName(name, [...knownNames, ...drafts.map(d => d.name)]), source: '', folder, start: '', end: '', capital: '', updated: new Date().toISOString()}; saveDraft(draft); return draft;
}
export function readFolders(): string[] { const raw = localStorage.getItem(foldersKey); if (!raw) return []; const list: unknown = JSON.parse(raw); if (!Array.isArray(list) || !list.every(v => typeof v === 'string')) throw new Error('本地文件夹记录无法读取。'); return list; }
export function createFolder(name: string) { const folders = readFolders(); const next = uniqueName(name, folders); localStorage.setItem(foldersKey, JSON.stringify([...folders, next])); return next; }
export const editorHref = (id: string) => 'strategy-editor.html?draft=' + encodeURIComponent(id);
export function validateConfig(draft: Pick<Draft, 'start' | 'end' | 'capital'>) {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
  if (!valid(draft.start) || !valid(draft.end) || draft.start > draft.end) throw new Error('请选择有效的开始和结束日期，结束日期不能早于开始日期。');
  const cash = Number(draft.capital); if (!draft.capital.trim() || !Number.isFinite(cash) || cash <= 0 || cash > 100000000) throw new Error('初始资金须大于 0 且不超过 1 亿元。');
}
