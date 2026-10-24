import { useState } from 'react';
import { dateTime, errorText } from '../shared/api';
import { editorHref, readDrafts, readFolders, type Draft } from '../shared/drafts';
import { childPath, createDirectory, directoryQuery, displayName, fileHref, folderHref, saveStrategyFile, type StrategyDirectory } from '../shared/strategy-files';
import { ErrorNotice, Modal, useResource } from '../shared/ui';
import { backtestsHref } from '../backtests/history-model';

export function StrategiesPage() {
  const [search,setSearch] = useState(''), [modal,setModal] = useState(''), [name,setName] = useState(''), [error,setError] = useState(''), [pending,setPending] = useState(false);
  const folder = new URLSearchParams(location.search).get('folder') || '';
  const directory = useResource<StrategyDirectory>(directoryQuery(folder));
  let drafts: Draft[] = [], folders: string[] = [], storageError = '';
  try {
    drafts = readDrafts().filter(d => !d.filePath);
    folders = [...new Set([...readFolders(), ...drafts.map(d => d.folder).filter(Boolean)])];
  } catch(e) { storageError = errorText(e); }
  const prefix = folder ? folder + '/' : '';
  const oldDirectories = folders.filter(path => path.startsWith(prefix) && path !== folder).map(path => prefix + path.slice(prefix.length).split('/')[0]);
  const directories = [...new Set([...(directory.data?.entries.filter(e => e.kind === 'directory').map(e => e.path) || []), ...oldDirectories])];
  const query = search.toLowerCase(), matches = (name: string) => name.toLowerCase().includes(query);
  const files = directory.data?.entries.filter(e => e.kind === 'file' && matches(e.name)) || [];
  const legacy = drafts.filter(d => d.folder === folder && matches(d.name));
  const visibleDirectories = directories.filter(path => matches(path.slice(prefix.length)));
  const count = files.length + legacy.length + visibleDirectories.length;

  async function create() {
    setPending(true); setError('');
    try {
      const path = childPath(folder, name, modal === '新建策略');
      if (modal === '新建策略') {
        if (folder) await createDirectory(folder);
        await saveStrategyFile(path, '', false); location.href = fileHref(path);
      }
      else { await createDirectory(path); location.href = folderHref(path); }
    } catch(err) { setError(errorText(err)); }
    finally { setPending(false); }
  }

  return <main><div className="titlebar"><h1>策略列表</h1><input aria-label="策略名称" placeholder="策略名称" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="toolbar"><button className="primary" onClick={()=>{setModal('新建策略');setName('');setError('');}}>新建策略</button><button onClick={()=>{setModal('新建文件夹');setName('');setError('');}}>新建文件夹</button></div>
    <p className="muted" aria-label="当前目录">{folder ? <><a href="strategies.html">全部文件</a> / {folder}</> : '全部文件'}</p>
    <ErrorNotice message={[directory.error, storageError].filter(Boolean).join(' ')}/>
    <div className="tablewrap"><table><thead><tr><th>名称</th><th>分类</th><th>最后修改时间</th><th>历史编译运行</th><th>历史回测</th></tr></thead><tbody>
      {visibleDirectories.map(path=><tr key={'folder:'+path}><td><a href={folderHref(path)}><i className="fa fa-folder-o" aria-hidden="true"/> {path.slice(prefix.length)}</a></td><td>文件夹</td><td>—</td><td>—</td><td>—</td></tr>)}
      {files.map(entry=><tr key={entry.path}><td><a href={fileHref(entry.path)}><span aria-hidden="true">▤　</span>{displayName(entry.path)}</a></td><td><span className="badge">Code</span></td><td>—</td><td>—</td><td><a href={backtestsHref({file:entry.path})} aria-label={displayName(entry.path)+'的回测列表'}>回测列表</a></td></tr>)}
      {legacy.map(d=><tr key={'draft:'+d.id}><td><a href={editorHref(d.id)}><span aria-hidden="true">▤　</span>{d.name}（浏览器草稿）</a></td><td><span className="badge">Code</span></td><td>{dateTime(d.updated)}</td><td>—</td><td>—</td></tr>)}
      {!count&&!directory.error&&!storageError&&<tr><td colSpan={5} className="empty">{directory.loading ? '正在读取文件…' : query ? '没有匹配的文件' : <>此目录还没有文件。点击“新建策略”开始研究。</>}</td></tr>}
    </tbody></table></div>
    <div className="pagination"><button aria-current="page" aria-label="第 1 页">1</button><span className="scope">当前 {count} 项</span></div>
    <p className="scope">文件从本机服务读取；旧浏览器草稿保留，主动保存后写入服务。</p>
    {modal&&<Modal title={modal} close={()=>{if(!pending)setModal('');}}><form onSubmit={e=>{e.preventDefault();if(!pending)void create();}}><label>{modal==='新建策略'?'策略名称':'文件夹名称'}<input autoFocus required maxLength={80} value={name} disabled={pending} onChange={e=>setName(e.target.value)}/></label><p className="note">{modal==='新建策略'?'创建空白 Python 文件；同名文件不会覆盖。':'在当前目录创建文件夹。'}</p><ErrorNotice message={error}/><div className="actions"><button type="button" disabled={pending} onClick={()=>setModal('')}>取消</button><button className="primary" disabled={pending}>{pending?'创建中…':'创建'}</button></div></form></Modal>}
  </main>;
}
