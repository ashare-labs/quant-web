import { useMemo, useState } from 'react';
import { active, statusText, type Factor } from './api';
import { compatible, factorHref, sampleDraft } from './model';
import { FactorResults } from './FactorResults';
import { useFactors } from './useFactors';
import './factors.css';

export function FactorsPage({route}: {route: string}) {
  const state = useFactors(route);
  const { catalogue, factor, factorId, sources, draft, edit, job, result, jobs, pending } = state;
  const [library,setLibrary] = useState('all'), [category,setCategory] = useState('all'), [search,setSearch] = useState(''), [page,setPage] = useState(0);
  const items = catalogue?.items ?? [];
  const libraryLabels: Record<string,string> = {joinquant:'聚宽命名库',alpha191:'Alpha191',qlib_alpha158:'Qlib Alpha158'};
  const libraries = [...new Set(items.map(f=>f.library))];
  const categories = [...new Set(items.filter(f=>library==='all'||f.library===library).map(f=>f.category))];
  const filtered = useMemo(()=>items.filter(f=>(library==='all'||f.library===library)&&(category==='all'||f.category===category)&&[f.name,f.field,f.description,f.id].some(s=>s.toLowerCase().includes(search.trim().toLowerCase()))),[items,library,category,search]);
  const source = sources.find(s=>s.id===draft.source);
  const matches = !!(source && factor && compatible(source,factor));
  const factorJobs = jobs.filter(j=>!factorId || j.request.factor_id===factorId).slice().reverse();
  const pendingFactor = items.find(f=>f.id===pending?.factor_id);
  return <main className="factors-page">
    <div className="factor-page-heading"><div><span className="factor-eyebrow">FACTOR RESEARCH</span><h1>因子看板</h1><p>了解定义，查看真实数值，在同一处研究因子表现。</p></div><div className="factor-library-count"><strong>{items.length || '—'}</strong><span>因子与特征<br/>{libraries.length} 个来源库</span></div></div>
    {state.error && <div role="alert" className="factor-error">{state.error}</div>}
    {pending && <div className="factor-pending" role="status"><div><strong>上次提交尚待确认</strong><p>{pending.factor_id} · {pending.start_date} 至 {pending.end_date}。请用已保存的原请求确认结果。</p></div><button disabled={state.busy||!pendingFactor} onClick={()=>pendingFactor&&void state.run(pendingFactor,true)}>确认原请求</button></div>}
    {!catalogue && !state.error && <p role="status" className="factor-empty">正在读取已有因子目录…</p>}
    {!factorId ? <section className="factor-catalogue">
      <div className="factor-filter-bar"><div className="factor-segments" aria-label="来源库">{[['all','全部因子与特征',items.length],...libraries.map(key=>[key,libraryLabels[key]||key,items.filter(f=>f.library===key).length])].map(([key,label,count])=><button key={key} aria-pressed={library===key} onClick={()=>{setLibrary(String(key));setCategory('all');setPage(0);}}>{label}<span>{count}</span></button>)}</div><label className="factor-search">搜索因子<input value={search} placeholder="名称、代码或关键词" onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label></div>
      <div className="factor-category-bar"><span>分类</span><button aria-pressed={category==='all'} onClick={()=>{setCategory('all');setPage(0);}}>全部</button>{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>{setCategory(c);setPage(0);}}>{c}</button>)}</div>
      <p className="factor-scope-note">聚宽命名库为现有 19 项研究定义；Alpha191 采用已有显式版本。Qlib Alpha158 为官方默认价量特征。列数不代表有效策略数。</p>
      <div className="table-scroll"><table className="factor-directory"><thead><tr><th>因子名称 / 代码</th><th>来源与分类</th><th>输入</th><th>历史上下文</th><th>计算要求</th></tr></thead><tbody>{filtered.slice(page*25,(page+1)*25).map(f=><tr key={f.id}><td><a href={factorHref(f.id)}><strong>{f.name}</strong><code>{f.field}</code></a></td><td>{libraryLabels[f.library]||f.library}<small>{f.category}</small></td><td className="factor-input-list">{f.inputs.join(' · ')}</td><td>{f.warmup_rows===null?'依报告/历史':f.warmup_rows+' 个交易日'}{f.recursive_history&&<small>含递推历史</small>}</td><td><Requirement factor={f}/></td></tr>)}</tbody></table></div>
      {!filtered.length && catalogue && <p className="factor-empty">没有匹配的因子。试试代码、中文名称或其他分类。</p>}
      <div className="factor-pagination"><span>共 {filtered.length} 项</span><button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/25))}</span><button disabled={(page+1)*25>=filtered.length} onClick={()=>setPage(page+1)}>下一页</button></div>
    </section> : factor ? <>
      <a className="factor-back" href="#/factors">← 全部因子</a>
      <div className="factor-detail-layout"><section className="factor-definition">
        <span className="factor-category-label">{factor.library==='alpha191'?'Alpha191':factor.category}</span><h2>{factor.name}</h2><code className="factor-id">{factor.id}</code><p>{factor.description}</p>
        <h3>计算公式</h3><pre className="factor-formula">{factor.expression || '该保守版本保留原文歧义；可查看显式定义版本。'}</pre>
        <p className="factor-formula-note">展示记号对应已有定义，精度、舍入和初始化沿用下方版本。</p>
        {factor.library==='alpha191'&&<details className="factor-notation"><summary>公式记号说明</summary><p>O / H / L / C 是开盘、最高、最低、收盘价；V 为成交量，VWAP 为成交量加权价格。DELTA 是与前 N 期之差，DELAY 是滞后值；MEAN / SUM / STD 对给定交易日窗口统计。RANK 对本次股票截面排名，TSRANK 对单只股票的历史窗口排名。SMA 按定义递推，不能直接当作简单均值。</p></details>}
        <dl className="factor-definition-grid"><div><dt>输入</dt><dd>{factor.inputs.join('、')}</dd></div><div><dt>历史上下文</dt><dd>{factor.warmup_rows===null?'按报告可见性和历史要求':factor.warmup_rows+' 个交易日'}{factor.library==='qlib_alpha158'&&<small> 含当日；允许部分窗口输出。</small>}</dd></div><div><dt>历史与截面</dt><dd>{factor.recursive_history?'递推结果依赖所选历史起点。':'固定窗口计算。'}{factor.cross_section_rank?' 排名使用本次股票范围。':''}</dd></div></dl>
        {factor.library==='alpha191' ? <label>定义版本<select value={state.version} onChange={e=>state.setVersion(e.target.value)}><option value="gtja191.explicit.v1">显式研究定义 · 191 项</option><option value="gtja191.public.v1">原文保守定义 · 183 项及 8 项歧义</option></select></label> : <p className="factor-version">{factor.definition}</p>}
        {factor.library==='qlib_alpha158'&&<p className="factor-input-note">Ref 为滞后，Rank 为单股窗口百分位；输出保留官方 float32 语义，不额外填值或拟合标准化。VWAP 与成交量口径见结果来源。{factor.source&&<a href={factor.source} target="_blank" rel="noreferrer">官方定义 · {factor.license}</a>}</p>}
        {factor.note && <details><summary>定义说明与适用范围</summary><p>{factor.note}</p></details>}
        <div className="factor-limitations">{factor.limitations.map(s=><p key={s}>{s}</p>)}</div>
      </section><section className="factor-explore">
        <div className="factor-section-heading"><div><h2>探索真实数据</h2><p>选择已冻结的数据来源和固定股票范围。</p></div></div>
        <label>数据来源<select value={draft.source} onChange={e=>{const s=sources.find(x=>x.id===e.target.value);edit(s?sampleDraft(s):{source:''});}}><option value="">请选择已登记来源</option>{sources.map(s=><option key={s.id} value={s.id}>{s.label}{!s.ready?' · 暂不可读':''}</option>)}</select></label>
        {!sources.length && <p className="factor-input-note">尚未登记数据来源。目录和定义可正常查看；请在运行环境绑定已有冻结因子样本或日线发布。</p>}
        {source && <p className="factor-input-note">{source.ready ? `${source.first} 至 ${source.last} · ${source.total_securities} 只可查询证券` : source.error}{source.ready&&!matches&&'。当前来源不满足此因子的输入协议，请选择对应的聚宽字段快照或对应的价量面板。'}</p>}
        <label>股票范围<textarea rows={2} value={draft.securities} placeholder="600000.XSHG, 000001.XSHE" onChange={e=>edit({securities:e.target.value})}/><small>本次固定股票池；不会自动扩展为指数成分或全市场。</small></label>
        <div className="factor-dates"><label>历史起点（含预热）<input type="date" value={draft.history} onInput={e=>edit({history:e.currentTarget.value})}/></label><label>展示起点<input type="date" value={draft.start} onInput={e=>edit({start:e.currentTarget.value})}/></label><label>结束日期<input type="date" value={draft.end} onInput={e=>edit({end:e.currentTarget.value})}/></label></div>
        {factor.parameters.map(p=><label key={p.name}>{p.label}<input type="number" min={p.minimum} max={p.maximum} step={p.kind==='integer'?1:'any'} value={draft.parameters[p.name]||''} placeholder="请输入显式参数" onChange={e=>edit({parameters:{...draft.parameters,[p.name]:e.target.value}})}/></label>)}
        {factor.cross_section_rank&&<label>截面缺失处理<select value={draft.rank} onChange={e=>edit({rank:e.target.value as 'strict'|'available'})}><option value="strict">严格：成员缺失时保留不可排名状态</option><option value="available">仅对实际可用成员排名</option></select></label>}
        {catalogue?.evaluation_available ? <><label className="factor-checkbox"><input type="checkbox" checked={draft.evaluate} disabled={!source?.evaluation_basis} onChange={e=>edit({evaluate:e.target.checked,labelEnd:draft.labelEnd||draft.end})}/>同时进行单因子评价</label>{source&&!source.evaluation_basis&&<p className="factor-input-note">此来源未登记复权收盘价，因子值仍可计算；评价需要补充对应的冻结价格口径。</p>}</> : <p className="factor-input-note">当前后端尚未安装评价依赖，因子值探索可用。</p>}
        {draft.evaluate&&<fieldset className="factor-evaluation-options"><legend>评价设置</legend><div className="factor-dates"><label>收益观察期（交易日）<input value={draft.horizons} onChange={e=>edit({horizons:e.target.value})}/></label><label>分层数量<input type="number" min="2" max="20" value={draft.quantiles} onChange={e=>edit({quantiles:e.target.value})}/></label><label>最少有效股票<input type="number" min="2" max="100" value={draft.minAssets} onChange={e=>edit({minAssets:e.target.value})}/></label><label>信号滞后（交易日）<input type="number" min="1" max="252" value={draft.lag} onChange={e=>edit({lag:e.target.value})}/></label><label>方向<select value={draft.direction} onChange={e=>edit({direction:e.target.value as '1'|'-1'})}><option value="1">正向：高值在高组</option><option value="-1">反向：低值在高组</option></select></label><label>标签结束日期<input type="date" min={draft.end} value={draft.labelEnd} onInput={e=>edit({labelEnd:e.currentTarget.value})}/></label><label>单边成本情景（bp）<input value={draft.costs} onChange={e=>edit({costs:e.target.value})}/></label><label>滚动窗口（交易日）<input type="number" min="2" max="2520" value={draft.rolling} onChange={e=>edit({rolling:e.target.value})}/></label></div><p className="factor-input-note">展示区间也是信号区间。标签缓冲不足会保留缺失，不补行情。股票不足或数值并列时，IC 或分组可能为空。先确定方向和参数再查看结果。</p><small>收益价格：{source?.evaluation_basis}</small></fieldset>}
        <div className="factor-run-actions"><button className="primary" disabled={state.busy||!!pending||!matches||!factor.expression||(draft.evaluate&&(!catalogue?.evaluation_available||!source?.evaluation_basis))} onClick={()=>void state.run(factor)}>{state.busy?'正在提交…':draft.evaluate?'计算并评价':'计算因子值'}</button><p>结果会保留，可刷新或从运行记录恢复。</p></div>
      </section></div>
      {job && <div className="factor-job-status" role="status"><div><strong>{statusText[job.status]||job.status}</strong><p>{job.request.start_date} 至 {job.request.end_date} · {job.request.securities.length} 只股票 · {job.request.definition}</p>{job.error&&<p className="factor-missing">{String(job.error.message||job.error.code)}</p>}{job.recovery_required&&<p>计算进程已中断。请保留此记录，明确新建一次运行。</p>}</div>{active(job)&&<button disabled={state.busy} onClick={()=>void state.cancel()}>取消计算</button>}</div>}
      {result && <FactorResults key={result.job_id} result={result}/>}
    </> : catalogue && <div className="factor-empty"><h2>未找到该因子</h2><a href="#/factors">返回目录</a></div>}
    {!!factorJobs.length&&<details className="factor-runs" open={!!job}><summary>运行记录 · {factorJobs.length}</summary><div>{factorJobs.map(j=><a key={j.job_id} className={j.job_id===job?.job_id?'current':''} href={factorHref(j.request.factor_id)+'/jobs/'+j.job_id}><span><strong>{j.request.name}</strong><small>{j.request.start_date} 至 {j.request.end_date} · {j.request.securities.length} 只股票</small></span><span className={'badge '+j.status}>{statusText[j.status]}</span></a>)}</div></details>}
  </main>;
}

function Requirement({factor}: {factor: Factor}) {
  const labels: Record<string,string> = {IMPLEMENTED:'已实现',IMPLEMENTED_WITH_SCOPE_LIMITS:'已有研究定义',REQUIRES_BENCHMARK:'需基准行情',REQUIRES_EXTERNAL_FACTORS:'需外部因子',REQUIRES_EXPLICIT_SEED:'需递推初值',REQUIRES_EXPLICIT_PARAMETER:'需显式参数',AMBIGUOUS_FORMULA:'原文歧义'};
  return <span className={'factor-requirement '+(factor.availability.startsWith('IMPLEMENTED')?'available':'')}>{labels[factor.availability]||factor.availability}</span>;
}
