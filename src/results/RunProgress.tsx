import type {HistoryJob,PythonJob} from '../shared/api';
import {dateTime} from '../shared/api';
import {duration} from '../backtests/history-model';
import {memoryText,progressView} from './progress';

export function RunProgress({job,disconnected=false}:{job:PythonJob|HistoryJob;disconnected?:boolean}){
  const v=progressView(job),p=v.p;
  return <div className="run-progress" role="status" aria-live="polite">
    <div className="run-progress-heading"><strong>{v.stage}</strong>
      {v.determinate&&<span>交易日 {v.completed} / {v.total} · {Math.floor(v.ratio!*100)}%</span>}</div>
    {v.running&&<progress aria-label="交易日进度" max={v.total||1} value={v.determinate?v.completed!:undefined}/>}
    {p?<><div className="run-progress-metrics">
      <span>模拟日期 <b>{p.simulation_date||'—'}</b></span><span>耗时 <b>{duration(p.elapsed_seconds)}</b></span>
      <span>{v.memoryLabel} <b>{memoryText(v.memory)}</b></span><span>峰值内存 <b>{memoryText(p.peak_rss_bytes)}</b></span>
    </div><p className="note">{disconnected?'连接中断；以下为上次读取的状态。 ':''}更新时间：{dateTime(p.sampled_at)} · 内存为回测子进程 RSS。</p></>:
      <p className="note">{v.running?'正在等待进度采样；完成后显示真实结果。':'此记录未保存进度采样。'}</p>}
  </div>;
}
