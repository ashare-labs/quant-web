import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, errorText, PIN, readRunDetail, cancelRun, readRunEvents, readRunReceipt, type Model } from './api';
import { canonical, money, time } from '../../shared/format.mjs';
import { usePoll } from '../../shared/usePoll';
import { useOnline } from '../../shared/useOnline';
import contract from '../../../contracts/api.openapi.json';

type Run = Model<'RunView'>;
type Engine = 'rqalpha' | 'fixture-replay-v1';
type Strategy = Model<'StrategyVersion'>;
type Scenario = Model<'StrategyCreate'>['scenario'];
const labels: Record<Scenario, string> = { buy_hold: '买入持有', t_plus_one: 'T+1 拒绝与次日卖出', insufficient_cash: '资金不足拒绝', partial_fill: '部分成交与撤销', cross_day: '跨日买卖', corporate_action: '公司行动入账', restart: '进程恢复规格' };
const statuses: Record<Run['status'], string> = { queued: '已排队', running: '运行中', succeeded: '已完成', failed: '运行失败', cancelled: '已停止' };
const isActive = (r: Run) => r.status === 'queued' || r.status === 'running';
const record = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};

function Json({ value }: { value: unknown }) { return <pre>{JSON.stringify(value, null, 2)}</pre>; }
function Badge({ status }: { status: Run['status'] }) { return <span className={`badge ${status}`}>{statuses[status]} <span className="english">{status}</span></span>; }
function ErrorBox({ text }: { text?: string }) { return text ? <div role="alert" className="error">{text}</div> : null; }
function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
function Pairs({ value }: { value: Record<string, unknown> }) { return <dl className="pairs">{Object.entries(value).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>; }
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <Empty>后端当前未输出记录。</Empty>;
  return <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}
