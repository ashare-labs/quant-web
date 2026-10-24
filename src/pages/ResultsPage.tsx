import { lazy, Suspense, useState } from 'react';
import { active, api, csv, download, errorText, num, object, pct, rows, shownStatus, type HistoryJob, type JobLogs, type PythonJob, type Row } from '../shared/api';
import { DataTable } from '../shared/DataTable';
import { Empty, ErrorNotice, JsonDetails, Reason, Status, useResource } from '../shared/ui';
import { backtestsHref } from '../backtests/history-model';
import { requestStrategy } from '../backtests/history-api';
import { fileHref } from '../shared/strategy-files';
import { editorHref } from '../shared/drafts';
const LineChart=lazy(()=>import('../shared/LineChart'));
export function ResultsPage() {
  const q=new URLSearchParams(location.search),id=q.get('job'),family=q.get('family')||'python',history=q.get('history')==='1';
  const valid=id&&/^m2job-[a-f0-9]{32}$/.test(id), path=valid?(history?'/history/jobs/':family==='factors'?'/factors/jobs/':'/python/jobs/')+id:null;
  const job=useResource<PythonJob|HistoryJob>(path,5000), log=useResource<JobLogs>(path?path+'/logs':null,5000);
  const result=useResource<Row>(path&&job.data?.result?path+'/result':null);
  const [tab,setTab]=useState('收益概述'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const j=job.data,r=result.data,summary=object(r?.summary),native=object(r?.native),accounts=rows(native.accounts),trades=rows(native.trades),positions=accounts.flatMap(a=>Object.entries(object(a.positions)).map(([security,p])=>({at:a.at,security,...object(p)}))),name=String(j?.request.name||r?.name||'回测结果');
  const request=object(j?.request),frequency=request.frequency==='1d'?'日频':request.frequency==='1m'?'分钟':String(request.frequency||'—');
  const strategyId=requestStrategy(request),listHref=strategyId?backtestsHref({strategy:strategyId}):id?backtestsHref({job:id}):null;
  const editHref=strategyId?fileHref(strategyId):q.get('draft')?editorHref(q.get('draft')!):null;
  const metrics=[['策略收益',pct(summary.net_return)],['基准收益',pct(summary.benchmark_return)],['Alpha',num(summary.alpha)],['Beta',num(summary.beta)],['Sharpe',num(summary.sharpe)],['最大回撤',pct(summary.max_drawdown)],['期末权益',num(summary.final_equity)]];
  async function cancel(){if(!path||!j||history||!active(j))return;setBusy(true);try{await api(path+'/cancel',{});job.refresh();setError('');}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  return <><div className="subnav"><div><a href="strategies.html"><i className="fa fa-angle-left" aria-hidden="true"/> 策略列表</a> / {name}</div><nav>{editHref&&<a href={editHref}>编辑策略</a>}{id&&<a href={'strategy-editor.html?job='+encodeURIComponent(id)}>查看源码</a>}{listHref&&<a href={listHref}>回测列表</a>}</nav></div>
  {j&&<div className="run-settings"><span>设置：{String(request.start_date||'—')} 至 {String(request.end_date||'—')}</span><span>初始资金 ¥ {num(request.initial_cash)}</span><span>{frequency}</span><Status job={j}/></div>}
  <div className="result"><aside className="side" aria-label="结果视图">{['收益概述','交易详情','持仓详情','每日权益','运行日志'].map(v=><button key={v} className={tab===v?'active':''} aria-pressed={tab===v} onClick={()=>setTab(v)}>{v}</button>)}</aside><section className="result-content">
    <div className="titlebar"><h1>{tab}</h1><div className="inline-actions"><button onClick={()=>{job.refresh();result.refresh();log.refresh();}} disabled={!path}>刷新</button>{!history&&j&&active(j)&&<button disabled={busy||j.status==='cancelling'} onClick={cancel}>取消运行</button>}</div></div>
    {!valid&&<Empty>{id?'任务编号无效。':'暂无选中的回测任务。'}<p><a href="strategies.html">前往策略列表</a></p></Empty>}
    <ErrorNotice message={error||job.error||result.error} retry={()=>{job.refresh();result.refresh();}}/>
    {job.loading&&<Empty>正在读取运行状态…</Empty>}
    {j&&<>{['retired','runtime_unavailable'].includes(shownStatus(j))&&<Reason value={j.execution_reason}/>}<Reason value={j.error}/>{history&&<p className="note">只读历史 · 冻结文件完整性已由服务核对，不代表重新验证策略收益。</p>}{!history&&j.can_resume===false&&['failed','cancelled'].includes(j.status)&&<p className="notice">此 Python 任务不支持断点恢复。可读取已有日志；不能恢复已结束的内存状态。</p>}
    {!r&&!result.error&&!job.error&&<Empty>{result.loading?'正在读取冻结结果…':active(j)?'任务正在处理。结果会在运行完成后显示。':'此任务尚无已发布结果。'}</Empty>}
    {r&&r.job_id!==id?<ErrorNotice message="返回的结果与所选任务不一致，已停止显示。"/>:r&&family==='factors'?<div className="notice">这是一条因子研究记录。<a href={'factors.html?factor='+encodeURIComponent(String(object(j.request).factor_id||''))+'&job='+encodeURIComponent(id!)}>查看因子值与评价</a></div>:r&&<>
      {tab==='收益概述'&&<><div className="metrics">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="note">未提供的指标显示为“—”。收益与估值来自此次冻结结果。</p>{accounts.length?<Suspense fallback={<Empty>正在绘制权益曲线…</Empty>}><LineChart title="账户权益 · 每日收盘" labels={accounts.map(a=>String(a.at||a.date||''))} series={[{name:'账户权益',values:accounts.map(a=>typeof a.total_value==='number'?a.total_value:null)}]}/></Suspense>:<Empty>此结果未提供账户权益序列。</Empty>}<button onClick={()=>download(name+'-指标.csv',csv([['指标','数值'],...metrics]),'text/csv;charset=utf-8')}>导出指标 CSV</button></>}
      {tab==='交易详情'&&<DataTable name="交易明细" data={trades} columns={[{key:'at',label:'时间',value:r=>r.at??r.datetime},{key:'security',label:'证券',value:r=>r.security??r.order_book_id},{key:'side',label:'方向'},{key:'quantity',label:'股数',value:r=>r.quantity??r.amount},{key:'price',label:'价格'},{key:'commission',label:'佣金'},{key:'tax',label:'税费'}]}/>}
      {tab==='持仓详情'&&<DataTable name="持仓明细" data={positions} columns={[{key:'at',label:'日期',value:r=>r.at??r.date},{key:'security',label:'证券',value:r=>r.security??r.order_book_id},{key:'total_amount',label:'数量'},{key:'closeable_amount',label:'可卖数量'},{key:'value',label:'市值'},{key:'price',label:'价格'}]}/>}
      {tab==='每日权益'&&<DataTable name="每日权益" data={accounts} columns={[{key:'at',label:'时间'},{key:'total_value',label:'账户权益'},{key:'available_cash',label:'可用资金'},{key:'positions_value',label:'持仓市值'}]}/>}
    </>}
    {tab==='运行日志'&&<><ErrorNotice message={log.error} retry={log.refresh}/><DataTable name="任务日志" data={rows(log.data?.items)} exportable={false} columns={[{key:'at',label:'时间'},{key:'event',label:'事件'},{key:'details',label:'详情'}]}/>{r&&<JsonDetails title="策略日志" value={r.logs}/>}</>}
    {r&&<details className="diagnostics"><summary>数据来源与诊断</summary><p className="note">诊断 JSON 保留服务原始结果，可能包含源码、内部标识和重复字段；与上方可读 CSV 分开。</p><button onClick={()=>download(name+'-诊断.json',JSON.stringify(r,null,2),'application/json')}>导出诊断 JSON</button><JsonDetails title="数据与模型" value={{release:r.release,preparation:r.preparation}}/></details>}
    </>}
  </section></div></>;
}
