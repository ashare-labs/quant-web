import { DailyTaskComposer } from "./DailyTaskComposer";
import { type Source } from "./snapshots";
import { TaskOverview } from "./TaskOverview";
import "./tasks.css";

import { TaskEvidenceTabs } from "./TaskEvidenceTabs";
import { pathFor, short, sources } from "./TaskUi";
import { pendingKey, useTasksController } from "./useTasksController";
export function TasksPage({ route }: { route: string }) {
  const model = useTasksController(route);
  const {
    refresh,
    source,
    id,
    choices,
    setSnapshot,
    error,
    operationError,
    setOperationError,
    notice,
    reading,
    acting,
    online,
    at,
    day,
    setTab,
    reason,
    setReason,
    pending,
    setPending,
    notes,
    setNotes,
    current,
    mine,
    send,
    exportEvidence,
    view,
    delivery,
    waiting,
    canAct,
    canPaperAct,
    next,
    body,
  } = model;
  return (
    <div className="task-page">
      <header>
        <div>
          <h1>任务与结果</h1>
          <p>选定版本，再核对同一份证据中的账户、成交与数据边界。</p>
        </div>
        <a href="#/tasks/daily">固定日频评测</a>
        <a href="#/paper">模拟操作</a>
        <a href="#/portfolio">组合回测</a>
      </header>
      <main>
        {source === "daily" && !id && <><p className="task-boundary">独立固定日频评测。正式股票和任意已有行情窗口请从 <a href="#/data">正式数据与回测</a> 进入组合回测。</p><DailyTaskComposer online={online} /></>}
        <section className="task-selection" aria-label="验收对象">
          <label>
            证据来源
            <select
              aria-label="证据来源"
              value={source}
              disabled={acting}
              onChange={(e) => {
                setSnapshot(null);
                location.hash = pathFor(e.target.value as Source);
              }}
            >
              {Object.entries(sources).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            验收对象
            <select
              aria-label="验收对象"
              value={id}
              disabled={reading || acting || !online}
              onChange={(e) => {
                setSnapshot(null);
                location.hash = pathFor(source, e.target.value);
              }}
            >
              <option value="">选择对象</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · {short(c.version)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={reading || acting || !online} onClick={refresh}>
            重新读取证据
          </button>
          <p role="status" className="task-connection">
            {!online
              ? "离线"
              : acting
                ? "请求处理中…"
                : reading
                  ? "核验证据中…"
                  : error
                    ? "读取失败"
                    : "已读取"}
            <small>
              {at
                ? `快照时间 ${at} · 状态以本次读取为准`
                : "核验通过后才展示结果"}
            </small>
          </p>
        </section>
        <p className="task-boundary">
          本地历史研究与模拟。服务身份与当前契约配对；更新后需重新导出契约。人类验收结论与后端执行状态分开记录。
        </p>
        {!online && (
          <div role="alert" className="task-error">
            浏览器离线，旧结果已隐藏。恢复网络后会重新核验同一对象。
          </div>
        )}
        {error && (
          <div role="alert" className="task-error">
            <strong>{error}</strong>
            <p>
              整份结果已隐藏。检查本机服务、固定版本或证据后，点击重新读取。
            </p>
          </div>
        )}
        {operationError && (
          <div role="alert" className="task-error">
            <strong>操作请求：{operationError}</strong>
            <p>错误保留供核对，不因随后读取成功而消失。</p>
          </div>
        )}
        {notice && (
          <p role="status" className="task-notice">
            {notice}
          </p>
        )}
        {pending && (
          <section className="task-pending">
            <h2>有一项请求待核对</h2>
            <p>
              {pending.source} · {pending.id} · {pending.action}
              。响应中断时原请求可能已经提交，先核对当前状态。
            </p>
            {mine ? (
              <>
                <button
                  disabled={!current || acting}
                  onClick={() => void send("", {}, true)}
                >
                  重试保留的原请求
                </button>
                <button
                  disabled={!current || acting}
                  onClick={() => {
                    try {
                      sessionStorage.removeItem(pendingKey);
                      setPending(null);
                      setOperationError("");
                    } catch (e) {
                      setOperationError(String(e));
                    }
                  }}
                >
                  已核对状态，结束本次请求
                </button>
              </>
            ) : (
              <a href={pathFor(pending.source, pending.id)}>返回待核对对象</a>
            )}
          </section>
        )}
        {!reading && !error && online && !current && !choices.length && (
          <section className="task-panel">
            <h2>暂无任务或账户</h2>
            <p>
              此服务没有已注册的对象。请通过对应 AQ
              本地入口准备数据；本页不会生成演示结果。
            </p>
          </section>
        )}
        {current && (
          <>
            <TaskOverview {...model} />
            <TaskEvidenceTabs {...model} />
            <section className="task-panel">
              <h2>人工验收备注</h2>
              <p>
                备注只随本次下载保存在本机；不会改变后端验收状态。切换对象会清空未导出备注。
              </p>
              <label>
                备注
                <textarea
                  aria-label="人工验收备注"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="记录发现的问题、对应日期和后续动作"
                  rows={3}
                />
              </label>
              <button onClick={exportEvidence}>下载本次证据与备注</button>
            </section>
          </>
        )}
      </main>
      <footer>
        仅本机 · 后端原始金额与结论 · 不补数据、不重算账本 ·
        独立代理联验不代表人类亲自点击
      </footer>
    </div>
  );
}
