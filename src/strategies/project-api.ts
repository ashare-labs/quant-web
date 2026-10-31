import { api, ApiError } from '../shared/api.ts';
import { isProjectId, isStrategyPath } from '../shared/strategy-path.ts';
import { projectResponse, projectSource, sameProjectSource, type StrategyProject } from './project-model.ts';
import type { components } from '../generated/api';
export class ProjectWriteError extends Error {
  current?: StrategyProject;
  constructor(message: string, current?: StrategyProject) {
    super(message);
    this.current = current;
  }
}
function response(value: unknown, uncertain = false) {
  try {
    return projectResponse(value);
  }
  catch (error) {
    throw new ApiError(error instanceof Error ? error.message : '项目响应无效。', 'INVALID_RESPONSE', uncertain);
  }
}
export async function readProject(identity: string, signal?: AbortSignal): Promise<StrategyProject> {
  if (!isProjectId(identity) && !isStrategyPath(identity))
    throw new Error('策略项目路径无效。');
  const query = new URLSearchParams(isProjectId(identity) ? { strategy_id: identity } : { path: identity });
  const project = response(await api('/python/projects?' + query, undefined, signal));
  if (isProjectId(identity) && project.strategy_id !== identity)
    throw new ApiError('返回项目与所选策略不一致。', 'INVALID_RESPONSE', false);
  return project;
}
export async function createProject(path: string): Promise<StrategyProject> {
  if (!isStrategyPath(path))
    throw new Error('策略项目路径无效。');
  const body: components['schemas']['ProjectCreate'] = { path, entrypoint: 'main.py' };
  return response(await api('/python/projects', body), true);
}
export async function saveProject(project: StrategyProject): Promise<StrategyProject> {
  const source = projectSource({ ...project, project_id: project.strategy_id });
  try {
    const body: components['schemas']['ProjectSave'] = {
      path: project.path,
      strategy_id: project.strategy_id,
      entrypoint: source.entrypoint,
      files: source.files,
      expected_revision: project.revision
    };
    const saved = response(await api('/python/projects', body, undefined, false, 'PUT'), true);
    if (saved.strategy_id !== project.strategy_id || !sameProjectSource(saved, project))
      throw new ApiError('返回项目与本次保存不一致。', 'INVALID_RESPONSE', true);
    return saved;
  }
  catch (error) {
    if (error instanceof ApiError && error.uncertain) {
      let current: StrategyProject | undefined;
      try {
        current = await readProject(project.strategy_id);
      }
      catch { /* Keep the complete working copy when readback also fails. */ }
      const matching = current && sameProjectSource(current, project) ? current : undefined;
      throw new ProjectWriteError('保存结果尚未确认。' + (matching ? '服务已读回相同项目源码，但持久化尚未确认。' : '') + '全部编辑已保留，请重试或重新读取核对。', matching);
    }
    throw error;
  }
}
export async function moveProject(project: StrategyProject, destination: string): Promise<StrategyProject> {
  if (!isStrategyPath(destination))
    throw new Error('请输入有效的项目路径。');
  try {
    const body: components['schemas']['ProjectMove'] = {
      path: project.path,
      destination,
      strategy_id: project.strategy_id,
      expected_revision: project.revision
    };
    const moved = response(await api('/python/projects/move', body), true);
    if (moved.strategy_id !== project.strategy_id || !sameProjectSource(moved, project))
      throw new ApiError('返回项目与移动前不一致。', 'INVALID_RESPONSE', true);
    return moved;
  }
  catch (error) {
    if (error instanceof ApiError && error.uncertain) {
      let current: StrategyProject | undefined;
      try {
        current = await readProject(project.strategy_id);
      }
      catch { /* Identity readback is the only safe way to locate an uncertain move. */ }
      throw new ProjectWriteError('移动结果尚未确认。' + (current ? '已重新定位到 ' + current.path + '；' : '') + '编辑仍保留，请核对后再继续。', current);
    }
    throw error;
  }
}
