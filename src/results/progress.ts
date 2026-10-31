import { active, shownStatus, statusLabels, type PythonJob, type HistoryJob } from '../shared/api.ts';
export function stopJobPolling(job: PythonJob | HistoryJob) { return !active(job); }
export function progressView(job: PythonJob | HistoryJob) {
  const p = job.progress?.job_id === job.job_id ? job.progress : null;
  const running = active(job);
  const status = shownStatus(job);
  const stages: Record<string, string> = {
    preparing: '正在准备数据',
    executing: '正在执行策略',
    finalizing: '正在封存结果',
    publishing: '正在校验并发布结果'
  };
  const stage = !running
    ? statusLabels[status]
    || status
    : status === 'cancelling'
      ? '正在取消'
      : status === 'queued'
        ? '等待运行'
        : stages[p?.phase
        || '']
        || '正在启动回测';
  const total = p?.total_trading_days;
  const completed = p?.completed_trading_days;
  const valid = Number.isSafeInteger(total)
    && total! > 0
    && Number.isSafeInteger(completed)
    && completed! >= 0
    && completed! <= total!;
  const determinate = valid && p?.phase !== 'preparing';
  const memory = running && !p?.terminal ? p?.current_rss_bytes : p?.last_rss_bytes;
  return {
    p, stage, running, determinate, total: valid
      ? total!
      : null, completed: valid
        ? completed!
        : null,
    ratio: determinate
      ? completed! / total!
      : null, memory, memoryLabel: running
        && !p?.terminal
        ? '当前内存'
        : '最后采样内存'
  };
}
export function memoryText(bytes: number | null | undefined) {
  return typeof bytes === 'number'
    && Number.isFinite(bytes)
    && bytes >= 0
    ? (bytes / 1024 ** 2).toFixed(1) + ' MiB'
    : '—';
}
