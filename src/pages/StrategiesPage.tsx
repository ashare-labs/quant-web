import { useState } from 'react';
import { dateTime, errorText } from '../shared/api';
import { createDraft, createFolder, editorHref, readDrafts, readFolders, type Draft } from '../shared/drafts';
import { ErrorNotice, Modal } from '../shared/ui';

const folderHref = (folder: string) => 'strategies.html?folder=' + encodeURIComponent(folder);

export function StrategiesPage() {
  const [search,setSearch] = useState(''), [modal,setModal] = useState(''), [name,setName] = useState(''), [error,setError] = useState('');
  const folder = new URLSearchParams(location.search).get('folder') || '';
  let drafts: Draft[] = [], folders: string[] = [], storageError = '';
  try {
    drafts = readDrafts();
    folders = [...new Set([...readFolders(), ...drafts.map(d => d.folder).filter(Boolean)])];
  } catch(e) { storageError = errorText(e); }
  const query = search.toLowerCase(), matches = (name: string) => name.toLowerCase().includes(query);
  const files = drafts.filter(d => d.folder === folder && matches(d.name));
  const directories = folder ? [] : folders.filter(matches);
  const count = files.length + directories.length;

  return <main><div className="titlebar"><h1>策略列表</h1><input aria-label="策略名称" placeholder="策略名称" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="toolbar"><button className="primary" onClick={()=>{setModal('新建策略');setName('');setError('');}}>新建策略</button><button onClick={()=>{setModal('新建文件夹');setName('');setError('');}}>新建文件夹</button></div>
    <p className="muted" aria-label="当前目录">{folder ? <><a href="strategies.html">全部文件</a> / {folder}</> : '全部文件'}</p>
    <ErrorNotice message={storageError}/>
    <div className="tablewrap"><table><thead><tr><th>名称</th><th>分类</th><th>最后修改时间</th><th>历史编译运行</th><th>历史回测</th></tr></thead><tbody>
      {directories.map(directory=><tr key={'folder:'+directory}><td><a href={folderHref(directory)}><i className="fa fa-folder-o" aria-hidden="true"/> {directory}</a></td><td>文件夹</td><td>—</td><td>—</td><td>—</td></tr>)}
      {files.map(d=><tr key={d.id}><td><a href={editorHref(d.id)}><span aria-hidden="true">▤　</span>{d.name}</a></td><td><span className="badge">Code</span></td><td>{dateTime(d.updated)}</td><td>—</td><td>—</td></tr>)}
      {!count&&!storageError&&<tr><td colSpan={5} className="empty">{query ? '没有匹配的文件' : <>此目录还没有文件。点击“新建策略”开始研究。</>}</td></tr>}
    </tbody></table></div>
    <div className="pagination"><button aria-current="page" aria-label="第 1 页">1</button><span className="scope">当前 {count} 项</span></div>
    <p className="scope">文件仅保存在当前浏览器，保存不会同步到服务。</p>
    {modal&&<Modal title={modal} close={()=>setModal('')}><form onSubmit={e=>{e.preventDefault();try {if(modal==='新建策略'){const draft=createDraft(name,folder);location.href=editorHref(draft.id);}else{location.href=folderHref(createFolder(name));}}catch(err){setError(errorText(err));}}}><label>{modal==='新建策略'?'策略名称':'文件夹名称'}<input autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><p className="note">{modal==='新建策略'?'创建空白 Python 文件；同名自动添加数字后缀。':'文件夹仅组织本浏览器中的文件。'}</p><ErrorNotice message={error}/><div className="actions"><button type="button" onClick={()=>setModal('')}>取消</button><button className="primary">创建</button></div></form></Modal>}
  </main>;
}
