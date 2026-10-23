import { useEffect, useRef, useState } from 'react';
import { download, errorText, object } from '../shared/api';
import { newDraft, readDrafts, saveDraft, validateDraftConfig, type Draft } from '../shared/drafts';
import { todayInShanghai, validDate, validateDateRange } from '../shared/dates';
import { unformatCapital } from '../shared/capital';
import { childPath, createDirectory, displayName, fileHref, fileName, parentDirectory, readStrategyFile, saveStrategyFile, StrategySaveError } from '../shared/strategy-files';
import { CapitalInput } from '../shared/CapitalInput';
import { ErrorNotice, JsonDetails, useResource } from '../shared/ui';
export function EditorPage() {
  const [params] = useState(() => new URLSearchParams(location.search));
  const draftId = params.get('draft'), jobId = params.get('job'), path = params.get('file');
  const readOnly = !!jobId, file = useRef<HTMLInputElement>(null);
  const startInput = useRef<HTMLInputElement>(null), endInput = useRef<HTMLInputElement>(null);
  const [error,setError] = useState(''), [saved,setSaved] = useState('未保存'), [dirty,setDirty] = useState(false);
  const [loading,setLoading] = useState(!!(path||draftId)), [loadFailed,setLoadFailed] = useState(false), [saving,setSaving] = useState(false), [loadedPath,setLoadedPath] = useState('');
  const locked = readOnly || loading || loadFailed || saving;
  const [today,setToday] = useState(() => todayInShanghai());
  const [draft,setDraft] = useState<Draft>(() => ({...newDraft(), ...(readOnly ? {capital:''} : {})}));
  const manifest = useResource<Record<string,unknown>>(jobId?'/history/jobs/'+encodeURIComponent(jobId)+'/manifest':null);
  useEffect(()=>{
    if(readOnly||(!path&&!draftId))return;
    const controller=new AbortController();
    async function open(){
      try {
        let stored:Draft|undefined, localError='';
        try { stored=readDrafts().find(d=>path?d.filePath===path:d.id===draftId); }
        catch(e){if(!path)throw e;localError=errorText(e);}
        const remotePath=path||stored?.filePath;
        if(remotePath){
          const source=await readStrategyFile(remotePath,controller.signal);
          if(controller.signal.aborted)return;
          const base=stored||newDraft();
          setDraft({...base,name:displayName(remotePath),folder:parentDirectory(remotePath),source:source.source,filePath:remotePath,...(localError?{capital:''}:{})});
          setLoadedPath(remotePath);setSaved('已从服务读取');setError(localError);
        }else if(stored){setDraft(stored);setSaved('浏览器草稿 · 未保存到服务');}
        else throw new Error('找不到此浏览器草稿。请返回策略列表。');
      }catch(e){if(!controller.signal.aborted){setError(errorText(e));setLoadFailed(true);}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void open();return()=>controller.abort();
  },[path,draftId,readOnly]);
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
  async function save(){
    if(locked)return;
    let target='';
    try{
      if([startInput.current,endInput.current].some(input=>input?.validity.badInput))throw new Error('请选择有效的开始和结束日期。');
      validateDraftConfig(draft);target=loadedPath&&draft.name===displayName(loadedPath)?loadedPath:childPath(draft.folder,draft.name,true);
      setSaving(true);setError('');setSaved('保存中…');
      if(!loadedPath&&draftId&&draft.folder)await createDirectory(draft.folder);
      await saveStrategyFile(target,draft.source,target===loadedPath);
      const next={...draft,id:loadedPath&&target!==loadedPath?crypto.randomUUID():draft.id,name:displayName(target),filePath:target,capital:unformatCapital(draft.capital),updated:new Date().toISOString()};
      setLoadedPath(target);setDraft(next);
      history.replaceState(null,'',fileHref(target));
      try{saveDraft(next);setSaved('已保存');setDirty(false);}
      catch(e){setSaved('源码已保存，配置未保存');setError('源码已写入服务，但浏览器配置保存失败：'+errorText(e));setDirty(true);}
    }catch(e){
      if(e instanceof StrategySaveError&&e.readbackMatches)setLoadedPath(target);
      setError(errorText(e));setSaved('未保存');setDirty(true);
    }finally{setSaving(false);}
  }
  let dateError='';
  if(!readOnly)try{validateDateRange(draft,{today,allowIncomplete:true});}catch(e){dateError=errorText(e);}
  return <><div className="subnav"><div><a href="strategies.html" aria-label="返回策略列表"><i className="fa fa-angle-left" aria-hidden="true"/></a> <input className="strategy-name" aria-label="策略名称" maxLength={80} value={draft.name} readOnly={locked} onChange={e=>edit({name:e.target.value})}/></div><nav><span>编辑策略</span><a href="strategies.html">回测列表</a></nav></div>
  <section className="editor"><div className="codepane"><div className="pane-tools"><button disabled={locked} onClick={()=>save()}>保存</button><span className="note" role="status">{readOnly?'历史源码 · 只读':loading?'正在读取…':saved}</span><button disabled={locked} onClick={()=>file.current?.click()}>导入 Python</button><button disabled={!draft.source} onClick={()=>download(fileName(draft.name),draft.source)}>导出代码</button><input ref={file} type="file" accept=".py,.txt" hidden onChange={async e=>{const selected=e.target.files?.[0];if(!selected)return;try{if(selected.size>262144)throw new Error('源码不能超过 256 KiB。');const source=await selected.text();edit({source});setError('');}catch(err){setError(errorText(err));}e.target.value='';}}/></div><textarea className="code-editor" aria-label="Python 策略代码" spellCheck={false} readOnly={locked} value={draft.source} placeholder="在此编写或导入你的 Python 策略" onChange={e=>edit({source:e.target.value})} onKeyDown={e=>{if(e.key==='Tab'&&!locked){e.preventDefault();const el=e.currentTarget,a=el.selectionStart,b=el.selectionEnd;edit({source:draft.source.slice(0,a)+'    '+draft.source.slice(b)});requestAnimationFrame(()=>{el.selectionStart=el.selectionEnd=a+4;});}}}/></div>
  <div className="output"><div className="pane-tools config-tools"><label>开始日期<input ref={startInput} type="date" aria-label="开始日期" max={today} value={draft.start} readOnly={locked} onChange={e=>edit({start:e.target.value})}/></label><label>结束日期<input ref={endInput} type="date" aria-label="结束日期" min={validDate(draft.start)?draft.start:undefined} max={today} value={draft.end} readOnly={locked} onChange={e=>edit({end:e.target.value})}/></label><label>初始资金<CapitalInput value={draft.capital} readOnly={locked} onChange={capital=>edit({capital})}/></label><button className="primary" disabled title="等待 Python 取数契约接入">开始回测</button></div>
  <ErrorNotice message={error||dateError||manifest.error}/>
  <div className="metrics">{['策略收益','基准收益','Alpha','Beta','Sharpe','最大回撤'].map(label=><div className="metric" key={label}><span>{label}</span><strong>—</strong></div>)}</div>
  <div className="editor-empty"><h2>{readOnly?'历史策略源码':'编写策略，设置回测参数'}</h2><p>{readOnly?'此页不修改已冻结的研究记录。':'证券和字段需求应由 Python 取数接口表达。'}</p><p className="note">{readOnly?'可在独立结果页查看对应运行。':'当前服务仍要求单独提交证券池，尚未支持此取数契约，开始回测暂不可用。'}</p><a href="strategies.html">返回策略列表 <i className="fa fa-long-arrow-right" aria-hidden="true"/></a></div>
  <div className="pane-tools">日志输出</div><div className="log">{readOnly?'只读查看历史源码。': '尚未提交任务。保存将源码写入本机服务，日期和资金保留在当前浏览器。'}</div></div></section>
  {readOnly&&<JsonDetails title="历史冻结记录" value={manifest.data}/>}
  <p className="scope editor-scope">{readOnly?'历史记录只读；不支持重新运行旧运行时。':'Python 文件保存在本机服务；日期和资金仅保存在当前浏览器。修改名称后保存会创建新文件。'}</p></>;
}
