import { names, short } from "./presentation";
import type { PaperController } from "./usePaperController";
type Props = Pick<
  PaperController,
  | "view"
  | "selected"
  | "delivery"
  | "observationReady"
  | "reviewedContract"
  | "impact"
>;
export function PaperScope({
  view,
  selected,
  delivery,
  observationReady,
  reviewedContract,
  impact,
}: Props) {
  if (!view) return null;
  return (
    <>
      <section>
        <h2>版本、模式与数据范围</h2>
        <div className="paper-facts">
          <div>
            <span>模式</span>
            <strong>
              {view.config.data_mode === "historical_research"
                ? "历史研究重放 · 条件模型"
                : "合成演练"}
            </strong>
            <small>
              {view.replay?.clock_basis || "synthetic_clock"} · 非在线新鲜度证明
            </small>
          </div>
          <div>
            <span>策略</span>
            <strong>
              {names[view.config.strategy_id || ""] || "外部冻结目标"}
            </strong>
            <code title={view.config.strategy_version}>
              {short(view.config.strategy_version)}
            </code>
          </div>
          <div>
            <span>数据版本</span>
            <strong>
              {view.replay?.producer.name || "synthetic"}{" "}
              {view.replay?.producer.version || ""}
            </strong>
            <code title={view.replay?.binding.input_sha256}>
              {short(
                view.replay?.binding.input_sha256 ||
                  view.decision?.data_manifest_sha256,
              )}
            </code>
          </div>
          <div>
            <span>任务状态</span>
            <strong>
              {view.paused
                ? "已暂停"
                : selected
                  ? names[selected.status] || selected.status
                  : "等待首次推进"}
            </strong>
            <small>
              已提交至 {view.last_day || "尚无"} · 下日{" "}
              {view.replay?.next_day || "—"}
            </small>
          </div>
        </div>
        <p>
          账户 <code>{view.config.account_id}</code> · 会话{" "}
          <code>{view.session_id}</code>
          <br />
          检查点 <code>{view.head || "尚无已提交检查点"}</code>
        </p>
        {delivery && (
          <div>
            <p>
              <strong>
                AD 整窗准入：
                {delivery.ad_admission.ready
                  ? "通过 · 已显式接受研究模型"
                  : "未通过 · 未知状态保留"}
              </strong>
              <br />
              已接收 {delivery.received.length} 日；下一数据日{" "}
              {delivery.next_input_day || "窗口已接收完"}；来源版本{" "}
              <code>{short(delivery.source_sha256)}</code>
              。从封存历史来源逐日交付，未接入在线行情。
            </p>
            {reviewedContract && (
              <p>
                消费 API {reviewedContract.contract.api_version}
                ；数据生产版本{" "}
                {reviewedContract.contract.immutable_data_producer_version}
                ，原行情 binding 未变。
                <br />
                本日观察输入：
                {observationReady
                  ? "可接收；无订单观察仅告警"
                  : "拒绝；全局模型或覆盖不满足"}
                。每个新目标订单须取得本日、该证券和方向的单笔许可；观察通过不授予订单或整窗许可。
                <br />
                当前冻结订单许可 {view.decision?.order_admissions?.length ??
                  0}{" "}
                项。
                {impact && view.replay?.binding.window.id === "w2024" && (
                  <>
                    固定历史订单影响分析：本策略涉及{" "}
                    {impact.unresolved_status_orders}{" "}
                    笔未知状态订单；该统计不是当前账户未来订单许可，5%/10%敏感性一致也不补齐未知字段。
                  </>
                )}
              </p>
            )}
            <details>
              <summary>查看逐日数据收据与实际接收时间</summary>
              <pre>{JSON.stringify(delivery.received, null, 2)}</pre>
            </details>
          </div>
        )}
        {view.replay && (
          <details>
            <summary>查看来源、假设、冻结风险与版本</summary>
            <p>
              范围：{view.replay.binding.window.id} ·{" "}
              {view.replay.binding.window.start}～
              {view.replay.binding.window.end}；状态：
              {view.replay.state_mode}
            </p>
            <p>
              AD binding：
              <code>{view.replay.owner_binding_sha256 || "合成输入"}</code>
            </p>
            <ul>
              {view.replay.limitations.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <ul>
              {view.replay.assumptions.map((x) => (
                <li key={x.id}>
                  {x.id}：{x.text}
                </li>
              ))}
            </ul>
            <pre>
              {JSON.stringify(
                {
                  risk: view.config.risk,
                  strategy_version: view.config.strategy_version,
                  manifest: view.config.scenario_manifest_sha256,
                  identity: view.identity,
                },
                null,
                2,
              )}
            </pre>
          </details>
        )}
      </section>
    </>
  );
}
