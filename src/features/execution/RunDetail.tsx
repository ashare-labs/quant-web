import { useCallback, useRef, useState } from "react";
import { time } from "../../shared/format.ts";
import { usePoll } from "../../shared/usePoll";
import { cancelRun, errorText, readRunDetail } from "./api";
import { RunProjection } from "./RunProjection";

import { Badge, Empty, ErrorBox } from "./ExecutionUi";
import { isActive, statuses } from "./model";
export function RunDetail({
  id,
  enabled,
  onChange,
}: {
  id: string;
  enabled: boolean;
  onChange: () => void;
}) {
  const load = useCallback(() => readRunDetail(id), [id]);
  const detail = usePoll(load);
  const [tab, setTab] = useState("account");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const data = detail.data,
    run = data?.state.run;
  async function cancel() {
    if (
      !run ||
      !isActive(run) ||
      run.cancel_requested_at ||
      !enabled ||
      detail.error ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await cancelRun(id);
      setMessage(
        result.cancel_requested_at && isActive(result)
          ? "取消请求已记录。仍占用账户，等待停止写者和最终对账。"
          : `后端返回：${statuses[result.status]}（${result.status}）。请核对 projection_complete 与冻结回执。`,
      );
      detail.refresh();
      onChange();
    } catch (e) {
      setError(errorText(e));
      detail.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const state = data?.state,
    manifest = data?.manifest;
  return (
    <section className="panel detail">
      <div className="section-head">
        <div>
          <span className="kicker">02 / 运行详情</span>
          <h2>{run ? <Badge status={run.status} /> : "读取运行"}</h2>
          <code>{id}</code>
        </div>
        <a href="#/execution/runs">返回列表</a>
      </div>
      <ErrorBox text={detail.error} />
      {detail.error && (
        <p className="notice">
          此处保留的投影可能过期；恢复连接前停止操作已禁用。
        </p>
      )}
      <ErrorBox text={error} />
      {message && (!run || isActive(run)) && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="toolbar">
        <button
          disabled={
            !run ||
            !isActive(run) ||
            !!run.cancel_requested_at ||
            !enabled ||
            !!detail.error ||
            busy
          }
          onClick={cancel}
        >
          {busy
            ? "正在请求取消…"
            : run?.cancel_requested_at && isActive(run)
              ? run.native_reconcile_only
                ? "取消已请求 · 需人工对账"
                : "取消已请求 · 等待对账"
              : "停止运行"}
        </button>
        <button disabled title="固定后端没有暂停 API">
          暂停（未实现）
        </button>
        <button disabled title="固定后端没有恢复 API">
          恢复（未实现）
        </button>
        <button onClick={detail.refresh} disabled={detail.loading}>
          刷新详情
        </button>
      </div>
      {detail.loading && <Empty>正在读取状态、日志和 manifest…</Empty>}
      {run?.status === "queued" && !run.error && !run.cancel_requested_at && (
        <p className="notice">
          已持久入队，等待固定环境的独立 worker；页面本身不执行引擎。
        </p>
      )}
      {run && !isActive(run) && (
        <p className="notice">
          该任务已到终态，停止按钮不可用。完成只代表本次合成数据运行完成，须结合原生回执核对，不代表真实市场验收通过。
        </p>
      )}
      {run?.cancel_requested_at && (
        <p className="notice">
          取消请求时间：{time(run.cancel_requested_at)}
          。取消不撤销已提交成交、不清仓；请检查冻结结果和最终对账状态。
        </p>
      )}
      {state && !state.projection_complete && (
        <div role="status" className="notice">
          <strong>投影尚未完成最终对账</strong> · 当前空账户 /
          零成交不能证明原生没有交易。保持只读，等待正确 worker 或人工只读对账。
        </div>
      )}
      {run?.native_reconcile_only && isActive(run) && (
        <div role="status" className="notice">
          <strong>需人工只读对账</strong> · 普通 worker
          不自动重跑，即使已有取消请求。请由操作员使用固定环境的 worker --run-id
          处理，浏览器不新增恢复动作。
        </div>
      )}
      {run?.error && <ErrorBox text={`后端运行错误 · ${run.error}`} />}
      {state && manifest && (
        <>
          <dl className="run-meta">
            <div>
              <dt>最后读取</dt>
              <dd>{time(detail.at)}</dd>
            </div>
            <div>
              <dt>逻辑时钟 / 交易日</dt>
              <dd>
                {time(state.logical_at)} / {state.trading_day || "—"}
              </dd>
            </div>
            <div>
              <dt>提交游标 / 最终投影</dt>
              <dd>
                {run?.cursor} · projection_complete=
                {String(state.projection_complete)}
              </dd>
            </div>
            <div>
              <dt>取消 / 对账要求</dt>
              <dd>
                {run?.cancel_requested_at
                  ? time(run.cancel_requested_at)
                  : "未请求取消"}{" "}
                · reconciliation_required={String(run?.reconciliation_required)}
              </dd>
            </div>
            <div>
              <dt>真值来源</dt>
              <dd>
                {state.truth_source} · is_test_double=
                {String(state.is_test_double)} · 数据={state.data_evidence_kind}
              </dd>
            </div>
          </dl>
          <div className="tabs" role="tablist">
            {[
              ["account", "账户与持仓"],
              ["orders", `订单 ${state.orders.length}`],
              ["fills", `成交 ${state.fills.length}`],
              ["events", "原生事件"],
              ["execution", "执行与恢复"],
              ["receipt", "完成回执"],
              ["logs", "日志与错误"],
              ["manifest", "Manifest / 数据"],
            ].map(([v, label]) => (
              <button
                role="tab"
                aria-selected={tab === v}
                key={v}
                onClick={() => setTab(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <RunProjection data={data} id={id} tab={tab} />
        </>
      )}
    </section>
  );
}
