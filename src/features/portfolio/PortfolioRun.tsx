import { money, time } from "../../shared/format.ts";
import { PortfolioResults } from "./PortfolioResults";
import {
  Alert,
  Empty,
  ScopeNote,
  Status,
  algorithmName,
  download,
  icon,
  short,
} from "./PortfolioUi";
import { base } from "./draft";
import { canCancel, labels } from "./state.ts";
import type { PortfolioController } from "./usePortfolioController";

type Props = Pick<
  PortfolioController,
  | "detail"
  | "error"
  | "reading"
  | "at"
  | "refresh"
  | "mutate"
  | "selectedId"
  | "tab"
  | "title"
  | "storageError"
  | "operation"
  | "busy"
  | "current"
  | "active"
>;
export function PortfolioRun({
  detail,
  error,
  reading,
  at,
  refresh,
  mutate,
  selectedId,
  tab,
  title,
  storageError,
  operation,
  busy,
  current,
  active,
}: Props) {
  return (
    <>
      {active && (
        <div className="qw-run-summary">
          <span>
            设置：{detail?.manifest.execution_scope.start_date} 到{" "}
            {detail?.manifest.execution_scope.end_date}，￥
            {money(active.request.initial_cash)}，每天 ·{" "}
            {active.request.securities.length} 只证券
          </span>
          <span>
            状态：
            <Status job={active} />
          </span>
          <span className="qw-type">
            {detail
              ? algorithmName(detail.manifest.strategy.definition.algorithm)
              : "—"}
          </span>
          <div className="qw-summary-actions">
            <button onClick={refresh} disabled={reading || busy}>
              {icon("refresh")} 刷新
            </button>
            <button
              onClick={() => void mutate("cancel")}
              disabled={
                !current ||
                !canCancel(active) ||
                operation?.state === "pending" ||
                !!storageError
              }
            >
              取消回测
            </button>
            <button
              onClick={() => void mutate("resume")}
              disabled={
                !current ||
                !active.can_resume ||
                operation?.state === "pending" ||
                !!storageError
              }
            >
              恢复原任务
            </button>
            <button
              onClick={() =>
                download(
                  `${active.job_id}.json`,
                  JSON.stringify(detail, null, 2),
                )
              }
            >
              {icon("download")} 导出
            </button>
          </div>
        </div>
      )}
      <div className="qw-results-layout">
        <aside aria-label="回测结果导航">
          {[
            ["overview", "收益概述", "line-chart"],
            ["trades", "交易详情", "list-alt"],
            ["positions", "每日持仓与权益", "bar-chart"],
            ["logs", "日志输出", "file-text-o"],
            ["decisions", "逐日决策", "tasks"],
            ["code", "策略版本", "code"],
            ["details", "运行信息", "info-circle"],
          ].map(([key, name, i]) => (
            <a
              key={key}
              className={tab === key ? "active" : ""}
              href={`${base}/results/${selectedId}/${key}`}
            >
              {icon(i)}
              {name}
            </a>
          ))}
          <div className="qw-sidebar-meta">
            <p>最后读取</p>
            <time>{at ? time(at) : "—"}</time>
            <p>策略版本</p>
            <code title={detail?.manifest.strategy.version_id}>
              {short(detail?.manifest.strategy.version_id)}
            </code>
            <p>
              {detail?.job.request.mode === "price_only_no_limits"
                ? "价格诊断 · 非总回报"
                : "本地条件研究"}
            </p>
          </div>
        </aside>
        <section className="qw-result-panel">
          {reading && !detail ? (
            <Empty>正在读取任务、清单、日志与结果…</Empty>
          ) : !detail ? (
            <Empty>
              {selectedId
                ? "结果暂不可用。请重试读取，或返回任务列表。"
                : "从回测列表选择一个任务。"}
              <a href={`${base}/tasks`}>返回回测列表</a>
            </Empty>
          ) : (
            <>
              {active?.error && <Alert>{JSON.stringify(active.error)}</Alert>}
              {active && active.status !== "succeeded" && (
                <div className="qw-progress">
                  <strong>{labels[active.status]}</strong>
                  <span>
                    已提交 {active.committed_cursor} / {active.total_cursors}{" "}
                    个游标 · 第 {active.attempt_count} 次尝试
                  </span>
                  <progress
                    value={active.committed_cursor}
                    max={active.total_cursors || 1}
                  />
                  <small>
                    {active.status === "queued"
                      ? "等待独立 worker。刷新页面不会重新提交。"
                      : active.status === "cancelling"
                        ? "正在等待安全停止；已提交成交保留。"
                        : active.can_resume
                          ? "可恢复同一任务；恢复后由 worker 继续执行。"
                          : "任务状态由服务确认。"}
                    {active.recovery_required ? " 当前需要恢复。" : ""}
                  </small>
                </div>
              )}
              <ScopeNote
                mode={detail.job.request.mode}
                scope={detail.manifest.preflight.economic_scope}
                assumptions={detail.manifest.preflight.assumptions}
                limitations={detail.manifest.preflight.limitations}
              />
              <PortfolioResults
                key={`${detail.job.job_id}/${tab}`}
                detail={detail}
                tab={tab}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
