import { useEffect, useRef, useState } from 'react';
import { download, errorText, object, type HistoryStrategy } from '../shared/api';
import { readDrafts, saveDraft, validateDraftConfig, type Draft } from '../shared/drafts';
import { todayInShanghai, validDate, validateDateRange } from '../shared/dates';
import { DEFAULT_CAPITAL, unformatCapital } from '../shared/capital';
import { CapitalInput } from '../shared/CapitalInput';
import { ErrorNotice, JsonDetails, useResource } from '../shared/ui';
export function EditorPage() {
  const params = new URLSearchParams(location.search), draftId = params.get('draft'), historyId = params.get('history'), jobId = params.get('job');
  const readOnly = !!(historyId || jobId), file = useRef<HTMLInputElement>(null);
  const startInput = useRef<HTMLInputElement>(null), endInput = useRef<HTMLInputElement>(null);
  const [error,setError] = useState(''), [saved,setSaved] = useState('未保存'), [dirty,setDirty] = useState(false);
  const [today,setToday] = useState(() => todayInShanghai());
  const [draft,setDraft] = useState<Draft>(() => { try { if(draftId){const stored=readDrafts().find(d=>d.id===draftId);if(stored)return stored;} }catch{/* Report on mount. */}return {id:crypto.randomUUID(),name:'未命名策略',source:'',folder:'',start:'',end:'',capital:readOnly?'':DEFAULT_CAPITAL,updated:''}; });
  const historical = useResource<{items: HistoryStrategy[]}>(historyId?'/history/strategies':null);
  const manifest = useResource<Record<string,unknown>>(jobId?'/history/jobs/'+encodeURIComponent(jobId)+'/manifest':null);
  useEffect(()=>{try{if(draftId&&!readDrafts().some(d=>d.id===draftId))setError('找不到此本地草稿。请返回策略列表。');else if(draftId)setSaved('已保存到本地');}catch(e){setError(errorText(e));}},[draftId]);
  useEffect(()=>{if(historyId&&historical.data){const h=historical.data.items.find(s=>s.version_id===historyId);if(h)setDraft(d=>({...d,name:String(h.frozen.name||h.version_id),source:h.source||''}));else setError('历史策略不存在。');}},[historyId,historical.data]);
  useEffect(()=>{if(manifest.data){const request=object(manifest.data.request);setDraft(d=>({...d,name:String(request.name||'历史策略'),source:typeof request.source==='string'?request.source:'',start:String(request.start_date||''),end:String(request.end_date||''),capital:typeof request.initial_cash==='number'?String(request.initial_cash):''}));}},[manifest.data]);
  useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
  useEffect(()=>{
    let timer: ReturnType<typeof setTimeout>;
    const refresh=()=>{
      clearTimeout(timer);
      const now=new Date(), day=todayInShanghai(now);
      setToday(day);
      timer=setTimeout(refresh, Date.parse(day+'T00:00:00+08:00')+86400000-now.getTime());
    };
    refresh(); window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  function edit(patch:Partial<Draft>){setDraft(d=>({...d,...patch}));setDirty(true);setSaved('未保存');setError('');}
  function save(){try{if([startInput.current,endInput.current].some(input=>input?.validity.badInput))throw new Error('请选择有效的开始和结束日期。');validateDraftConfig(draft);if(!draft.name.trim())throw new Error('请填写策略名称。');const next={...draft,capital:unformatCapital(draft.capital),updated:new Date().toISOString()};saveDraft(next);setDraft(next);setSaved('已保存到本地');setDirty(false);setError('');if(!draftId)history.replaceState(null,'','strategy-editor.html?draft='+next.id);}catch(e){setError(errorText(e));}}
  let dateError='';
  if(!readOnly)try{validateDateRange(draft,{today,allowIncomplete:true});}catch(e){dateError=errorText(e);}
  return <><div className="subnav"><div><a href="strategies.html" aria-label="返回策略列表"><i className="fa fa-angle-left" aria-hidden="true"/></a> <input className="strategy-name" aria-label="策略名称" maxLength={80} value={draft.name} readOnly={readOnly} onChange={e=>edit({name:e.target.value})}/></div><nav><span>编辑策略</span><a href="strategies.html">回测列表</a></nav></div>
  <section className="editor"><div className="codepane"><div className="pane-tools"><button disabled={readOnly} onClick={()=>save()}>保存</button><span className="note" role="status">{readOnly?'历史源码 · 只读':saved}</span><button disabled={readOnly} onClick={()=>file.current?.click()}>导入 Python</button><button disabled={!draft.source} onClick={()=>download(draft.name+'.py',draft.source)}>导出代码</button><input ref={file} type="file" accept=".py,.txt" hidden onChange={async e=>{const selected=e.target.files?.[0];if(!selected)return;try{if(selected.size>262144)throw new Error('源码不能超过 256 KiB。');const source=await selected.text();edit({source});setError('');}catch(err){setError(errorText(err));}e.target.value='';}}/></div><textarea className="code-editor" aria-label="Python 策略代码" spellCheck={false} readOnly={readOnly} value={draft.source} placeholder="在此编写或导入你的 Python 策略" onChange={e=>edit({source:e.target.value})} onKeyDown={e=>{if(e.key==='Tab'&&!readOnly){e.preventDefault();const el=e.currentTarget,a=el.selectionStart,b=el.selectionEnd;edit({source:draft.source.slice(0,a)+'    '+draft.source.slice(b)});requestAnimationFrame(()=>{el.selectionStart=el.selectionEnd=a+4;});}}}/></div>
  <div className="output"><div className="pane-tools config-tools"><label>开始日期<input ref={startInput} type="date" aria-label="开始日期" max={today} value={draft.start} readOnly={readOnly} onChange={e=>edit({start:e.target.value})}/></label><label>结束日期<input ref={endInput} type="date" aria-label="结束日期" min={validDate(draft.start)?draft.start:undefined} max={today} value={draft.end} readOnly={readOnly} onChange={e=>edit({end:e.target.value})}/></label><label>初始资金<CapitalInput value={draft.capital} readOnly={readOnly} onChange={capital=>edit({capital})}/></label><button className="primary" disabled title="等待 Python 取数契约接入">开始回测</button></div>
  <ErrorNotice message={error||dateError||historical.error||manifest.error}/>
  <div className="metrics">{['策略收益','基准收益','Alpha','Beta','Sharpe','最大回撤'].map(label=><div className="metric" key={label}><span>{label}</span><strong>—</strong></div>)}</div>
  <div className="editor-empty"><h2>{readOnly?'历史策略源码':'编写策略，设置回测参数'}</h2><p>{readOnly?'此页不修改已冻结的研究记录。':'证券和字段需求应由 Python 取数接口表达。'}</p><p className="note">{readOnly?'可在独立结果页查看对应运行。':'当前服务仍要求单独提交证券池，尚未支持此取数契约，开始回测暂不可用。'}</p><a href="strategies.html">查看历史回测 <i className="fa fa-long-arrow-right" aria-hidden="true"/></a></div>
  <div className="pane-tools">日志输出</div><div className="log">{readOnly?'只读查看历史源码。': '尚未提交任务。代码和配置可保存到当前浏览器。'}</div></div></section>
  {readOnly&&<JsonDetails title="历史冻结记录" value={manifest.data || historical.data?.items.find(s=>s.version_id===historyId)?.frozen}/>}
  <p className="scope editor-scope">{readOnly?'历史记录只读；不支持重新运行旧运行时。':'本地保存不会同步到服务。清理浏览器数据前，请导出 Python 代码。'}</p></>;
}
