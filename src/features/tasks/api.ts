import type { components } from '../../generated/tasks';
import { ApiError, requestJson } from '../../shared/http';
import { canonical } from '../../shared/format.ts';
import contract from '../../../contracts/tasks.openapi.json';
import pin from '../../../contracts/tasks.identity.json';

export type Task<K extends keyof components['schemas']> = components['schemas'][K];
export { pin as taskPin };
export const tasks = <T>(path: string, body?: unknown, signal?: AbortSignal) => requestJson<T>('/tasks-api', path, body, signal);
export function taskService(identity: Task<'JobServiceIdentity'>) {
  if (identity.backend_version !== pin.version || identity.source_sha256 !== pin.source_sha256
    || identity.contract_version !== pin.contract_version || identity.independent_review_status !== 'not_reviewed') {
    throw new ApiError('TASKS_SERVICE_MISMATCH', '任务服务与当前候选源码身份不符，请同步同一 AQ 候选导出的契约。');
  }
}
export function taskSchema(value: unknown) {
  if (canonical(value) !== canonical(contract)) throw new ApiError('TASKS_CONTRACT_MISMATCH', '任务服务 OpenAPI 与当前契约不同，结果与操作已禁用。请核对 TASKS_API_URL 和配对的 AQ 候选。');
}
