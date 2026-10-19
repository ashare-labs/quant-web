import type { AccountView } from './api';

const money = (value: string) => Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export function AccountDetails({ view }: { view: AccountView }) {
  return <>
    <section aria-label="结算概览" className="account-metrics">
      <div><span>结算日</span><strong>{view.last_day}</strong></div>
      <div><span>现金</span><strong title={view.account.total_cash}>{money(view.account.total_cash)}</strong></div>
      <div><span>净资产 NAV</span><strong title={view.account.nav}>{money(view.account.nav)}</strong></div>
      <div><span>费用</span><strong>{money(view.fees)}</strong></div>
      <div><span>委托 / 成交</span><strong>{view.orders.length} / {view.trades.length}</strong></div>
    </section>
    <section><h2>收盘持仓</h2><table><thead><tr><th>证券</th><th>持仓</th><th>当日可卖</th><th>收盘价</th><th>市值</th></tr></thead>
      <tbody>{Object.entries(view.account.positions).map(([security, p]) => <tr key={security}><td>{security}</td><td>{p.quantity}</td><td>{p.sellable}</td><td>{p.price}</td><td>{money(p.market_value)}</td></tr>)}</tbody></table></section>
    <section><h2>模拟成交</h2><table><thead><tr><th>成交号</th><th>证券</th><th>方向</th><th>数量</th><th>价格</th><th>费用</th></tr></thead>
      <tbody>{view.trades.map(t => <tr key={t.id}><td>{t.id}</td><td>{t.security}</td><td>{t.side === 'BUY' ? '买入' : '卖出'}</td><td>{t.quantity}</td><td>{t.price}</td><td title={t.cost}>{money(t.cost)}</td></tr>)}</tbody></table></section>
    <section><h2>委托记录</h2><table><thead><tr><th>委托号</th><th>证券</th><th>数量</th><th>已成交</th><th>未成交</th><th>状态</th></tr></thead>
      <tbody>{view.orders.map(o => <tr key={o.id}><td>{o.id}</td><td>{o.security}</td><td>{o.quantity}</td><td>{o.filled}</td><td>{o.remaining}</td><td>{o.status === 'FILLED' ? '全部成交' : o.status}</td></tr>)}</tbody></table></section>
    <section><h2>账户核验</h2><p>运行时已核验 · 原生游标 {view.cursor} · 结算 {view.settlement_count} 次</p>
      <details><summary>身份与检查点</summary><dl><dt>账户身份</dt><dd>{view.identity}</dd><dt>最终检查点</dt><dd>{view.head}</dd><dt>迁移复核摘要</dt><dd>{view.review_sha256}</dd></dl></details>
      <ul>{view.limitations.map(text => <li key={text}>{text}</li>)}</ul></section>
  </>;
}
