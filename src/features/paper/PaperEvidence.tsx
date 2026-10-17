import type { PaperController } from "./usePaperController";
type Props = Pick<
  PaperController,
  | "day"
  | "view"
  | "reason"
  | "at"
  | "account"
  | "accountDay"
  | "receipt"
  | "report"
>;
export function PaperEvidence({
  day,
  view,
  reason,
  at,
  account,
  accountDay,
  receipt,
  report,
}: Props) {
  if (!view) return null;
  return (
    <>
      <section>
        <h2>
          原生账户{" "}
          <small>{accountDay ? `截至 ${accountDay}` : "尚未提交"}</small>
        </h2>
        {account ? (
          <div className="paper-facts" data-testid="paper-account">
            <div>
              <span>权益 CNY</span>
              <strong>{account.nav}</strong>
            </div>
            <div>
              <span>现金 CNY</span>
              <strong>{account.total_cash}</strong>
            </div>
            <div>
              <span>可用 / 冻结现金</span>
              <strong>
                {account.available_cash} / {account.frozen_cash}
              </strong>
            </div>
            <div>
              <span>日结 / 事件游标</span>
              <strong>
                {report
                  ? `${report.native.settlement_count} / ${report.native.cursor}`
                  : "查看最近已提交日"}
              </strong>
            </div>
          </div>
        ) : (
          <p>
            没有已提交账本。初始资金 {view.config.initial_cash} CNY 是冻结配置。
          </p>
        )}
        {receipt && (
          <p>
            信号截止 {receipt.information_cutoff} · 前日权益{" "}
            {receipt.previous_equity} ·{" "}
            {receipt.scheduled ? "当日计划调仓" : "非调仓日，沿用实际持仓"}
            <br />
            历史摘要 <code>{receipt.history_sha256}</code>
          </p>
        )}
        <div className="paper-scroll">
          <table>
            <thead>
              <tr>
                <th>证券</th>
                <th>信号目标股数</th>
                <th>实际股数</th>
                <th>可卖</th>
                <th>估值价格</th>
                <th>原生成本</th>
                <th>市值</th>
                <th>原生应收</th>
                <th>未完成目标</th>
              </tr>
            </thead>
            <tbody>
              {view.config.universe.map((s) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td>{view.decision?.targets[s] ?? "—"}</td>
                  <td>{account?.positions[s]?.quantity ?? "—"}</td>
                  <td>{account?.positions[s]?.sellable ?? "—"}</td>
                  <td>{account?.positions[s]?.price ?? "—"}</td>
                  <td>{account?.positions[s]?.average_cost ?? "—"}</td>
                  <td>{account?.positions[s]?.market_value ?? "—"}</td>
                  <td>{account?.positions[s]?.dividend_receivable ?? "—"}</td>
                  <td>{report?.native.target_gaps[s] ?? (report ? 0 : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!report && (
          <p>
            选定日尚无已核验日报；如有账户数值，仅来自上方标明日期的已提交账户。
          </p>
        )}
      </section>
      <section>
        <h2>公司行动与研究假设</h2>
        <p>
          会话政策：
          {view.config.cash_dividend_policy === "gross_zero_withholding_0900"
            ? "毛权益、零扣税、支付日09:00原生入账研究模型；实际到账时刻与投资者税率未独立确认。"
            : "有权益公司行动尚未准入该会话。"}
        </p>
        {report?.native.opening_reconciliation?.actions.map((a, i) => (
          <div key={i}>
            <p>
              <strong>
                {a.security} · 登记持仓 {a.record_quantity} 股 · 毛权益{" "}
                {a.gross_entitlement} 元
              </strong>
              <br />
              每股毛权益 {a.cash_per_share}；除息参考扣减{" "}
              {a.source_event.ex_price_cash_deduction ?? "未提供"}
              （不同字段）。
              <br />
              登记日 {a.record_date}；除息日 {a.ex_date}；支付日 {a.pay_date}
              。来源实际到账时刻{" "}
              {a.source_event.payment_time ||
                a.source_event.cash_available_at ||
                "未知"}
              ；模型到账 {a.model_cash_available_at}。<br />
              本日原生入账对账 {a.cash_paid}；研究扣税 {a.withholding}
              。无新增股份，应收与可用现金分别显示。
            </p>
          </div>
        ))}
        {view.config.strategy_id === "equal-weight" &&
          view.replay?.binding.window.id === "w2022" && (
            <p>
              固定独立参考仍有经济差：AQ 毛权益 3500 元；JQ 原生日志净额 2621.08
              元，相差878.92元＝毛额差223.65＋从JQ毛净额推得的扣减655.27。该扣减没有独立税款流水证据；它不覆盖或调整当前原生账本。
            </p>
          )}
      </section>
      <section>
        <h2>订单与成交</h2>
        {report ? (
          <>
            {!!report.native.refusals?.length && (
              <div className="paper-error">
                <strong>
                  本日拒绝 {report.native.refusals.length}{" "}
                  笔；已成交结果和拒绝分别核验
                </strong>
                {report.native.refusals.map((r, i) => (
                  <p key={i}>
                    {r.code} · {r.message}
                    {r.measured && `；检查值 ${r.measured} / 上限 ${r.cap}`}
                  </p>
                ))}
              </div>
            )}
            <p>{report.summary}</p>
            <div className="paper-scroll">
              <table>
                <thead>
                  <tr>
                    <th>订单 ID</th>
                    <th>证券</th>
                    <th>方向</th>
                    <th>委托 / 已成</th>
                    <th>状态 / 拒绝</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.native.orders).map(([id, o]) => (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{o.security}</td>
                      <td>{o.side}</td>
                      <td>
                        {o.quantity} / {o.filled}
                      </td>
                      <td>
                        {o.status} {o.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paper-scroll">
              <table>
                <thead>
                  <tr>
                    <th>成交 / 订单 ID</th>
                    <th>时间</th>
                    <th>证券 / 方向</th>
                    <th>股数 × 价格</th>
                    <th>佣金 / 税 / 总费用</th>
                  </tr>
                </thead>
                <tbody>
                  {report.native.trades.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.id} / {t.order_id}
                      </td>
                      <td>{t.at}</td>
                      <td>
                        {t.security} {t.side}
                      </td>
                      <td>
                        {t.quantity} × {t.price}
                      </td>
                      <td>
                        {t.commission} / {t.tax} / {t.cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.native.trades.length && <p>本日无成交。</p>}
          </>
        ) : (
          <p>无已提交执行结果，不能推断订单或成交为零。</p>
        )}
      </section>
      <section>
        <h2>风险、数据与恢复记录</h2>
        <div className="paper-scroll">
          <table>
            <thead>
              <tr>
                <th>序号 / 日期</th>
                <th>事件</th>
                <th>说明与后续动作</th>
              </tr>
            </thead>
            <tbody>
              {[...view.events].reverse().map((e) => (
                <tr key={e.sequence}>
                  <td>
                    {e.sequence} · {e.day || "会话"}
                  </td>
                  <td>
                    {e.kind}
                    <br />
                    {e.details.code}
                  </td>
                  <td>
                    {e.details.message || String(e.details.reason || "")}
                    <br />
                    {e.details.detail && String(e.details.detail)}
                    <br />
                    {e.details.next_action}
                    <details>
                      <summary>完整收据</summary>
                      <pre>{JSON.stringify(e.details, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
