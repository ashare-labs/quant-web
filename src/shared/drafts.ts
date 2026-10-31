import { accountStorage } from '../auth/session.ts';
import { DEFAULT_CAPITAL, parseCapital } from './capital.ts';
import { todayInShanghai, validateDateRange } from './dates.ts';
import type { components } from '../generated/api';
import { randomId } from './random-id.ts';
import { isStrategyFilePath } from './strategy-path.ts';
export type Frequency = components['schemas']['PythonCreate']['frequency'];
// The source design selects its first option, 分钟. Never infer this from Python code.
export const DEFAULT_FREQUENCY: Frequency = '1m';
export function resolveFrequency(value: unknown = DEFAULT_FREQUENCY): Frequency {
  if (value === '1m' || value === '1d')
    return value;
  throw new Error('请选择有效的运行频率（分钟或日）。');
}
export interface Draft {
  id: string;
  name: string;
  source: string;
  folder: string;
  start: string;
  end: string;
  capital: string;
  updated: string;
  filePath?: string;
  frequency?: Frequency;
  workingCopy?: boolean;
  aliasSourcePath?: string;
}
const key = 'quantweb-strategy-drafts-v1';
const foldersKey = 'quantweb-folders-v1';
export function readDrafts(storage = accountStorage()): Draft[] {
  const raw = storage.getItem(key);
  if (!raw)
    return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)
    || !value.every(v => v
      && [
        'id',
        'name',
        'source',
        'folder',
        'start',
        'end',
        'capital',
        'updated'
      ].every(k => typeof v[k] === 'string')
      && (v.filePath === undefined
        || typeof v.filePath === 'string')
      && (v.frequency === undefined
        || v.frequency === '1m'
        || v.frequency === '1d')
      && (v.workingCopy === undefined
        || typeof v.workingCopy === 'boolean')
      && (v.aliasSourcePath === undefined
        || isStrategyFilePath(v.aliasSourcePath))))
    throw new Error('本地草稿格式无法读取；原始内容已保留，请导出浏览器存储后检查。');
  return value as Draft[];
}
export function saveDraftUpdates(updates: Draft[], storage = accountStorage()) {
  const drafts = readDrafts(storage);
  for (const draft of updates) {
    const next = { ...draft, frequency: resolveFrequency(draft.frequency) };
    const index = drafts.findIndex(d => d.id === draft.id);
    if (index >= 0)
      drafts[index] = next;
    else
      drafts.unshift(next);
  }
  storage.setItem(key, JSON.stringify(drafts));
}
export function saveDraft(draft: Draft, storage = accountStorage()) {
  saveDraftUpdates([draft], storage);
}
export function newDraft(name = '未命名策略', folder = ''): Draft {
  return {
    id: randomId(),
    name,
    source: '',
    folder,
    start: '',
    end: '',
    capital: DEFAULT_CAPITAL,
    frequency: DEFAULT_FREQUENCY,
    updated: ''
  };
}
export function readFolders(): string[] {
  const raw = accountStorage().getItem(foldersKey);
  if (!raw)
    return [];
  const list: unknown = JSON.parse(raw);
  if (!Array.isArray(list) || !list.every(v => typeof v === 'string'))
    throw new Error('本地文件夹记录无法读取。');
  return list;
}
export const editorHref = (id: string) => 'strategy-editor.html?draft=' + encodeURIComponent(id);
type StrategyConfig = Pick<Draft, 'start' | 'end' | 'capital' | 'frequency'>;
export function validateDraftConfig(draft: StrategyConfig, now = new Date()) {
  validateDateRange(draft, { today: todayInShanghai(now), allowIncomplete: true });
  if (draft.capital.trim())
    parseCapital(draft.capital);
  resolveFrequency(draft.frequency);
}
export function validateConfig(draft: StrategyConfig, now = new Date()) {
  validateDateRange(draft, { today: todayInShanghai(now) });
  resolveFrequency(draft.frequency);
  return parseCapital(draft.capital);
}
export function pythonBacktestConfig(
  draft: StrategyConfig,
  now = new Date(),
): Pick<components['schemas']['PythonCreate'], 'start_date' | 'end_date' | 'initial_cash' | 'frequency'> {
  return {
    start_date: draft.start,
    end_date: draft.end,
    initial_cash: validateConfig(draft, now),
    frequency: resolveFrequency(draft.frequency)
  };
}