export type Bootstrap = { capabilities: Model<'Capabilities'>; scenarios: Record<string, unknown>; nativeScenarios: Record<string, unknown>; compatible: boolean };
const loadBootstrap = async (): Promise<Bootstrap> => {
  const [capabilities, scenarios, nativeScenarios, live] = await Promise.all([api<Model<'Capabilities'>>('/capabilities'), api<Record<string, unknown>>('/scenarios'), api<Record<string, unknown>>('/rqalpha/scenarios'), api<unknown>('/openapi.json')]);
  return { capabilities, scenarios, nativeScenarios, compatible: canonical(live) === canonical(contract) };
};
const loadIndex = async () => {
  const [runs, strategies] = await Promise.all([api<Run[]>('/runs'), api<Strategy[]>('/strategies')]);
  return { runs, strategies };
};
export function ExecutionPage({ route }: { route: string }) {
  const online = useOnline();
  const boot = usePoll(loadBootstrap, 30000);
  const index = usePoll(loadIndex, 3000);
  let id: string | undefined;
  try { if (route.startsWith('#/execution/runs/')) id = decodeURIComponent(route.slice('#/execution/runs/'.length)); }
  catch { /* An invalid encoded route remains unselected. */ }
  const enabled = online && !boot.error && !index.error && boot.data?.compatible === true;
  return <main>
    <header><h1>执行与合成演练</h1><p>使用固定人工场景检查原生执行；真实任务结果由后端提供。</p></header>
    {!online && <ErrorBox text="浏览器离线，操作已禁用。"/>}
    <ErrorBox text={boot.error || index.error}/>
    {boot.data && !boot.data.compatible && <ErrorBox text="EXECUTION_CONTRACT_MISMATCH · 当前服务契约不匹配，操作已禁用。"/>}
    {route.startsWith('#/execution/capabilities') ? <Capabilities data={boot.data}/> : <div className="workspace">
        <aside><RunForm boot={boot.data} enabled={enabled} onCreated={index.refresh} />
          <section className="panel help"><h2>操作顺序</h2><ol><li>选择人工样例，核对固定参数。</li><li>提交后由独立 worker 消费排队任务。</li><li>检查订单、成交、账户、日志与 manifest。</li></ol><p>暂停 / 恢复：当前无 HTTP API。原生取消需等待停止写者并最终对账；worker 恢复需本机 CLI 操作，准入边界见上方说明。</p></section>
        </aside>
        <div className="content">
          <section className="panel"><div className="section-head"><div><h2>运行记录</h2><p>{index.data?.runs.length ?? '—'} 条 · 每 3 秒读取 · 最后读取 {time(index.at)}</p></div><button onClick={index.refresh} disabled={index.loading}>刷新列表</button></div>
            {index.loading && <Empty>正在读取运行列表…</Empty>}
            {index.data?.runs.length === 0 && <Empty>还没有运行。先从左侧提交一次合成演练。</Empty>}
            {!!index.data?.runs.length && <div className="run-list">{[...index.data.runs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => <a className={`run-row ${id === r.run_id ? 'current' : ''}`} href={`#/execution/runs/${encodeURIComponent(r.run_id)}`} key={r.run_id}><div><strong>{index.data?.strategies.find(s => s.version_id === r.strategy_version_id)?.definition.name || '固定策略规格'}</strong><code>{r.run_id}</code></div><div><Badge status={r.status}/>{r.cancel_requested_at && isActive(r) && <span className="badge queued">取消待对账</span>}{r.reconciliation_required && <span className="badge queued">需对账</span>}<small>{r.account_id} · {time(r.created_at)}</small></div></a>)}</div>}
          </section>
          {id ? <RunDetail key={id} id={id} enabled={enabled} onChange={index.refresh}/> : <section className="panel"><Empty>选择一条运行，查看后端执行投影与证据。</Empty></section>}
        </div>
      </div>}
  </main>;
}
function Capabilities({ data }: { data?: Bootstrap }) {
  return <section className="panel"><h2>能力边界与固定契约</h2><p>后端身份由功能契约约束；运行时检查 OpenAPI 结构，不把 schema 一致当作源码身份验证。</p><Pairs value={{ backend_source: PIN, api: '/api/v1', contract: 'contracts/api.openapi.json', interface_match: data ? String(data.compatible) : '等待连接', parameter_editing: '日频任务支持固定窗口、参数和数据绑定', pause_resume: '合成无 HTTP 暂停/恢复；回测任务恢复见对应入口', metrics: '只有后端账户 equity；无收益率 / 回撤接口' }}/><h3>后端实时能力响应</h3>{data ? <Json value={data.capabilities}/> : <Empty>尚未取得后端能力响应。</Empty>}<p>restart 是恢复场景样例；选择它不会自动注入进程崩溃。原生恢复由固定环境的 CLI worker 接管，浏览器只读执行状态。</p></section>;
}
type Attempt = { pin: string; key: string; definition: Model<'StrategyCreate'>; account: string; outcome: 'unknown' | 'rejected' | 'created'; run?: Run; error?: string };
const storageKey = 'quant-web.execution.attempt.v3';
function restore(): Attempt | undefined {
  try { const x = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return x?.pin === PIN && x.definition && typeof x.key === 'string' ? x : undefined; } catch { return undefined; }
}
function RunForm({ boot, enabled, onCreated }: { boot?: Bootstrap; enabled: boolean; onCreated: () => void }) {
  const [attempt, setAttempt] = useState<Attempt | undefined>(restore);
  const [engine, setEngine] = useState<Engine>(attempt?.definition.engine_id || 'rqalpha');
  const [scenario, setScenario] = useState<Scenario>(attempt?.definition.scenario || 'buy_hold');
  const [name, setName] = useState(attempt?.definition.name || '买入持有演练');
  const [description, setDescription] = useState(attempt?.definition.description || '');
  const [account, setAccount] = useState(attempt?.account || 'web-demo');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const scenarios = engine === 'rqalpha' ? boot?.nativeScenarios : boot?.scenarios;
  const spec = record(scenarios?.[scenario]);
  const params = record(spec.parameters);
  function save(value: Attempt) { sessionStorage.setItem(storageKey, JSON.stringify(value)); setAttempt(value); }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !enabled || attempt?.outcome === 'created') return;
    lock.current = true; setBusy(true); setError(undefined);
    let next: Attempt | undefined;
    try {
      next = attempt ? { ...attempt, outcome: 'unknown', error: undefined } : { pin: PIN, key: `web-${crypto.randomUUID()}`, definition: { engine_id: engine, name: name.trim(), scenario, description }, account, outcome: 'unknown' };
      save(next); // Persist before any mutation: reload/retry always reuses this exact request.
      const strategy = await api<Strategy>('/strategies', next.definition);
      const run = await api<Run>('/runs', { strategy_version_id: strategy.version_id, account_id: next.account, engine_id: next.definition.engine_id, mode: next.definition.engine_id === 'rqalpha' ? 'synthetic' : 'fixture', idempotency_key: next.key } satisfies Model<'RunCreate'>);
      save({ ...next, outcome: 'created', run });
      location.hash = `/execution/runs/${encodeURIComponent(run.run_id)}`; onCreated();
    } catch (e) {
      const text = errorText(e); setError(text);
      if (next) { try { save({ ...next, outcome: e instanceof ApiError && !e.uncertain ? 'rejected' : 'unknown', error: text }); } catch { setError('无法保存本次请求到 sessionStorage。为避免重复运行，提交已中止；请允许本地站点存储后重试。'); } }
    } finally { lock.current = false; setBusy(false); }
  }
  function reset() { try { sessionStorage.removeItem(storageKey); setAttempt(undefined); setError(undefined); } catch { setError('无法清理本地请求记录。'); } }
  return <section className="panel"><div className="section-head"><div><span className="kicker">01 / 新建演练</span><h2>人工策略样例</h2></div><span className="tag">SYNTHETIC</span></div>
    <form onSubmit={submit}><fieldset disabled={busy || !!attempt}><label>执行引擎<select value={engine} onChange={e => setEngine(e.target.value as Engine)}><option value="rqalpha">原生 RQAlpha · 合成数据</option><option value="fixture-replay-v1">测试替身 fixture · 合成回放</option></select></label><label>样例<select value={scenario} onChange={e => { const s = e.target.value as Scenario; setScenario(s); setName(`${labels[s]}演练`); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value} disabled={!!boot && !(value in (scenarios || {}))}>{label} · {value}</option>)}</select></label>
      <label>规格名称<input required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label>
      <label>虚拟演练账户<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.:\-]{0,95}" value={account} onChange={e => setAccount(e.target.value)}/><small>仅作为并发互斥标识；每次运行重新使用样例初始资金。</small></label>
      <label>说明（可选）<textarea maxLength={2000} rows={2} value={description} onChange={e => setDescription(e.target.value)}/></label></fieldset>
      <div className="fixed-params"><h3>后端固定参数 <span>只读</span></h3>{Object.keys(params).length ? <Pairs value={params}/> : <p>正在等待后端样例参数…</p>}<small>当前接口不接受参数编辑或策略代码。</small></div>
      <details><summary>人工预期与样例假设（非实测）</summary><Json value={spec}/></details>
      {scenario === 'restart' && <p className="notice">该样例用于恢复验证；浏览器不注入崩溃或重启进程。正确 CLI worker 可接管可恢复任务；真实市场恢复仍未验证。</p>}
      <ErrorBox text={error || attempt?.error}/>
      {attempt && <div className="attempt"><small>当前请求幂等键</small><code>{attempt.key}</code>{attempt.outcome === 'created' ? <p role="status">已创建合成运行。再次点击或刷新不会新建任务。<a href={`#/execution/runs/${attempt.run?.run_id}`}>查看本次运行 →</a></p> : <p>请求已锁定，重试沿用同一键和参数。{attempt.outcome === 'unknown' && '结果待确认，暂不允许另起请求。'}</p>}</div>}
      <button className="primary wide" type="submit" disabled={!enabled || busy || attempt?.outcome === 'created' || !name.trim()}>{busy ? '正在提交…' : attempt?.outcome === 'created' ? '本次请求已提交' : attempt ? '用原幂等键重试' : '提交合成演练'}</button>
      {(attempt?.outcome === 'created' || attempt?.outcome === 'rejected') && <button className="wide" type="button" disabled={busy} onClick={reset}>准备下一次演练</button>}
      {!enabled && <small>连接正常且固定契约一致后可提交。</small>}
    </form>
  </section>;
}
function RunDetail({ id, enabled, onChange }: { id: string; enabled: boolean; onChange: () => void }) {
  const load = useCallback(() => readRunDetail(id), [id]);
  const detail = usePoll(load);
  const [tab, setTab] = useState('account');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const data = detail.data, run = data?.state.run;
  async function cancel() {
    if (!run || !isActive(run) || run.cancel_requested_at || !enabled || detail.error || lock.current) return;
    lock.current = true; setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const result = await cancelRun(id);
      setMessage(result.cancel_requested_at && isActive(result) ? '取消请求已记录。仍占用账户，等待停止写者和最终对账。' : `后端返回：${statuses[result.status]}（${result.status}）。请核对 projection_complete 与冻结回执。`); detail.refresh(); onChange();
    } catch (e) { setError(errorText(e)); detail.refresh(); }
    finally { lock.current = false; setBusy(false); }
  }
  const state = data?.state, manifest = data?.manifest;
  return <section className="panel detail"><div className="section-head"><div><span className="kicker">02 / 运行详情</span><h2>{run ? <Badge status={run.status}/> : '读取运行'}</h2><code>{id}</code></div><a href="#/execution/runs">返回列表</a></div>
    <ErrorBox text={detail.error}/>{detail.error && <p className="notice">此处保留的投影可能过期；恢复连接前停止操作已禁用。</p>}
    <ErrorBox text={error}/>{message && (!run || isActive(run)) && <p role="status" className="notice">{message}</p>}
    <div className="toolbar"><button disabled={!run || !isActive(run) || !!run.cancel_requested_at || !enabled || !!detail.error || busy} onClick={cancel}>{busy ? '正在请求取消…' : run?.cancel_requested_at && isActive(run) ? run.native_reconcile_only ? '取消已请求 · 需人工对账' : '取消已请求 · 等待对账' : '停止运行'}</button><button disabled title="固定后端没有暂停 API">暂停（未实现）</button><button disabled title="固定后端没有恢复 API">恢复（未实现）</button><button onClick={detail.refresh} disabled={detail.loading}>刷新详情</button></div>
    {detail.loading && <Empty>正在读取状态、日志和 manifest…</Empty>}
    {run?.status === 'queued' && !run.error && !run.cancel_requested_at && <p className="notice">已持久入队，等待固定环境的独立 worker；页面本身不执行引擎。</p>}
    {run && !isActive(run) && <p className="notice">该任务已到终态，停止按钮不可用。完成只代表本次合成数据运行完成，须结合原生回执核对，不代表真实市场验收通过。</p>}
    {run?.cancel_requested_at && <p className="notice">取消请求时间：{time(run.cancel_requested_at)}。取消不撤销已提交成交、不清仓；请检查冻结结果和最终对账状态。</p>}
    {state && !state.projection_complete && <div role="status" className="notice"><strong>投影尚未完成最终对账</strong> · 当前空账户 / 零成交不能证明原生没有交易。保持只读，等待正确 worker 或人工只读对账。</div>}
    {run?.native_reconcile_only && isActive(run) && <div role="status" className="notice"><strong>需人工只读对账</strong> · 普通 worker 不自动重跑，即使已有取消请求。请由操作员使用固定环境的 worker --run-id 处理，浏览器不新增恢复动作。</div>}
    {run?.error && <ErrorBox text={`后端运行错误 · ${run.error}`}/>}
    {state && manifest && <><dl className="run-meta"><div><dt>最后读取</dt><dd>{time(detail.at)}</dd></div><div><dt>逻辑时钟 / 交易日</dt><dd>{time(state.logical_at)} / {state.trading_day || '—'}</dd></div><div><dt>提交游标 / 最终投影</dt><dd>{run?.cursor} · projection_complete={String(state.projection_complete)}</dd></div><div><dt>取消 / 对账要求</dt><dd>{run?.cancel_requested_at ? time(run.cancel_requested_at) : '未请求取消'} · reconciliation_required={String(run?.reconciliation_required)}</dd></div><div><dt>真值来源</dt><dd>{state.truth_source} · is_test_double={String(state.is_test_double)} · 数据={state.data_evidence_kind}</dd></div></dl>
      <div className="tabs" role="tablist">{[['account','账户与持仓'],['orders',`订单 ${state.orders.length}`],['fills',`成交 ${state.fills.length}`],['events','原生事件'],['execution','执行与恢复'],['receipt','完成回执'],['logs','日志与错误'],['manifest','Manifest / 数据']].map(([v, label]) => <button role="tab" aria-selected={tab === v} key={v} onClick={() => setTab(v)}>{label}</button>)}</div>
      <div role="tabpanel">
        {tab === 'account' && <><p className="notice">数据证据：synthetic。{state.is_test_double ? '测试替身回放快照。' : '原生 RQAlpha 账户投影；原生 float 按八位小数政策正规化，非源行情精度承诺。'} 金额为后端 CNY 字符串，不是实测收益。</p>{state.account ? <><div className="metrics"><div><small>现金（含冻结）</small><strong>{money(state.account.cash)}</strong></div><div><small>冻结现金</small><strong>{money(state.account.frozen_cash)}</strong></div><div><small>合成权益 equity</small><strong>{money(state.account.equity)}</strong></div></div><h3>持仓投影</h3><Table headers={['证券', '总数量（股）', '可卖数量（股）', '均价 CNY', '应收股利 CNY']} rows={state.account.positions.map(p => [p.security, p.quantity, p.sellable, money(p.average_price), money(p.dividend_receivable)])}/></> : <Empty>后端尚无账户快照。不会用人工预期填充。</Empty>}<p className="muted">收益率、回撤、可用资金：当前未输出，前端不计算。</p></>}
        {tab === 'orders' && <><p className="notice">合成输入的引擎订单投影；部分原生拒绝不产生订单，请查看事件与回执。原始 rejected / Market close 不改写为 cancelled。</p><Table headers={['订单 ID','证券','方向','数量','已成交','限价 CNY','状态','拒绝原因']} rows={state.orders.map(o => [o.order_id,o.security,o.side,o.quantity,o.filled,money(o.limit_price),o.status,o.reason])}/></>}
        {tab === 'fills' && <><p className="notice">合成输入的引擎成交记录，不代表真实市场成交。</p><Table headers={['成交 ID','订单 ID','证券','方向','数量','价格 CNY','总费用 CNY','佣金 CNY','税 CNY']} rows={state.fills.map(f => [f.fill_id,f.order_id,f.security,f.side,f.quantity,money(f.price),money(f.fee),money(f.commission),money(f.tax)])}/></>}
        {tab === 'events' && <EventsPanel id={id} />}
        {tab === 'receipt' && <ReceiptPanel id={id} engine={manifest.engine.engine_id} />}
        {tab === 'execution' && <><p className="notice">租约仅表示监督进程持有权，不代表所有外部进程或行情健康。环境拒绝可能保持 queued 并占用账户；请按后端错误恢复固定环境，勿新建任务冒充续跑。</p><Pairs value={record(data.execution)}/><p className="notice">{data.execution.recovery === 'cli_worker_after_lease_expiry' ? '可由正确环境的 CLI worker 在租约到期后接管。浏览器无恢复接口。' : data.execution.recovery === 'worker_active' ? '监督 worker 活跃。停止请求需等待最终对账。' : data.execution.recovery === 'cancel_reconciliation' ? '取消待对账：保持账户占用，由固定环境 worker 停止写者并只读对账。' : data.execution.recovery === 'operator_reconciliation' ? '需要人工只读对账：普通 worker 不自动重跑；由操作员使用 worker --run-id 指定本任务。' : '终态任务，不自动重跑。'}</p></>}
        {tab === 'logs' && <><Table headers={['序号','记录时间 +08:00','级别','后端消息']} rows={data.logs.map(l => [l.index,time(l.observed_at),l.level,l.message])}/><p className="muted">读取 logs?after=0；顺序与消息保留后端原文。</p></>}
        {tab === 'manifest' && <><h3>数据引用 · synthetic / 非真实行情</h3><Pairs value={record(manifest.data)}/><h3>不可变策略 / 引擎</h3><Pairs value={{ strategy_version_id: manifest.strategy.version_id, execution_status: manifest.strategy.execution_status, execution_semantics: manifest.execution_semantics, implementation_files: manifest.implementation_files ? Object.keys(manifest.implementation_files).length : '未提供', native_runtime: manifest.native_runtime ? '已提供；完整字段见下方 manifest' : '未提供', engine_id: manifest.engine.engine_id, is_test_double: manifest.engine.is_test_double, real_strategy_executed: manifest.real_strategy_executed, created_at: time(manifest.created_at) }}/><details open><summary>完整 manifest（后端原始响应）</summary><Json value={manifest}/></details></>}
      </div>
    </>}
  </section>;
}

