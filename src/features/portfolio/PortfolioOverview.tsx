import { money } from "../../shared/format.ts";
import type { PortfolioModel } from "./api";
import { PortfolioChart } from "./PortfolioChart";
import { Table, percent } from "./PortfolioUi";
export function PortfolioOverview({
  result,
}: {
  result: PortfolioModel<"PortfolioResult">;
}) {
  const summary = result.summary;
  const metrics = [
    ["期末权益", money(summary.final_equity)],
    ["权益变动", money(summary.net_change)],
    ["期末现金", money(summary.final_cash)],
    ["成交笔数", String(summary.trade_count)],
    ["总费用", money(summary.fee_total)],
    ["佣金", money(summary.commission_total)],
    ["税费", money(summary.tax_total)],
    ["净收益率", percent(summary.net_return)],
    ["最大回撤", percent(summary.max_drawdown)],
    ["基准收益率", percent(summary.benchmark)],
    ["年化收益率", percent(summary.annualized_return)],
    ["夏普比率", summary.sharpe ?? "—"],
  ];
  return (
    <>
      <h2 className="qw-panel-heading">收益概述</h2>
      <div className="qw-result-metrics">
        {metrics.map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <strong
              title={value}
              className={
                name === "权益变动"
                  ? Number(summary.net_change) >= 0
                    ? "qw-up"
                    : "qw-down"
                  : ""
              }
            >
              {value.replace(/(\.\d{4})\d+(%)/, "$1…$2")}
            </strong>
          </div>
        ))}
      </div>
      <div className="qw-chart-caption">
        <span>
          账户权益 · CNY ·{" "}
          {result.request.mode === "price_only_no_limits"
            ? "价格诊断，非总回报"
            : "条件研究"}
        </span>
        <span>拖动缩放条查看区间，悬停查看日终金额</span>
      </div>
      <PortfolioChart result={result} />
      <p className="qw-metric-note">
        金额、净收益率与回撤来自原生结果投影；基准、年化与 Sharpe
        未计算，显示“—”。百分比的省略位可悬停或展开完整值查看。采用固定跨期费用模型，不是各历史时点法定费率。原生浮点金额按十进制文本保留。
      </p>
      {result.audit.gross_dividend_entitlement != null && (
        <p className="qw-metric-note">
          原生核对的毛分红权益：
          {String(result.audit.gross_dividend_entitlement)}{" "}
          CNY。支付时点及税务模型见研究假设和原生收据。
        </p>
      )}
      <details className="qw-curve-values">
        <summary>查看指标完整数值</summary>
        <pre>{JSON.stringify(summary, null, 2)}</pre>
      </details>
      <details className="qw-curve-values">
        <summary>查看曲线原始数值</summary>
        <Table
          headers={["交易日", "账户权益", "现金", "日费用", "累计费用"]}
          rows={result.days.map((d) => [
            d.date,
            money(d.equity),
            money(d.cash),
            money(d.day_fee),
            money(d.cumulative_fee),
          ])}
        />
      </details>
    </>
  );
}
