import { useEffect, useRef, useState } from "react";
import { errorText } from "../../shared/http";
import { api as paper, type Action } from "../paper/api";
import { tasks } from "./api";
import { pendingMatches } from "./evidence.ts";
import {
  readIndex,
  readSnapshot,
  sourcePin,
  type Choice,
  type Snapshot,
  type Source,
} from "./snapshots";

import { pathFor, sources } from "./TaskUi";
type Pending = {
  source: Source;
  id: string;
  pin: string;
  action: string;
  body: Action | Record<string, never>;
};
export const pendingKey = "quant-web.tasks.pending.v3";
function savedPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
    if (
      !value ||
      !["paper", "daily"].includes(value.source) ||
      !["pause", "resume", "ingest", "advance", "cancel"].includes(value.action)
    )
      return null;
    if (!pendingMatches(value, value.source, value.id, sourcePin(value.source)))
      return null;
    return value;
  } catch {
    return null;
  }
}

export function useTasksController(route: string) {
  const parts = route.split("/");
  const source: Source = Object.hasOwn(sources, parts[2])
    ? (parts[2] as Source)
    : "daily";
  let id = "";
  try {
    id = decodeURIComponent(parts[3] || "");
  } catch {
    /* Invalid routes remain unselected. */
  }
  const detailRoute = parts[4] === "details";
  const [choices, setChoices] = useState<Choice[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(true);
  const [acting, setActing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0);
  const [at, setAt] = useState("");
  const [day, setDay] = useState("");
  const [tab, setTab] = useState("overview");
  const [reason, setReason] = useState("本地操作");
  const [pending, setPending] = useState<Pending | null>(savedPending);
  const [notes, setNotes] = useState("");
  const generation = useRef(0),
    readLock = useRef(false),
    actionLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const changed = () => {
      generation.current++;
      controller.current?.abort();
      setSnapshot(null);
      setAt("");
      setOnline(navigator.onLine);
      setRevision((v) => v + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") changed();
    };
    addEventListener("online", changed);
    addEventListener("offline", changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      removeEventListener("online", changed);
      removeEventListener("offline", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    setDay("");
    setNotes("");
    setOperationError("");
    setNotice("");
  }, [source, id]);
  useEffect(() => {
    setTab(detailRoute && source === "daily" ? "details" : "overview");
  }, [source, id, detailRoute]);
  useEffect(() => {
    const token = ++generation.current;
    const request = new AbortController();
    controller.current = request;
    setSnapshot(null);
    setChoices([]);
    setAt("");
    setError("");
    setReading(online && !acting);
    if (!online || acting) return () => request.abort();
    readLock.current = true;
    (async () => {
      try {
        const index = await readIndex(source, request.signal);
        if (request.signal.aborted || token !== generation.current) return;
        setChoices(index.choices);
        if (source === "paper" && !id && index.choices[0]) {
          location.replace(pathFor(source, index.choices[0].id));
          return;
        }
        const value = id
          ? await readSnapshot(source, id, index, request.signal)
          : null;
        if (request.signal.aborted || token !== generation.current) return;
        setSnapshot(value);
        setDay((previous) =>
          value?.points.some((p) => p.day === previous)
            ? previous
            : value?.points.at(-1)?.day || "",
        );
        setAt(new Date().toISOString());
      } catch (e) {
        if (!request.signal.aborted && token === generation.current) {
          setSnapshot(null);
          setChoices([]);
          setError(errorText(e));
        }
      } finally {
        if (token === generation.current) {
          readLock.current = false;
          setReading(false);
        }
      }
    })();
    return () => request.abort();
  }, [source, id, revision, online, acting]);

  function refresh() {
    if (readLock.current || actionLock.current || !online) return;
    readLock.current = true;
    controller.current?.abort();
    generation.current++;
    setSnapshot(null);
    setAt("");
    setReading(true);
    setRevision((v) => v + 1);
  }
  const current =
    online &&
    !reading &&
    !acting &&
    !error &&
    snapshot?.source === source &&
    snapshot.id === id
      ? snapshot
      : null;
  const mine = pendingMatches(pending, source, id, sourcePin(source));
  async function send(
    action: string,
    body: Action | Record<string, never>,
    retry = false,
  ) {
    if (actionLock.current || !current || !online || (pending && !retry))
      return;
    const request = retry
      ? pending
      : { source, id, pin: sourcePin(source), action, body };
    if (!request || !pendingMatches(request, source, id, sourcePin(source)))
      return;
    actionLock.current = true;
    generation.current++;
    controller.current?.abort();
    setSnapshot(null);
    setActing(true);
    setOperationError("");
    setNotice("");
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(request));
      setPending(request);
      if (source === "paper")
        await paper(
          `/sessions/${encodeURIComponent(id)}/${request.action}`,
          request.body,
        );
      else
        await tasks(
          `/jobs/${encodeURIComponent(id)}/${request.action}`,
          request.body,
        );
      sessionStorage.removeItem(pendingKey);
      if (mounted.current) {
        setPending(null);
        setNotice(
          "请求已确认。以下状态以随后重新读取为准；已提交成交不会因取消或暂停而撤销。",
        );
      }
    } catch (e) {
      if (mounted.current) setOperationError(errorText(e));
    } finally {
      actionLock.current = false;
      if (mounted.current) {
        setActing(false);
        setRevision((v) => v + 1);
      }
    }
  }
  function exportEvidence() {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schema: "quant-web.task-snapshot.v1",
              source,
              source_pin: sourcePin(source),
              read_at: at,
              id,
              human_ui_accepted: false,
              human_notes: notes,
              evidence: current.raw,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `task-snapshot-${source}-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selected = current?.points.find((p) => p.day === day);
  const previous =
    current?.points[(current?.points.findIndex((p) => p.day === day) ?? 0) - 1];
  const view = current?.paper;
  const report = current?.reports?.find((r) => r.day === day);
  const delivery = view?.replay?.delivery;
  const waiting = view?.days.find((d) => d.status !== "committed");
  const canAct = !!current && !pending;
  const canPaperAct = canAct && !!reason.trim();
  const next = view?.replay?.next_day;
  const body = (date?: string): Action => ({
    reason: reason.trim(),
    expected_parent: view?.head ?? null,
    ...(date ? { day: date } : {}),
  });
  const labels = [
    ["overview", "曲线与逐日记录"],
    ...(current?.result ? [["orders", "订单与拒单"]] : []),
    ["fills", "逐笔成交"],
    ["positions", "持仓变化"],
    ["comparison", "双端差异"],
    ["gaps", "数据与证据"],
    ...(current?.taskLogs ? [["details", "任务参数与日志"]] : []),
  ];

  return {
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
    setDay,
    tab,
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
    selected,
    previous,
    view,
    report,
    delivery,
    waiting,
    canAct,
    canPaperAct,
    next,
    body,
    labels,
  };
}
export type TasksController = ReturnType<typeof useTasksController>;
