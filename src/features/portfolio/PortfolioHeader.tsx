import { Alert, icon, short } from "./PortfolioUi";
import { base } from "./draft";
import type { PortfolioController } from "./usePortfolioController";

type Props = Pick<
  PortfolioController,
  | "error"
  | "reading"
  | "online"
  | "editSelectedTask"
  | "mutate"
  | "page"
  | "selectedId"
  | "title"
  | "draft"
  | "update"
  | "storageError"
  | "operation"
  | "busy"
  | "actionError"
  | "notice"
  | "setNotice"
  | "help"
  | "setHelp"
  | "current"
  | "active"
>;
export function PortfolioHeader({
  error,
  reading,
  online,
  editSelectedTask,
  mutate,
  page,
  selectedId,
  title,
  draft,
  update,
  storageError,
  operation,
  busy,
  actionError,
  notice,
  setNotice,
  help,
  setHelp,
  current,
  active,
}: Props) {
  return (
    <>
      <header className="qw-header">
        <a className="qw-wordmark" href={`${base}/strategies`}>
          quant-web
        </a>
        <span className="qw-local">本地量化研究</span>
        <nav aria-label="主导航">
          <a
            className={page === "strategies" ? "active" : ""}
            href={`${base}/strategies`}
          >
            策略列表
          </a>
          <a
            className={page === "editor" ? "active" : ""}
            href={`${base}/editor`}
          >
            策略工作台
          </a>
          <a
            className={page === "tasks" || page === "results" ? "active" : ""}
            href={`${base}/tasks`}
          >
            回测任务
          </a>
          <button onClick={() => setHelp((v) => !v)}>使用说明</button>
        </nav>
        <span className="qw-connection">
          {current
            ? "已连接"
            : busy
              ? "正在提交"
              : reading
                ? "连接中"
                : "未连接"}{" "}
          · AQ
        </span>
      </header>
      {page !== "strategies" && (
        <div className="qw-titlebar">
          <div>
            <a href={`${base}/strategies`} aria-label="返回策略列表">
              {icon("angle-left")}
            </a>
            {page === "editor" ? (
              <input
                aria-label="策略名称"
                value={draft.name}
                maxLength={80}
                onChange={(e) => update({ name: e.target.value })}
              />
            ) : (
              <h1>{title}</h1>
            )}
          </div>
          <nav aria-label="策略导航">
            <a
              className={page === "editor" ? "active" : ""}
              href={`${base}/editor`}
              onClick={editSelectedTask}
            >
              编辑策略
            </a>
            {selectedId && (
              <a
                className={page === "results" ? "active" : ""}
                href={`${base}/results/${selectedId}`}
              >
                回测详情
              </a>
            )}
            <a
              className={page === "tasks" ? "active" : ""}
              href={`${base}/tasks`}
            >
              回测列表
            </a>
            <a
              className={page === "strategies" ? "active" : ""}
              href={`${base}/strategies`}
            >
              策略版本
            </a>
          </nav>
        </div>
      )}
      {help && (
        <div className="qw-help">
          <button
            className="qw-close"
            aria-label="关闭说明"
            onClick={() => setHelp(false)}
          >
            {icon("times")}
          </button>
          <strong>本地研究工作台</strong>
          <p>
            编辑并注册组合算法定义，选择真实数据、证券集合、日期与资金，通过预检查并确认假设后运行。代码编辑器仅编辑注册定义；任意
            Python 暂不受此接口支持。任务由独立 worker 执行，刷新不会重新提交。
          </p>
          <p><a href="#/data">数据准备与检查</a> 可搜索主库股票、发布窗口并带入此页。固定日频评测单独保留。</p>
          <p>
            本应用为独立的 quant-web，与聚宽官方无关联。当前服务：
            {current?.catalogue.service_identity.backend_version ||
              "尚未连接"}{" "}
            · 源码{" "}
            {current
              ? short(current.catalogue.service_identity.source_sha256)
              : "—"}
            。<a href="#/tasks/daily">日频任务与结果</a>
          </p>
        </div>
      )}
      <Alert>
        {!online ? "网络已断开。已隐藏旧结果；恢复连接后重新核对任务。" : error}
      </Alert>
      <Alert>{storageError || actionError}</Alert>
      {notice && (
        <div role="status" className="qw-notice">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            {icon("times")}
          </button>
        </div>
      )}
      {operation?.state === "pending" && (
        <div className="qw-pending" role="status">
          <strong>有请求待确认</strong>
          <span>
            {operation.action === "create"
              ? "创建回测"
              : operation.action === "cancel"
                ? "取消任务"
                : "恢复任务"}{" "}
            · 响应可能已经写入。刷新不会另建任务。
          </span>
          <button
            disabled={!current || busy || !!storageError}
            onClick={() => void mutate(operation.action, true)}
          >
            核对并重试原请求
          </button>
        </div>
      )}
    </>
  );
}
