import { money, time } from "../../shared/format.ts";
import {
  algorithmName,
  Empty,
  icon,
  short,
  Status,
  Table,
} from "./PortfolioUi";
import { base, freshDraft } from "./draft";
import { labels } from "./state.ts";
import type { PortfolioController } from "./usePortfolioController";

type Props = Pick<
  PortfolioController,
  | "reading"
  | "refresh"
  | "selectStrategy"
  | "search"
  | "setStrategySearch"
  | "setTaskSearch"
  | "stateFilter"
  | "setStateFilter"
  | "listPage"
  | "setListPage"
  | "jobs"
  | "versions"
  | "page"
  | "title"
  | "update"
  | "operation"
  | "busy"
  | "current"
>;
export function PortfolioLists({
  reading,
  refresh,
  selectStrategy,
  search,
  setStrategySearch,
  setTaskSearch,
  stateFilter,
  setStateFilter,
  listPage,
  setListPage,
  jobs,
  versions,
  page,
  title,
  update,
  operation,
  busy,
  current,
}: Props) {
  return (
    <main
      className={`qw-list-page ${page === "strategies" ? "strategy-list" : "task-list"}`}
    >
      <div className="qw-list-heading">
        <h2>
          {page === "strategies"
            ? "策略列表"
            : `共有 ${jobs.length} 个回测任务`}
        </h2>
        <input
          aria-label="搜索策略或任务"
          placeholder={
            page === "strategies"
              ? "搜索版本或类型…"
              : "搜索策略名称 / 任务 ID…"
          }
          value={search}
          onChange={(e) =>
            page === "strategies"
              ? setStrategySearch(e.target.value)
              : setTaskSearch(e.target.value)
          }
        />
      </div>
      <div className="qw-list-tools">
        <button
          className="qw-primary"
          onClick={() => {
            if (operation?.state === "pending") {
              location.hash = `${base}/editor`;
              return;
            }
            update({ ...freshDraft() });
            location.hash = `${base}/editor`;
          }}
        >
          {icon("plus")} 新建策略
        </button>
        <a className="qw-button" href={`${base}/editor`}>
          {icon("file-code-o")} 继续草稿
        </a>
        <button onClick={refresh} disabled={reading || busy}>
          {icon("refresh")} 刷新
        </button>
        {page === "tasks" && (
          <select
            aria-label="任务状态筛选"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <span className="qw-list-summary">
          {current
            ? `排队 ${current.service.counts.queued || 0} · 运行 ${current.service.counts.running || 0} · 可用队列 ${current.service.available_pending}`
            : "等待连接"}
        </span>
      </div>
      {reading && !current ? (
        <Empty>正在读取策略版本与任务状态…</Empty>
      ) : !current ? (
        <Empty>无法读取服务，请检查连接后刷新。</Empty>
      ) : page === "strategies" ? (
        <>
          <p className="qw-muted">
            全部已注册版本 · 相同算法定义复用版本，编辑后重新注册
          </p>
          <Table
            headers={[
              "策略版本",
              "类型",
              "注册时间",
              "历史回测",
              "最近状态",
              "操作",
            ]}
            rows={versions
              .slice((listPage - 1) * 12, listPage * 12)
              .map((s) => {
                const runs = current.jobs.filter(
                  (j) => j.request.strategy_version_id === s.version_id,
                );
                return [
                  <button
                    className="qw-link"
                    title={s.version_id}
                    onClick={() => selectStrategy(s)}
                  >
                    {icon("file-code-o")} {short(s.version_id)}
                  </button>,
                  <span className="qw-type">
                    {algorithmName(s.definition.algorithm)}
                  </span>,
                  time(s.created_at),
                  <a
                    href={`${base}/tasks`}
                    onClick={() => {
                      setTaskSearch(s.version_id);
                      setStateFilter("all");
                    }}
                  >
                    {runs.length}
                  </a>,
                  runs[0] ? (
                    <Status job={runs[0]} />
                  ) : (
                    <span className="qw-muted">未运行</span>
                  ),
                  <button className="qw-link" onClick={() => selectStrategy(s)}>
                    编辑策略
                  </button>,
                ];
              })}
          />
        </>
      ) : (
        <Table
          headers={[
            "策略名称",
            "策略版本",
            "创建时间 +08:00",
            "时间范围",
            "证券集合",
            "研究范围",
            "初始资金",
            "进度",
            "状态",
            "操作",
          ]}
          rows={jobs.slice((listPage - 1) * 12, listPage * 12).map((j) => [
            <a href={`${base}/results/${j.job_id}`} title={j.job_id}>
              {j.request.name}
            </a>,
            <code>{short(j.request.strategy_version_id)}</code>,
            time(j.created_at),
            `${j.request.start_date} → ${j.request.end_date}`,
            j.request.securities.join("、"),
            j.request.mode === "price_only_no_limits"
              ? "价格诊断 · 非总回报"
              : "条件研究",
            money(j.request.initial_cash),
            <span>
              {j.committed_cursor} / {j.total_cursors}
            </span>,
            <Status job={j} />,
            <a href={`${base}/results/${j.job_id}`}>查看详情</a>,
          ])}
        />
      )}
      <div className="qw-pagination">
        <button
          disabled={listPage === 1}
          onClick={() => setListPage((n) => n - 1)}
        >
          上一页
        </button>
        <span>
          {listPage} /{" "}
          {Math.max(
            1,
            Math.ceil(
              (page === "strategies" ? versions.length : jobs.length) / 12,
            ),
          )}
        </span>
        <button
          disabled={
            listPage * 12 >=
            (page === "strategies" ? versions.length : jobs.length)
          }
          onClick={() => setListPage((n) => n + 1)}
        >
          下一页
        </button>
        <small>每页 12 行</small>
      </div>
      {current && !current.strategies.length && page === "strategies" && (
        <Empty>
          尚无策略版本。打开工作台，选择组合算法、编辑定义并注册版本。
        </Empty>
      )}
    </main>
  );
}
