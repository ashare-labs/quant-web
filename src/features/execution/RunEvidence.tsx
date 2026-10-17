import { useCallback, useState } from "react";
import { time } from "../../shared/format.ts";
import { usePoll } from "../../shared/usePoll";
import { ApiError, readRunEvents, readRunReceipt } from "./api";

import { Empty, ErrorBox, Json, Pairs } from "./ExecutionUi";
import { record } from "./model";
export function EventsPanel({ id }: { id: string }) {
  const [after, setAfter] = useState(0);
  const load = useCallback(() => readRunEvents(id, after), [id, after]);
  const events = usePoll(load);
  return (
    <>
      <p className="notice">
        已提交的引擎事件投影，可能暂时落后于原生
        checkpoint。拒绝消息保留原文；无订单的拒绝不创建订单。
      </p>
      <div className="toolbar">
        <button
          onClick={() => {
            setAfter(0);
            events.refresh();
          }}
        >
          从首批刷新事件
        </button>
        <button
          disabled={!events.data?.has_more || events.loading || !!events.error}
          onClick={() => events.data && setAfter(events.data.next_after)}
        >
          下一批事件
        </button>
        <span>
          after={after} · limit=25 · next_after={events.data?.next_after ?? "—"}
        </span>
      </div>
      <ErrorBox text={events.error} />
      {events.loading && <Empty>正在读取事件…</Empty>}
      {events.data?.items.length === 0 && (
        <Empty>暂无已提交事件；不会用人工预期补齐。</Empty>
      )}
      {events.data?.items.map((e) => (
        <details className="event" key={e.sequence}>
          <summary>
            #{e.sequence} · {time(e.logical_at)} · {e.kind} · {e.message}
          </summary>
          <Pairs
            value={{
              trading_day: e.trading_day,
              cash: e.account.cash,
              frozen_cash: e.account.frozen_cash,
              equity: e.account.equity,
            }}
          />
          <Json value={e} />
        </details>
      ))}
    </>
  );
}
export function ReceiptPanel({ id, engine }: { id: string; engine: string }) {
  const load = useCallback(async () => {
    if (engine !== "rqalpha")
      return {
        note: "该运行使用 fixture 测试替身，没有原生 RQAlpha 完成回执。",
        receipt: undefined,
      };
    try {
      return { note: undefined, receipt: await readRunReceipt(id) };
    } catch (e) {
      if (e instanceof ApiError && e.code === "RECEIPT_NOT_READY")
        return { note: `${e.code} · ${e.message}`, receipt: undefined };
      throw e;
    }
  }, [id, engine]);
  const result = usePoll(load);
  return (
    <>
      <p className="notice">
        原生冻结结果 / 完成回执。取消后可能只有部分冻结快照；以
        host_reconciliation.native_complete 为准。manifest
        不能代替完成证据，真实市场 / paper 未准入。
      </p>
      <ErrorBox text={result.error} />
      {result.loading && <Empty>正在读取完成回执…</Empty>}
      {result.data?.note && (
        <p role="status" className="notice">
          {result.data.note}
        </p>
      )}
      {result.data?.receipt && (
        <>
          <h3>冻结 / 对账信息</h3>
          <Pairs value={record(result.data.receipt.host_reconciliation)} />
          <p className="notice">
            {record(result.data.receipt.host_reconciliation).native_complete ===
            false
              ? "部分冻结快照：原生输入未全部执行，不得当作完整策略运行。"
              : record(result.data.receipt.host_reconciliation)
                    .native_complete === true
                ? "完整原生结果；全部输入仍为合成数据。"
                : "未提供完整性确认；保留后端原始字段。"}
          </p>
          <Json value={result.data.receipt} />
        </>
      )}
      <button onClick={result.refresh}>刷新回执</button>
    </>
  );
}
