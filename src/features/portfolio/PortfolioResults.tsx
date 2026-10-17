import { useState } from "react";
import { money, time } from "../../shared/format.ts";
import { StrategyEditor } from "../strategies/StrategyEditor";
import type { Detail } from "./api";
import { PortfolioOverview } from "./PortfolioOverview";
import { Table, algorithmName } from "./PortfolioUi";
import { positionRows } from "./positions.ts";

export function PortfolioResults({
  detail,
  tab,
}: {
  detail: Detail;
  tab: string;
}) {
  const { result, manifest, logs, job } = detail;
  const [date, setDate] = useState("all"),
    [security, setSecurity] = useState("all"),
    [query, setQuery] = useState(""),
    [showOrders, setShowOrders] = useState(false);
  const days =
    result?.days.filter((d) => date === "all" || d.date === date) || [];
  if (tab === "logs")
    return (
      <>
        <h2 className="qw-panel-heading">日志输出</h2>
        <div className="qw-table-tools">
          <input
            aria-label="搜索日志"
            placeholder="搜索事件或日志内容…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>顺序保留后端原文 · {logs.items.length} 条</span>
        </div>
        <div className="qw-result-logs">
          {logs.items
            .filter((l) =>
              `${l.event} ${JSON.stringify(l.details)}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((l) => (
              <p key={l.sequence}>
                <time>{time(l.at)}</time> <b>{l.event}</b>{" "}
                <span>{JSON.stringify(l.details)}</span>
              </p>
            ))}
        </div>
      </>
    );
  if (tab === "code")
    return (
      <>
        <h2 className="qw-panel-heading">
          冻结策略版本 · {algorithmName(manifest.strategy.definition.algorithm)}
        </h2>
        <div className="qw-version-details">
          <p>
            版本 <code>{manifest.strategy.version_id}</code>
          </p>
          <p>
            算法源码摘要 <code>{manifest.strategy.source_sha256}</code>
          </p>
          <p>
            定义摘要 <code>{manifest.strategy.parameter_sha256}</code>
          </p>
          <p>
            此任务执行服务内的固定算法版本。以下是注册定义，不是任意 Python
            源码；后续草稿编辑不会改变本次任务。
          </p>
        </div>
        <div className="qw-result-code">
          <StrategyEditor
            value={JSON.stringify(manifest.strategy.definition, null, 2)}
            language="json"
            readOnly
          />
        </div>
      </>
    );
  if (tab === "details")
    return (
      <>
        <h2 className="qw-panel-heading">运行信息</h2>
        <div className="qw-version-details">
          <p>
            任务 <code>{job.job_id}</code>
          </p>
          <p>
            原生账户 <code>{job.account_id}</code>
          </p>
          <p>
            数据包 {manifest.data_identity.name} ·{" "}
            <code>{job.request.dataset_id}</code>
          </p>
          <p>
            选择后输入 <code>{manifest.preflight.input_sha256}</code>
          </p>
          <p>
            幂等键 <code>{job.request.idempotency_key}</code>
          </p>
          <p>证券 {manifest.execution_scope.securities.join("、")}</p>
          <p>
            执行范围 {manifest.execution_scope.start_date} —{" "}
            {manifest.execution_scope.end_date} ·{" "}
            {manifest.execution_scope.trading_dates.length} 个交易日 · 预热{" "}
            {manifest.execution_scope.warmup_sessions} 日
          </p>
          <p>
            已提交 {job.committed_cursor} / {job.total_cursors} 个游标 · 第{" "}
            {job.attempt_count} 次尝试 ·{" "}
            {job.can_resume ? "服务允许恢复" : "当前不能恢复"}
          </p>
          <details>
            <summary>冻结请求、清单与来源</summary>
            <pre>{JSON.stringify(manifest, null, 2)}</pre>
          </details>
          {result && (
            <>
              <details>
                <summary>原生核对与恢复证据</summary>
                <pre>
                  {JSON.stringify(
                    { audit: result.audit, recovery: result.recovery },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <details>
                <summary>完整原生收据（含公司行动策略与来源）</summary>
                <pre>{JSON.stringify(result.receipt, null, 2)}</pre>
              </details>
            </>
          )}
        </div>
      </>
    );
  if (!result)
    return (
      <>
        <h2 className="qw-panel-heading">
          {tab === "overview" ? "收益概述" : "回测明细"}
        </h2>
        <div className="qw-empty">
          此任务尚未发布完整结果。请查看日志与运行信息；空白不代表零成交。
        </div>
      </>
    );
  const filters = (
    <div className="qw-table-tools">
      <label>
        交易日{" "}
        <select
          aria-label="交易日筛选"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          <option value="all">全部交易日</option>
          {result.days.map((d) => (
            <option key={d.date}>{d.date}</option>
          ))}
        </select>
      </label>
      {tab !== "decisions" && (
        <label>
          证券{" "}
          <select
            aria-label="证券筛选"
            value={security}
            onChange={(e) => setSecurity(e.target.value)}
          >
            <option value="all">全部证券</option>
            {result.scope.securities.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {tab === "trades" && (
        <label className="qw-check">
          <input
            type="checkbox"
            checked={showOrders}
            onChange={(e) => setShowOrders(e.target.checked)}
          />
          查看订单与拒绝原因
        </label>
      )}
      <span>时间 +08:00 · 金额 CNY · 数量 股</span>
    </div>
  );
  if (tab === "trades")
    return (
      <>
        <h2 className="qw-panel-heading">交易详情</h2>
        {filters}
        {showOrders ? (
          <Table
            headers={[
              "时间 +08:00",
              "证券",
              "方向",
              "委托数量",
              "成交数量",
              "状态",
              "原因",
              "订单 ID",
            ]}
            rows={result.orders
              .filter(
                (o) =>
                  (date === "all" || o.date === date) &&
                  (security === "all" || o.security === security),
              )
              .map((o) => [
                o.at ? time(o.at) : `${o.date}（时刻未提供）`,
                o.security,
                o.side === "BUY" ? "买" : "卖",
                o.quantity,
                o.filled,
                o.status,
                o.message || "—",
                o.id,
              ])}
          />
        ) : (
          <Table
            headers={[
              "成交时间 +08:00",
              "证券",
              "方向",
              "数量",
              "成交价",
              "佣金",
              "税费",
              "成交 ID",
              "订单 ID",
            ]}
            rows={result.trades
              .filter(
                (t) =>
                  (date === "all" || t.date === date) &&
                  (security === "all" || t.security === security),
              )
              .map((t) => [
                time(t.at),
                t.security,
                <span className={t.side === "BUY" ? "qw-up" : "qw-down"}>
                  {t.side === "BUY" ? "买" : "卖"}
                </span>,
                t.quantity,
                money(t.price),
                money(t.commission),
                money(t.tax),
                t.id,
                t.order_id,
              ])}
          />
        )}
        {!result.trades.length && (
          <p className="qw-metric-note">
            该完整原生结果没有成交；费用按真实结果显示，不将未完成任务当作零成交。
          </p>
        )}
      </>
    );
  if (tab === "positions")
    return (
      <>
        <h2 className="qw-panel-heading">每日持仓与权益</h2>
        {filters}
        <p className="qw-metric-note">
          账户权益与现金属于同一个组合账户；证券筛选仅筛选下方持仓，不拆分账户或重新计算收益。
        </p>
        <Table
          headers={[
            "日终时间 +08:00",
            "账户权益",
            "现金",
            "当日费用",
            "累计费用",
          ]}
          rows={days.map((d) => [
            time(d.at),
            money(d.equity),
            money(d.cash),
            money(d.day_fee),
            money(d.cumulative_fee),
          ])}
        />
        <h3 className="qw-subheading">逐证券持仓与未结权益</h3>
        <Table
          headers={[
            "日期",
            "证券",
            "已到账股数",
            "可售股数",
            "受限新增股",
            "待到账股数",
            "价格",
            "持仓市值",
            "待到账股份价值",
            "均价",
            "应收股息",
          ]}
          rows={positionRows(days, security)}
        />
        <p className="qw-metric-note">
          应收股息尚未转入现金；待到账股份未计入已到账股数，其价值按原生结果单独显示。受限新增股在服务声明的可售日解锁，可售股数同时受
          T+1 等约束。旧服务未提供的阶段字段显示“—”，不推定为零。
        </p>
        <p className="qw-metric-note">
          零持股但仍有未结权益的原生持仓行保留；未返回的仓位不补造。全现金日的账户行仍保留。最终账户仅有日期，不补造最终时刻。
        </p>
      </>
    );
  if (tab === "decisions")
    return (
      <>
        <h2 className="qw-panel-heading">逐日决策</h2>
        {filters}
        <Table
          headers={[
            "决策时间 +08:00",
            "信息截止",
            "再平衡",
            "候选证券",
            "目标股数",
            "原始信号",
          ]}
          rows={result.decisions
            .filter((d) => date === "all" || d.date === date)
            .map((d) => [
              time(d.at),
              time(d.cutoff),
              d.rebalance ? "是" : "否",
              d.signal?.selected.join("、") || "无",
              d.signal
                ? Object.entries(d.signal.targets)
                    .map(([s, n]) => `${s}: ${n}`)
                    .join("；") || "无"
                : "—",
              <details>
                <summary>查看</summary>
                <pre>{JSON.stringify(d, null, 2)}</pre>
              </details>,
            ])}
        />
      </>
    );
  return <PortfolioOverview result={result} />;
}
