import type { HistoryJob, PythonJob } from '../shared/api';
import { shownStatus } from '../shared/api';
import { duration } from '../backtests/history-model';
import { memoryText, progressView } from './progress';
import { useElapsedTime } from './useElapsedTime';
function ElapsedTime({ progress, running }: {
  progress: NonNullable<PythonJob['progress']>;
  running: boolean;
}) {
  return <b>{duration(useElapsedTime(progress, running))}</b>;
}
export function RunProgress({ job, disconnected = false }: {
  job: PythonJob | HistoryJob;
  disconnected?: boolean;
}) {
  const v = progressView(job);
  const p = v.p;
  return <div className="run-progress" role="status" aria-live="polite">
    <div className="run-progress-heading"><strong>{v.stage}</strong>
      {v.determinate && <span>交易日 {v.completed} / {v.total} · {Math.floor(v.ratio! * 100)}%</span>}</div>
    {v.running
      && <div key={job.job_id + ':' + p?.attempt} className="run-progress-track" role="progressbar" aria-label="交易日进度" aria-valuemin={0} aria-valuemax={v.total
        || undefined} aria-valuenow={v.determinate
          ? v.completed!
          : undefined}>
        <span className="run-progress-fill" style={{ width: ((v.ratio ?? 0) * 100) + '%' }} />
      </div>}
    {p ? <><div className="run-progress-metrics">
      <span>模拟日期 <b>
        {p.simulation_date || '—'}
      </b></span><span aria-live="off">耗时 <ElapsedTime progress={p} running={v.running
        && !disconnected
        && shownStatus(job) !== 'queued'} /></span>
      <span>{v.memoryLabel} <b>
        {memoryText(v.memory)}
      </b></span><span>峰值内存 <b>
        {memoryText(p.peak_rss_bytes)}
      </b></span>
    </div>{disconnected && <p className="note">连接中断，显示上次采样。</p>}</> :
      <p className="note">{v.running ? '正在等待进度采样；完成后显示真实结果。' : '此记录未保存进度采样。'}</p>}
  </div>;
}
