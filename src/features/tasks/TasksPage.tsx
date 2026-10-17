import { useEffect, useRef, useState } from 'react';
import { api as paper, type Action } from '../paper/api';
import { tasks } from './api';
import { DailyTaskComposer } from './DailyTaskComposer';
import { DailySummary, DailyDecisions, DailyDiagnostics, DailyOrders, DailyEvidence } from './DailyTaskResults';
import { TaskTable as Table } from './TaskTable';
import { errorText } from '../../shared/http';
import { readIndex, readSnapshot, sourcePin, type Source, type Snapshot, type Choice, type Point } from './snapshots';
import { curveGeometry, pendingMatches } from './evidence.mjs';
import './tasks.css';

const sources: Record<Source, string> = { daily: '日频回测任务', paper: '连续模拟账户' };
const states: Record<string, string> = { paused: '已暂停', committed: '已提交', empty: '尚无已提交日', prepared: '等待数据', ready: '待执行', running: '运行中', recovery_required: '需恢复', evidence_conflict: '证据冲突', queued: '排队中', cancelling: '取消待确认', cancelled: '已取消', failed: '失败', succeeded: '已完成', sealed: '封存只读' };
const short = (v: string) => v.length > 18 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v;
const pathFor = (source: Source, id = '') => `#/tasks/${source}${id ? `/${encodeURIComponent(id)}` : ''}`;
type Pending = { source: Source; id: string; pin: string; action: string; body: Action | Record<string, never> };
const pendingKey = 'quant-web.tasks.pending.v3';
function savedPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    if (!value || !['paper', 'daily'].includes(value.source) || !['pause', 'resume', 'ingest', 'advance', 'cancel'].includes(value.action)) return null;
    if (!pendingMatches(value, value.source, value.id, sourcePin(value.source))) return null;
    return value;
  } catch { return null; }
}
function Raw({ title, value }: { title: string; value: unknown }) {
  return <details><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}
function Curve({ points, day, select }: { points: Point[]; day: string; select: (day: string) => void }) {
  const geometry = curveGeometry(points);
  if (!geometry) return <p className="task-empty">尚无可绘制的已提交权益。缺失值不补零，不生成示例曲线。</p>;
  return <figure className="task-curve"><svg viewBox="0 0 800 218" role="img" aria-label="后端逐日权益曲线，精确金额见下方逐日表">
    <line x1="64" y1="26" x2="776" y2="26" className="task-grid"/><line x1="64" y1="176" x2="776" y2="176" className="task-grid"/>
    <text x="64" y="18">{points[geometry.highIndex].equity} CNY</text>
    <text x="64" y="197">{points[0].day}</text><text x="776" y="197" textAnchor="end">{points.at(-1)!.day}</text>
    <polyline fill="none" stroke="currentColor" strokeWidth="2" points={geometry.coordinates.map((p: { x: number; y: number }) => `${p.x},${p.y}`).join(' ')}/>
    {geometry.coordinates.map((p: { x: number; y: number }, i: number) => <circle key={points[i].day} cx={p.x} cy={p.y} r={points[i].day === day ? 5 : 3} fill={points[i].day === day ? '#b66524' : 'currentColor'}><title>{points[i].day} · {points[i].equity} CNY</title></circle>)}
  </svg><figcaption>逐日原生权益 · {points.length} 个已提交日 · 金额单位 CNY。最低原值 {points[geometry.lowIndex].equity}，最高原值 {points[geometry.highIndex].equity}。连线用于定位，不计算收益率或回撤。</figcaption>
    <label>定位交易日<select aria-label="定位交易日" value={day} onChange={e => select(e.target.value)}>{points.map(p => <option key={p.day} value={p.day}>{p.day} · {p.equity} CNY</option>)}</select></label>
  </figure>;
}

