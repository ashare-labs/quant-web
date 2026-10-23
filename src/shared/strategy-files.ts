import type { components } from '../generated/api';
import { api, ApiError } from './api.ts';

export type StrategyDirectory = components['schemas']['StrategyDirectory'];
type StrategyPath = components['schemas']['StrategyPath'];
type StrategySource = components['schemas']['StrategySource'];
type StrategySave = components['schemas']['StrategySave'];

export const directoryQuery = (path: string) => '/python/directories?path=' + encodeURIComponent(path);
export const fileHref = (path: string) => 'strategy-editor.html?file=' + encodeURIComponent(path);
export const folderHref = (path: string) => 'strategies.html?folder=' + encodeURIComponent(path);
export const fileName = (name: string) => name.endsWith('.py') ? name : name + '.py';
export const displayName = (path: string) => { const name = path.slice(path.lastIndexOf('/') + 1); return name.length > 3 && name.endsWith('.py') ? name.slice(0, -3) : name; };
export const parentDirectory = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export function childPath(folder: string, name: string, python = false) {
  const leaf = name.trim();
  if (!leaf || leaf === '.' || leaf === '..' || /[\\/:\u0000-\u001f\u007f]/.test(leaf)) throw new Error('请填写有效的文件或文件夹名称，不能包含路径分隔符。');
  return (folder ? folder + '/' : '') + (python ? fileName(leaf) : leaf);
}

export const createDirectory = (path: string) => api<StrategyPath>('/python/directories', {path});
export async function readStrategyFile(path: string, signal?: AbortSignal) {
  const result = await api<StrategySource>('/python/files?path=' + encodeURIComponent(path), undefined, signal);
  if (result?.path !== path || typeof result.source !== 'string') throw new ApiError('文件响应无法读取或路径不一致。', 'INVALID_RESPONSE', false);
  return result;
}

export class StrategySaveError extends Error {
  readbackMatches: boolean;
  constructor(message: string, readbackMatches = false) { super(message); this.readbackMatches = readbackMatches; }
}

export async function saveStrategyFile(path: string, source: string, overwrite: boolean) {
  const body: StrategySave = {path, source, overwrite};
  try {
    const result = await api<StrategyPath>('/python/files', body, undefined, false, 'PUT');
    if (result?.path !== path) throw new ApiError('保存响应与文件路径不一致。', 'INVALID_RESPONSE', true);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.uncertain) {
      let matches = false, checked = false;
      try { const current = await readStrategyFile(path); matches = current.path === path && current.source === source; checked = true; } catch { /* Keep the user's editor content if readback also fails. */ }
      throw new StrategySaveError('保存结果尚未确认。' + (matches ? '服务已读回相同源码，但持久化仍未确认。' : checked ? '服务读回的源码与本次编辑不同。' : '重新读取文件也未成功。') + '编辑内容已保留，请稍后重试或重新打开核对。', matches);
    }
    if (error instanceof ApiError && error.code === 'STRATEGY_FILE_EXISTS') throw new StrategySaveError('同名文件已存在；请打开该文件后编辑保存，或使用其他名称。');
    throw error;
  }
}
