import { object } from '../shared/api.ts';
import { isProjectId, isStrategyFilePath, isStrategyPath } from '../shared/strategy-path.ts';
import type { components } from '../generated/api';
export type ProjectSource = components['schemas']['PythonProject'];
export type StrategyProject = components['schemas']['ProjectSource'];
export const projectHref = (id: string) => 'strategy-editor.html?project=' + encodeURIComponent(id);
export const strategyEditorHref = (id: string) => isProjectId(id)
  ? projectHref(id)
  : 'strategy-editor.html?file=' + encodeURIComponent(id);
export function projectFilePath(path: string): string {
  if (!isStrategyFilePath(path))
    throw new Error('请输入项目内的 Python 文件路径，例如 helpers.py 或 signals/momentum.py。');
  const keywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  const parts = path.slice(0, -3).split('/');
  if (parts.some(part => !/^[_\p{ID_Start}][_\p{ID_Continue}]*$/u.test(part)
    || part.normalize('NFKC') !== part
    || keywords.has(part)
    || part === '__pycache__'))
    throw new Error('Python 文件和子目录请使用有效模块名，例如 signals/momentum.py；不能使用空格、连字符或 Python 保留字。');
  return path;
}
export function sourceFiles(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('项目源码清单无法读取。');
  const entries = Object.entries(value);
  const seen = new Set<string>();
  const spellings = new Map<string, string>();
  if (!entries.length)
    throw new Error('项目至少需要一个 Python 入口文件。');
  for (const [path, source] of entries) {
    projectFilePath(path);
    if (typeof source !== 'string')
      throw new Error('项目文件内容必须是文本。');
    const canonical = path.normalize('NFC').toLocaleLowerCase('en-US');
    if (seen.has(canonical))
      throw new Error('项目内存在重名文件，请使用不同名称。');
    seen.add(canonical);
    for (let index = 1; index <= path.split('/').length; index++) {
      const prefix = path.split('/').slice(0, index).join('/');
      const key = prefix.normalize('NFC').toLocaleLowerCase('en-US');
      if (spellings.has(key) && spellings.get(key) !== prefix)
        throw new Error('项目内文件或目录的大小写名称冲突。');
      spellings.set(key, prefix);
    }
  }
  for (const path of seen)
    for (const parent of path.split('/').slice(0, -1).map((_, i) => path.split('/').slice(0, i + 1).join('/'))) {
      if (seen.has(parent) || seen.has(parent + '.py'))
        throw new Error('模块文件与同名包目录冲突。');
    }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}
export function projectSource(value: unknown): ProjectSource {
  const data = object(value);
  if (!isProjectId(data.project_id) || typeof data.entrypoint !== 'string')
    throw new Error('项目身份或入口无效。');
  const files = sourceFiles(data.files);
  if (!Object.hasOwn(files, data.entrypoint))
    throw new Error('项目入口必须是项目中的 Python 文件。');
  return { project_id: data.project_id, entrypoint: data.entrypoint, files };
}
export function projectResponse(value: unknown): StrategyProject {
  const data = object(value);
  if (!isStrategyPath(data.path)
    || !isProjectId(data.strategy_id)
    || typeof data.revision !== 'string'
    || !/^[a-f0-9]{64}$/.test(data.revision))
    throw new Error('项目响应的路径、身份或版本无效。');
  const source = projectSource({ ...data, project_id: data.strategy_id });
  return {
    path: data.path,
    strategy_id: data.strategy_id,
    entrypoint: source.entrypoint,
    files: source.files,
    revision: data.revision
  };
}
export const sameFiles = (left: Record<string, string>, right: Record<string, string>) => Object.keys(left).length === Object.keys(right).length
  && Object.entries(left).every(([path, source]) => Object.hasOwn(right, path)
    && right[path] === source);
export const sameProjectSource = (left: Pick<ProjectSource, 'entrypoint' | 'files'>, right: Pick<ProjectSource, 'entrypoint' | 'files'>) => left.entrypoint === right.entrypoint
  && sameFiles(left.files, right.files);
export function renameProjectFile(source: Pick<ProjectSource, 'entrypoint' | 'files'>, from: string, to: string) {
  projectFilePath(to);
  if (!Object.hasOwn(source.files, from))
    throw new Error('找不到要改名的文件。');
  if (from !== to && Object.hasOwn(source.files, to))
    throw new Error('同名文件已存在。');
  const files = { ...source.files };
  delete files[from];
  Object.defineProperty(files, to, {
    value: source.files[from],
    enumerable: true,
    configurable: true,
    writable: true
  });
  return {
    entrypoint: source.entrypoint === from
      ? to
      : source.entrypoint,
    files: sourceFiles(files)
  };
}
export function deleteProjectFile(source: Pick<ProjectSource, 'entrypoint' | 'files'>, path: string) {
  if (path === source.entrypoint)
    throw new Error('请先选择其他入口文件，再删除当前入口。');
  if (!Object.hasOwn(source.files, path))
    throw new Error('找不到要删除的文件。');
  const files = { ...source.files };
  delete files[path];
  return { ...source, files: sourceFiles(files) };
}
export function projectDescriptor(project: Pick<StrategyProject, 'strategy_id' | 'entrypoint'>) {
  return 'format_version = 1\nproject_id = ' + JSON.stringify(project.strategy_id) + '\nentrypoint = ' + JSON.stringify(project.entrypoint) + '\n';
}
export interface FrozenSource {
  entrypoint: string;
  files: Record<string, string>;
  projectId: string | null;
}
export function frozenSource(request: unknown): FrozenSource {
  const data = object(request);
  if (data.project != null) {
    const source = projectSource(data.project);
    if (data.strategy_id != null && data.strategy_id !== source.project_id)
      throw new Error('冻结项目源码与策略身份不一致。');
    return { ...source, projectId: source.project_id };
  }
  if (typeof data.source !== 'string')
    throw new Error('此记录没有可读取的冻结源码。');
  return {
    entrypoint: 'strategy.py',
    files: { 'strategy.py': data.source },
    projectId: null
  };
}
export function sourceChanges(left: FrozenSource, right: FrozenSource) {
  return [...new Set([
    ...Object.keys(left.files),
    ...Object.keys(right.files)
  ])].sort().map(path => ({
    path,
    status: !Object.hasOwn(left.files, path)
      ? 'added'
      : !Object.hasOwn(right.files, path)
        ? 'removed'
        : left.files[path] === right.files[path]
          ? 'unchanged'
          : 'changed'
  }));
}
