import { useEffect, useRef, useState } from 'react';
import { taskPin, taskSchema, taskService, tasks, type Task } from './api';
import { createRequest } from './parameters.mjs';
import { canonical } from '../../shared/format.mjs';
import { errorText } from '../../shared/http';

type Catalogue = Task<'JobCatalogue'>;
type Strategy = Task<'M2StrategyVersion'>;
type Pending = { source: string; request: Task<'JobCreate'> };
const pendingKey = 'quant-web.tasks.create.v1';
function savedRequest(): Pending | null {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    return pending?.source === taskPin.source_sha256 && /^[A-Za-z0-9_-]{1,96}$/.test(pending.request?.idempotency_key) ? pending : null;
  } catch { return null; }
}
async function readCatalogue(signal?: AbortSignal) {
  taskSchema(await tasks('/openapi.json', undefined, signal));
  const catalogue = await tasks<Catalogue>('/jobs/catalogue', undefined, signal);
  taskService(catalogue.service_identity);
  return catalogue;
}
export function DailyTaskComposer({ online }: { online: boolean }) {
  const [pending, setPending] = useState(savedRequest);
  const saved = pending?.request, parameters = saved?.parameters;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [windowId, setWindowId] = useState(saved?.window_id || '');
  const [end, setEnd] = useState(saved?.end_date || '');
  const [name, setName] = useState(saved?.name || '日频回测');
  const [cash, setCash] = useState(parameters?.initial_cash || '10000');
  const [shares, setShares] = useState(parameters && 'target_shares' in parameters ? String(parameters.target_shares) : '100');
  const [enter, setEnter] = useState(parameters && 'enter_below' in parameters ? parameters.enter_below : '12.5');
  const [exit, setExit] = useState(parameters && 'exit_above' in parameters ? parameters.exit_above : '12.55');
  const [template, setTemplate] = useState<string>(parameters?.template || 'previous_close_band.v1');
  const [strategy, setStrategy] = useState(parameters && 'strategy_version_id' in parameters ? parameters.strategy_version_id : '');
  const [pythonParameters, setPythonParameters] = useState(parameters && 'strategy_parameters' in parameters ? JSON.stringify(parameters.strategy_parameters) : '{}');
  const [dataset, setDataset] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    setCatalogue(null); setAck(false);
    if (online) {
      setBusy(true);
      Promise.all([readCatalogue(abort.signal), tasks<Strategy[]>('/strategies', undefined, abort.signal), tasks<Strategy[]>('/python-strategies', undefined, abort.signal)])
        .then(([next, rules, python]) => {
          if (abort.signal.aborted) return;
          setCatalogue(next); setStrategies([...rules, ...python]); setError('');
          setWindowId(previous => next.windows.some(item => item.scope.window_id === previous) ? previous : next.windows[0]?.scope.window_id || '');
        }).catch(e => { if (!abort.signal.aborted) setError(errorText(e)); })
        .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    }
    return () => abort.abort();
  }, [online, revision]);
  const selected = catalogue?.windows.find(item => item.scope.window_id === windowId);
  useEffect(() => { if (!pending) { setAck(false); setEnd(''); } }, [windowId, pending]);
  const choices = strategies.filter(item => item.definition.template === (template === 'registered_python.v1' ? 'trusted_python_decision.v1' : 'decision_rules.v1'));
  const disabled = !online || busy || !!pending;
  async function bind() {
    if (lock.current || disabled || !/^[a-f0-9]{64}$/.test(dataset)) return;
    lock.current = true; setBusy(true); setError(''); setAck(false);
    try {
      await readCatalogue();
      const next = await tasks<Catalogue>('/data/bind', { dataset_id: dataset });
      taskService(next.service_identity);
      if (mounted.current) { setCatalogue(next); setRevision(value => value + 1); }
    } catch (e) {
      if (mounted.current) { setCatalogue(null); setError(`${errorText(e)} 请重新读取目录核对绑定状态。`); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function submit(retry = false) {
    if (lock.current || !online || busy || (!retry && (!catalogue || pending))) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const fresh = await readCatalogue();
      let frozen = pending;
      if (!retry) {
        if (canonical(fresh) !== canonical(catalogue)) { setCatalogue(fresh); setAck(false); throw new Error('目录发生变化，请重新选择并确认当前假设。'); }
        if (template !== 'previous_close_band.v1' && !choices.some(item => item.version_id === strategy)) throw new Error('请选择当前目录中的已注册策略。');
        if (template === 'previous_close_band.v1' && !/^[1-9][0-9]*$/.test(shares)) throw new Error('目标股数须为不带空白、指数或小数的正整数。');
        const parameters = { template, security: '600000.XSHG', frequency: '1d', initial_cash: cash,
          target_shares: Number(shares), enter_below: enter, exit_above: exit,
          strategy_version_id: strategy, strategy_parameters: template === 'registered_python.v1' ? JSON.parse(pythonParameters) : {} };
        const request = createRequest(fresh, { window_id: windowId, end_date: end, name, acknowledged: ack, parameters }, `web-${crypto.randomUUID()}`) as Task<'JobCreate'>;
        frozen = { source: taskPin.source_sha256, request };
        // Persist the exact request before sending. Storage failure must prevent submission.
        sessionStorage.setItem(pendingKey, JSON.stringify(frozen)); setPending(frozen);
      }
      if (!frozen || frozen.source !== taskPin.source_sha256) throw new Error('待核对请求的来源身份不匹配。');
      const job = await tasks<Task<'JobView'>>('/jobs', frozen.request);
      if (job.contract_version !== taskPin.contract_version || !/^m2job-[a-f0-9]{32}$/.test(job.job_id)
          || canonical(job.request) !== canonical(frozen.request)) throw new Error('创建响应与原请求不一致，请保留原请求核对。');
      sessionStorage.removeItem(pendingKey);
      if (mounted.current) { setPending(null); location.hash = `/tasks/daily/${job.job_id}`; }
    } catch (e) { if (mounted.current) setError(errorText(e)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="task-panel" aria-label="新建日频回测">
    <h2>新建日频回测</h2><p>使用已准入窗口、已绑定数据和明确的策略版本；任务恢复与结果在下方查看。</p>
    <button disabled={!online || busy} onClick={() => setRevision(value => value + 1)}>重新读取目录与绑定</button>
    {error && <p role="alert" className="task-error">{error}</p>}
    {pending && <div className="task-pending"><strong>有一项创建请求待核对</strong><p>响应中断时任务可能已创建；重试会发送同一请求和幂等键。</p>
      <details><summary>已保存的请求</summary><pre>{JSON.stringify(pending.request, null, 2)}</pre></details>
      <button disabled={!online || busy} onClick={() => void submit(true)}>重试原请求</button>
      <button disabled={!online || busy || !catalogue} onClick={() => { sessionStorage.removeItem(pendingKey); setPending(null); }}>已在任务列表核对，结束此请求</button>
    </div>}
    <fieldset disabled={disabled}>
      <details><summary>绑定已导入的数据</summary><p>数据由 AQ 本地 CLI 导入；这里仅接受 dataset ID。</p><label>Dataset ID<input value={dataset} onChange={event => setDataset(event.target.value)} maxLength={64}/></label><button disabled={!/^[a-f0-9]{64}$/.test(dataset) || !catalogue} onClick={() => void bind()}>绑定数据</button></details>
      {catalogue && <p>绑定摘要：<code>{catalogue.data_binding_sha256 || '尚未绑定'}</code><br/>{catalogue.configuration_error || catalogue.native_error || (catalogue.native_ready ? '原生执行器已就绪' : '原生执行器未就绪')}</p>}
      <label>任务名称<input value={name} onChange={event => setName(event.target.value)} maxLength={80}/></label>
      <label>窗口<select value={windowId} onChange={event => setWindowId(event.target.value)}><option value="">选择已准入窗口</option>{catalogue?.windows.map(item => <option key={item.scope.window_id} value={item.scope.window_id}>{item.scope.window_id} · {item.scope.trading_dates[0]}～{item.scope.trading_dates.at(-1)}</option>)}</select></label>
      <label>结束日期<select value={end} onChange={event => setEnd(event.target.value)}><option value="">整个窗口</option>{selected?.scope.trading_dates.map(day => <option key={day}>{day}</option>)}</select></label>
      <label>初始资金 CNY<input value={cash} onChange={event => setCash(event.target.value)} inputMode="decimal" maxLength={12}/></label>
      <label>策略<select value={template} onChange={event => { setTemplate(event.target.value); setStrategy(''); }}><option value="previous_close_band.v1">前收盘价阈值</option><option value="registered_rules.v1">已注册 JSON 规则</option><option value="registered_python.v1">已注册 Python 策略</option></select></label>
      {template === 'previous_close_band.v1' ? <>
        <label>目标股数<input value={shares} onChange={event => setShares(event.target.value)} inputMode="numeric"/></label>
        <label>买入阈值<input value={enter} onChange={event => setEnter(event.target.value)} inputMode="decimal" maxLength={12}/></label>
        <label>卖出阈值<input value={exit} onChange={event => setExit(event.target.value)} inputMode="decimal" maxLength={12}/></label>
      </> : <><label>已注册版本<select value={strategy} onChange={event => setStrategy(event.target.value)}><option value="">选择版本</option>{choices.map(item => <option key={item.version_id} value={item.version_id}>{item.definition.template} · {item.version_id.slice(0, 12)}</option>)}</select></label><p>策略先在 AQ 注册；Python 仅支持本机可信代码。</p></>}
      {template === 'registered_python.v1' && <label>Python 参数 JSON<textarea value={pythonParameters} onChange={event => setPythonParameters(event.target.value)} rows={3}/></label>}
      {selected && <><ul>{selected.assumptions.map(item => <li key={item.assumption_id}>{item.description}</li>)}</ul><label><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)}/>已阅读并确认此窗口的假设与限制</label></>}
      <button disabled={!catalogue?.configured || !catalogue.native_ready || !ack || !selected} onClick={() => void submit()}>创建日频任务</button>
    </fieldset>
  </section>;
}
