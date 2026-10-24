import { useEffect, useRef, useState } from 'react';
import { pct } from '../shared/api';
import { fileHref } from '../shared/strategy-files';
import { ErrorNotice } from '../shared/ui';
import { BacktestComparison } from './BacktestComparison';
import { createdTime, duration, frequencyLabel, lastPage, optionalColumns, optionalValue, pageOf, pageSize, recordStatus, resultHref, returnClass, selectRecords, type BacktestRecord, type OptionalColumn, type StrategyBacktests, type StrategyIdentity } from './history-model';

export function BacktestList({identity, data, loading, error, refresh, editor}: {
  identity: StrategyIdentity; data: StrategyBacktests|null; loading:boolean; error:string; refresh:()=>void; editor?:string;
}) {
  const [search,setSearch] = useState(''), [page,setPage] = useState(1);
  const [columns,setColumns] = useState<Set<OptionalColumn>>(() => new Set(['created']));
  const [selected,setSelected] = useState<Set<string>>(() => new Set());
  const [comparison,setComparison] = useState<{records:BacktestRecord[];mode:'source'|'results'}|null>(null);
  const allCheckbox = useRef<HTMLInputElement>(null);
  const filtered = selectRecords(data?.records || [],search), pages = lastPage(filtered.length), currentPage = Math.min(page,pages);
  const visible = pageOf(filtered,currentPage), checked = visible.filter(record=>selected.has(record.id)).length;
  const chosen = filtered.filter(record=>selected.has(record.id));
  const extraColumns = optionalColumns.filter(column=>column.key!=='created'&&columns.has(column.key));
  const latest = selectRecords(data?.records || [],'')[0], strategy = data?.strategy || identity;
  const editorLink = editor || (strategy.path ? fileHref(strategy.path) : null);
  useEffect(()=>{if(allCheckbox.current)allCheckbox.current.indeterminate=checked>0&&checked<visible.length;},[checked,visible.length]);
  useEffect(()=>{setSearch('');setPage(1);setSelected(new Set());setComparison(null);},[identity.id]);
  function toggle(id:string, checked:boolean) {setSelected(previous=>{const next=new Set(previous);checked?next.add(id):next.delete(id);return next;});}
  function filter(value:string) {setSearch(value);setPage(1);setSelected(new Set());}
  function changeColumn(column:OptionalColumn) {setColumns(previous=>{const next=new Set(previous);next.has(column)?next.delete(column):next.add(column);return next;});}
  const columnCount = 10+(columns.has('created')?1:0)+extraColumns.length;

  return <>
    <div className="subnav backtest-subnav"><div className="strategy-context"><a href={editorLink||'strategies.html'} aria-label={editorLink?'返回策略':'返回策略列表'}><i className="fa fa-angle-left" aria-hidden="true"/></a><h1 title={strategy.path||strategy.name}>{strategy.name}</h1></div>
      <nav aria-label="当前策略导航">{editorLink&&<a href={editorLink}>编辑策略</a>}{latest&&<a href={resultHref(latest,strategy.id)}>回测详情</a>}<span className="current" aria-current="page">回测列表</span></nav>
    </div>
    <main className="backtest-list" aria-label={strategy.name+'的回测列表'}>
      <div className="backtest-controls"><div className="backtest-actions"><span className="backtest-count" role="status">共有{data?data.records.length:'—'}个回测</span>
        <div className="button-group"><button disabled={chosen.length<2||chosen.length>6} title="选择 2 至 6 个回测进行对比" onClick={()=>setComparison({records:chosen,mode:'results'})}><i className="fa fa-exchange" aria-hidden="true"/>回测对比</button><button disabled={chosen.length!==2} title="选择两个回测，对比冻结源码" onClick={()=>setComparison({records:chosen,mode:'source'})}><i className="fa fa-code" aria-hidden="true"/>代码对比</button><span title="历史回测保留，暂不支持删除"><button disabled aria-label="删除（历史回测保留，暂不支持删除）"><i className="fa fa-trash-o" aria-hidden="true"/>删除</button></span></div>
        {chosen.length>0&&<span className="backtest-selection">已选 {chosen.length} 项</span>}
        <label className="backtest-search"><input type="search" aria-label="搜索此策略的回测名称" placeholder="策略名称..." value={search} onChange={e=>filter(e.target.value)}/><i className="fa fa-search" aria-hidden="true"/></label>
      </div><div className="backtest-columns" role="group" aria-label="显示列">{optionalColumns.map(column=><label key={column.key}><input type="checkbox" checked={columns.has(column.key)} onChange={()=>changeColumn(column.key)}/>{column.label}</label>)}</div></div>
      <ErrorNotice message={error} retry={refresh}/>
      <div className="tablewrap" tabIndex={0} role="region" aria-label="回测记录"><table className={'backtest-table'+(extraColumns.length?' has-optional':'')}>
        <thead><tr><th scope="col" className="row-check"><input ref={allCheckbox} type="checkbox" aria-label="选择本页全部回测" disabled={!visible.length} checked={!!visible.length&&checked===visible.length} onChange={e=>{const on=e.target.checked;setSelected(previous=>{const next=new Set(previous);for(const record of visible)on?next.add(record.id):next.delete(record.id);return next;});}}/></th><th scope="col" className="row-number">#</th><th scope="col" className="run-name">策略名称</th>
          {columns.has('created')&&<th scope="col" className="run-created">创建时间</th>}<th scope="col" className="run-period">时间范围</th><th scope="col" className="run-duration">回测用时</th><th scope="col" className="run-frequency">运行频率</th><th scope="col" className="run-metric">策略收益</th><th scope="col" className="run-metric">基准收益</th><th scope="col" className="run-drawdown">最大回撤</th>{extraColumns.map(column=><th scope="col" className="run-optional" key={column.key}>{column.label}</th>)}<th scope="col" className="run-status">状态</th>
        </tr></thead><tbody>
          {visible.map((record,index)=>{const created=createdTime(record.createdAt),href=resultHref(record,strategy.id);return <tr key={record.id} aria-selected={selected.has(record.id)}><td className="row-check"><input type="checkbox" aria-label={'选择回测 '+record.id} checked={selected.has(record.id)} onChange={e=>toggle(record.id,e.target.checked)}/></td><td>{filtered.length-(currentPage-1)*pageSize-index}</td><td><a className="run-name-link" href={href} title={record.name+' · '+created.join(' ')}>{record.name}</a></td>
            {columns.has('created')&&<td><time dateTime={record.createdAt}>{created[0]}<br/>{created[1]}</time></td>}<td><span className="date-range">{record.start||'—'}<br/>- {record.end||'—'}</span></td><td title={record.durationSeconds===null?'此回测未记录运行耗时':undefined}>{duration(record.durationSeconds)}</td><td>{frequencyLabel(record.frequency)}</td><td className={returnClass(record.summary.net_return)}>{pct(record.summary.net_return)}</td><td>{pct(record.summary.benchmark_return)}</td><td>{pct(record.summary.max_drawdown)}</td>{extraColumns.map(column=><td key={column.key}>{optionalValue(record,column.key)}</td>)}<td><a className="run-status-link" href={href} title={record.error||undefined}>{recordStatus(record.status)}</a></td>
          </tr>;})}
          {!visible.length&&<tr><td colSpan={columnCount} className="empty">{loading?'正在读取回测记录…':error?'回测记录未能加载。':search?'没有匹配的回测。':'此策略还没有回测记录。'}{!loading&&!error&&!search&&editorLink&&<p><a href={editorLink}>编辑策略并开始回测</a></p>}</td></tr>}
        </tbody></table></div>
      {data&&filtered.length>0&&<div className="pagination backtest-pagination" aria-label="回测分页"><button disabled={currentPage<=1} onClick={()=>setPage(p=>p-1)} aria-label="上一页"><i className="fa fa-angle-left" aria-hidden="true"/></button>{Array.from({length:pages},(_,i)=>i+1).filter(p=>p===1||p===pages||Math.abs(p-currentPage)<=2).map((p,i,list)=><span key={p}>{i>0&&p>list[i-1]+1&&<span aria-hidden="true">… </span>}<button aria-label={'第 '+p+' 页'} aria-current={p===currentPage?'page':undefined} onClick={()=>setPage(p)}>{p}</button></span>)}<button disabled={currentPage>=pages} onClick={()=>setPage(p=>p+1)} aria-label="下一页"><i className="fa fa-angle-right" aria-hidden="true"/></button><span className="page-summary">{search?'匹配 ':''}{filtered.length} 条 · 每页 {pageSize} 条</span></div>}
      {!!data?.unassociatedCount&&<p className="notice">另有 {data.unassociatedCount} 条历史回测尚未关联策略，不计入当前列表。</p>}
    </main>
    {comparison&&<BacktestComparison records={comparison.records} mode={comparison.mode} close={()=>setComparison(null)}/>}
  </>;
}
