import { useEffect, useState } from 'react';
import { api, errorText, object, pct, num, type Row } from '../shared/api';
import { ErrorNotice, Modal } from '../shared/ui';
import { createdTime, recordStatus, type BacktestRecord } from './history-model';

export function BacktestComparison({records, mode, close}: {records: BacktestRecord[]; mode:'results'|'source'; close:()=>void}) {
  const [data,setData] = useState<Row[]|null>(null), [error,setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(records.map(async record => {
      if (mode === 'results' && !record.hasResult) return {};
      const value = await api<Row>('/history/jobs/'+encodeURIComponent(record.id)+(mode==='source'?'/manifest':'/result'),undefined,controller.signal);
      if (value.job_id !== record.id) throw new Error('返回的记录与所选回测不一致，已停止对比。');
      if (mode === 'source' && typeof object(value.request).source !== 'string') throw new Error('此记录没有可读取的冻结源码。');
      return value;
    })).then(values => {if(!controller.signal.aborted)setData(values);}).catch(e => {if(!controller.signal.aborted)setError(errorText(e));});
    return () => controller.abort();
  },[records,mode]);
  const fields:[string,(record:BacktestRecord,index:number)=>string][] = [
    ['创建时间',r=>createdTime(r.createdAt).join(' ')],['时间范围',r=>r.start+' 至 '+r.end],['状态',r=>recordStatus(r.status)],
    ['策略收益',(_,i)=>pct(object(data?.[i].summary).net_return)],['基准收益',(_,i)=>pct(object(data?.[i].summary).benchmark_return)],
    ['最大回撤',(_,i)=>pct(object(data?.[i].summary).max_drawdown)],['夏普比率',(_,i)=>num(object(data?.[i].summary).sharpe)],
    ['初始资金',r=>num(r.initialCash,2)],['期末权益',(_,i)=>num(object(data?.[i].summary).final_equity,2)],
  ];
  return <Modal title={mode==='source'?'代码对比':'回测对比'} close={close} wide>
    <ErrorNotice message={error}/>
    {!data&&!error&&<p className="empty" role="status">正在读取所选回测…</p>}
    {data&&mode==='results'&&<div className="tablewrap"><table className="comparison-table"><thead><tr><th scope="col">指标</th>{records.map((record,index)=><th scope="col" key={record.id}>{index+1}. {record.name}</th>)}</tr></thead><tbody>{fields.map(([label,value])=><tr key={label}><th scope="row">{label}</th>{records.map((record,index)=><td key={record.id}>{value(record,index)}</td>)}</tr>)}</tbody></table><p className="note">指标来自各次回测的冻结结果；没有结果或未提供的指标显示为“—”。</p></div>}
    {data&&mode==='source'&&<><p role="status">{object(data[0].request).source===object(data[1].request).source?'两次回测的源码相同。':'两次回测的源码不同。'}</p><div className="source-comparison">{records.map((record,index)=><section key={record.id}><h3>{record.name}</h3><p className="note">{createdTime(record.createdAt).join(' ')}</p><pre tabIndex={0} aria-label={'第 '+(index+1)+' 次回测源码'}><code>{String(object(data[index].request).source)}</code></pre></section>)}</div></>}
  </Modal>;
}
