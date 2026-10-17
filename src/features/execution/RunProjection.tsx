import { money, time } from "../../shared/format.ts";
import { readRunDetail } from "./api";
import { Empty, Json, Pairs, Table } from "./ExecutionUi";
import { record } from "./model";
import { EventsPanel, ReceiptPanel } from "./RunEvidence";
type Data = Awaited<ReturnType<typeof readRunDetail>>;
export function RunProjection({
  data,
  id,
  tab,
}: {
  data: Data;
  id: string;
  tab: string;
}) {
  const { state, manifest } = data;
  return (
    <div role="tabpanel">
      {tab === "account" && (
        <>
          <p className="notice">
            数据证据：synthetic。
            {state.is_test_double
              ? "测试替身回放快照。"
              : "原生 RQAlpha 账户投影；原生 float 按八位小数政策正规化，非源行情精度承诺。"}{" "}
            金额为后端 CNY 字符串，不是实测收益。
          </p>
          {state.account ? (
            <>
              <div className="metrics">
                <div>
                  <small>现金（含冻结）</small>
                  <strong>{money(state.account.cash)}</strong>
                </div>
                <div>
                  <small>冻结现金</small>
                  <strong>{money(state.account.frozen_cash)}</strong>
                </div>
                <div>
                  <small>合成权益 equity</small>
                  <strong>{money(state.account.equity)}</strong>
                </div>
              </div>
              <h3>持仓投影</h3>
              <Table
                headers={[
                  "证券",
                  "总数量（股）",
                  "可卖数量（股）",
                  "均价 CNY",
                  "应收股利 CNY",
                ]}
                rows={state.account.positions.map((p) => [
                  p.security,
                  p.quantity,
                  p.sellable,
                  money(p.average_price),
                  money(p.dividend_receivable),
                ])}
              />
            </>
          ) : (
            <Empty>后端尚无账户快照。不会用人工预期填充。</Empty>
          )}
          <p className="muted">
            收益率、回撤、可用资金：当前未输出，前端不计算。
          </p>
        </>
      )}
      {tab === "orders" && (
        <>
          <p className="notice">
            合成输入的引擎订单投影；部分原生拒绝不产生订单，请查看事件与回执。原始
            rejected / Market close 不改写为 cancelled。
          </p>
          <Table
            headers={[
              "订单 ID",
              "证券",
              "方向",
              "数量",
              "已成交",
              "限价 CNY",
              "状态",
              "拒绝原因",
            ]}
            rows={state.orders.map((o) => [
              o.order_id,
              o.security,
              o.side,
              o.quantity,
              o.filled,
              money(o.limit_price),
              o.status,
              o.reason,
            ])}
          />
        </>
      )}
      {tab === "fills" && (
        <>
          <p className="notice">合成输入的引擎成交记录，不代表真实市场成交。</p>
          <Table
            headers={[
              "成交 ID",
              "订单 ID",
              "证券",
              "方向",
              "数量",
              "价格 CNY",
              "总费用 CNY",
              "佣金 CNY",
              "税 CNY",
            ]}
            rows={state.fills.map((f) => [
              f.fill_id,
              f.order_id,
              f.security,
              f.side,
              f.quantity,
              money(f.price),
              money(f.fee),
              money(f.commission),
              money(f.tax),
            ])}
          />
        </>
      )}
      {tab === "events" && <EventsPanel id={id} />}
      {tab === "receipt" && (
        <ReceiptPanel id={id} engine={manifest.engine.engine_id} />
      )}
      {tab === "execution" && (
        <>
          <p className="notice">
            租约仅表示监督进程持有权，不代表所有外部进程或行情健康。环境拒绝可能保持
            queued 并占用账户；请按后端错误恢复固定环境，勿新建任务冒充续跑。
          </p>
          <Pairs value={record(data.execution)} />
          <p className="notice">
            {data.execution.recovery === "cli_worker_after_lease_expiry"
              ? "可由正确环境的 CLI worker 在租约到期后接管。浏览器无恢复接口。"
              : data.execution.recovery === "worker_active"
                ? "监督 worker 活跃。停止请求需等待最终对账。"
                : data.execution.recovery === "cancel_reconciliation"
                  ? "取消待对账：保持账户占用，由固定环境 worker 停止写者并只读对账。"
                  : data.execution.recovery === "operator_reconciliation"
                    ? "需要人工只读对账：普通 worker 不自动重跑；由操作员使用 worker --run-id 指定本任务。"
                    : "终态任务，不自动重跑。"}
          </p>
        </>
      )}
      {tab === "logs" && (
        <>
          <Table
            headers={["序号", "记录时间 +08:00", "级别", "后端消息"]}
            rows={data.logs.map((l) => [
              l.index,
              time(l.observed_at),
              l.level,
              l.message,
            ])}
          />
          <p className="muted">读取 logs?after=0；顺序与消息保留后端原文。</p>
        </>
      )}
      {tab === "manifest" && (
        <>
          <h3>数据引用 · synthetic / 非真实行情</h3>
          <Pairs value={record(manifest.data)} />
          <h3>不可变策略 / 引擎</h3>
          <Pairs
            value={{
              strategy_version_id: manifest.strategy.version_id,
              execution_status: manifest.strategy.execution_status,
              execution_semantics: manifest.execution_semantics,
              implementation_files: manifest.implementation_files
                ? Object.keys(manifest.implementation_files).length
                : "未提供",
              native_runtime: manifest.native_runtime
                ? "已提供；完整字段见下方 manifest"
                : "未提供",
              engine_id: manifest.engine.engine_id,
              is_test_double: manifest.engine.is_test_double,
              real_strategy_executed: manifest.real_strategy_executed,
              created_at: time(manifest.created_at),
            }}
          />
          <details open>
            <summary>完整 manifest（后端原始响应）</summary>
            <Json value={manifest} />
          </details>
        </>
      )}
    </div>
  );
}
