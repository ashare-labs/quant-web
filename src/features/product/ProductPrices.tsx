import type { Prices } from "./api";

export function ProductPrices({ prices }: { prices: Prices }) {
  const fields = ["security", "date", "source", "open", "high", "low", "close", "volume", "amount"];
  return <section className="panel" aria-label="正式行情读取结果">
    <h2>真实日线 · {prices.rows.length} 条</h2>
    <p>价格为未复权原价，成交量单位为股。日期、空值和来源按回执原样保留。</p>
    <details open={prices.gaps.length > 0}>
      <summary>数据缺口 · {prices.gaps.length} 项</summary>
      {prices.gaps.length ? <><p role="alert">此窗口存在数据缺口，暂不能发布。请调整证券、日期或来源。</p><pre>{JSON.stringify(prices.gaps, null, 2)}</pre></> : <p>本次行情读取未报告缺口；发布时仍会检查 120 日预热和后继交易日。</p>}
    </details>
    <div className="table-scroll"><table>
      <caption>行情明细{prices.rows.length > 100 ? ` · 显示前 100 条，共 ${prices.rows.length} 条` : ""}</caption>
      <thead><tr>{["证券", "日期", "来源", "开盘", "最高", "最低", "收盘", "成交量（股）", "成交额"].map(v => <th key={v}>{v}</th>)}</tr></thead>
      <tbody>{prices.rows.slice(0, 100).map((row, i) => <tr key={i}>{fields.map(f => <td key={f}>{row[f] == null ? "未提供" : String(row[f])}</td>)}</tr>)}</tbody>
    </table></div>
    <details><summary>逐证券覆盖</summary><pre>{JSON.stringify(prices.coverage, null, 2)}</pre></details>
    <details><summary>正式数据来源与读取回执</summary><pre>{JSON.stringify(prices.receipt, null, 2)}</pre></details>
    {prices.limitations?.map((v, i) => <p key={i}>{v}</p>)}
  </section>;
}
