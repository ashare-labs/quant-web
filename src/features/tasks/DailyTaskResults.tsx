import type { Task } from './api';
import { TaskTable as Table } from './TaskTable';

type Result = Task<'JobResult'>;
function Raw({ title, value }: { title: string; value: unknown }) {
  return <details><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

export function DailySummary({ result: r }: { result: Result }) {
  return <section aria-label="日频结果汇总"><p>后端提交订单 {r.summary.committed_order_count} 笔，成交 {r.summary.committed_fill_count} 笔。{r.summary.committed_fill_count === 0 && '无成交也可正常完成；请核对逐日信号、未下单原因与原生拒单。'}</p>
    <div className="task-metrics"><div><span>净变化 · 后端原值</span><strong>{r.summary.net_change}</strong></div><div><span>累计费用 · CNY</span><strong>{r.summary.fee_total}</strong></div><div><span>佣金 / 税 · CNY</span><strong>{r.summary.commission_total} / {r.summary.tax_total}</strong></div><div><span>最终持仓 · 股</span><strong>{r.summary.final_quantity}</strong></div></div>
    <p>结果范围：{r.scope.grade}；PIT={String(r.historical_pit_verified)}，paper={String(r.paper_admitted)}，通用执行许可={String(r.general_execution_permission)}。</p>
  </section>;
}

export function DailyDiagnostics({ result: r }: { result: Result }) {
  const rejections = r.days.flatMap(d => d.native_rejections.map(n => [d.trading_date, n.observed_at, `${n.event} / ${n.phase}`, `${n.generation} / ${n.cursor} / ${n.native_observation_index}`, n.order_id, n.reason]));
  return <section aria-label="日频执行诊断"><h3>逐日未下单原因与原生说明</h3><p>无成交不能单独说明执行结果；无订单的原生拒绝仍单列保留。以下原因、状态和数量均来自后端。</p>
    <Table name="逐日执行诊断" headers={['交易日', '信号 / 原因', '后端未下单原因', '原生说明']} rows={r.days.map(d => [d.trading_date, `${d.signal.action} / ${d.signal.reason}`, d.no_order_reason, d.native_reason])} empty="结果没有逐日诊断记录。"/>
    {r.days.flatMap(d => d.native_rejections.map((n, i) => <p className="task-notice task-native-rejection" key={`${d.trading_date}-${i}`}><strong>{d.trading_date} · 原生拒单原文</strong><br/>{n.reason}</p>))}
    <Table name="原生拒单" headers={['交易日', '原生时间', '事件 / 阶段', '代次 / 游标 / 观察索引', '订单 ID', '原生理由']} rows={rejections} empty="后端本次没有原生拒单记录；不能仅凭无成交推断发生拒单。"/>
  </section>;
}

export function DailyDecisions({ result: r }: { result: Result }) {
  return <><h3>逐日信号与执行</h3><Table name="逐日信号" headers={['交易日 / 前一开市日', '决策时间', '动作 / 信号原因', '目标股数 / 规则索引', 'AD08 前收', '执行价 / 读取状态', '当日 / 累计费用']} rows={r.days.map(d => [
    `${d.trading_date} / ${d.previous_open}`, d.decision_at, `${d.signal.action} / ${d.signal.reason}`,
    `${d.signal.target_shares ?? '未提供'} / ${d.signal.rule_index ?? '未提供'}`, d.ad08.previous_close,
    `${d.execution_close ?? '未提供'} / ${d.execution_price_read_status}`, `${d.day_fee} / ${d.cumulative_fee}`,
  ])} empty="结果没有逐日信号记录。"/><DailyDiagnostics result={r}/></>;
}

export function DailyOrders({ result: r }: { result: Result }) {
  return <><h3>原生订单</h3><p>数量与状态保留后端原值；部分成交的剩余股数不作为成交补齐。</p><Table name="日频订单" headers={['交易日', '订单 ID', '证券 / 方向', '请求 / 已成交 / 剩余 · 股', '状态', '理由', '关联成交 ID']} rows={r.days.flatMap(d => d.orders.map(o => [
    d.trading_date, o.order_id, `${o.security} / ${o.side}`, `${o.requested_quantity} / ${o.filled_quantity} / ${o.remaining_quantity}`, o.status, o.reason, o.trade_ids.join('、') || '未提供',
  ]))} empty="后端本次没有订单记录。未生成订单的拒绝请见执行诊断。"/></>;
}

export function DailyEvidence({ result: r }: { result: Result }) {
  return <><h3>AD08、缓存与历史价格读取</h3><p>实际历史调用 {r.summary.actual_history_call_count} 次；原生缓存消费 {r.summary.native_cache_consumption_count} 次；估值 bar 查询已观察={String(r.valuation_bar_query_observed)}。模型时钟和历史完整性核验不授予新的价格读取权限。</p>
    <Table name="历史价格读取" headers={['交易日', '操作', '观测索引', '核验性质', '授权新读取']} rows={r.engine_price_reads.map(e => [e.trading_date, e.operation, e.native_observation_index, e.verification, String(e.authorizes_new_read)])} empty="后端没有历史价格读取记录。"/>
    <Raw title="逐日 AD08 实际调用与授权" value={r.days.map(d => ({ date: d.trading_date, ad08: d.ad08 }))}/><Raw title="保留的全部历史价格读取" value={r.engine_price_reads}/><Raw title="恢复与发布证据" value={r.recovery}/><Raw title="结果证据引用" value={r.evidence}/><Raw title="执行身份" value={r.execution_identity}/><Raw title="数据身份与未知质量" value={r.data_identity}/><Raw title="本次条件假设" value={r.assumptions}/><Raw title="最终原生账户" value={r.account}/>
  </>;
}
