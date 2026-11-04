import { object, type HistoryJob } from '../shared/api.ts';

export function resultTarget(value: unknown, id: string, requestedFamily: string | null, forceHistory: boolean) {
  const record = object(value);
  const invalid = (error: string) => ({ job: null, path: null, history: true, family: requestedFamily || 'python', error });
  if (!value)
    return invalid('');
  if (record.job_id !== id || !['python', 'factors', 'daily', 'portfolio'].includes(String(record.family))
    || !record.request || typeof record.request !== 'object' || Array.isArray(record.request)
    || record.read_only !== true
    || !['current_runtime', 'runtime_unavailable', 'retired_family'].includes(String(record.execution_state)))
    return invalid('返回的任务身份或运行时信息无效，已停止显示。');
  if (requestedFamily && requestedFamily !== record.family)
    return invalid('返回的任务类型与链接不一致，已停止显示。');
  const job = value as HistoryJob;
  // Read and verify the frozen identity before selecting a runtime route. Never
  // retry an integrity/conflict error against another service or result source.
  const history = forceHistory || job.execution_state !== 'current_runtime'
    || !['python', 'factors'].includes(job.family);
  return {
    job,
    path: (history ? '/history/jobs/' : '/' + job.family + '/jobs/') + id,
    history,
    family: job.family,
    error: ''
  };
}
