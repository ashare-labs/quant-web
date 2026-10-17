import { useEffect, useRef, useState } from "react";
import {
  api,
  bootstrap,
  verify,
  type Action,
  type Failure,
  type Report,
  type Session,
  type View,
} from "./api";

import { failure, short } from "./presentation";
export function usePaperController() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sid, setSid] = useState("");
  const [day, setDay] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [operationError, setOperationError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("本地人工模拟验收");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [tick, setTick] = useState(0);
  const [at, setAt] = useState("");
  const [newAccount, setNewAccount] = useState("");
  const [policy, setPolicy] = useState("target_then_native_cash_v1");
  const [profiles, setProfiles] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const requestRef = useRef<{ sid: string; path: string; body: Action } | null>(
    null,
  );
  const seq = useRef(0);

  useEffect(() => {
    const changed = () => {
      setOnline(navigator.onLine);
      setView(null);
      setTick((t) => t + 1);
    };
    addEventListener("online", changed);
    addEventListener("offline", changed);
    return () => {
      removeEventListener("online", changed);
      removeEventListener("offline", changed);
    };
  }, []);

  useEffect(() => {
    if (!online || busy) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const version = ++seq.current;
    setLoading(true);
    setView(null);
    (async () => {
      try {
        const list = await bootstrap(controller.signal);
        const policies = await api<Record<string, Record<string, unknown>>>(
          "/risk-profiles",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSessions(list);
        setProfiles(policies);
        if (!sid && list[0]) {
          setSid(list[0].id);
          return;
        }
        if (sid) {
          const result = await api<View>(
            `/sessions/${encodeURIComponent(sid)}/view${day ? `?day=${encodeURIComponent(day)}` : ""}`,
            undefined,
            controller.signal,
          );
          verify(result, sid);
          if (controller.signal.aborted || version !== seq.current) return;
          setView(result);
        }
        setError(null);
        setAt(new Date().toLocaleTimeString());
      } catch (e) {
        if (!controller.signal.aborted && version === seq.current) {
          setError(failure(e));
          setView(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [sid, day, tick, online, busy]);

  async function send(path: string, body: Action, retry = false) {
    if (!view || busy || !online || !reason.trim()) return;
    const saved = retry ? requestRef.current : { sid, path, body };
    if (!saved || saved.sid !== sid) return;
    requestRef.current = saved;
    setBusy(true);
    setView(null);
    setNotice("");
    setError(null);
    setOperationError(null);
    try {
      const result = await api<Report | Record<string, unknown>>(
        saved.path,
        saved.body,
      );
      setNotice(
        "checkpoint_sha256" in result
          ? `请求已确认：${saved.body.day || day} · 检查点 ${short(String(result.checkpoint_sha256))}。同日重复请求复用该结果。`
          : "packet_sha256" in result
            ? `AD 单日收据已确认：${saved.body.day} · ${short(String(result.packet_sha256))}。账户尚须单独推进。`
            : "控制请求已确认。请以重新读取的状态为准。",
      );
      if (saved.body.day)
        setDay(saved.path.endsWith("/ingest") ? "" : saved.body.day);
    } catch (e) {
      setOperationError(failure(e));
    } finally {
      setBusy(false);
      setTick((t) => t + 1);
    }
  }

  async function createSimulation() {
    if (!view || !newAccount.trim() || !profiles[policy] || busy) return;
    setBusy(true);
    setView(null);
    setError(null);
    setOperationError(null);
    setNotice("");
    try {
      const result = await api<{ session_id: string }>(
        `/sessions/${sid}/fork`,
        {
          account_id: newAccount.trim(),
          risk: profiles[policy],
        },
      );
      setSid(result.session_id);
      setDay("");
      setNewAccount("");
      requestRef.current = null;
      setNotice("独立模拟账户已创建，使用同一固定策略与数据，从窗口首日开始。");
    } catch (e) {
      setOperationError(failure(e));
    } finally {
      setBusy(false);
      setTick((t) => t + 1);
    }
  }

  const account = view?.report?.native.account || view?.latest_account;
  const accountDay = view?.report?.day || view?.account_as_of;
  const selected = view?.days.find((d) => d.day === view.selected_day);
  const pending = view?.days.find((d) => d.status !== "committed");
  const receipt = view?.decision?.strategy_receipt;
  const actionable = !!view && online && !loading && !busy && !!reason.trim();
  const delivery = view?.replay?.delivery;
  const observationReady =
    delivery?.observation_admission?.ready ?? delivery?.ad_admission.ready;
  const reviewedContract = delivery?.consumer_contract;
  const impact =
    reviewedContract?.references.order_impact_summary.strategies.find(
      (x) => x.strategy === view?.config.strategy_id,
    );
  const nextReceived =
    !delivery ||
    delivery.received.some((d) => d.day === view?.replay?.next_day);
  const canAdvance =
    actionable &&
    !!view.replay?.next_day &&
    nextReceived &&
    !view.paused &&
    !pending?.recovery_required &&
    pending?.status !== "running";
  const report = view?.report;
  const visibleError = error || operationError;

  return {
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
    reason,
    setReason,
    busy,
    loading,
    online,
    setTick,
    at,
    newAccount,
    setNewAccount,
    policy,
    setPolicy,
    requestRef,
    send,
    createSimulation,
    account,
    accountDay,
    selected,
    pending,
    receipt,
    actionable,
    delivery,
    observationReady,
    reviewedContract,
    impact,
    canAdvance,
    report,
    visibleError,
  };
}
export type PaperController = ReturnType<typeof usePaperController>;
