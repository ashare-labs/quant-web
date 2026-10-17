import {
  DailyDecisions,
  DailyDiagnostics,
  DailyEvidence,
  DailyOrders,
} from "./DailyTaskResults";
import { TaskTable as Table } from "./TaskTable";

import { Curve } from "./TaskCurve";
import { Raw } from "./TaskUi";
import type { TasksController } from "./useTasksController";
type Props = Pick<
  TasksController,
  | "id"
  | "notice"
  | "at"
  | "day"
  | "setDay"
  | "tab"
  | "setTab"
  | "current"
  | "selected"
  | "previous"
  | "view"
  | "report"
  | "delivery"
  | "labels"
>;
export function TaskEvidenceTabs({
  id,
  notice,
  at,
  day,
  setDay,
  tab,
  setTab,
  current,
  selected,
  previous,
  view,
  report,
  delivery,
  labels,
}: Props) {
  if (!current) return null;
  return (
    <>
      <nav className="task-tabs" aria-label="证据内容">
        {labels.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        className="task-panel"
        aria-label={labels.find(([key]) => key === tab)?.[1]}
      >
        {tab === "overview" && (
          <>
            <h2>回测 / 模拟权益曲线</h2>
            <Curve points={current.points} day={day} select={setDay} />
            <Table
              name="逐日账户"
              headers={["交易日", "原生权益 · CNY", "原生现金 · CNY"]}
              rows={current.points.map((p) => [
                <button
                  className="task-date"
                  aria-pressed={day === p.day}
                  onClick={() => setDay(p.day)}
                >
                  {p.day}
                </button>,
                p.equity,
                p.cash,
              ])}
              empty="尚无已提交账户，不能把初始资金当作已执行结果。"
            />
            {current.result && <DailyDecisions result={current.result} />}
          </>
        )}
        {tab === "orders" && current.result && (
          <>
            <h2>日频订单与拒单</h2>
            <DailyOrders result={current.result} />
            <DailyDiagnostics result={current.result} />
          </>
        )}
        {tab === "fills" && (
          <>
            <h2>逐笔成交与费用</h2>
            <p>
              当前对象的全部已提交日；顺序按日期及后端记录。价格与费用保持原始精度。
            </p>
            <Table
              name="逐笔成交"
              headers={[
                "日期 / 模型时间",
                "成交 / 订单 ID",
                "证券 / 方向",
                "股数",
                "价格",
                "佣金",
                "税",
                "总费用",
              ]}
              rows={current.fills.map((f) => [
                `${f.day} / ${f.at}`,
                `${f.id} / ${f.order}`,
                `${f.security} / ${f.side}`,
                f.quantity,
                f.price,
                f.commission,
                f.tax,
                f.fee,
              ])}
              empty={
                current.points.length
                  ? "已提交日报中无成交记录。"
                  : "尚无已提交结果，不能推断成交为零。"
              }
            />
            {current.result && <DailyDiagnostics result={current.result} />}
            {current.reports?.some((r) => r.native.refusals?.length) && (
              <Raw
                title="后端逐日拒绝（与成交分别保留）"
                value={current.reports
                  .filter((r) => r.native.refusals?.length)
                  .map((r) => ({ day: r.day, refusals: r.native.refusals }))}
              />
            )}
          </>
        )}
        {tab === "positions" && (
          <>
            <h2>持仓变化</h2>
            <p>
              并列两个相邻已提交日的原生数量，不从成交重建账本。缺失的证券或前一日显示未提供。
            </p>
            <label>
              持仓日期
              <select
                aria-label="持仓日期"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              >
                {current.points.map((p) => (
                  <option key={p.day}>{p.day}</option>
                ))}
              </select>
            </label>
            <Table
              name="持仓变化"
              headers={[
                "证券",
                `前一日 ${previous?.day || "未提供"} · 股`,
                `选定日 ${day || "未提供"} · 股`,
                "当日可卖 · 股",
                "当日市值 · CNY",
              ]}
              rows={
                selected?.positions.map((p) => [
                  p.security,
                  previous?.positions.find((q) => q.security === p.security)
                    ?.quantity,
                  p.quantity,
                  p.sellable,
                  p.value,
                ]) || []
              }
              empty="没有可核对的已提交持仓。"
            />
            {report && (
              <Raw
                title="选定日原生账户与目标缺口"
                value={{
                  account: report.native.account,
                  target_gaps: report.native.target_gaps,
                }}
              />
            )}
          </>
        )}
        {tab === "comparison" && (
          <>
            <h2>AQ / 聚宽双端差异</h2>
            <p className="task-notice">
              <strong>未提供当前对象的可核验双端比较。</strong> 现有冻结 API
              没有将聚宽证据绑定到本次策略版本、数据版本和窗口；此处不判定一致，也不拼接历史参考金额。
            </p>
            <Table
              name="双端证据覆盖"
              headers={["核对项", "AQ", "聚宽"]}
              rows={[
                ["策略与数据版本", "见本页当前对象身份", "未提供绑定证据"],
                [
                  "逐日权益 / 持仓",
                  current.points.length
                    ? `${current.points.length} 个已提交日`
                    : "尚无提交结果",
                  "未提供",
                ],
                [
                  "逐笔成交 / 费用",
                  current.points.length
                    ? `${current.fills.length} 条原始记录`
                    : "尚无提交结果",
                  "未提供",
                ],
                [
                  "差异原因 / 容差 / 对账结论",
                  "需后端比较投影",
                  "需后端比较投影",
                ],
              ]}
              empty=""
            />
            <p>
              需要 AQ
              提供带双方来源摘要、时间范围、逐项差异与原始限制的只读契约，之后再接入。缺项不等于零差异。
            </p>
          </>
        )}
        {tab === "details" && current.taskLogs && (
          <>
            <h2>日频任务参数与日志</h2>
            <p>来自当前服务的同一任务，日志与冻结参数按任务身份核对。</p>
            <Raw
              title="创建请求与冻结策略"
              value={{
                request: current.job?.request,
                strategy:
                  current.manifest && "strategy" in current.manifest
                    ? current.manifest.strategy
                    : undefined,
              }}
            />
            <Raw title="完整冻结清单与 Session" value={current.manifest} />
            <Table
              name="任务日志"
              headers={["序号", "时间", "事件", "后端详情"]}
              rows={current.taskLogs.items.map((item) => [
                item.sequence,
                item.at,
                item.event,
                <pre>{JSON.stringify(item.details, null, 2)}</pre>,
              ])}
              empty="后端尚未提供日志。"
            />
          </>
        )}
        {tab === "gaps" && (
          <>
            <h2>真实数据缺失与证据范围</h2>
            {current.issues.length ? (
              <ul className="task-issues">
                {current.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p>后端没有列出额外缺口；这不扩张原有执行权限。</p>
            )}
            {view && (
              <>
                <p>
                  整窗准入：
                  {delivery
                    ? delivery.ad_admission.ready
                      ? "已通过声明模型"
                      : "未通过"
                    : "未提供逐日 AD 准入"}
                  ；观察输入：
                  {delivery
                    ? (delivery.observation_admission?.ready ??
                      delivery.ad_admission.ready)
                      ? "可接收，订单仍需逐笔许可"
                      : "拒绝"
                    : "未提供"}
                  。
                </p>
                <Raw
                  title="来源缺口与逐日收据"
                  value={{ preflight: view.replay?.preflight, delivery }}
                />
                <Raw title="策略、数据、风险与恢复原文" value={view} />
              </>
            )}
            {current.result && <DailyEvidence result={current.result} />}
            <Raw title="本次完整 API 证据" value={current.raw} />
          </>
        )}
      </section>
    </>
  );
}
