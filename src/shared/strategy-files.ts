import type { components } from '../generated/api';
import { api, ApiError, object } from './api.ts';
import { isStrategyId, isStrategyPath } from './strategy-path.ts';

export type StrategyDirectory = components['schemas']['StrategyDirectory'];
type StrategyPath = components['schemas']['StrategyPath'];
type StrategyFilePath = components['schemas']['StrategyFilePath'];
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

export function fileIdentity(value: unknown, uncertain = false): StrategyFilePath {
  const result=object(value);
  if(!isStrategyId(result.path)||result.strategy_id!==result.path)throw new ApiError('文件响应的路径或策略身份无效。','INVALID_RESPONSE',uncertain);
  return {path:result.path,strategy_id:result.path};
}
export function strategyDirectory(value: unknown): StrategyDirectory {
  const result=object(value),seen=new Set<string>();
  if(!isStrategyPath(result.path,true)||typeof result.root!=='string'||!Array.isArray(result.entries))throw new ApiError('目录响应无法读取。','INVALID_RESPONSE',false);
  for(const item of result.entries){
    const entry=object(item);
    if(!isStrategyPath(entry.path)||parentDirectory(entry.path)!==result.path||entry.name!==entry.path.split('/').at(-1)
      ||!['directory','file'].includes(String(entry.kind))||seen.has(entry.path))throw new ApiError('目录项路径不属于当前目录或格式无效。','INVALID_RESPONSE',false);
    if(entry.kind==='file')fileIdentity(entry);
    else if(entry.strategy_id!=null)throw new ApiError('目录不能作为策略文件。','INVALID_RESPONSE',false);
    seen.add(entry.path);
  }
  return value as StrategyDirectory;
}
export async function createDirectory(path: string) {
  if(!isStrategyPath(path))throw new Error('文件夹路径无效。');
  const result=await api<StrategyPath>('/python/directories',{path});
  if(!isStrategyPath(result?.path))throw new ApiError('文件夹响应路径无效。','INVALID_RESPONSE',true);
  return result;
}
export async function readStrategyFile(path: string, signal?: AbortSignal) {
  if(!isStrategyId(path))throw new ApiError('策略文件路径无效。','INVALID_PATH',false);
  const result = await api<StrategySource>('/python/files?path=' + encodeURIComponent(path), undefined, signal);
  fileIdentity(result);
  if (typeof result.source !== 'string') throw new ApiError('文件响应源码无法读取。', 'INVALID_RESPONSE', false);
  return result;
}

export class StrategySaveError extends Error {
  readbackMatches: boolean;
  readbackPath?: string;
  constructor(message: string, readbackMatches = false, readbackPath?: string) { super(message); this.readbackMatches = readbackMatches; this.readbackPath=readbackPath; }
}

export async function saveStrategyFile(path: string, source: string, overwrite: boolean) {
  if(!isStrategyId(path))throw new ApiError('策略文件路径无效。','INVALID_PATH',false);
  const body: StrategySave = {path, source, overwrite};
  try {
    const result = await api<StrategyFilePath>('/python/files', body, undefined, false, 'PUT');
    fileIdentity(result,true);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.uncertain) {
      let matches = false, checked = false, readbackPath:string|undefined;
      try { const current = await readStrategyFile(path); matches = current.source === source; readbackPath=current.path; checked = true; } catch { /* Keep the user's editor content if readback also fails. */ }
      throw new StrategySaveError('保存结果尚未确认。' + (matches ? '服务已读回相同源码，但持久化仍未确认。' : checked ? '服务读回的源码与本次编辑不同。' : '重新读取文件也未成功。') + '编辑内容已保留，请稍后重试或重新打开核对。', matches, readbackPath);
    }
    if (error instanceof ApiError && error.code === 'STRATEGY_FILE_EXISTS') throw new StrategySaveError('同名文件已存在；请打开该文件后编辑保存，或使用其他名称。');
    throw error;
  }
}
