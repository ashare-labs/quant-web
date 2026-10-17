import { PaperControls } from "./PaperControls";
import { PaperEvidence } from "./PaperEvidence";
import { PaperScope } from "./PaperScope";
import { pin } from "./api";
import "./paper.css";

import { names, short } from "./presentation";
import { usePaperController } from "./usePaperController";
export function PaperPage() {
  const model = usePaperController();
  const {
    sessions,
    sid,
    setSid,
    day,
    setDay,
    view,
    setView,
    setOperationError,
    notice,
    setNotice,
    busy,
    loading,
    online,
    setTick,
    at,
    requestRef,
    visibleError,
  } = model;
  return (
    <div className="paper-page">
      <div className="paper-boundary">
        <strong>本地模拟验收 · 真实持续模拟未通过</strong>
        <span>
          明确历史来源逐日接收 /
          研究模型。历史送达与实际分红到账时刻仍未知；独立人类验收待完成。
        </span>
      </div>
      <header>
        <div>
          <h1>连续模拟</h1>
          <p>策略 → 冻结收据 → 单日原生执行 → 同一账户续接</p>
        </div>
        <a href="#/tasks">任务与结果</a>
        <a href="#/portfolio">组合回测</a>
      </header>
      <main>
        <section className="paper-toolbar">
          <label>
            本机会话
            <select
              aria-label="本机会话"
              value={sid}
              disabled={busy || loading}
              onChange={(e) => {
                setView(null);
                setSid(e.target.value);
                setDay("");
                setNotice("");
                setOperationError(null);
                requestRef.current = null;
              }}
            >
              <option value="">选择会话</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.config.account_id} ·{" "}
                  {names[s.config.strategy_id || ""] || "外部冻结目标"}
                </option>
              ))}
            </select>
          </label>
          <label>
            模拟日
            <select
              aria-label="模拟日"
              value={day}
              disabled={busy || loading || !view}
              onChange={(e) => {
                setView(null);
                setDay(e.target.value);
              }}
            >
              <option value="">最近一日</option>
              {view?.days.map((d) => (
                <option key={d.day} value={d.day}>
                  {d.day} · {names[d.status] || d.status}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={busy || !online}
          >
            重新读取
          </button>
          <span role="status">
            {!online
              ? "浏览器离线"
              : busy
                ? "本地执行中…"
                : loading
                  ? "核验服务和证据…"
                  : view
                    ? `已核验 · ${at}`
                    : "等待会话"}
            <small>
              源码 {short(pin.source_sha256)} · {pin.contract_version}
            </small>
          </span>
        </section>
        {!online && (
          <div className="paper-error" role="alert">
            浏览器离线。账户和报告已隐藏，所有提交已禁用。重新连接后核验同一会话。
          </div>
        )}
        {visibleError && (
          <div className="paper-error" role="alert">
            <strong>
              {visibleError.code} · {visibleError.message}
            </strong>
            <p>{visibleError.detail}</p>
            <p>{visibleError.next_action}</p>
          </div>
        )}
        {notice && (
          <div className="paper-notice" role="status">
            {notice}
          </div>
        )}
        {!sid && !loading && (
          <section>
            <h2>暂无本机会话</h2>
            <p>
              先使用 AQ
              本地入口导入固定题面与来源包，或创建合成会话。此页面读取已注册数据，不连接行情账户。
            </p>
          </section>
        )}
        {view && (
          <>
            <PaperScope {...model} />
            <PaperControls {...model} />
            <PaperEvidence {...model} />
          </>
        )}
      </main>
      <footer>
        仅本机模拟 · 金额保留原始精度 · AQ 唯一原生账本 ·
        风控和到账假设按会话冻结
      </footer>
    </div>
  );
}
