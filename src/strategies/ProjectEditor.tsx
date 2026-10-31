import { navigate } from '../shared/navigation';
import { accountMode, accountSession, accountStorage } from '../auth/session';
import { useEffect, useRef, useState } from 'react';
import { ApiError, download, errorText, object } from '../shared/api';
import { CapitalInput } from '../shared/CapitalInput';
import { resolveFrequency } from '../shared/drafts';
import { todayInShanghai, validDate, validateDateRange } from '../shared/dates';
import { displayName, folderHref, parentDirectory } from '../shared/strategy-files';
import { isProjectId } from '../shared/strategy-path';
import { ErrorNotice, Modal, useResource } from '../shared/ui';
import { backtestsHref } from '../backtests/history-model';
import { checkSourceBudget, environment, submitProjectCurrent } from '../backtests/submission';
import { CodeEditor } from './CodeEditor';
import { ProjectFiles } from './ProjectFiles';
import { moveProject, ProjectWriteError, readProject, saveProject } from './project-api';
import { deleteProjectFile, frozenSource, projectDescriptor, projectFilePath, projectHref, renameProjectFile, sameProjectSource, sourceChanges, sourceFiles, type StrategyProject } from './project-model';
import { editProjectDraft, openProjectDraft, readProjectDraft, relocatedProjectDraft, retainProjectDraft, savedProjectDraft, type ProjectDraft } from './project-state';
type FileAction = {
  kind: 'create' | 'rename' | 'delete' | 'move';
  path: string;
};
export function ProjectEditor({ identity, manifest, jobId }: {
  identity?: string;
  manifest?: Record<string, unknown>;
  jobId?: string;
}) {
  const [storage] = useState(accountStorage);
  const [epoch] = useState(() => accountSession.snapshot().epoch);
  const assertAccount = () => {
    if (accountMode)
      accountSession.assertCurrent(epoch);
  };
  const readOnly = !!jobId;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const draftRef = useRef<ProjectDraft | null>(null);
  const remoteRef = useRef<StrategyProject | null>(null);
  const [loading, setLoading] = useState(!readOnly);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [retentionError, setRetentionError] = useState('');
  const [unretained, setUnretained] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [action, setAction] = useState<FileAction | null>(null);
  const [name, setName] = useState('');
  const [actionError, setActionError] = useState('');
  const [review, setReview] = useState<StrategyProject | null>(null);
  const [today, setToday] = useState(todayInShanghai);
  const startInput = useRef<HTMLInputElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const leaving = useRef(false);
  const catalogue = useResource<Record<string, unknown>>(readOnly ? null : '/python/catalogue');
  const locked = readOnly || loading || loadFailed || !!busy || !draft;
  function show(next: ProjectDraft) {
    draftRef.current = next;
    setDraft(next);
  }
  function retain(next: ProjectDraft, sourceSaved = false) {
    try {
      assertAccount();
      retainProjectDraft(next, storage);
      setUnretained(false);
      setRetentionError('');
      return true;
    }
    catch (e) {
      setUnretained(true);
      setRetentionError((sourceSaved ? '项目源码已保存到服务；浏览器未能保留回测参数和编辑状态：' : '浏览器未能保留完整项目编辑：') + errorText(e));
      return false;
    }
  }
  function edit(patch: Partial<ProjectDraft>) {
    assertAccount();
    if (!draftRef.current || locked)
      return;
    const next = editProjectDraft(draftRef.current, patch);
    show(next);
    setError('');
    retain(next);
  }
  useEffect(() => {
    if (readOnly) {
      try {
        const request = object(manifest?.request), source = frozenSource(request);
        if (!source.projectId)
          throw new Error('历史项目源码无法读取。');
        show({
          path: String(request.name || '历史策略项目'),
          strategy_id: source.projectId,
          entrypoint: source.entrypoint,
          files: source.files,
          revision: '0'.repeat(64),
          start: String(request.start_date || ''),
          end: String(request.end_date || ''),
          capital: typeof request.initial_cash === 'number' ? String(request.initial_cash) : '',
          frequency: resolveFrequency(request.frequency),
          active: source.entrypoint,
          workingCopy: false,
          updated: ''
        });
      }
      catch (e) {
        setError(errorText(e));
      }
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    setError('');
    async function load() {
      try {
        // A service outage must not hide a complete working copy already kept in this browser.
        if (isProjectId(identity))
          try {
            const local = readProjectDraft(identity, storage);
            if (local)
              show(local);
          }
          catch (e) {
            setRetentionError(errorText(e));
          }
        const remote = await readProject(identity!, controller.signal);
        if (controller.signal.aborted)
          return;
        remoteRef.current = remote;
        assertAccount();
        let stored: ProjectDraft | undefined, localError = '';
        try {
          stored = readProjectDraft(remote.strategy_id, storage);
        }
        catch (e) {
          localError = errorText(e);
        }
        const opened = openProjectDraft(remote, stored);
        show(opened.draft);
        setConflict(opened.conflict);
        setRetentionError(localError);
        history.replaceState(null, '', projectHref(remote.strategy_id));
      }
      catch (e) {
        if (!controller.signal.aborted) {
          setError(errorText(e));
          setLoadFailed(true);
        }
      }
      finally {
        if (!controller.signal.aborted)
          setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [identity, manifest, jobId, readOnly, reload]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (unretained && !leaving.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [unretained]);
  useEffect(() => {
    const update = () => setToday(todayInShanghai());
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  function select(path: string) {
    if (!draftRef.current)
      return;
    const next = { ...draftRef.current, active: path };
    show(next);
    if (!readOnly)
      retain(next);
  }
  function openAction(kind: FileAction['kind'], path = '') {
    setAction({ kind, path });
    setName(kind === 'rename' ? path : kind === 'move' ? draft!.path : '');
    setActionError('');
  }
  async function performAction() {
    if (!action || !draftRef.current || operation.current)
      return;
    try {
      const current = draftRef.current;
      if (action.kind === 'create') {
        const path = projectFilePath(name.trim());
        if (Object.hasOwn(current.files, path))
          throw new Error('同名文件已存在。');
        edit({ files: sourceFiles({ ...current.files, [path]: '' }), active: path });
      }
      else if (action.kind === 'rename') {
        const path = projectFilePath(name.trim());
        edit({ ...renameProjectFile(current, action.path, path), active: current.active === action.path ? path : current.active });
      }
      else if (action.kind === 'delete')
        edit({ ...deleteProjectFile(current, action.path), active: current.active === action.path ? current.entrypoint : current.active });
      else {
        retain(current);
        operation.current = true;
        setBusy('move');
        const moved = await moveProject(remoteRef.current!, name.trim());
        assertAccount();
        remoteRef.current = moved;
        const relocated = relocatedProjectDraft(current, moved);
        show(relocated.draft);
        if (relocated.conflict)
          setConflict(true);
        retain(relocated.draft);
        history.replaceState(null, '', projectHref(current.strategy_id));
      }
      setAction(null);
    }
    catch (e) {
      if (e instanceof ProjectWriteError && e.current && draftRef.current) {
        const recovered = relocatedProjectDraft(draftRef.current, e.current);
        remoteRef.current = e.current;
        show(recovered.draft);
        if (recovered.conflict)
          setConflict(true);
        retain(recovered.draft);
      }
      if (e instanceof ApiError && e.code === 'STRATEGY_PROJECT_REVISION_CONFLICT')
        setConflict(true);
      setActionError(errorText(e));
    }
    finally {
      operation.current = false;
      setBusy('');
    }
  }
  async function save() {
    if (locked || conflict || operation.current || !draftRef.current)
      return;
    operation.current = true;
    setBusy('save');
    setError('');
    try {
      const current = draftRef.current;
      retain(current);
      checkSourceBudget(current.files, catalogue.data);
      // Browser retention is best effort; an explicit disk save must still run.
      const saved = await saveProject(current);
      assertAccount();
      remoteRef.current = saved;
      const next = savedProjectDraft(current, saved);
      show(next);
      setConflict(false);
      retain(next, true);
    }
    catch (e) {
      if (e instanceof ProjectWriteError && e.current && draftRef.current) {
        remoteRef.current = e.current;
        const next = {
          ...draftRef.current,
          path: e.current.path,
          revision: e.current.revision,
          workingCopy: true
        };
        show(next);
        retain(next);
      }
      if (e instanceof ApiError && e.code === 'STRATEGY_PROJECT_REVISION_CONFLICT')
        setConflict(true);
      setError(errorText(e));
    }
    finally {
      operation.current = false;
      setBusy('');
    }
  }
  async function run() {
    if (locked || operation.current || !draftRef.current)
      return;
    operation.current = true;
    setBusy('run');
    setError('');
    try {
      if (!retain(draftRef.current))
        return;
      if ([startInput.current, endInput.current].some(input => input?.validity.badInput))
        throw new Error('请选择有效的开始和结束日期。');
      const job = await submitProjectCurrent(draftRef.current, catalogue.data);
      assertAccount();
      leaving.current = true;
      navigate('backtest-results.html?job=' + encodeURIComponent(job.job_id));
    }
    catch (e) {
      setError(errorText(e));
    }
    finally {
      operation.current = false;
      setBusy('');
    }
  }
  async function inspectRemote() {
    if (!draft || operation.current)
      return;
    operation.current = true;
    setBusy('review');
    try {
      setReview(await readProject(draft.strategy_id));
    }
    catch (e) {
      setError(errorText(e));
    }
    finally {
      operation.current = false;
      setBusy('');
    }
  }
  function resolveConflict(keep: boolean) {
    if (!review || !draft)
      return;
    const next = keep ? {
      ...draft,
      path: review.path,
      revision: review.revision,
      workingCopy: !sameProjectSource(draft, review)
    } : savedProjectDraft(draft, review);
    remoteRef.current = review;
    show(next);
    setReview(null);
    setConflict(false);
    setError('');
    retain(next);
  }
  let dateError = '', serviceError = '', serviceReady = false;
  if (draft && !readOnly)
    try {
      validateDateRange(draft, { today, allowIncomplete: true });
    }
    catch (e) {
      dateError = errorText(e);
    }
  if (catalogue.data)
    try {
      environment(catalogue.data);
      serviceReady = true;
    }
    catch (e) {
      serviceError = errorText(e);
    }
  const active = draft?.active ?? '';
  const system = active === 'aquant.toml';
  const source = draft ? (system ? projectDescriptor(draft) : draft.files[active] ?? '') : '';
  const projectName = draft ? displayName(draft.path) : '策略项目';
  const listHref = draft ? backtestsHref({ strategy: draft.strategy_id }) : undefined;
  return <>
    <div className="subnav">
      <div><a href={draft && !readOnly ? folderHref(parentDirectory(draft.path)) : 'strategies.html'} aria-label="返回策略列表">
        <i className="fa fa-angle-left" aria-hidden="true" />
      </a> <span className="strategy-name">
          {projectName}
        </span>{!readOnly && draft && <button className="project-rename" disabled={locked} title="改名或移动策略项目" aria-label="改名或移动策略项目" onClick={() => openAction('move')}>
          <i className="fa fa-pencil" aria-hidden="true" />
        </button>}</div>
      <nav>
        {readOnly && draft ? <a href={projectHref(draft.strategy_id)}>编辑策略</a> : <span>编辑策略</span>}
        {listHref ? <a href={listHref}>回测列表</a> : <span aria-disabled="true">回测列表</span>}
      </nav>
    </div>
    <section className="editor">
      <div className="codepane">
        <div className="pane-tools">
          <button disabled={locked || conflict} onClick={() => void save()}>
            {busy === 'save' ? '保存中…' : '保存'}
          </button>
          <span className="note" role="status">
            {readOnly ? '历史项目源码 · 只读' : loading ? '正在读取…' : loadFailed ? '读取失败 · 浏览器工作副本' : draft?.workingCopy ? '未保存 · ' + (unretained ? '浏览器未保留' : '浏览器已保留') : '已从服务读取'}
          </span>
          <button disabled={locked || system} onClick={() => importInput.current?.click()}>导入 Python</button>
          <button disabled={!source} onClick={() => download(active, source)}>导出当前文件</button>
          <input ref={importInput} type="file" accept=".py" hidden onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = '';
            if (!selected || !draftRef.current || operation.current)
              return;
            operation.current = true;
            setBusy('import');
            try {
              const content = await selected.text();
              const files = { ...draftRef.current.files, [active]: content };
              checkSourceBudget(files, catalogue.data);
              edit({ files });
            }
            catch (err) {
              setError(errorText(err));
            }
            finally {
              operation.current = false;
              setBusy('');
            }
          }} />
        </div>
        {draft ? <div className="project-code-body">
          <ProjectFiles files={draft.files} entrypoint={draft.entrypoint} active={active} onSelect={select} onCreate={() => openAction('create')} onRename={path => openAction('rename', path)} onDelete={path => openAction('delete', path)} onEntry={path => edit({ entrypoint: path })} readOnly={locked} projectName={projectName} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
          <div className="project-code-main">
            <div className="project-file-tab">
              <span>
                {active}
              </span>
              {active === draft.entrypoint && <span className="project-entry-label">入口</span>}
              {system && <span className="project-entry-label">系统信息 · 只读</span>}
            </div>
            <CodeEditor key={draft.strategy_id} value={source} path={active} readOnly={locked || system} onChange={value => edit({ files: { ...draftRef.current!.files, [active]: value } })} />
          </div>
        </div> : <div className="empty">
          {loading ? '正在读取项目…' : '项目尚未加载。'}
        </div>}
      </div>
      <div className="output">
        <div className="pane-tools config-tools">
          <label>开始日期<input ref={startInput} type="date" aria-label="开始日期" max={today} value={draft?.start ?? ''} readOnly={locked} onChange={e => edit({ start: e.target.value })} /></label>
          <label>结束日期<input ref={endInput} type="date" aria-label="结束日期" min={draft && validDate(draft.start) ? draft.start : undefined} max={today} value={draft?.end ?? ''} readOnly={locked} onChange={e => edit({ end: e.target.value })} /></label>
          <label>初始资金<CapitalInput value={draft?.capital ?? ''} readOnly={locked} onChange={capital => edit({ capital })} /></label>
          <select aria-label="运行频率" value={draft?.frequency ?? '1m'} disabled={locked} onChange={e => edit({ frequency: resolveFrequency(e.target.value) })}>
            <option value="1m">分钟</option>
            <option value="1d">日</option>
          </select>
          <span className="runtime-label">Python3 · aquant</span>
          <button className="primary" disabled={locked || !serviceReady} onClick={() => void run()}>
            {busy === 'run' ? '正在提交…' : '开始回测'}
          </button>
        </div>
        <ErrorNotice message={[error, retentionError].filter(Boolean).join(' ') || dateError || catalogue.error || serviceError} retry={loadFailed ? () => setReload(n => n + 1) : catalogue.error ? catalogue.refresh : undefined} />
        {conflict && <div className="notice" role="status">服务中的项目已变化，当前全部编辑仍保留。保存前请核对版本。<button disabled={locked} onClick={() => void inspectRemote()}>核对服务版本</button></div>}
        <div className="metrics">
          {['策略收益', '基准收益', 'Alpha', 'Beta', 'Sharpe', '最大回撤'].map(label => <div className="metric" key={label}>
            <span>
              {label}
            </span>
            <strong>—</strong>
          </div>)}
        </div>
        <div className="editor-empty">
          <h2>
            {readOnly ? '历史策略源码' : '编写策略，设置回测参数'}
          </h2>
          <p>
            {readOnly ? '此页展示当次回测冻结的完整项目源码。' : '策略 API：from aquant import *。项目模块使用相对导入，例如 from .signals import signal。'}
          </p>
          {readOnly && <p className="note">可在独立结果页查看对应运行。</p>}
          <a href="strategies.html">返回策略列表 <i className="fa fa-long-arrow-right" aria-hidden="true" /></a>
        </div>
        <div className="pane-tools">日志输出</div>
        <div className="log">
          {readOnly ? '只读查看历史项目源码。' : busy === 'run' ? '正在提交完整项目源码…' : '点击“开始回测”将在本机执行当前项目入口；全部文件（包括未保存编辑）、入口和配置将冻结在回测记录中。'}
        </div>
      </div>
    </section>
    <p className="scope editor-scope">
      {readOnly ? '历史记录只读；不支持重新运行旧运行时。' : '未保存文件和回测参数保留在当前浏览器；保存写入整个项目。aquant.toml 由系统管理，第三方依赖不包含在项目源码中。'}
    </p>
    {action && <Modal title={action.kind === 'create' ? '添加 Python 文件' : action.kind === 'rename' ? '改名或移动文件' : action.kind === 'delete' ? '删除文件' : '改名或移动策略项目'} close={() => {
      if (!busy)
        setAction(null);
    }}>
      <form onSubmit={e => {
        e.preventDefault();
        void performAction();
      }}>
        {action.kind === 'delete' ? <p>删除 {action.path}？修改会先保留在浏览器，保存后更新项目。</p> : <>
          <label>
            {action.kind === 'move' ? '项目路径（相对于策略根目录）' : '文件路径（相对于项目目录）'}
            <input autoFocus required disabled={!!busy} value={name} onChange={e => setName(e.target.value)} placeholder={action.kind === 'move' ? '分类/项目名称' : 'signals/momentum.py'} />
          </label>
          <p className="note">
            {action.kind === 'move' ? '项目身份与历史回测关联保持；未保存编辑仍留在浏览器。目标分类文件夹需已存在。' : action.kind === 'rename' ? '使用斜杠移动到子目录。入口随文件改名更新；代码中的 import 请一并修改。' : '使用斜杠创建子目录；文件与目录请使用 Python 模块名。辅助文件不会成为独立策略。'}
          </p>
        </>}
        <ErrorNotice message={actionError} />
        <div className="actions">
          <button type="button" disabled={!!busy} onClick={() => setAction(null)}>取消</button>
          <button className="primary" disabled={!!busy}>
            {busy ? '处理中…' : action.kind === 'delete' ? '删除' : '确定'}
          </button>
        </div>
      </form>
    </Modal>}
    {review && draft && <Modal title="核对项目版本" close={() => setReview(null)}>
      <p>服务中以下文件与当前编辑不同；入口：{review.entrypoint}。请选择采用服务版本，或明确保留当前编辑后再次保存。</p>
      <ul>
        {sourceChanges({
          files: draft.files,
          entrypoint: draft.entrypoint,
          projectId: draft.strategy_id
        }, {
          files: review.files,
          entrypoint: review.entrypoint,
          projectId: review.strategy_id
        }).filter(item => item.status !== 'unchanged').map(item => <li key={item.path}>
          {item.path}
        </li>)}
      </ul>
      <div className="actions">
        <button onClick={() => setReview(null)}>取消</button>
        <button onClick={() => resolveConflict(false)}>载入服务版本</button>
        <button className="primary" onClick={() => resolveConflict(true)}>保留当前编辑，允许覆盖差异</button>
      </div>
    </Modal>}
  </>;
}
