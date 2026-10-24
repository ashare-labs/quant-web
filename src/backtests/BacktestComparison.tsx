import { useEffect, useState } from 'react';
import { errorText, object, num } from '../shared/api';
import { ErrorNotice, Modal } from '../shared/ui';
import { metricDefinitions, metricText, reasonText, resultMetrics } from '../results/model';
import { comparisonNotes, readComparison, type ComparisonColumn } from './comparison-api';
import { createdTime, frequencyLabel, recordStatus, type BacktestRecord } from './history-model';
import { frozenSource, sameProjectSource, sourceChanges } from '../strategies/project-model';
import { CodeEditor } from '../strategies/CodeEditor';

export function BacktestComparison({records, mode, close}: {records: BacktestRecord[]; mode:'results'|'source'; close:()=>void}) {
  const [data,setData] = useState<ComparisonColumn[]|null>(null), [error,setError] = useState(''),[selectedFile,setSelectedFile]=useState('');
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
  const sources=data&&mode==='source'?data.map(column=>frozenSource(column.result?.request)):null;
  const changes=sources?sourceChanges(sources[0],sources[1]):[],currentFile=changes.some(item=>item.path===selectedFile)?selectedFile:changes[0]?.path;
  const changeLabels:Record<string,string>={added:'新增',removed:'删除',changed:'修改',unchanged:'相同'};
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
    {sources&&<><p role="status">{sameProjectSource(sources[0],sources[1])?'两次回测的完整源码与入口相同。':'两次回测的源码或入口不同。'}</p>
      <label className="source-file-select">对比文件<select value={currentFile} onChange={e=>setSelectedFile(e.target.value)}>{changes.map(item=><option key={item.path} value={item.path}>{item.path} · {changeLabels[item.status]}</option>)}</select></label>
      <div className="source-comparison">{records.map((record,index)=><section key={record.id}><h3>{record.name}</h3><p className="note">{createdTime(record.createdAt).join(' ')} · 入口：{sources[index].entrypoint}</p>{Object.hasOwn(sources[index].files,currentFile)?<div className="comparison-code"><CodeEditor key={record.id} path={currentFile} value={sources[index].files[currentFile]} readOnly onChange={()=>{}}/></div>:<p className="empty">此版本不包含 {currentFile}</p>}</section>)}</div></>}
  </Modal>;
}
