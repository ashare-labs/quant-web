import type { Result } from './api';
import { download } from './draft';
const num = (v: unknown) => Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const pct = (v: unknown) => (Number(v || 0) * 100).toFixed(3) + '%';
type Row = Record<string, unknown>;
export function PythonResults({ result }: { result: Result }) {
  const rows = (result.native.accounts || []) as Row[];
  const trades = (result.native.trades || []) as Row[];
  const orders = (result.native.orders || []) as Row[];
  const values = [Number(result.summary.initial_cash), ...rows.map(r => Number(r.total_value))];
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const points = values.map((v, i) => `${40 + i * 720 / Math.max(1, values.length - 1)},${190 - (v - low) * 140 / span}`).join(' ');
  return <section className="wb-result panel" aria-label="回测结果">
    <div className="wb-toolbar"><div><h2>回测结果 · {result.name}</h2><p>收益已计入当前模型的费用，以下是这次固定窗口的模拟结果。</p></div>
      <button onClick={() => download(result.name + '-result.json', JSON.stringify(result, null, 2), 'application/json')}>下载结果</button></div>
    <div className="wb-metrics">
      <div><small>区间收益</small><strong>{pct(result.summary.net_return)}</strong></div>
      <div><small>期末权益</small><strong>¥ {num(result.summary.final_equity)}</strong></div>
      <div><small>最大回撤（日末）</small><strong>{pct(result.summary.max_drawdown)}</strong></div>
      <div><small>成交 / 委托</small><strong>{num(result.summary.trade_count)} / {num(result.summary.order_count)}</strong></div>
    </div>
    <figure><figcaption>账户权益 · 每日收盘</figcaption><svg viewBox="0 0 800 230" role="img" aria-label="每日账户权益曲线">
      <title>账户权益从 {num(values[0])} 元至 {num(values.at(-1))} 元</title>
      <path d="M40 200 H770 M40 30 V200" fill="none" stroke="#c7d4df"/>
      <polyline points={points} fill="none" stroke="#167866" strokeWidth="3"/>
      <text x="40" y="222">初始资金</text><text x="650" y="222">{String(rows.at(-1)?.at || '').slice(0, 10)}</text>
      {values.map((v, i) => <circle key={i} cx={40 + i * 720 / Math.max(1, values.length - 1)} cy={190 - (v - low) * 140 / span} r="4" fill="#167866"><title>{i ? String(rows[i - 1]?.at) : '初始'} · ¥{num(v)}</title></circle>)}
    </svg></figure>
    <h3>成交明细</h3>{trades.length ? <div className="table-scroll"><table><thead><tr><th>时间</th><th>证券</th><th>方向</th><th>股数</th><th>价格</th><th>费用</th></tr></thead><tbody>
      {trades.map((r, i) => <tr key={i}><td>{String(r.at || r.datetime || '')}</td><td>{String(r.security || r.order_book_id || '')}</td><td>{String(r.side || '')}</td><td>{num(r.quantity || r.amount)}</td><td>{num(r.price)}</td><td>{num(Number(r.commission || 0) + Number(r.tax || 0))}</td></tr>)}
    </tbody></table></div> : <p>本次没有成交。请检查信号、委托日志、可用资金和 T+1 限制。</p>}
    <details><summary>查看委托状态与拒绝原因（{orders.length}）</summary><pre>{JSON.stringify(orders, null, 2)}</pre></details>
    <details><summary>策略日志与 record 指标（{result.logs.length}）</summary><pre>{JSON.stringify(result.logs, null, 2)}</pre></details>
    <details><summary>本次使用的数据和模型</summary><p>发布 R{String(result.release.release_id)}，{num(result.preparation.minute_rows)} 根分钟线。前收、状态和公司行动按冻结来源回放，不代表当时可获知的全部信息。</p><p>下一分钟开盘撮合，T+1，每分钟成交量上限 25%；手续费万三、最低 5 元、卖出税率千一。涨跌停采用日线前收的 5% / 10% 研究模型；分钟标签解释和公司行动覆盖仍有限制。</p><pre>{JSON.stringify(result.preparation, null, 2)}</pre></details>
  </section>;
}
