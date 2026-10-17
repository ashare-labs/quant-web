import { short } from "./presentation";
import type { PaperController } from "./usePaperController";
type Props = Pick<
  PaperController,
  | "sessions"
  | "sid"
  | "day"
  | "view"
  | "notice"
  | "reason"
  | "setReason"
  | "busy"
  | "newAccount"
  | "setNewAccount"
  | "policy"
  | "setPolicy"
  | "requestRef"
  | "send"
  | "createSimulation"
  | "selected"
  | "pending"
  | "actionable"
  | "delivery"
  | "observationReady"
  | "canAdvance"
>;
export function PaperControls({
  sessions,
  sid,
  day,
  view,
  notice,
  reason,
  setReason,
  busy,
  newAccount,
  setNewAccount,
  policy,
  setPolicy,
  requestRef,
  send,
  createSimulation,
  selected,
  pending,
  actionable,
  delivery,
  observationReady,
  canAdvance,
}: Props) {
  if (!view) return null;
  return (
    <>
      <section>
        <h2>单日操作与恢复</h2>
        <p>
          只推进固定下一日；已提交日重复返回原结果。修改数据、策略或风控需新建会话。
        </p>
        <p>
          <strong>
            风险模式：
            {view.config.risk.profile === "target_then_native_cash_v1"
              ? "日频模拟 v1 · 前收目标约束 + 原生逐单现金"
              : "保守测试 · 涨停价预算"}
          </strong>
          <br />
          目标总仓位 {view.config.risk.max_gross} · 目标单股{" "}
          {view.config.risk.max_single} · 双边换手{" "}
          {view.config.risk.max_turnover} · 现金底线{" "}
          {view.config.risk.cash_buffer}
          。卖出仅在真实成交后释放现金，买入费用一并验资。
        </p>
        <label>
          操作原因
          <input
            aria-label="操作原因"
            value={reason}
            maxLength={1024}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="paper-actions">
          {delivery && (
            <button
              disabled={
                !actionable ||
                !delivery.next_input_day ||
                !observationReady ||
                delivery.next_input_day !== view.replay?.next_day ||
                view.paused
              }
              onClick={() =>
                send(`/sessions/${sid}/ingest`, {
                  reason,
                  day: delivery.next_input_day!,
                  expected_parent: view.head,
                })
              }
            >
              接收 {delivery.next_input_day || "下一日"} 数据
            </button>
          )}
          <button
            disabled={!canAdvance}
            onClick={() =>
              send(`/sessions/${sid}/advance`, {
                reason,
                day: view.replay!.next_day!,
                expected_parent: view.head,
              })
            }
          >
            推进 {view.replay?.next_day || "下一日"}
          </button>
          <button
            disabled={!actionable || view.paused}
            onClick={() =>
              send(`/sessions/${sid}/pause`, {
                reason,
                expected_parent: view.head,
              })
            }
          >
            暂停
          </button>
          <button
            disabled={
              !actionable || (!view.paused && !pending?.recovery_required)
            }
            onClick={() =>
              send(`/sessions/${sid}/resume`, {
                reason,
                expected_parent: view.head,
              })
            }
          >
            恢复冻结日
          </button>
          <button
            disabled={
              !actionable || !view.decision || !selected || !view.replay
            }
            onClick={() =>
              send(`/sessions/${sid}/advance`, {
                reason,
                day: selected!.day,
                expected_parent: view.decision!.expected_parent,
              })
            }
          >
            重复提交选定日
          </button>
          <button
            disabled={!actionable || requestRef.current?.sid !== sid}
            onClick={() => send("", { reason, expected_parent: null }, true)}
          >
            重试上次原请求
          </button>
        </div>
        {selected && (
          <p>
            选定日 {selected.day} · 原生尝试 {selected.attempts} 次 ·{" "}
            {selected.recovery_required ? "需要显式恢复" : "无需恢复"} · 意图{" "}
            <code>{short(selected.intent_id)}</code>
          </p>
        )}
        {selected?.error && (
          <div className="paper-error" role="alert">
            <strong>
              {selected.error.code} · {selected.error.message}
            </strong>
            <p>{selected.error.detail}</p>
            <p>{selected.error.next_action}</p>
          </div>
        )}
        {view.replay && view.replay.preflight.gaps.length > 0 && (
          <div
            className={
              view.replay.preflight.ready ? "paper-notice" : "paper-error"
            }
          >
            {view.replay.preflight.ready ? "观察告警" : "来源数据缺口"}：
            {view.replay.preflight.gaps.length}{" "}
            项。未知字段不能默认值补齐；实际订单需要的字段仍严格核验。
            <pre>
              {JSON.stringify(view.replay.preflight.gaps.slice(0, 3), null, 2)}
            </pre>
            <details>
              <summary>完整缺口清单</summary>
              <pre>{JSON.stringify(view.replay.preflight.gaps, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
      {view.replay && (
        <section>
          <h2>新建独立模拟账户</h2>
          <p>复用当前固定策略和数据，从窗口首日开始；已有账户不修改。</p>
          <div className="paper-toolbar">
            <label>
              新账户名称
              <input
                aria-label="新账户名称"
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                placeholder="例如 review-trend-2024"
                maxLength={96}
              />
            </label>
            <label>
              模拟风险配置
              <select
                aria-label="模拟风险配置"
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="target_then_native_cash_v1">
                  日频模拟 v1 · 98%目标、逐单验资
                </option>
                <option value="conservative_v1">保守测试 · 单笔5万元</option>
              </select>
            </label>
            <button
              disabled={!actionable || !newAccount.trim()}
              onClick={createSimulation}
            >
              创建模拟账户
            </button>
          </div>
        </section>
      )}
    </>
  );
}
