import { useMemo, useState } from 'react';
import type { Result } from './api';
import { number, reasonText } from './model';
import { FactorChart } from './FactorChart';
import { FactorEvaluation } from './FactorEvaluation';

export function FactorResults({ result }: {result: Result}) {
  const [tab,setTab] = useState('series'), [security,setSecurity] = useState(result.request.securities[0]);
  const dates = useMemo(() => [...new Set(result.rows.map(r=>r.date))].sort(),[result]);
  const [day,setDay] = useState(dates.at(-1) || '');
  const [page,setPage] = useState(0);
  const timeRows = result.rows.filter(r=>r.security===security);
  const crossRows = result.rows.filter(r=>r.date===day).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
  const tableRows = tab === 'cross' ? crossRows : timeRows;
  return <section className="factor-result" aria-label="因子计算结果">
    <div className="factor-section-heading"><div><h2>真实样本结果</h2><p>{result.request.start_date} 至 {result.request.end_date} · {result.request.securities.length} 只股票 · {result.request.definition}</p></div><span className="badge succeeded">计算已完成</span></div>
    <div className="factor-metrics"><div><small>有效数值</small><strong>{number(result.summary.valid_cells)}</strong></div><div><small>缺失单元</small><strong>{number(result.summary.missing_cells)}</strong></div><div><small>覆盖率</small><strong>{typeof result.summary.coverage === 'number' ? (result.summary.coverage*100).toFixed(1)+'%' : '—'}</strong></div><div><small>数值范围</small><strong>{number(result.summary.minimum)} ~ {number(result.summary.maximum)}</strong></div></div>
    <div className="factor-tabs" role="tablist" aria-label="结果视图">{[['series','时间序列'],['cross','每日截面'],['evaluation','单因子评价']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);setPage(0);}}>{label}</button>)}</div>
    {tab==='evaluation' ? <FactorEvaluation value={result.evaluation}/> : <>
      <div className="factor-chart-controls">{tab==='series' ? <label>证券<select value={security} onChange={e=>{setSecurity(e.target.value);setPage(0);}}>{result.request.securities.map(s=><option key={s}>{s}</option>)}</select></label> : <label>截面日期<select value={day} onChange={e=>{setDay(e.target.value);setPage(0);}}>{dates.map(d=><option key={d}>{d}</option>)}</select></label>}<p>缺失值保留为空，不连接缺失区间。截面排名仅对应本次固定股票范围。</p></div>
      {tableRows.some(r=>r.value!==null) ? <FactorChart labels={tableRows.map(r=>tab==='series'?r.date:r.security)} series={[{name:String(result.factor.name),values:tableRows.map(r=>r.value)}]} bar={tab==='cross'} label={tab==='series'?'因子真实数值时间序列':'所选日期的因子截面'}/> : <p className="factor-empty">该选择没有有效数值，请查看下方缺失原因和输入要求。</p>}
      <div className="table-scroll"><table><thead><tr><th>日期</th><th>证券</th><th>因子值</th><th>状态 / 原因</th></tr></thead><tbody>{tableRows.slice(page*100,(page+1)*100).map(r=><tr key={r.date+r.security}><td>{r.date}</td><td>{r.security}</td><td className="factor-numeric">{r.value_text ?? (r.value===null?'—':String(r.value))}</td><td><span className={r.value===null?'factor-missing':''}>{reasonText[r.status] || r.status}</span>{r.reason && r.reason!==r.status && <small className="factor-reason">{r.reason}</small>}</td></tr>)}</tbody></table></div>
      {tableRows.length>100 && <div className="factor-pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button><span>{page+1} / {Math.ceil(tableRows.length/100)}</span><button disabled={(page+1)*100>=tableRows.length} onClick={()=>setPage(page+1)}>下一页</button></div>}
    </>}
    <details className="factor-provenance"><summary>来源、版本与缺失统计</summary><pre>{JSON.stringify({provenance:result.provenance,status_counts:result.summary.status_counts},null,2)}</pre></details>
  </section>;
}

