import { useState } from 'react';
import { dateTime, errorText } from '../shared/api';
import { editorHref, readDrafts, readFolders, type Draft } from '../shared/drafts';
import {
  childPath, createDirectory, directoryQuery, displayName, fileHref,
  folderHref, saveStrategyFile, strategyDirectory, type StrategyDirectory,
} from '../shared/strategy-files';
import { ErrorNotice, Modal, useResource } from '../shared/ui';
import { backtestsHref } from '../backtests/history-model';
import { createProject } from '../strategies/project-api';
import { projectHref } from '../strategies/project-model';
import { navigate } from '../shared/navigation';
export function StrategiesPage() {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const requestedFolder = new URLSearchParams(location.search).get('folder') || '';
  const directory = useResource<StrategyDirectory>(directoryQuery(requestedFolder));
  let currentDirectory: StrategyDirectory | null = null;
  let directoryError = '';
  try {
    if (directory.data)
      currentDirectory = strategyDirectory(directory.data);
  }
  catch (e) {
    directoryError = errorText(e);
  }
  const folder = currentDirectory?.path ?? requestedFolder;
  let drafts: Draft[] = [];
  let folders: string[] = [];
  let storageError = '';
  try {
    drafts = readDrafts().filter(d => !d.filePath);
    folders = [...new Set([...readFolders(), ...drafts.map(d => d.folder).filter(Boolean)])];
  }
  catch (e) {
    storageError = errorText(e);
  }
  const prefix = folder ? folder + '/' : '';
  const oldDirectories = folders.filter(path => path.startsWith(prefix)
    && path !== folder).map(path => prefix + path.slice(prefix.length).split('/')[0]);
  const directories = [...new Set([
    ...(currentDirectory?.entries.filter(e => e.kind === 'directory').map(e => e.path)
      || []),
    ...oldDirectories
  ])];
  const query = search.toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(query);
  const files = currentDirectory?.entries.filter(e => e.kind === 'file' && matches(e.name)) || [];
  const projects = currentDirectory?.entries.filter(e => e.kind === 'project'
    && matches(e.name))
    || [];
  const legacy = drafts.filter(d => d.folder === folder && matches(d.name));
  const visibleDirectories = directories.filter(path => matches(path.slice(prefix.length)));
  const count = projects.length + files.length + legacy.length + visibleDirectories.length;
  async function create() {
    setPending(true);
    setError('');
    try {
      const path = childPath(folder, name, modal === '新建策略');
      if (modal === '新建策略') {
        if (folder)
          await createDirectory(folder);
        const saved = await saveStrategyFile(path, '', false);
        navigate(fileHref(saved.path));
      }
      else if (modal === '新建项目') {
        const project = await createProject(path);
        navigate(projectHref(project.strategy_id));
      }
      else {
        const saved = await createDirectory(path);
        navigate(folderHref(saved.path));
      }
    }
    catch (err) {
      setError(errorText(err));
    }
    finally {
      setPending(false);
    }
  }
  return <main>
    <div className="titlebar">
      <h1>策略列表</h1>
      <input aria-label="策略名称" placeholder="策略名称" value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <div className="toolbar">
      <button className="primary" onClick={() => {
        setModal('新建项目');
        setName('');
        setError('');
      }}>新建项目</button>
      <button onClick={() => {
        setModal('新建策略');
        setName('');
        setError('');
      }}>新建单文件策略</button>
      <button onClick={() => {
        setModal('新建文件夹');
        setName('');
        setError('');
      }}>新建分类文件夹</button>
    </div>
    <p className="muted" aria-label="当前目录">
      {folder ? <><a href="strategies.html">全部文件</a> / {folder}</> : '全部文件'}
    </p>
    <ErrorNotice message={[
      directory.error,
      directoryError,
      storageError
    ].filter(Boolean).join(' ')} />
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>分类</th>
            <th>最后修改时间</th>
            <th>历史编译运行</th>
            <th>历史回测</th>
          </tr>
        </thead>
        <tbody>
          {visibleDirectories.map(path => <tr key={'folder:' + path}>
            <td>
              <a href={folderHref(path)}><i className="fa fa-folder-o" aria-hidden="true" /> {path.slice(prefix.length)}</a>
            </td>
            <td>分类文件夹</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
          </tr>)}
          {projects.map(entry => <tr key={entry.path}>
            <td>
              <a href={projectHref(entry.strategy_id!)}><i className="fa fa-cube" aria-hidden="true" /> {displayName(entry.path)}</a>
            </td>
            <td>
              <span className="badge">策略项目</span>
            </td>
            <td>—</td>
            <td>—</td>
            <td>
              <a href={backtestsHref({ strategy: entry.strategy_id! })} aria-label={displayName(entry.path) + '的回测列表'}>回测列表</a>
            </td>
          </tr>)}
          {files.map(entry => <tr key={entry.path}>
            <td>
              <a href={fileHref(entry.path)}>
                <span aria-hidden="true">▤　</span>
                {displayName(entry.path)}
              </a>
            </td>
            <td>
              <span className="badge">Code</span>
            </td>
            <td>—</td>
            <td>—</td>
            <td>
              <a href={backtestsHref({ file: entry.path })} aria-label={displayName(entry.path) + '的回测列表'}>回测列表</a>
            </td>
          </tr>)}
          {legacy.map(d => <tr key={'draft:' + d.id}>
            <td>
              <a href={editorHref(d.id)}><span aria-hidden="true">▤　</span>{d.name}（浏览器草稿）</a>
            </td>
            <td>
              <span className="badge">Code</span>
            </td>
            <td>
              {dateTime(d.updated)}
            </td>
            <td>—</td>
            <td>—</td>
          </tr>)}
          {!count && !directory.error && !directoryError && !storageError && <tr>
            <td colSpan={5} className="empty">
              {directory.loading
                ? '正在读取文件…'
                : query
                  ? '没有匹配的文件'
                  : <>此目录还没有文件。点击“新建项目”或“新建单文件策略”开始研究。</>}
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    <div className="pagination">
      <button aria-current="page" aria-label="第 1 页">1</button>
      <span className="scope">当前 {count} 项</span>
    </div>
    <p className="scope">文件从本机服务读取；旧浏览器草稿保留，主动保存后写入服务。</p>
    {modal && <Modal title={modal} close={() => {
      if (!pending)
        setModal('');
    }}><form onSubmit={e => {
      e.preventDefault();
      if (!pending)
        void create();
    }}><label>
          {modal === '新建文件夹' ? '分类文件夹名称' : '策略名称'}
          <input autoFocus required value={name} disabled={pending} onChange={e => setName(e.target.value)} />
        </label><p className="note">
          {modal === '新建策略'
            ? '创建空白 Python 文件；同名文件不会覆盖。'
            : modal === '新建项目'
              ? '创建包含 main.py 入口的策略项目，可添加辅助模块和子目录。'
              : '在当前目录创建分类文件夹；分类文件夹内可放置策略和其他分类。'}
        </p><ErrorNotice message={error} /><div className="actions">
          <button type="button" disabled={pending} onClick={() => setModal('')}>取消</button>
          <button className="primary" disabled={pending}>
            {pending ? '创建中…' : '创建'}
          </button>
        </div></form></Modal>}
  </main>;
}
