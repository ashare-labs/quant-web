import { useEffect, useState } from "react";
import { requestJson } from "../../shared/http";
import type { ProductConfig } from "../../shared/product-config";
import { inEnvironment } from "./api";

type MinuteRead = {
  source: string; binding: { release_id?: number; manifest_sha256?: string };
  rows: Record<string, unknown>[];
  report: { rows: number; limits?: string[]; release?: unknown };
};

export function ProductMinutes({ config, available }: { config: ProductConfig | null; available: boolean }) {
  const [security, setSecurity] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [source, setSource] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MinuteRead | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setResult(null); setError(""); }, [security, start, end, source, config?.configuration_id]);

  async function read() {
    if (!config || !available) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const value = await inEnvironment(config, () => requestJson<MinuteRead>(
        "/execution-api/product", "/minute/prices", {
          security: security.trim(), start: `${start}:00+08:00`, end: `${end}:00+08:00`, source,
        }, undefined, { timeoutMs: 120000 },
      ));
      if (!Array.isArray(value.rows) || !value.binding || !value.report) throw new Error("分钟读取结果格式无效。");
      setResult(value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "分钟读取失败。");
    } finally { setBusy(false); }
  }
  const columns = ["source", "source_label", "open", "high", "low", "close", "volume", "amount", "price_status"];
  return <section className="panel" aria-label="统一分钟行情">
    <h2>分钟行情</h2>
    <p>默认读取固定本地发布；HF 原始研究记录保留质量限制。北京时间，每次一只证券、最多 60 天。</p>
    <form onSubmit={event => { event.preventDefault(); void read(); }}>
      <fieldset disabled={!available || busy}>
        <label>证券代码<input aria-label="分钟证券代码" value={security} onChange={e => setSecurity(e.target.value)} placeholder="600000.XSHG" required /></label>
        <div className="product-dates">
          <label>开始标签<input aria-label="分钟开始标签" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} step="60" required /></label>
          <label>结束标签<input aria-label="分钟结束标签" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} step="60" required /></label>
        </div>
        <label>分钟来源<select aria-label="分钟来源" value={source} onChange={e => setSource(e.target.value)}>
          <option value="auto">当前发布的默认分钟</option><option value="neigezhu">HF 原始研究记录（含限制）</option><option value="free_stockdb">free-stockdb 已发布补缺</option><option value="sina">新浪已发布近期分钟</option><option value="tdx">TDX 已封存样本</option>
        </select></label>
        <button type="submit" disabled={!security.trim() || !start || !end || end < start}>读取分钟行情</button>
      </fieldset>
    </form>
    {busy && <p role="status">正在读取所选来源…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p role="status">本次读取 {result.rows.length} 条{result.binding.release_id ? ` · 本地发布 R${result.binding.release_id}` : ""}</p>
      {!result.rows.length && <p>所选来源在此窗口没有可查询记录，请查看覆盖和限制。</p>}
      {!!result.rows.length && <div className="table-scroll"><table>
        <caption>分钟明细 · 显示前 {Math.min(result.rows.length, 100)} 条</caption>
        <thead><tr>{["来源", "来源标签（含时区）", "开盘", "最高", "最低", "收盘", "成交量（股）", "成交额（元）", "价格状态"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.slice(0, 100).map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] == null ? "未提供" : String(row[column])}</td>)}</tr>)}</tbody>
      </table></div>}
      {result.report.limits?.map((value, index) => <p key={index}>{value}</p>)}
      <details><summary>固定版本、来源与覆盖回执</summary><pre>{JSON.stringify({ binding: result.binding, report: result.report }, null, 2)}</pre></details>
    </>}
  </section>;
}
