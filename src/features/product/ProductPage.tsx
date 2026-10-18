import { ProductPrices } from "./ProductPrices";
import { validSelection } from "./selection";
import { useProductSelection } from "./useProductSelection";
import "./product.css";

export function ProductPage() {
  const m = useProductSelection();
  const sources = [...new Set(m.selected.flatMap(s => s.sources.map(v => v.source)))].sort();
  return <main className="product-page">
    <header><div><h1>正式数据与回测</h1><p>从已配置主库选择股票和日期，读取真实行情，再发布到组合回测。</p></div><button onClick={m.refresh} disabled={!!m.busy}>重新读取环境</button></header>
    <section className="panel product-profile" aria-label="当前数据环境">
      <h2>当前环境：{m.config?.profile || "未连接"}</h2>
      {m.config && <p>{m.config.kind === "product" ? "正式产品" : m.config.kind ? `独立评测 / ${m.config.kind}` : "配置不可用"} · {m.config.configured ? "数据已配置" : "数据未配置"}</p>}
      {!m.online && <p role="alert">浏览器离线。恢复连接后重新读取配置和数据。</p>}
      {m.config && !m.available && m.online && <p role="alert">{m.config.error ? `${m.config.error.code} · ${m.config.error.message}` : "此环境不提供正式数据，请按部署清单启动 product 配置。不会替换为固定样本。"}</p>}
      {m.config?.configured && <p>主板 A 股日线；发布会核验 120 个交易日预热。证券和日期以主库实际覆盖为准。</p>}
      {m.config && <details><summary>配置身份、正式资产与来源限制</summary><p>配置身份：<code>{m.config.configuration_id || "未提供"}</code></p><pre>{JSON.stringify(m.config.assets, null, 2)}</pre>{m.config.limitations.map((v, i) => <p key={i}>{v}</p>)}</details>}
    </section>
    {m.error && <div className="error" role="alert"><strong>{m.error}</strong>{m.errorDetails != null && <pre>{JSON.stringify(m.errorDetails, null, 2)}</pre>}</div>}
    {m.busy && <p role="status" className="product-status">{m.busy}…</p>}
    <div className="product-workspace">
      <section className="panel" aria-label="证券目录">
        <h2>选择股票</h2>
        <form className="product-search" onSubmit={e => { e.preventDefault(); void m.search(); }}>
          <label>代码或名称<input aria-label="搜索正式证券" maxLength={100} value={m.query} onChange={e => m.setQuery(e.target.value)} placeholder="输入证券代码或名称" disabled={!m.available || !!m.busy}/></label>
          <button type="submit" disabled={!m.available || !!m.busy}>搜索</button>
        </form>
        {m.catalogue && <>
          <p>目录结果 {m.catalogue.total} 只{m.catalogue.query ? ` · 搜索“${m.catalogue.query}”` : ""}。可跨页多选。</p>
          {!m.catalogue.securities.length && <p className="empty">没有匹配证券。请调整搜索条件，不会自动改选样例。</p>}
          <div className="table-scroll"><table><thead><tr><th>选择 / 证券</th><th>现有日期</th><th>来源</th></tr></thead><tbody>
            {m.catalogue.securities.map(s => <tr key={s.security}>
              <td><label className="product-check"><input type="checkbox" aria-label={`选择 ${s.security}`} checked={m.selected.some(v => v.security === s.security)} disabled={!!m.busy} onChange={e => m.toggle(s, e.target.checked)}/><span>{s.security}<small>{s.name || "名称未提供"}</small></span></label></td>
              <td>{s.first_bar || "未提供"} 至 {s.last_bar || "未提供"}</td>
              <td>{s.sources.map(v => `${v.source} (${v.rows} 条)`).join("、") || "未提供"}</td>
            </tr>)}
          </tbody></table></div>
          <div className="toolbar"><button disabled={!!m.busy || m.catalogue.offset === 0} onClick={() => void m.search(Math.max(0, m.catalogue!.offset - m.catalogue!.limit), m.catalogue!.query)}>上一页</button>
            <span>第 {Math.floor(m.catalogue.offset / m.catalogue.limit) + 1} 页</span>
            <button disabled={!!m.busy || m.catalogue.offset + m.catalogue.limit >= m.catalogue.total} onClick={() => void m.search(m.catalogue!.offset + m.catalogue!.limit, m.catalogue!.query)}>下一页</button></div>
          <details><summary>目录来源回执</summary><pre>{JSON.stringify(m.catalogue.receipt, null, 2)}</pre></details>
        </>}
      </section>
      <section className="panel" aria-label="发布回测数据">
        <h2>数据窗口 · 已选 {m.selected.length} 只</h2>
        {m.draftWarning && <p role="alert" className="notice">{m.draftWarning}</p>}
        <ul className="product-selected">{m.selected.map(s => <li key={s.security}><span>{s.security} {s.name}</span><button aria-label={`移除 ${s.security}`} disabled={!!m.busy} onClick={() => m.toggle(s, false)}>移除</button></li>)}</ul>
        {!m.selected.length && <p>先从证券目录选择股票。</p>}
        <fieldset disabled={!m.available || !!m.busy}>
          <div className="product-dates"><label>开始日期<input type="date" aria-label="正式数据开始日期" value={m.start} onChange={e => m.setStart(e.target.value)}/></label><label>结束日期<input type="date" aria-label="正式数据结束日期" value={m.end} onChange={e => m.setEnd(e.target.value)}/></label></div>
          <label>行情来源<select aria-label="正式行情来源" value={m.source} onChange={e => m.setSource(e.target.value)}><option value="auto">自动按真实覆盖选择（以回执为准）</option>{sources.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <button className="wide" disabled={!validSelection(m.selection)} onClick={() => void m.loadPrices()}>读取真实行情</button>
        </fieldset>
        <div className="notice"><strong>价格诊断 · 非总收益</strong><p>现有主库不保证完整公司行动与历史状态。此模式使用真实未复权价格，忽略涨跌停和公司行动；不代表完整可交易回测。缺行情、预热或后继交易日时仍会拒绝。</p></div>
        <label className="product-check"><input type="checkbox" aria-label="确认价格诊断限制" checked={m.acknowledged} disabled={!m.available || !!m.busy} onChange={e => m.setAcknowledged(e.target.checked)}/><span>我确认使用价格诊断，接受不计公司行动与涨跌停的限制。</span></label>
        <button className="primary wide" disabled={!m.available || !!m.busy || !m.acknowledged || !m.prices || !!m.prices.gaps.length || !validSelection(m.selection)} onClick={() => void m.publish()}>发布并打开组合回测</button>
        <p className="muted">发布保存当前窗口、120 日预热、后继交易日和来源回执。随后替换此浏览器草稿的数据选择，保留策略代码；回测前还需检查并确认本次假设。</p>
      </section>
    </div>
    {m.prices && <ProductPrices prices={m.prices}/>}
    <section className="panel product-evaluation"><h2>独立固定评测</h2><p>固定证券和窗口用于复现评测。其范围与正式主库入口分别显示。</p><a href="#/tasks/daily">固定日频任务</a><a href="#/market">固定样本行情与覆盖</a></section>
  </main>;
}
