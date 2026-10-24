import {useState} from 'react';
import {active,api,download,errorText,num,object,pct,rows,shownStatus,type HistoryJob,type JobLogs,type PythonJob,type Row} from '../shared/api';
import {DataTable} from '../shared/DataTable';
import {Empty,ErrorNotice,JsonDetails,Reason,Status,useResource} from '../shared/ui';
import {backtestsHref} from '../backtests/history-model';
import {requestStrategy} from '../backtests/history-api';
import {strategyEditorHref} from '../strategies/project-model';
import {editorHref} from '../shared/drafts';
import {acceptedAnalysis,analysisPath,holdingRows,money,reasonText,timeParts,tradeRows} from '../results/model';
import {ResultOverview} from '../results/ResultOverview';
import '../results/results.css';

export function ResultsPage(){
  const q=new URLSearchParams(location.search),id=q.get('job'),family=q.get('family')||'python',history=q.get('history')==='1';
  const valid=id&&/^m2job-[a-f0-9]{32}$/.test(id),path=valid?(history?'/history/jobs/':family==='factors'?'/factors/jobs/':'/python/jobs/')+id:null;
  const job=useResource<PythonJob|HistoryJob>(path,5000),log=useResource<JobLogs>(path?path+'/logs':null,5000);
  const result=useResource<Row>(path&&job.data?.result?path+'/result':null);
  const [tab,setTab]=useState('收益概述'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const j=job.data,r=result.data,verifiedResult=r?.job_id===id?r:null,native=object(r?.native);
  const sourceSha=object(j?.result).snapshot_sha256;
  const expectedHash=typeof sourceSha==='string'?sourceSha:undefined;
  const inline=acceptedAnalysis(verifiedResult?.analysis,id||'',expectedHash);
  const derived=useResource<Row>(analysisPath(path,verifiedResult,inline,family));
  const analysis=inline??acceptedAnalysis(derived.data,id||'',expectedHash);
  const analysisError=derived.data&&!analysis?'派生分析与本次结果的身份或格式不一致。':derived.error;
  const request=object(j?.request),frequency=request.frequency==='1d'?'日频':request.frequency==='1m'?'分钟':String(request.frequency||'—');
  const name=String(j?.request.name||r?.name||'回测结果');
  const strategyId=requestStrategy(request),listHref=strategyId?backtestsHref({strategy:strategyId}):id?backtestsHref({job:id}):null;
  const editHref=strategyId?strategyEditorHref(strategyId):q.get('draft')?editorHref(q.get('draft')!):null;
  const refresh=()=>{job.refresh();result.refresh();log.refresh();derived.refresh();};
  const dailyReturns=new Map(analysis?.series.map(point=>[point.date,point])??[]);
  async function cancel(){
    if(!path||!j||history||!active(j))return;
    setBusy(true);try{await api(path+'/cancel',{});job.refresh();setError('');}catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return <>
    <div className="subnav"><div><a href="strategies.html"><i className="fa fa-angle-left" aria-hidden="true"/> 策略列表</a> / {name}</div>
      <nav>{editHref&&<a href={editHref}>编辑策略</a>}{id&&<a href={'strategy-editor.html?job='+encodeURIComponent(id)}>查看源码</a>}{listHref&&<a href={listHref}>回测列表</a>}</nav></div>
    {j&&<div className="run-settings"><span>设置：{String(request.start_date||'—')} 至 {String(request.end_date||'—')}</span>
      <span>初始资金 ¥ {num(request.initial_cash)}</span><span>{frequency}</span><Status job={j}/></div>}
    <div className="result result-analysis"><aside className="side" aria-label="结果视图">
      {['收益概述','交易详情','每日持仓与收益'].map(view=><button key={view} className={tab===view?'active':''} aria-pressed={tab===view} onClick={()=>setTab(view)}>{view}</button>)}
      <button className={'result-side-secondary '+(tab==='运行日志'?'active':'')} aria-pressed={tab==='运行日志'} onClick={()=>setTab('运行日志')}>运行日志</button>
    </aside><section className="result-content">
      <div className="titlebar"><h1>{tab}</h1><div className="inline-actions"><button onClick={refresh} disabled={!path}>刷新</button>
        {!history&&j&&active(j)&&<button disabled={busy||j.status==='cancelling'} onClick={cancel}>取消运行</button>}</div></div>
      {!valid&&<Empty>{id?'任务编号无效。':'暂无选中的回测任务。'}<p><a href="strategies.html">前往策略列表</a></p></Empty>}
      <ErrorNotice message={error||job.error||result.error} retry={refresh}/>
      {job.loading&&<Empty>正在读取运行状态…</Empty>}
      {j&&<>
        {['retired','runtime_unavailable'].includes(shownStatus(j))&&<Reason value={j.execution_reason}/>}<Reason value={j.error}/>
        {history&&<p className="note">只读历史 · 冻结文件完整性已由服务核对。派生分析不修改原成交和权益。</p>}
        {!history&&j.can_resume===false&&['failed','cancelled'].includes(j.status)&&<p className="notice">此 Python 任务不支持断点恢复。可读取已有日志；不能恢复已结束的内存状态。</p>}
        {!r&&!result.error&&!job.error&&<Empty>{result.loading?'正在读取冻结结果…':active(j)?'任务正在处理。结果会在运行完成后显示。':'此任务尚无已发布结果。'}</Empty>}
        {r&&r.job_id!==id?<ErrorNotice message="返回的结果与所选任务不一致，已停止显示。"/>:r&&family==='factors'?<div className="notice">这是一条因子研究记录。<a href={'factors.html?factor='+encodeURIComponent(String(object(j.request).factor_id||''))+'&job='+encodeURIComponent(id!)}>查看因子值与评价</a></div>:r&&<>
          {tab==='收益概述'&&<ResultOverview result={r} analysis={analysis} loading={derived.loading} error={analysisError}/>}
          {tab==='交易详情'&&<>
            <DataTable name="交易明细" data={tradeRows(native,analysis)} columns={[
              {key:'date',label:'日期'},{key:'order_time',label:'委托时间'},{key:'security',label:'标的'},
              {key:'side',label:'交易类型'},{key:'order_type',label:'下单类型'},{key:'quantity',label:'成交数量'},
              {key:'price',label:'成交价'},{key:'notional',label:'成交额'},{key:'pnl',label:'平仓盈亏'},{key:'fees',label:'手续费'},
            ]}/>
            <p className="note result-attribution-note">平仓盈亏按移动平均成本分摊成交费用，现金分红另列；买入成交不记平仓盈亏。
              {analysis?.trading.status==='unavailable'&&<> {reasonText(analysis.trading.reason)}，盈亏保留为空。</>}</p>
          </>}
          {tab==='每日持仓与收益'&&<>
            <h2 className="result-subheading">每日账户</h2><DataTable name="每日账户" data={rows(native.accounts)} columns={[
              {key:'at',label:'日期',value:r=>timeParts(r.at)[0]},
              {key:'total_value',label:'账户权益',value:r=>money(r.total_value)},
              {key:'available_cash',label:'可用现金',value:r=>money(r.available_cash)},
              {key:'positions_value',label:'持仓市值',value:r=>money(r.positions_value)},
              {key:'return',label:'每日收益',value:r=>pct(dailyReturns.get(timeParts(r.at)[0])?.return)},
              {key:'pnl',label:'每日盈亏',value:r=>money(dailyReturns.get(timeParts(r.at)[0])?.pnl)},
            ]}/>
            <h2 className="result-subheading">每日持仓</h2><DataTable name="每日持仓与收益" data={holdingRows(native,analysis)} columns={[
              {key:'date',label:'日期'},{key:'security',label:'标的'},{key:'quantity',label:'数量'},
              {key:'closeable',label:'可卖数量'},{key:'price',label:'收盘价 / 结算价'},
              {key:'value',label:'市值 / 价值'},{key:'pnl',label:'未实现盈亏'},{key:'weight',label:'仓位'},
            ]}/><p className="note">未实现盈亏使用包含买入费用的移动成本；分红不重复计入持仓价差。现金行不记证券浮盈。</p>
          </>}
        </>}
        {tab==='运行日志'&&<><ErrorNotice message={log.error} retry={log.refresh}/><DataTable name="任务日志" data={rows(log.data?.items)} exportable={false}
          columns={[{key:'at',label:'时间'},{key:'event',label:'事件'},{key:'details',label:'详情'}]}/>{r&&<JsonDetails title="策略日志" value={r.logs}/>}</>}
        {r&&<details className="diagnostics"><summary>数据来源与诊断</summary><p className="note">诊断 JSON 保留服务原始结果，可能包含源码、内部标识和重复字段。</p>
          <button onClick={()=>download(name+'-诊断.json',JSON.stringify(r,null,2),'application/json')}>导出诊断 JSON</button>
          <JsonDetails title="数据与模型" value={{release:r.release,preparation:r.preparation}}/>
          {analysis&&<JsonDetails title="指标口径与来源" value={{schema:analysis.schema_version,version:analysis.calculation_version,source_sha256:analysis.source_sha256,engine:analysis.engine,policy:analysis.policy,quality:analysis.quality}}/>}
          {analysisError&&<p className="note">分析读取：{analysisError}</p>}
        </details>}
      </>}
    </section></div>
  </>;
}
