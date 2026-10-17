import { useEffect, useRef, useState } from 'react';
import { api, bootstrap, verify, pin, PaperError, type Action, type Failure, type Session, type View, type Report } from './api';
import './paper.css';

const names: Record<string, string> = { 'equal-weight': '等权再平衡', momentum: '动量轮换', trend: '趋势过滤', committed: '已提交 / 对账通过', prepared: '等待当日数据', ready: '待执行', running: '执行中', recovery_required: '需恢复', evidence_conflict: '证据冲突' };
const short = (value: string | null | undefined) => value ? value.slice(0, 12) : '—';
const failure = (e: unknown): Failure => e instanceof PaperError ? e.failure : { code: 'PAPER_UI_ERROR', message: String(e) };

export function PaperPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sid, setSid] = useState('');
  const [day, setDay] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [operationError, setOperationError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('本地人工模拟验收');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [tick, setTick] = useState(0);
  const [at, setAt] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [policy, setPolicy] = useState('target_then_native_cash_v1');
  const [profiles, setProfiles] = useState<Record<string, Record<string, unknown>>>({});
  const requestRef = useRef<{ sid: string; path: string; body: Action } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const changed = () => { setOnline(navigator.onLine); setView(null); setTick(t => t + 1); };
    addEventListener('online', changed); addEventListener('offline', changed);
    return () => { removeEventListener('online', changed); removeEventListener('offline', changed); };
  }, []);

  useEffect(() => {
    if (!online || busy) { setLoading(false); return; }
    const controller = new AbortController();
    const version = ++seq.current;
    setLoading(true); setView(null);
    (async () => {
      try {
        const list = await bootstrap(controller.signal);
        const policies = await api<Record<string, Record<string, unknown>>>('/risk-profiles', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setSessions(list);
        setProfiles(policies);
        if (!sid && list[0]) { setSid(list[0].id); return; }
        if (sid) {
          const result = await api<View>(`/sessions/${encodeURIComponent(sid)}/view${day ? `?day=${encodeURIComponent(day)}` : ''}`, undefined, controller.signal);
          verify(result, sid);
          if (controller.signal.aborted || version !== seq.current) return;
          setView(result);
        }
        setError(null); setAt(new Date().toLocaleTimeString());
      } catch (e) {
        if (!controller.signal.aborted && version === seq.current) { setError(failure(e)); setView(null); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [sid, day, tick, online, busy]);

  async function send(path: string, body: Action, retry = false) {
    if (!view || busy || !online || !reason.trim()) return;
    const saved = retry ? requestRef.current : { sid, path, body };
    if (!saved || saved.sid !== sid) return;
    requestRef.current = saved;
    setBusy(true); setView(null); setNotice(''); setError(null); setOperationError(null);
    try {
      const result = await api<Report | Record<string, unknown>>(saved.path, saved.body);
      setNotice('checkpoint_sha256' in result
        ? `请求已确认：${saved.body.day || day} · 检查点 ${short(String(result.checkpoint_sha256))}。同日重复请求复用该结果。`
        : 'packet_sha256' in result ? `AD 单日收据已确认：${saved.body.day} · ${short(String(result.packet_sha256))}。账户尚须单独推进。`
        : '控制请求已确认。请以重新读取的状态为准。');
      if (saved.body.day) setDay(saved.path.endsWith('/ingest') ? '' : saved.body.day);
    } catch (e) { setOperationError(failure(e)); }
    finally { setBusy(false); setTick(t => t + 1); }
  }

  async function createSimulation() {
    if (!view || !newAccount.trim() || !profiles[policy] || busy) return;
    setBusy(true); setView(null); setError(null); setOperationError(null); setNotice('');
    try {
      const result = await api<{ session_id: string }>(`/sessions/${sid}/fork`, {
        account_id: newAccount.trim(), risk: profiles[policy],
      });
      setSid(result.session_id); setDay(''); setNewAccount(''); requestRef.current = null;
      setNotice('独立模拟账户已创建，使用同一固定策略与数据，从窗口首日开始。');
    } catch (e) { setOperationError(failure(e)); }
    finally { setBusy(false); setTick(t => t + 1); }
  }

  const account = view?.report?.native.account || view?.latest_account;
  const accountDay = view?.report?.day || view?.account_as_of;
  const selected = view?.days.find(d => d.day === view.selected_day);
  const pending = view?.days.find(d => d.status !== 'committed');
  const receipt = view?.decision?.strategy_receipt;
  const actionable = !!view && online && !loading && !busy && !!reason.trim();
  const delivery = view?.replay?.delivery;
  const observationReady = delivery?.observation_admission?.ready ?? delivery?.ad_admission.ready;
  const reviewedContract = delivery?.consumer_contract;
  const impact = reviewedContract?.references.order_impact_summary.strategies.find(x => x.strategy === view?.config.strategy_id);
  const nextReceived = !delivery || delivery.received.some(d => d.day === view?.replay?.next_day);
  const canAdvance = actionable && !!view.replay?.next_day && nextReceived && !view.paused && !pending?.recovery_required && pending?.status !== 'running';
  const report = view?.report;
  const visibleError = error || operationError;

  return <div className="paper-page">
    <div className="paper-boundary"><strong>本地模拟验收 · 真实持续模拟未通过</strong><span>明确历史来源逐日接收 / 研究模型。历史送达与实际分红到账时刻仍未知；独立人类验收待完成。</span></div>
    <header><div><h1>连续模拟</h1><p>策略 → 冻结收据 → 单日原生执行 → 同一账户续接</p></div><a href="#/tasks">任务与结果</a><a href="#/portfolio">组合回测</a></header>
    <main>
      <section className="paper-toolbar">
        <label>本机会话<select aria-label="本机会话" value={sid} disabled={busy || loading} onChange={e => { setView(null); setSid(e.target.value); setDay(''); setNotice(''); setOperationError(null); requestRef.current = null; }}><option value="">选择会话</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.config.account_id} · {names[s.config.strategy_id || ''] || '外部冻结目标'}</option>)}</select></label>
        <label>模拟日<select aria-label="模拟日" value={day} disabled={busy || loading || !view} onChange={e => { setView(null); setDay(e.target.value); }}><option value="">最近一日</option>{view?.days.map(d => <option key={d.day} value={d.day}>{d.day} · {names[d.status] || d.status}</option>)}</select></label>
        <button onClick={() => setTick(t => t + 1)} disabled={busy || !online}>重新读取</button>
        <span role="status">{!online ? '浏览器离线' : busy ? '本地执行中…' : loading ? '核验服务和证据…' : view ? `已核验 · ${at}` : '等待会话'}<small>源码 {short(pin.source_sha256)} · {pin.contract_version}</small></span>
      </section>
      {!online && <div className="paper-error" role="alert">浏览器离线。账户和报告已隐藏，所有提交已禁用。重新连接后核验同一会话。</div>}
      {visibleError && <div className="paper-error" role="alert"><strong>{visibleError.code} · {visibleError.message}</strong><p>{visibleError.detail}</p><p>{visibleError.next_action}</p></div>}
      {notice && <div className="paper-notice" role="status">{notice}</div>}
      {!sid && !loading && <section><h2>暂无本机会话</h2><p>先使用 AQ 本地入口导入固定题面与来源包，或创建合成会话。此页面读取已注册数据，不连接行情账户。</p></section>}
      {view && <>
        <section>
          <h2>版本、模式与数据范围</h2>
          <div className="paper-facts">
            <div><span>模式</span><strong>{view.config.data_mode === 'historical_research' ? '历史研究重放 · 条件模型' : '合成演练'}</strong><small>{view.replay?.clock_basis || 'synthetic_clock'} · 非在线新鲜度证明</small></div>
            <div><span>策略</span><strong>{names[view.config.strategy_id || ''] || '外部冻结目标'}</strong><code title={view.config.strategy_version}>{short(view.config.strategy_version)}</code></div>
            <div><span>数据版本</span><strong>{view.replay?.producer.name || 'synthetic'} {view.replay?.producer.version || ''}</strong><code title={view.replay?.binding.input_sha256}>{short(view.replay?.binding.input_sha256 || view.decision?.data_manifest_sha256)}</code></div>
            <div><span>任务状态</span><strong>{view.paused ? '已暂停' : selected ? names[selected.status] || selected.status : '等待首次推进'}</strong><small>已提交至 {view.last_day || '尚无'} · 下日 {view.replay?.next_day || '—'}</small></div>
          </div>
          <p>账户 <code>{view.config.account_id}</code> · 会话 <code>{view.session_id}</code><br/>检查点 <code>{view.head || '尚无已提交检查点'}</code></p>
          {delivery && <div><p><strong>AD 整窗准入：{delivery.ad_admission.ready ? '通过 · 已显式接受研究模型' : '未通过 · 未知状态保留'}</strong><br/>已接收 {delivery.received.length} 日；下一数据日 {delivery.next_input_day || '窗口已接收完'}；来源版本 <code>{short(delivery.source_sha256)}</code>。从封存历史来源逐日交付，未接入在线行情。</p>{reviewedContract && <p>消费 API {reviewedContract.contract.api_version}；数据生产版本 {reviewedContract.contract.immutable_data_producer_version}，原行情 binding 未变。<br/>本日观察输入：{observationReady ? '可接收；无订单观察仅告警' : '拒绝；全局模型或覆盖不满足'}。每个新目标订单须取得本日、该证券和方向的单笔许可；观察通过不授予订单或整窗许可。<br/>当前冻结订单许可 {view.decision?.order_admissions?.length ?? 0} 项。{impact && view.replay?.binding.window.id === 'w2024' && <>固定历史订单影响分析：本策略涉及 {impact.unresolved_status_orders} 笔未知状态订单；该统计不是当前账户未来订单许可，5%/10%敏感性一致也不补齐未知字段。</>}</p>}<details><summary>查看逐日数据收据与实际接收时间</summary><pre>{JSON.stringify(delivery.received, null, 2)}</pre></details></div>}
          {view.replay && <details><summary>查看来源、假设、冻结风险与版本</summary><p>范围：{view.replay.binding.window.id} · {view.replay.binding.window.start}～{view.replay.binding.window.end}；状态：{view.replay.state_mode}</p><p>AD binding：<code>{view.replay.owner_binding_sha256 || '合成输入'}</code></p><ul>{view.replay.limitations.map(x => <li key={x}>{x}</li>)}</ul><ul>{view.replay.assumptions.map(x => <li key={x.id}>{x.id}：{x.text}</li>)}</ul><pre>{JSON.stringify({ risk: view.config.risk, strategy_version: view.config.strategy_version, manifest: view.config.scenario_manifest_sha256, identity: view.identity }, null, 2)}</pre></details>}
        </section>
        <section>
          <h2>单日操作与恢复</h2><p>只推进固定下一日；已提交日重复返回原结果。修改数据、策略或风控需新建会话。</p>
          <p><strong>风险模式：{view.config.risk.profile === 'target_then_native_cash_v1' ? '日频模拟 v1 · 前收目标约束 + 原生逐单现金' : '保守测试 · 涨停价预算'}</strong><br/>目标总仓位 {view.config.risk.max_gross} · 目标单股 {view.config.risk.max_single} · 双边换手 {view.config.risk.max_turnover} · 现金底线 {view.config.risk.cash_buffer}。卖出仅在真实成交后释放现金，买入费用一并验资。</p>
          <label>操作原因<input aria-label="操作原因" value={reason} maxLength={1024} onChange={e => setReason(e.target.value)} disabled={busy}/></label>
          <div className="paper-actions">
            {delivery && <button disabled={!actionable || !delivery.next_input_day || !observationReady || delivery.next_input_day !== view.replay?.next_day || view.paused} onClick={() => send(`/sessions/${sid}/ingest`, { reason, day: delivery.next_input_day!, expected_parent: view.head })}>接收 {delivery.next_input_day || '下一日'} 数据</button>}
            <button disabled={!canAdvance} onClick={() => send(`/sessions/${sid}/advance`, { reason, day: view.replay!.next_day!, expected_parent: view.head })}>推进 {view.replay?.next_day || '下一日'}</button>
            <button disabled={!actionable || view.paused} onClick={() => send(`/sessions/${sid}/pause`, { reason, expected_parent: view.head })}>暂停</button>
            <button disabled={!actionable || (!view.paused && !pending?.recovery_required)} onClick={() => send(`/sessions/${sid}/resume`, { reason, expected_parent: view.head })}>恢复冻结日</button>
            <button disabled={!actionable || !view.decision || !selected || !view.replay} onClick={() => send(`/sessions/${sid}/advance`, { reason, day: selected!.day, expected_parent: view.decision!.expected_parent })}>重复提交选定日</button>
            <button disabled={!actionable || requestRef.current?.sid !== sid} onClick={() => send('', { reason, expected_parent: null }, true)}>重试上次原请求</button>
          </div>
          {selected && <p>选定日 {selected.day} · 原生尝试 {selected.attempts} 次 · {selected.recovery_required ? '需要显式恢复' : '无需恢复'} · 意图 <code>{short(selected.intent_id)}</code></p>}
          {selected?.error && <div className="paper-error" role="alert"><strong>{selected.error.code} · {selected.error.message}</strong><p>{selected.error.detail}</p><p>{selected.error.next_action}</p></div>}
          {view.replay && view.replay.preflight.gaps.length > 0 && <div className={view.replay.preflight.ready ? "paper-notice" : "paper-error"}>{view.replay.preflight.ready ? "观察告警" : "来源数据缺口"}：{view.replay.preflight.gaps.length} 项。未知字段不能默认值补齐；实际订单需要的字段仍严格核验。<pre>{JSON.stringify(view.replay.preflight.gaps.slice(0, 3), null, 2)}</pre><details><summary>完整缺口清单</summary><pre>{JSON.stringify(view.replay.preflight.gaps, null, 2)}</pre></details></div>}
        </section>
        {view.replay && <section><h2>新建独立模拟账户</h2><p>复用当前固定策略和数据，从窗口首日开始；已有账户不修改。</p><div className="paper-toolbar"><label>新账户名称<input aria-label="新账户名称" value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="例如 review-trend-2024" maxLength={96}/></label><label>模拟风险配置<select aria-label="模拟风险配置" value={policy} onChange={e => setPolicy(e.target.value)}><option value="target_then_native_cash_v1">日频模拟 v1 · 98%目标、逐单验资</option><option value="conservative_v1">保守测试 · 单笔5万元</option></select></label><button disabled={!actionable || !newAccount.trim()} onClick={createSimulation}>创建模拟账户</button></div></section>}
        <section>
          <h2>原生账户 <small>{accountDay ? `截至 ${accountDay}` : '尚未提交'}</small></h2>
          {account ? <div className="paper-facts" data-testid="paper-account"><div><span>权益 CNY</span><strong>{account.nav}</strong></div><div><span>现金 CNY</span><strong>{account.total_cash}</strong></div><div><span>可用 / 冻结现金</span><strong>{account.available_cash} / {account.frozen_cash}</strong></div><div><span>日结 / 事件游标</span><strong>{report ? `${report.native.settlement_count} / ${report.native.cursor}` : '查看最近已提交日'}</strong></div></div> : <p>没有已提交账本。初始资金 {view.config.initial_cash} CNY 是冻结配置。</p>}
          {receipt && <p>信号截止 {receipt.information_cutoff} · 前日权益 {receipt.previous_equity} · {receipt.scheduled ? '当日计划调仓' : '非调仓日，沿用实际持仓'}<br/>历史摘要 <code>{receipt.history_sha256}</code></p>}
          <div className="paper-scroll"><table><thead><tr><th>证券</th><th>信号目标股数</th><th>实际股数</th><th>可卖</th><th>估值价格</th><th>原生成本</th><th>市值</th><th>原生应收</th><th>未完成目标</th></tr></thead><tbody>{view.config.universe.map(s => <tr key={s}><td>{s}</td><td>{view.decision?.targets[s] ?? '—'}</td><td>{account?.positions[s]?.quantity ?? '—'}</td><td>{account?.positions[s]?.sellable ?? '—'}</td><td>{account?.positions[s]?.price ?? '—'}</td><td>{account?.positions[s]?.average_cost ?? '—'}</td><td>{account?.positions[s]?.market_value ?? '—'}</td><td>{account?.positions[s]?.dividend_receivable ?? '—'}</td><td>{report?.native.target_gaps[s] ?? (report ? 0 : '—')}</td></tr>)}</tbody></table></div>
          {!report && <p>选定日尚无已核验日报；如有账户数值，仅来自上方标明日期的已提交账户。</p>}
        </section>
        <section><h2>公司行动与研究假设</h2><p>会话政策：{view.config.cash_dividend_policy === 'gross_zero_withholding_0900' ? '毛权益、零扣税、支付日09:00原生入账研究模型；实际到账时刻与投资者税率未独立确认。' : '有权益公司行动尚未准入该会话。'}</p>{report?.native.opening_reconciliation?.actions.map((a, i) => <div key={i}><p><strong>{a.security} · 登记持仓 {a.record_quantity} 股 · 毛权益 {a.gross_entitlement} 元</strong><br/>每股毛权益 {a.cash_per_share}；除息参考扣减 {a.source_event.ex_price_cash_deduction ?? '未提供'}（不同字段）。<br/>登记日 {a.record_date}；除息日 {a.ex_date}；支付日 {a.pay_date}。来源实际到账时刻 {a.source_event.payment_time || a.source_event.cash_available_at || '未知'}；模型到账 {a.model_cash_available_at}。<br/>本日原生入账对账 {a.cash_paid}；研究扣税 {a.withholding}。无新增股份，应收与可用现金分别显示。</p></div>)}{view.config.strategy_id === 'equal-weight' && view.replay?.binding.window.id === 'w2022' && <p>固定独立参考仍有经济差：AQ 毛权益 3500 元；JQ 原生日志净额 2621.08 元，相差878.92元＝毛额差223.65＋从JQ毛净额推得的扣减655.27。该扣减没有独立税款流水证据；它不覆盖或调整当前原生账本。</p>}</section>
        <section><h2>订单与成交</h2>{report ? <>
          {!!report.native.refusals?.length && <div className="paper-error"><strong>本日拒绝 {report.native.refusals.length} 笔；已成交结果和拒绝分别核验</strong>{report.native.refusals.map((r, i) => <p key={i}>{r.code} · {r.message}{r.measured && `；检查值 ${r.measured} / 上限 ${r.cap}`}</p>)}</div>}
          <p>{report.summary}</p><div className="paper-scroll"><table><thead><tr><th>订单 ID</th><th>证券</th><th>方向</th><th>委托 / 已成</th><th>状态 / 拒绝</th></tr></thead><tbody>{Object.entries(report.native.orders).map(([id, o]) => <tr key={id}><td>{id}</td><td>{o.security}</td><td>{o.side}</td><td>{o.quantity} / {o.filled}</td><td>{o.status} {o.message}</td></tr>)}</tbody></table></div>
          <div className="paper-scroll"><table><thead><tr><th>成交 / 订单 ID</th><th>时间</th><th>证券 / 方向</th><th>股数 × 价格</th><th>佣金 / 税 / 总费用</th></tr></thead><tbody>{report.native.trades.map(t => <tr key={t.id}><td>{t.id} / {t.order_id}</td><td>{t.at}</td><td>{t.security} {t.side}</td><td>{t.quantity} × {t.price}</td><td>{t.commission} / {t.tax} / {t.cost}</td></tr>)}</tbody></table></div>
          {!report.native.trades.length && <p>本日无成交。</p>}
        </> : <p>无已提交执行结果，不能推断订单或成交为零。</p>}</section>
        <section><h2>风险、数据与恢复记录</h2><div className="paper-scroll"><table><thead><tr><th>序号 / 日期</th><th>事件</th><th>说明与后续动作</th></tr></thead><tbody>{[...view.events].reverse().map(e => <tr key={e.sequence}><td>{e.sequence} · {e.day || '会话'}</td><td>{e.kind}<br/>{e.details.code}</td><td>{e.details.message || String(e.details.reason || '')}<br/>{e.details.detail && String(e.details.detail)}<br/>{e.details.next_action}<details><summary>完整收据</summary><pre>{JSON.stringify(e.details, null, 2)}</pre></details></td></tr>)}</tbody></table></div></section>
      </>}
    </main><footer>仅本机模拟 · 金额保留原始精度 · AQ 唯一原生账本 · 风控和到账假设按会话冻结</footer>
  </div>;
}