export function TasksPage({ route }: { route: string }) {
  const parts = route.split('/');
  const source: Source = Object.hasOwn(sources, parts[2]) ? parts[2] as Source : 'daily';
  let id = '';
  try { id = decodeURIComponent(parts[3] || ''); } catch { /* Invalid routes remain unselected. */ }
  const detailRoute = parts[4] === 'details';
  const [choices, setChoices] = useState<Choice[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(true);
  const [acting, setActing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [at, setAt] = useState('');
  const [day, setDay] = useState('');
  const [tab, setTab] = useState('overview');
  const [reason, setReason] = useState('本地操作');
  const [pending, setPending] = useState<Pending | null>(savedPending);
  const [notes, setNotes] = useState('');
  const generation = useRef(0), readLock = useRef(false), actionLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const changed = () => { generation.current++; controller.current?.abort(); setSnapshot(null); setAt(''); setOnline(navigator.onLine); setRevision(v => v + 1); };
    const visible = () => { if (document.visibilityState === 'visible') changed(); };
    addEventListener('online', changed); addEventListener('offline', changed); document.addEventListener('visibilitychange', visible);
    return () => { removeEventListener('online', changed); removeEventListener('offline', changed); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => { setDay(''); setNotes(''); setOperationError(''); setNotice(''); }, [source, id]);
  useEffect(() => { setTab(detailRoute && source === 'daily' ? 'details' : 'overview'); }, [source, id, detailRoute]);
  useEffect(() => {
    const token = ++generation.current;
    const request = new AbortController(); controller.current = request;
    setSnapshot(null); setChoices([]); setAt(''); setError(''); setReading(online && !acting);
    if (!online || acting) return () => request.abort();
    readLock.current = true;
    (async () => {
      try {
        const index = await readIndex(source, request.signal);
        if (request.signal.aborted || token !== generation.current) return;
        setChoices(index.choices);
        if (source === 'paper' && !id && index.choices[0]) { location.replace(pathFor(source, index.choices[0].id)); return; }
        const value = id ? await readSnapshot(source, id, index, request.signal) : null;
        if (request.signal.aborted || token !== generation.current) return;
        setSnapshot(value); setDay(previous => value?.points.some(p => p.day === previous) ? previous : value?.points.at(-1)?.day || ''); setAt(new Date().toISOString());
      } catch (e) {
        if (!request.signal.aborted && token === generation.current) { setSnapshot(null); setChoices([]); setError(errorText(e)); }
      } finally { if (token === generation.current) { readLock.current = false; setReading(false); } }
    })();
    return () => request.abort();
  }, [source, id, revision, online, acting]);

  function refresh() {
    if (readLock.current || actionLock.current || !online) return;
    readLock.current = true; controller.current?.abort(); generation.current++; setSnapshot(null); setAt(''); setReading(true); setRevision(v => v + 1);
  }
  const current = online && !reading && !acting && !error && snapshot?.source === source && snapshot.id === id ? snapshot : null;
  const mine = pendingMatches(pending, source, id, sourcePin(source));
  async function send(action: string, body: Action | Record<string, never>, retry = false) {
    if (actionLock.current || !current || !online || (pending && !retry)) return;
    const request = retry ? pending : { source, id, pin: sourcePin(source), action, body };
    if (!request || !pendingMatches(request, source, id, sourcePin(source))) return;
    actionLock.current = true; generation.current++; controller.current?.abort();
    setSnapshot(null); setActing(true); setOperationError(''); setNotice('');
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request);
      if (source === 'paper') await paper(`/sessions/${encodeURIComponent(id)}/${request.action}`, request.body);
      else await tasks(`/jobs/${encodeURIComponent(id)}/${request.action}`, request.body);
      sessionStorage.removeItem(pendingKey);
      if (mounted.current) { setPending(null); setNotice('请求已确认。以下状态以随后重新读取为准；已提交成交不会因取消或暂停而撤销。'); }
    } catch (e) { if (mounted.current) setOperationError(errorText(e)); }
    finally { actionLock.current = false; if (mounted.current) { setActing(false); setRevision(v => v + 1); } }
  }
  function exportEvidence() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'quant-web.task-snapshot.v1', source, source_pin: sourcePin(source), read_at: at, id, human_ui_accepted: false, human_notes: notes, evidence: current.raw }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `task-snapshot-${source}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selected = current?.points.find(p => p.day === day);
  const previous = current?.points[(current?.points.findIndex(p => p.day === day) ?? 0) - 1];
  const view = current?.paper;
  const report = current?.reports?.find(r => r.day === day);
  const delivery = view?.replay?.delivery;
  const waiting = view?.days.find(d => d.status !== 'committed');
  const canAct = !!current && !pending;
  const canPaperAct = canAct && !!reason.trim();
  const next = view?.replay?.next_day;
  const body = (date?: string): Action => ({ reason: reason.trim(), expected_parent: view?.head ?? null, ...(date ? { day: date } : {}) });
  const labels = [['overview', '曲线与逐日记录'], ...(current?.result ? [['orders', '订单与拒单']] : []), ['fills', '逐笔成交'], ['positions', '持仓变化'], ['comparison', '双端差异'], ['gaps', '数据与证据'], ...(current?.taskLogs ? [['details', '任务参数与日志']] : [])];

  return <div className="task-page">
    <header><div><h1>任务与结果</h1><p>选定版本，再核对同一份证据中的账户、成交与数据边界。</p></div><a href="#/tasks/daily">新建日频任务</a><a href="#/paper">模拟操作</a><a href="#/portfolio">组合回测</a></header>
    <main>
      {source === 'daily' && !id && <DailyTaskComposer online={online}/>}
      <section className="task-selection" aria-label="验收对象">
        <label>证据来源<select aria-label="证据来源" value={source} disabled={acting} onChange={e => { setSnapshot(null); location.hash = pathFor(e.target.value as Source); }}>{Object.entries(sources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>验收对象<select aria-label="验收对象" value={id} disabled={reading || acting || !online} onChange={e => { setSnapshot(null); location.hash = pathFor(source, e.target.value); }}><option value="">选择对象</option>{choices.map(c => <option key={c.id} value={c.id}>{c.title} · {short(c.version)}</option>)}</select></label>
        <button disabled={reading || acting || !online} onClick={refresh}>重新读取证据</button>
        <p role="status" className="task-connection">{!online ? '离线' : acting ? '请求处理中…' : reading ? '核验证据中…' : error ? '读取失败' : '已读取'}<small>{at ? `快照时间 ${at} · 状态以本次读取为准` : '核验通过后才展示结果'}</small></p>
      </section>
      <p className="task-boundary">本地历史研究与模拟。服务身份与当前契约配对；更新后需重新导出契约。人类验收结论与后端执行状态分开记录。</p>
      {!online && <div role="alert" className="task-error">浏览器离线，旧结果已隐藏。恢复网络后会重新核验同一对象。</div>}
      {error && <div role="alert" className="task-error"><strong>{error}</strong><p>整份结果已隐藏。检查本机服务、固定版本或证据后，点击重新读取。</p></div>}
      {operationError && <div role="alert" className="task-error"><strong>操作请求：{operationError}</strong><p>错误保留供核对，不因随后读取成功而消失。</p></div>}
      {notice && <p role="status" className="task-notice">{notice}</p>}
      {pending && <section className="task-pending"><h2>有一项请求待核对</h2><p>{pending.source} · {pending.id} · {pending.action}。响应中断时原请求可能已经提交，先核对当前状态。</p>
        {mine ? <><button disabled={!current || acting} onClick={() => void send('', {}, true)}>重试保留的原请求</button><button disabled={!current || acting} onClick={() => { try { sessionStorage.removeItem(pendingKey); setPending(null); setOperationError(''); } catch (e) { setOperationError(String(e)); } }}>已核对状态，结束本次请求</button></> : <a href={pathFor(pending.source, pending.id)}>返回待核对对象</a>}
      </section>}
      {!reading && !error && online && !current && !choices.length && <section className="task-panel"><h2>暂无任务或账户</h2><p>此服务没有已注册的对象。请通过对应 AQ 本地入口准备数据；本页不会生成演示结果。</p></section>}
      {current && <>
        <section className="task-panel" data-testid="task-evidence"><div className="task-heading"><div><h2>{current.title}</h2><p className="task-mode">{current.mode === 'synthetic_fixture' ? '合成演练 · 不是真实历史结果' : current.mode === 'historical_research' ? '历史输入 · 条件研究模拟' : '固定历史条件研究 · 来源真实性未独立证明'}</p></div><strong className="task-state">{states[current.state] || current.state}</strong></div>
          <dl className="task-identity"><div><dt>策略版本</dt><dd><code>{current.strategy}</code></dd></div><div><dt>数据版本</dt><dd><code>{current.dataVersion}</code></dd></div><div><dt>对象 ID</dt><dd><code>{current.id}</code></dd></div><div><dt>服务源码</dt><dd><code>{sourcePin(source)}</code></dd></div></dl>
          <p>{current.review}</p>
          {current.executionScope && <p data-testid="task-execution-scope">执行窗口：{current.executionScope.start_date}～{current.executionScope.end_date} · {current.executionScope.trading_dates.length} 个交易日 · 原窗口 {current.executionScope.owner_window_id}。<br/>冻结数据绑定：<code>{current.dataBinding}</code></p>}
          {current.taskStatus && <details><summary>本次目录读取的任务服务状态</summary><p>待处理容量剩余 {current.taskStatus.available_pending} / {current.taskStatus.policy.max_pending}；执行槽 {current.taskStatus.policy.max_workers}；每任务最多 {current.taskStatus.policy.max_attempts} 次尝试。目录状态与任务快照分别读取，不代表同一原子时刻。</p><Raw title="服务策略、队列与恢复原文" value={current.taskStatus}/></details>}
          {view && <div className="task-controls"><p>模拟状态：已提交至 {view.last_day || '尚无'}；下一日 {next || '未提供 / 窗口结束'}。暂停保留账户，恢复沿用同一冻结会话。</p><label>操作原因<input aria-label="操作原因" value={reason} maxLength={1024} disabled={acting} onChange={e => setReason(e.target.value)}/></label><div className="task-buttons">
            {delivery && <button disabled={!canPaperAct || view.paused || !delivery.next_input_day || delivery.next_input_day !== next || !(delivery.observation_admission?.ready ?? delivery.ad_admission.ready)} onClick={() => void send('ingest', body(delivery.next_input_day!))}>接收下一日数据</button>}
            <button disabled={!canPaperAct || !next || view.paused || waiting?.recovery_required || waiting?.status === 'running' || (!!delivery && !delivery.received.some(d => d.day === next))} onClick={() => void send('advance', body(next!))}>推进下一日</button>
            <button disabled={!canPaperAct || view.paused} onClick={() => void send('pause', body())}>暂停模拟</button>
            <button disabled={!canPaperAct || (!view.paused && !waiting?.recovery_required)} onClick={() => void send('resume', body())}>恢复冻结会话</button>
          </div></div>}
          {current.job && <div className="task-controls"><p>任务游标 {current.job.committed_cursor} / {current.job.total_cursors} · 尝试 {current.job.attempt_count} 次。取消保留已提交成交；恢复条件以 can_resume 为准。</p><div className="task-buttons"><button disabled={!canAct || !['queued', 'running', 'cancelling'].includes(current.job.status)} onClick={() => void send('cancel', {})}>取消研究任务</button><button disabled={!canAct || !current.job.can_resume} onClick={() => void send('resume', {})}>恢复原研究任务</button><a href={`${pathFor(source, current.id)}/details`} onClick={() => { if (source === 'daily') setTab('details'); }}>完整任务参数与日志</a></div>{current.job.error && <Raw title="后端任务错误" value={current.job.error}/>}</div>}
          <div className="task-metrics"><div><span>初始资金 · 冻结配置</span><strong>{current.initialCash}</strong></div><div><span>最近已提交权益 · CNY</span><strong data-testid="task-equity">{current.points.at(-1)?.equity ?? '未提供'}</strong></div><div><span>最近已提交现金 · CNY</span><strong>{current.points.at(-1)?.cash ?? '未提供'}</strong></div><div><span>已提交日期 / 成交记录</span><strong>{current.points.length} / {current.fills.length}</strong></div></div>
          {current.result && <DailySummary result={current.result}/>}
        </section>
        <nav className="task-tabs" aria-label="证据内容">{labels.map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
        <section className="task-panel" aria-label={labels.find(([key]) => key === tab)?.[1]}>
          {tab === 'overview' && <><h2>回测 / 模拟权益曲线</h2><Curve points={current.points} day={day} select={setDay}/><Table name="逐日账户" headers={['交易日', '原生权益 · CNY', '原生现金 · CNY']} rows={current.points.map(p => [<button className="task-date" aria-pressed={day === p.day} onClick={() => setDay(p.day)}>{p.day}</button>, p.equity, p.cash])} empty="尚无已提交账户，不能把初始资金当作已执行结果。"/>{current.result && <DailyDecisions result={current.result}/>}</>}
          {tab === 'orders' && current.result && <><h2>日频订单与拒单</h2><DailyOrders result={current.result}/><DailyDiagnostics result={current.result}/></>}
          {tab === 'fills' && <><h2>逐笔成交与费用</h2><p>当前对象的全部已提交日；顺序按日期及后端记录。价格与费用保持原始精度。</p><Table name="逐笔成交" headers={['日期 / 模型时间', '成交 / 订单 ID', '证券 / 方向', '股数', '价格', '佣金', '税', '总费用']} rows={current.fills.map(f => [`${f.day} / ${f.at}`, `${f.id} / ${f.order}`, `${f.security} / ${f.side}`, f.quantity, f.price, f.commission, f.tax, f.fee])} empty={current.points.length ? '已提交日报中无成交记录。' : '尚无已提交结果，不能推断成交为零。'}/>{current.result && <DailyDiagnostics result={current.result}/>}{current.reports?.some(r => r.native.refusals?.length) && <Raw title="后端逐日拒绝（与成交分别保留）" value={current.reports.filter(r => r.native.refusals?.length).map(r => ({ day: r.day, refusals: r.native.refusals }))}/>}</>}
          {tab === 'positions' && <><h2>持仓变化</h2><p>并列两个相邻已提交日的原生数量，不从成交重建账本。缺失的证券或前一日显示未提供。</p><label>持仓日期<select aria-label="持仓日期" value={day} onChange={e => setDay(e.target.value)}>{current.points.map(p => <option key={p.day}>{p.day}</option>)}</select></label><Table name="持仓变化" headers={['证券', `前一日 ${previous?.day || '未提供'} · 股`, `选定日 ${day || '未提供'} · 股`, '当日可卖 · 股', '当日市值 · CNY']} rows={selected?.positions.map(p => [p.security, previous?.positions.find(q => q.security === p.security)?.quantity, p.quantity, p.sellable, p.value]) || []} empty="没有可核对的已提交持仓。"/>{report && <Raw title="选定日原生账户与目标缺口" value={{ account: report.native.account, target_gaps: report.native.target_gaps }}/>}</>}
          {tab === 'comparison' && <><h2>AQ / 聚宽双端差异</h2><p className="task-notice"><strong>未提供当前对象的可核验双端比较。</strong> 现有冻结 API 没有将聚宽证据绑定到本次策略版本、数据版本和窗口；此处不判定一致，也不拼接历史参考金额。</p><Table name="双端证据覆盖" headers={['核对项', 'AQ', '聚宽']} rows={[[ '策略与数据版本', '见本页当前对象身份', '未提供绑定证据'], ['逐日权益 / 持仓', current.points.length ? `${current.points.length} 个已提交日` : '尚无提交结果', '未提供'], ['逐笔成交 / 费用', current.points.length ? `${current.fills.length} 条原始记录` : '尚无提交结果', '未提供'], ['差异原因 / 容差 / 对账结论', '需后端比较投影', '需后端比较投影']]} empty=""/><p>需要 AQ 提供带双方来源摘要、时间范围、逐项差异与原始限制的只读契约，之后再接入。缺项不等于零差异。</p></>}
          {tab === 'details' && current.taskLogs && <><h2>日频任务参数与日志</h2><p>来自当前服务的同一任务，日志与冻结参数按任务身份核对。</p><Raw title="创建请求与冻结策略" value={{ request: current.job?.request, strategy: current.manifest && 'strategy' in current.manifest ? current.manifest.strategy : undefined }}/><Raw title="完整冻结清单与 Session" value={current.manifest}/><Table name="任务日志" headers={['序号', '时间', '事件', '后端详情']} rows={current.taskLogs.items.map(item => [item.sequence, item.at, item.event, <pre>{JSON.stringify(item.details, null, 2)}</pre>])} empty="后端尚未提供日志。"/></>}
          {tab === 'gaps' && <><h2>真实数据缺失与证据范围</h2>{current.issues.length ? <ul className="task-issues">{current.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul> : <p>后端没有列出额外缺口；这不扩张原有执行权限。</p>}{view && <><p>整窗准入：{delivery ? delivery.ad_admission.ready ? '已通过声明模型' : '未通过' : '未提供逐日 AD 准入'}；观察输入：{delivery ? (delivery.observation_admission?.ready ?? delivery.ad_admission.ready) ? '可接收，订单仍需逐笔许可' : '拒绝' : '未提供'}。</p><Raw title="来源缺口与逐日收据" value={{ preflight: view.replay?.preflight, delivery }}/><Raw title="策略、数据、风险与恢复原文" value={view}/></>}{current.result && <DailyEvidence result={current.result}/>}<Raw title="本次完整 API 证据" value={current.raw}/></>}
        </section>
        <section className="task-panel"><h2>人工验收备注</h2><p>备注只随本次下载保存在本机；不会改变后端验收状态。切换对象会清空未导出备注。</p><label>备注<textarea aria-label="人工验收备注" value={notes} onChange={e => setNotes(e.target.value)} placeholder="记录发现的问题、对应日期和后续动作" rows={3}/></label><button onClick={exportEvidence}>下载本次证据与备注</button></section>
      </>}
    </main><footer>仅本机 · 后端原始金额与结论 · 不补数据、不重算账本 · 独立代理联验不代表人类亲自点击</footer>
  </div>;
}
