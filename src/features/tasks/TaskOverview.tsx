import { DailySummary } from "./DailyTaskResults";
import { pathFor, Raw, states } from "./TaskUi";
import { sourcePin } from "./snapshots";
import type { TasksController } from "./useTasksController";
type Props = Pick<
  TasksController,
  | "current"
  | "source"
  | "view"
  | "next"
  | "reason"
  | "acting"
  | "setReason"
  | "delivery"
  | "canPaperAct"
  | "send"
  | "body"
  | "waiting"
  | "canAct"
  | "setTab"
>;
export function TaskOverview({
  current,
  source,
  view,
  next,
  reason,
  acting,
  setReason,
  delivery,
  canPaperAct,
  send,
  body,
  waiting,
  canAct,
  setTab,
}: Props) {
  if (!current) return null;
  return (
    <section className="task-panel" data-testid="task-evidence">
      <div className="task-heading">
        <div>
          <h2>{current.title}</h2>
          <p className="task-mode">
            {current.mode === "synthetic_fixture"
              ? "合成演练 · 不是真实历史结果"
              : current.mode === "historical_research"
                ? "历史输入 · 条件研究模拟"
                : "固定历史条件研究 · 来源真实性未独立证明"}
          </p>
        </div>
        <strong className="task-state">
          {states[current.state] || current.state}
        </strong>
      </div>
      <dl className="task-identity">
        <div>
          <dt>策略版本</dt>
          <dd>
            <code>{current.strategy}</code>
          </dd>
        </div>
        <div>
          <dt>数据版本</dt>
          <dd>
            <code>{current.dataVersion}</code>
          </dd>
        </div>
        <div>
          <dt>对象 ID</dt>
          <dd>
            <code>{current.id}</code>
          </dd>
        </div>
        <div>
          <dt>服务源码</dt>
          <dd>
            <code>{sourcePin(source)}</code>
          </dd>
        </div>
      </dl>
      <p>{current.review}</p>
      {current.executionScope && (
        <p data-testid="task-execution-scope">
          执行窗口：{current.executionScope.start_date}～
          {current.executionScope.end_date} ·{" "}
          {current.executionScope.trading_dates.length} 个交易日 · 原窗口{" "}
          {current.executionScope.owner_window_id}。<br />
          冻结数据绑定：<code>{current.dataBinding}</code>
        </p>
      )}
      {current.taskStatus && (
        <details>
          <summary>本次目录读取的任务服务状态</summary>
          <p>
            待处理容量剩余 {current.taskStatus.available_pending} /{" "}
            {current.taskStatus.policy.max_pending}；执行槽{" "}
            {current.taskStatus.policy.max_workers}；每任务最多{" "}
            {current.taskStatus.policy.max_attempts}{" "}
            次尝试。目录状态与任务快照分别读取，不代表同一原子时刻。
          </p>
          <Raw title="服务策略、队列与恢复原文" value={current.taskStatus} />
        </details>
      )}
      {view && (
        <div className="task-controls">
          <p>
            模拟状态：已提交至 {view.last_day || "尚无"}；下一日{" "}
            {next || "未提供 / 窗口结束"}
            。暂停保留账户，恢复沿用同一冻结会话。
          </p>
          <label>
            操作原因
            <input
              aria-label="操作原因"
              value={reason}
              maxLength={1024}
              disabled={acting}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="task-buttons">
            {delivery && (
              <button
                disabled={
                  !canPaperAct ||
                  view.paused ||
                  !delivery.next_input_day ||
                  delivery.next_input_day !== next ||
                  !(
                    delivery.observation_admission?.ready ??
                    delivery.ad_admission.ready
                  )
                }
                onClick={() =>
                  void send("ingest", body(delivery.next_input_day!))
                }
              >
                接收下一日数据
              </button>
            )}
            <button
              disabled={
                !canPaperAct ||
                !next ||
                view.paused ||
                waiting?.recovery_required ||
                waiting?.status === "running" ||
                (!!delivery && !delivery.received.some((d) => d.day === next))
              }
              onClick={() => void send("advance", body(next!))}
            >
              推进下一日
            </button>
            <button
              disabled={!canPaperAct || view.paused}
              onClick={() => void send("pause", body())}
            >
              暂停模拟
            </button>
            <button
              disabled={
                !canPaperAct || (!view.paused && !waiting?.recovery_required)
              }
              onClick={() => void send("resume", body())}
            >
              恢复冻结会话
            </button>
          </div>
        </div>
      )}
      {current.job && (
        <div className="task-controls">
          <p>
            任务游标 {current.job.committed_cursor} /{" "}
            {current.job.total_cursors} · 尝试 {current.job.attempt_count}{" "}
            次。取消保留已提交成交；恢复条件以 can_resume 为准。
          </p>
          <div className="task-buttons">
            <button
              disabled={
                !canAct ||
                !["queued", "running", "cancelling"].includes(
                  current.job.status,
                )
              }
              onClick={() => void send("cancel", {})}
            >
              取消研究任务
            </button>
            <button
              disabled={!canAct || !current.job.can_resume}
              onClick={() => void send("resume", {})}
            >
              恢复原研究任务
            </button>
            <a
              href={`${pathFor(source, current.id)}/details`}
              onClick={() => {
                if (source === "daily") setTab("details");
              }}
            >
              完整任务参数与日志
            </a>
          </div>
          {current.job.error && (
            <Raw title="后端任务错误" value={current.job.error} />
          )}
        </div>
      )}
      <div className="task-metrics">
        <div>
          <span>初始资金 · 冻结配置</span>
          <strong>{current.initialCash}</strong>
        </div>
        <div>
          <span>最近已提交权益 · CNY</span>
          <strong data-testid="task-equity">
            {current.points.at(-1)?.equity ?? "未提供"}
          </strong>
        </div>
        <div>
          <span>最近已提交现金 · CNY</span>
          <strong>{current.points.at(-1)?.cash ?? "未提供"}</strong>
        </div>
        <div>
          <span>已提交日期 / 成交记录</span>
          <strong>
            {current.points.length} / {current.fills.length}
          </strong>
        </div>
      </div>
      {current.result && <DailySummary result={current.result} />}
    </section>
  );
}
