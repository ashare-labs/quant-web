import { isRecord } from "../../shared/json";

export function InitialAccountNote() {
  return <p>新任务初始仅现金，无窗口前持仓或待收权益。预热数据不代表持仓；登记日在窗口起点之前的行动不产生本账户权益。</p>;
}

export function isInitialEntitlements(value: unknown): value is Record<string, unknown> & { id: "corporate_initial_entitlements" } {
  return isRecord(value) && value.id === "corporate_initial_entitlements" && value.scope !== "source_provenance_only";
}

const dateFields = ["record_date", "ex_date", "payment_date", "share_credit_date", "new_shares_tradable_date"] as const;
const eventShape = (value: unknown): value is Record<string, unknown> => isRecord(value) &&
  ["security", "entitlement_key", "record_date", "ex_date"].every(key => typeof value[key] === "string" && value[key] !== "") &&
  dateFields.every(key => value[key] == null || typeof value[key] === "string");

export function InitialEntitlements({ assumption }: { assumption: Record<string, unknown> }) {
  const rows = assumption.prior_record_events;
  const known = assumption.initial_account === "cash_only_no_positions_or_entitlements" &&
    Array.isArray(rows) && rows.every(eventShape);
  return <section className="qw-scope-note qw-initial-entitlements" aria-label="初始账户与登记日权益">
    <strong title="corporate_initial_entitlements">初始账户与登记日权益</strong>
    {known ? <>
      <InitialAccountNote />
      <p>公司行动来源日程仍完整保留，以下事件由后端按本次选择确认。</p>
      {rows.length ? <div className="qw-table-scroll"><table>
        <caption>后端确认的窗口前登记事件</caption>
        <thead><tr><th>证券</th><th>登记日</th><th>除权除息日</th><th>派息日</th><th>股份到账日</th><th>新增股份可交易日</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>
          <td title={String(row.entitlement_key)}>{String(row.security)}</td>
          {dateFields.map(field => <td key={field}>{typeof row[field] === "string" ? row[field] : "未提供"}</td>)}
        </tr>)}</tbody>
      </table></div> : <p>本次精确预检未列出窗口前登记事件，新账户规则仍适用；这不表示来源中没有公司行动。</p>}
    </> : <p role="alert">后端初始账户说明格式无法识别，请查看原始假设；未推定持仓或权益。</p>}
    <details><summary>查看后端原始账户假设与事件</summary><pre>{JSON.stringify(assumption, null, 2)}</pre></details>
  </section>;
}