function EventsPanel({ id }: { id: string }) {
  const [after, setAfter] = useState(0);
  const load = useCallback(() => readRunEvents(id, after), [id, after]);
  const events = usePoll(load);
  return <><p className="notice">已提交的引擎事件投影，可能暂时落后于原生 checkpoint。拒绝消息保留原文；无订单的拒绝不创建订单。</p>
    <div className="toolbar"><button onClick={() => { setAfter(0); events.refresh(); }}>从首批刷新事件</button><button disabled={!events.data?.has_more || events.loading || !!events.error} onClick={() => events.data && setAfter(events.data.next_after)}>下一批事件</button><span>after={after} · limit=25 · next_after={events.data?.next_after ?? '—'}</span></div>
    <ErrorBox text={events.error}/>{events.loading && <Empty>正在读取事件…</Empty>}{events.data?.items.length === 0 && <Empty>暂无已提交事件；不会用人工预期补齐。</Empty>}
    {events.data?.items.map(e => <details className="event" key={e.sequence}><summary>#{e.sequence} · {time(e.logical_at)} · {e.kind} · {e.message}</summary><Pairs value={{trading_day: e.trading_day, cash: e.account.cash, frozen_cash: e.account.frozen_cash, equity: e.account.equity}}/><Json value={e}/></details>)}
  </>;
}
function ReceiptPanel({ id, engine }: { id: string; engine: string }) {
  const load = useCallback(async () => {
    if (engine !== 'rqalpha') return { note: '该运行使用 fixture 测试替身，没有原生 RQAlpha 完成回执。', receipt: undefined };
    try { return { note: undefined, receipt: await readRunReceipt(id) }; }
    catch (e) { if (e instanceof ApiError && e.code === 'RECEIPT_NOT_READY') return { note: `${e.code} · ${e.message}`, receipt: undefined }; throw e; }
  }, [id, engine]);
  const result = usePoll(load);
  return <><p className="notice">原生冻结结果 / 完成回执。取消后可能只有部分冻结快照；以 host_reconciliation.native_complete 为准。manifest 不能代替完成证据，真实市场 / paper 未准入。</p><ErrorBox text={result.error}/>{result.loading && <Empty>正在读取完成回执…</Empty>}{result.data?.note && <p role="status" className="notice">{result.data.note}</p>}{result.data?.receipt && <><h3>冻结 / 对账信息</h3><Pairs value={record(result.data.receipt.host_reconciliation)}/><p className="notice">{record(result.data.receipt.host_reconciliation).native_complete === false ? '部分冻结快照：原生输入未全部执行，不得当作完整策略运行。' : record(result.data.receipt.host_reconciliation).native_complete === true ? '完整原生结果；全部输入仍为合成数据。' : '未提供完整性确认；保留后端原始字段。'}</p><Json value={result.data.receipt}/></>}<button onClick={result.refresh}>刷新回执</button></>;
}
