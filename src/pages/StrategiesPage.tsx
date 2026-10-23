import { useState } from 'react';
import { dateTime, errorText, jobHref, type HistoryJob, type HistoryStrategy } from '../shared/api';
import { createDraft, createFolder, editorHref, readDrafts, readFolders, type Draft } from '../shared/drafts';
import { Empty, ErrorNotice, Modal, Status, Tabs, useResource } from '../shared/ui';
export function StrategiesPage() {
  const [search,setSearch] = useState(''), [tab,setTab] = useState('策略草稿'), [modal,setModal] = useState(''), [name,setName] = useState(''), [error,setError] = useState('');
  const [folder,setFolder] = useState(''), [version,setVersion] = useState(0);
  const history = useResource<{items: HistoryJob[]}>('/history/jobs'), saved = useResource<{items: HistoryStrategy[]}>('/history/strategies');
  let drafts: Draft[] = [], folders: string[] = [], storageError = '';
  try { drafts = readDrafts(); folders = readFolders(); } catch(e) { storageError = errorText(e); }
  const query = search.toLowerCase(), matches = (name: string) => name.toLowerCase().includes(query);
  const filtered = drafts.filter(d => matches(d.name) && (!folder || d.folder === folder));
  const jobs = (history.data?.items || []).filter(j => j.family !== 'factors' && matches(String(j.request.name || j.job_id)));
  const strategies = (saved.data?.items || []).filter(s => matches(String(s.frozen.name || s.version_id)));
  const known = [...(history.data?.items || []).map(j => String(j.request.name || '')), ...(saved.data?.items || []).map(s => String(s.frozen.name || ''))];
  return <main data-version={version}><div className="titlebar"><h1>策略列表</h1><input aria-label="策略名称" placeholder="策略名称" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="toolbar"><button className="primary" onClick={()=>{setModal('新建策略');setName('');setError('');}}>新建策略</button><button onClick={()=>{setModal('新建文件夹');setName('');setError('');}}>新建文件夹</button><span className="push note">草稿仅保存在当前浏览器</span></div>
    <Tabs values={['策略草稿','历史回测','历史策略']} selected={tab} onChange={setTab}/>
    <ErrorNotice message={storageError}/>
    {tab==='策略草稿' && <><label className="folder-filter">全部文件 <select aria-label="文件夹筛选" value={folder} onChange={e=>setFolder(e.target.value)}><option value="">全部文件夹</option>{folders.map(f=><option key={f}>{f}</option>)}</select></label>
    <div className="tablewrap"><table><thead><tr><th>名称</th><th>分类</th><th>最后修改时间</th><th>历史编译运行</th><th>历史回测</th></tr></thead><tbody>{filtered.map(d=><tr key={d.id}><td><a href={editorHref(d.id)}><i className="fa fa-file-code-o" aria-hidden="true"/> {d.name}</a></td><td><span className="badge">Python</span>{d.folder && <span className="note"> / {d.folder}</span>}</td><td>{dateTime(d.updated)}</td><td>—</td><td><span className="muted">尚未提交</span></td></tr>)}</tbody></table></div>{!filtered.length&&<Empty>{drafts.length ? '没有匹配的策略' : <>还没有策略草稿。点击“新建策略”开始研究。</>}</Empty>}<div className="pagination"><span className="note">当前 {filtered.length} 项</span></div></>}
    {tab==='历史回测' && <><ErrorNotice message={history.error} retry={history.refresh}/><div className="tablewrap"><table><thead><tr><th>名称</th><th>类型</th><th>提交时间</th><th>状态</th><th>结果</th></tr></thead><tbody>{jobs.map(j=><tr key={j.job_id}><td><a href={jobHref(j,j.family,true)}>{String(j.request.name || j.job_id)}</a></td><td>{j.family==='python'?'Python':'历史研究'}</td><td>{dateTime(j.created_at)}</td><td><Status job={j}/></td><td><a href={jobHref(j,j.family,true)}>{j.result?'查看结果':'查看状态'}</a></td></tr>)}</tbody></table></div>{history.loading?<Empty>正在读取历史回测…</Empty>:!history.error&&!jobs.length&&<Empty>没有匹配的历史回测。</Empty>}</>}
    {tab==='历史策略'&&<><ErrorNotice message={saved.error} retry={saved.refresh}/><div className="tablewrap"><table><thead><tr><th>名称</th><th>版本</th><th>源码</th><th>操作</th></tr></thead><tbody>{strategies.map(s=><tr key={s.version_id}><td>{String(s.frozen.name || s.version_id)}</td><td className="mono truncate">{s.version_id}</td><td>{s.source?'Python':'已冻结配置'}</td><td><a href={'strategy-editor.html?history='+encodeURIComponent(s.version_id)}>只读查看</a> <button disabled title="后端尚未提供历史策略删除接口">删除</button></td></tr>)}</tbody></table></div>{saved.loading?<Empty>正在读取历史策略…</Empty>:!saved.error&&!strategies.length&&<Empty>没有匹配的历史策略。</Empty>}<p className="note">历史策略保留只读。服务尚未提供删除或重命名接口。</p></>}
    {modal&&<Modal title={modal} close={()=>setModal('')}><form onSubmit={e=>{e.preventDefault();try {if(modal==='新建策略'){const draft=createDraft(name,known,folder);location.href=editorHref(draft.id);}else{setFolder(createFolder(name));setVersion(v=>v+1);setModal('');}}catch(err){setError(errorText(err));}}}><label>{modal==='新建策略'?'策略名称':'文件夹名称'}<input autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><p className="note">{modal==='新建策略'?'创建空白 Python 草稿；同名自动添加数字后缀。':'文件夹仅组织本浏览器中的草稿。'}</p><ErrorNotice message={error}/><div className="actions"><button type="button" onClick={()=>setModal('')}>取消</button><button className="primary">创建</button></div></form></Modal>}
  </main>;
}
