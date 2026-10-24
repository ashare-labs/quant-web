import { useEffect, useState } from 'react';
import { errorText, object, num } from '../shared/api';
import { ErrorNotice, Modal } from '../shared/ui';
import { metricDefinitions, metricText, reasonText, resultMetrics } from '../results/model';
import { comparisonNotes, readComparison, type ComparisonColumn } from './comparison-api';
import { createdTime, frequencyLabel, recordStatus, type BacktestRecord } from './history-model';

export function BacktestComparison({records, mode, close}: {records: BacktestRecord[]; mode:'results'|'source'; close:()=>void}) {
  const [data,setData] = useState<ComparisonColumn[]|null>(null), [error,setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);setError('');
    void readComparison(records,mode,controller.signal)
      .then(values => {if(!controller.signal.aborted)setData(values);})
      .catch(e => {if(!controller.signal.aborted)setError(errorText(e));});
    return () => controller.abort();
  },[records,mode]);
  const fields:[string,(record:BacktestRecord,index:number)=>string][] = [
    ['创建时间',r=>createdTime(r.createdAt).join(' ')],['时间范围',r=>r.start+' 至 '+r.end],
    ['运行频率',r=>frequencyLabel(r.frequency)],['状态',r=>recordStatus(r.status)],
    ['初始资金',r=>num(r.initialCash,2)],['期末权益',(_,i)=>num(object(data?.[i].result?.summary).final_equity,2)],
  ];
  const metrics=data?.map(column=>resultMetrics(object(column.result?.summary),column.analysis));
  return <Modal title={mode==='source'?'代码对比':'回测对比'} close={close} wide>
    <ErrorNotice message={error}/>
    {!data&&!error&&<p className="empty" role="status">正在读取所选回测…</p>}
    {data&&metrics&&mode==='results'&&<>
      {comparisonNotes(data).map(note=><p className="notice" key={note}>{note}</p>)}
      <div className="tablewrap"><table className="comparison-table"><thead><tr><th scope="col">指标</th>{records.map((record,index)=>{
        const column=data[index];
        return <th scope="col" key={record.id}>{index+1}. {record.name}
          {column.resultError?<p className="note" role="status">结果不可读：{column.resultError}</p>
            :!column.result?<p className="note">尚无已发布结果</p>
            :column.analysisError&&<p className="note" role="status">分析不可用：{column.analysisError} 保留已有冻结汇总。</p>}
        </th>;
      })}</tr></thead><tbody>
        {fields.map(([label,value])=><tr key={label}><th scope="row">{label}</th>{records.map((record,index)=><td key={record.id}>{value(record,index)}</td>)}</tr>)}
        {metricDefinitions.map(([key,label,definition])=><tr key={key}><th scope="row" title={definition}>{label}</th>{records.map((record,index)=>{
          const metric=metrics[index][key];
          return <td key={record.id}>{metricText(metric)}{metric.value===null&&<small className="comparison-reason">{reasonText(metric.reason)}</small>}</td>;
        })}</tr>)}
      </tbody></table></div>
      <p className="note">与收益概述使用同一份冻结结果分析；缺失值保留“—”。运行频率、资金和参数不同可并列查看。</p>
    </>}
    {data&&mode==='source'&&<><p role="status">{object(data[0].result?.request).source===object(data[1].result?.request).source?'两次回测的源码相同。':'两次回测的源码不同。'}</p><div className="source-comparison">{records.map((record,index)=><section key={record.id}><h3>{record.name}</h3><p className="note">{createdTime(record.createdAt).join(' ')}</p><pre tabIndex={0} aria-label={'第 '+(index+1)+' 次回测源码'}><code>{String(object(data[index].result?.request).source)}</code></pre></section>)}</div></>}
  </Modal>;
}
