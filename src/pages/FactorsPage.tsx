import { accountStorage } from '../auth/session';
import { useEffect, useRef, useState } from 'react';
import { randomId } from '../shared/random-id';
import { active, api, ApiError, csv, download, errorText, num, type JobLogs } from '../shared/api';
import { Empty, ErrorNotice, JsonDetails, Modal, Reason, Status, useResource } from '../shared/ui';
import type { Catalogue, Factor, Job, Result, Source, Submission } from '../factors/api';
import { compatible, containsRequest, draftKey, emptyDraft, pendingKey, readDraft, submission, type Draft } from '../factors/model';
import { FactorForm } from '../factors/FactorForm';
import { FactorReport } from '../factors/FactorReport';
export function FactorsPage() {
  const [storage] = useState(accountStorage);
  const initial = new URLSearchParams(location.search);
  const [selectedId, setSelectedId] = useState(initial.get('factor') || '');
  const [jobId, setJobId] = useState(initial.get('job') || '');
  const [search, setSearch] = useState('');
  const [library, setLibrary] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<'name' | 'warmup'>('name');
  const [reverse, setReverse] = useState(false);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState(readDraft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<Submission | null>(() => {
    try {
      const p = JSON.parse(storage.getItem(pendingKey) || 'null');
      return p
        && typeof p.idempotency_key === 'string'
        && typeof p.factor_id === 'string'
        ? p
        : null;
    }
    catch {
      return null;
    }
  });
  const guard = useRef(false);
  const catalogue = useResource<Catalogue>('/factors/catalogue');
  const sources = useResource<{
    items: Source[];
    environment_id: string;
  }>('/factors/sources');
  const jobs = useResource<{
    items: Job[];
  }>('/factors/jobs', 7000);
  const validJob = /^m2job-[a-f0-9]{32}$/.test(jobId);
  const job = useResource<Job>(validJob ? '/factors/jobs/' + jobId : null, 3000);
  const result = useResource<Result>(validJob
    && job.data?.result
    ? '/factors/jobs/' + jobId + '/result'
    : null);
  const logs = useResource<JobLogs>(validJob ? '/factors/jobs/' + jobId + '/logs' : null, 7000);
  const items = catalogue.data?.items || [];
  const factor = items.find(f => f.id === selectedId);
  const allCategories = [...new Set(items.map(f => f.category))];
  const filtered = items.filter(f => (!library
    || f.library === library)
    && (!categories.length
      || categories.includes(f.category))
    && [
      f.name,
      f.id,
      f.description
    ].some(v => v.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => {
      const n = sort === 'warmup'
        ? (a.warmup_rows
          ?? Infinity) - (b.warmup_rows
            ?? Infinity)
        : a.name.localeCompare(b.name);
      return reverse ? -n : n;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages - 1);
  const environmentReady = !!catalogue.data
    && catalogue.data.environment_id === sources.data?.environment_id;
  const scrolledJob = useRef('');
  useEffect(() => {
    if (jobId && catalogue.data && jobs.data && scrolledJob.current !== jobId) {
      const panel = document.getElementById('factor-run');
      panel?.scrollIntoView({ block: 'start' });
      panel?.focus({ preventScroll: true });
      scrolledJob.current = jobId;
    }
  }, [jobId, catalogue.data, jobs.data]);
  function edit(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      storage.setItem(draftKey, JSON.stringify(next));
    }
    catch {
      setError('本地存储不可用，配置尚未保存。');
    }
  }
  function select(f: Factor) {
    setSelectedId(f.id);
    setShowForm(true);
    setError('');
    edit({ parameters: {} });
  }
  function showJob(j: Job) {
    setJobId(j.job_id);
    setSelectedId(j.request.factor_id);
    history.replaceState(null, '', `factors.html?factor=${encodeURIComponent(j.request.factor_id)}&job=${j.job_id}`);
  }
  async function run(retry = false) {
    if (guard.current || (!retry && pending))
      return;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      if (!environmentReady || !catalogue.data)
        throw new Error('来源与因子目录尚未就绪，或读取期间环境发生变化。请刷新后重试。');
      const selected = retry && pending
        ? items.find(f => f.id === pending.factor_id)
        : factor;
      if (!selected)
        throw new Error('请选择可用的因子。');
      if (!retry
        && !sources.data?.items.some(s => s.id === draft.source
          && compatible(s, selected)))
        throw new Error('所选来源不能计算此因子。');
      const request = retry
        && pending
        ? pending
        : submission(draft, selected, catalogue.data.environment_id, randomId());
      storage.setItem(pendingKey, JSON.stringify(request));
      setPending(request);
      const accepted = await api<Job>('/factors/jobs', request);
      if (accepted.contract_version !== 'factor-jobs.v1'
        || !/^m2job-[a-f0-9]{32}$/.test(accepted.job_id)
        || !containsRequest(accepted.request, request))
        throw new Error('返回任务与原请求不一致。原请求已保留，请先核对服务状态。');
      storage.removeItem(pendingKey);
      setPending(null);
      setShowForm(false);
      showJob(accepted);
      jobs.refresh();
    }
    catch (e) {
      if (e instanceof ApiError && !e.uncertain) {
        storage.removeItem(pendingKey);
        setPending(null);
      }
      setError(errorText(e));
    }
    finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job.data || !active(job.data) || guard.current)
      return;
    guard.current = true;
    setBusy(true);
    try {
      await api('/factors/jobs/' + jobId + '/cancel', {});
      job.refresh();
      jobs.refresh();
    }
    catch (e) {
      setError(errorText(e));
    }
    finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const changeSort = (value: 'name' | 'warmup') => {
    if (sort === value)
      setReverse(!reverse);
    else {
      setSort(value);
      setReverse(false);
    }
    setPage(0);
  };
  return <main>
    <div className="titlebar">
      <h1>因子看板</h1>
      <span className="note">
        {catalogue.data ? `${items.length} 个因子定义` : '真实数据研究'}
      </span>
    </div>
    <div className="filterbox">
      <div className="categories">
        {allCategories.map(category => <label key={category}>
          <input type="checkbox" checked={!categories.length
            || categories.includes(category)} onChange={e => {
              const current = categories.length ? categories : allCategories;
              const next = e.target.checked
                ? [
                  ...current,
                  category
                ]
                : current.filter(c => c !== category);
              setCategories(next.length ? next : ['__none__']);
              setPage(0);
            }} />
          {category}
        </label>)}
        {!allCategories.length && <span className="muted">等待因子目录</span>}
      </div>
      <div className="filterrow">
        <span>因子库</span>
        {[
          [
            '',
            '全部'
          ],
          [
            'joinquant',
            '基础因子'
          ],
          [
            'alpha191',
            'Alpha191'
          ],
          [
            'qlib_alpha158',
            'Qlib Alpha158'
          ]
        ].map(([value, label]) => <button key={value} className={library === value
          ? 'selected'
          : ''} aria-pressed={library === value} onClick={() => {
            setLibrary(value);
            setPage(0);
          }}>
          {label}
        </button>)}
      </div>
      <div className="filterrow">
        <span>股票池</span>
        <span className="selection-label">自定义证券</span>
        <span className="filter-note">指数历史成分池尚未接入</span>
      </div>
      <div className="filterrow">
        <span>研究周期</span>
        <span className="filter-note">按真实来源覆盖，在因子详情中指定日期</span>
      </div>
      <div className="filterrow">
        <span>组合与交易过滤</span>
        <span className="filter-note">支持单因子统计评价；组合回测、涨停停牌交易过滤暂不可用</span>
      </div>
    </div>
    <div className="toolbar factor-toolbar">
      <input aria-label="搜索因子" placeholder="搜索因子名称" value={search} onChange={e => {
        setSearch(e.target.value);
        setPage(0);
      }} />
      <span className="note">IC 与 IR 由所选运行的评价结果提供</span>
      <button className="push" onClick={() => {
        setSearch('');
        setLibrary('');
        setCategories([]);
        setPage(0);
      }}>重置筛选</button>
    </div>
    <ErrorNotice message={catalogue.error || sources.error || error} retry={() => {
      catalogue.refresh();
      sources.refresh();
      setError('');
    }} />
    {pending && <div className="notice" role="status">
      <span>有一条尚未确认的提交（{pending.factor_id}）。</span>
      <button disabled={busy || !environmentReady} onClick={() => void run(true)}>按原请求找回</button>
    </div>}
    <div className="tablewrap factor-table">
      <table>
        <thead>
          <tr>
            <th>
              <button onClick={() => changeSort('name')}>因子名称 <i className="fa fa-sort" aria-hidden="true" /></button>
            </th>
            <th>分类</th>
            <th>因子库</th>
            <th>
              <button onClick={() => changeSort('warmup')}>预热行数 <i className="fa fa-sort" aria-hidden="true" /></button>
            </th>
            <th>输入字段</th>
            <th>计算状态</th>
            <th>IC / IR</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(current * 25, (current + 1) * 25).map(f => <tr key={f.id}>
            <td>
              <button className="text-button" onClick={() => select(f)}>
                {f.name}
              </button>
              <small className="factor-id">
                {f.id}
              </small>
            </td>
            <td>
              {f.category}
            </td>
            <td>
              {f.library === 'qlib_alpha158'
                ? 'Qlib Alpha158'
                : f.library === 'alpha191'
                  ? 'Alpha191'
                  : '基础因子'}
            </td>
            <td>
              {num(f.warmup_rows, 0)}
            </td>
            <td>
              {f.inputs.join('、')}
            </td>
            <td>
              {f.availability === 'IMPLEMENTED' ? '可计算' : f.availability}
            </td>
            <td>—</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {catalogue.loading
      ? <Empty>正在读取因子目录…</Empty>
      : !catalogue.error
      && !filtered.length
      && <Empty>没有匹配的因子。</Empty>}
    <div className="pagination">
      <button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button>
      <span>{current + 1} / {pages} · {filtered.length} 项</span>
      <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>下一页</button>
      <button disabled={!filtered.length} onClick={() => download('因子目录.csv', csv([
        [
          '因子ID',
          '名称',
          '定义',
          '分类',
          '输入'
        ],
        ...filtered.map(f => [
          f.id,
          f.name,
          f.definition,
          f.category,
          f.inputs.join(',')
        ])
      ]), 'text/csv;charset=utf-8')}>导出当前目录</button>
    </div>
    <section className="factor-history">
      <h2>因子运行记录</h2>
      <ErrorNotice message={jobs.error} retry={jobs.refresh} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>因子</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data?.items || []).map(j => <tr key={j.job_id}>
              <td>
                {j.request.name}
              </td>
              <td>
                {j.request.factor_id}
              </td>
              <td>
                <Status job={j} />
              </td>
              <td>
                <button onClick={() => showJob(j)}>
                  {j.result ? '查看结果' : '查看状态'}
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {jobs.data && !jobs.data.items.length && <Empty>尚无因子运行记录。</Empty>}
    </section>
    {jobId && <section className="factor-detail" id="factor-run" tabIndex={-1}>
      <div className="titlebar">
        <h2>运行详情 · {job.data?.request.factor_id || jobId}</h2>
        <div className="inline-actions">
          {job.data && <Status job={job.data} />}
          <button onClick={() => {
            job.refresh();
            result.refresh();
          }}>刷新</button>
          {job.data
            && active(job.data)
            && <button disabled={busy
              || job.data.status === 'cancelling'} onClick={cancel}>取消计算</button>}
        </div>
      </div>
      <ErrorNotice message={!validJob ? '任务编号无效。' : job.error || result.error} retry={() => {
        job.refresh();
        result.refresh();
      }} />
      <Reason value={job.data?.execution_reason} />
      <Reason value={job.data?.error} />
      {result.data
        && job.data
        && result.data.job_id === jobId
        && containsRequest(result.data.request, job.data.request) ? <FactorReport result={result.data} /> : result.data ? <ErrorNotice message="结果与任务请求不一致，已停止显示。" /> : !job.error
          && <Empty>
            {job.loading
              || result.loading
              ? '正在读取研究结果…'
              : job.data
                && active(job.data)
                ? '计算正在进行，完成后将显示真实结果。'
                : '此运行尚无已发布结果。'}
          </Empty>}
      <ErrorNotice message={logs.error} />
      {logs.data && <JsonDetails title="任务日志" value={logs.data.items} />}
    </section>}
    {showForm && factor && <Modal title={factor.name + ' · 因子研究'} close={() => setShowForm(false)} wide>
      <p>
        {factor.description}
      </p>
      <p className="note">{factor.id} · {factor.definition}</p>
      {factor.expression && <pre className="formula">
        {factor.expression}
      </pre>}
      <form onSubmit={e => {
        e.preventDefault();
        void run();
      }}>
        <FactorForm factor={factor} sources={sources.data?.items
          || []} draft={draft} edit={edit} evaluationAvailable={!!catalogue.data?.evaluation_available} />
        <ErrorNotice message={error} />
        <details>
          <summary>定义与限制</summary>
          <p className="note">
            {factor.note}
          </p>
          <ul>
            {factor.limitations.map((s, i) => <li key={i}>
              {s}
            </li>)}
          </ul>
        </details>
        <div className="actions">
          <button type="button" onClick={() => setShowForm(false)}>取消</button>
          <button className="primary" disabled={busy
            || !!pending
            || !environmentReady
            || factor.availability !== 'IMPLEMENTED'}>
            {busy ? '正在提交…' : draft.evaluate ? '计算并评价' : '计算因子'}
          </button>
        </div>
      </form>
    </Modal>}
  </main>;
}
