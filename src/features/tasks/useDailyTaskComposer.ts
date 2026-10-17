import { useEffect, useRef, useState } from "react";
import { canonical } from "../../shared/format.ts";
import { errorText } from "../../shared/http";
import { parseJson } from "../../shared/json.ts";
import { taskPin, taskSchema, taskService, tasks, type Task } from "./api";
import { createRequest } from "./parameters.ts";

type Catalogue = Task<"JobCatalogue">;
type Strategy = Task<"M2StrategyVersion">;
type Pending = { source: string; request: Task<"JobCreate"> };
export const pendingKey = "quant-web.tasks.create.v1";
function savedRequest(): Pending | null {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
    return pending?.source === taskPin.source_sha256 &&
      /^[A-Za-z0-9_-]{1,96}$/.test(pending.request?.idempotency_key)
      ? pending
      : null;
  } catch {
    return null;
  }
}
async function readCatalogue(signal?: AbortSignal) {
  taskSchema(await tasks("/openapi.json", undefined, signal));
  const catalogue = await tasks<Catalogue>(
    "/jobs/catalogue",
    undefined,
    signal,
  );
  taskService(catalogue.service_identity);
  return catalogue;
}
export function useDailyTaskComposer(online: boolean) {
  const [pending, setPending] = useState(savedRequest);
  const saved = pending?.request,
    parameters = saved?.parameters;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [windowId, setWindowId] = useState(saved?.window_id || "");
  const [end, setEnd] = useState(saved?.end_date || "");
  const [name, setName] = useState(saved?.name || "日频回测");
  const [cash, setCash] = useState(parameters?.initial_cash || "10000");
  const [shares, setShares] = useState(
    parameters && "target_shares" in parameters
      ? String(parameters.target_shares)
      : "100",
  );
  const [enter, setEnter] = useState(
    parameters && "enter_below" in parameters ? parameters.enter_below : "12.5",
  );
  const [exit, setExit] = useState(
    parameters && "exit_above" in parameters ? parameters.exit_above : "12.55",
  );
  const [template, setTemplate] = useState<string>(
    parameters?.template || "previous_close_band.v1",
  );
  const [strategy, setStrategy] = useState(
    parameters && "strategy_version_id" in parameters
      ? parameters.strategy_version_id
      : "",
  );
  const [pythonParameters, setPythonParameters] = useState(
    parameters && "strategy_parameters" in parameters
      ? JSON.stringify(parameters.strategy_parameters)
      : "{}",
  );
  const [dataset, setDataset] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setCatalogue(null);
    setAck(false);
    if (online) {
      setBusy(true);
      Promise.all([
        readCatalogue(abort.signal),
        tasks<Strategy[]>("/strategies", undefined, abort.signal),
        tasks<Strategy[]>("/python-strategies", undefined, abort.signal),
      ])
        .then(([next, rules, python]) => {
          if (abort.signal.aborted) return;
          setCatalogue(next);
          setStrategies([...rules, ...python]);
          setError("");
          setWindowId((previous) =>
            next.windows.some((item) => item.scope.window_id === previous)
              ? previous
              : next.windows[0]?.scope.window_id || "",
          );
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(errorText(e));
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }
    return () => abort.abort();
  }, [online, revision]);
  const selected = catalogue?.windows.find(
    (item) => item.scope.window_id === windowId,
  );
  useEffect(() => {
    if (!pending) {
      setAck(false);
      setEnd("");
    }
  }, [windowId, pending]);
  const choices = strategies.filter(
    (item) =>
      item.definition.template ===
      (template === "registered_python.v1"
        ? "trusted_python_decision.v1"
        : "decision_rules.v1"),
  );
  const disabled = !online || busy || !!pending;
  async function bind() {
    if (lock.current || disabled || !/^[a-f0-9]{64}$/.test(dataset)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setAck(false);
    try {
      await readCatalogue();
      const next = await tasks<Catalogue>("/data/bind", {
        dataset_id: dataset,
      });
      taskService(next.service_identity);
      if (mounted.current) {
        setCatalogue(next);
        setRevision((value) => value + 1);
      }
    } catch (e) {
      if (mounted.current) {
        setCatalogue(null);
        setError(`${errorText(e)} 请重新读取目录核对绑定状态。`);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(retry = false) {
    if (lock.current || !online || busy || (!retry && (!catalogue || pending)))
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const fresh = await readCatalogue();
      let frozen = pending;
      if (!retry) {
        if (canonical(fresh) !== canonical(catalogue)) {
          setCatalogue(fresh);
          setAck(false);
          throw new Error("目录发生变化，请重新选择并确认当前假设。");
        }
        if (
          template !== "previous_close_band.v1" &&
          !choices.some((item) => item.version_id === strategy)
        )
          throw new Error("请选择当前目录中的已注册策略。");
        if (
          template === "previous_close_band.v1" &&
          !/^[1-9][0-9]*$/.test(shares)
        )
          throw new Error("目标股数须为不带空白、指数或小数的正整数。");
        const parameters = {
          template,
          security: "600000.XSHG",
          frequency: "1d",
          initial_cash: cash,
          target_shares: Number(shares),
          enter_below: enter,
          exit_above: exit,
          strategy_version_id: strategy,
          strategy_parameters:
            template === "registered_python.v1"
              ? parseJson(pythonParameters)
              : {},
        };
        const request = createRequest(
          fresh,
          {
            window_id: windowId,
            end_date: end,
            name,
            acknowledged: ack,
            parameters,
          },
          `web-${crypto.randomUUID()}`,
        );
        frozen = { source: taskPin.source_sha256, request };
        // Persist the exact request before sending. Storage failure must prevent submission.
        sessionStorage.setItem(pendingKey, JSON.stringify(frozen));
        setPending(frozen);
      }
      if (!frozen || frozen.source !== taskPin.source_sha256)
        throw new Error("待核对请求的来源身份不匹配。");
      const job = await tasks<Task<"JobView">>("/jobs", frozen.request);
      if (
        job.contract_version !== taskPin.contract_version ||
        !/^m2job-[a-f0-9]{32}$/.test(job.job_id) ||
        canonical(job.request) !== canonical(frozen.request)
      )
        throw new Error("创建响应与原请求不一致，请保留原请求核对。");
      sessionStorage.removeItem(pendingKey);
      if (mounted.current) {
        setPending(null);
        location.hash = `/tasks/daily/${job.job_id}`;
      }
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    pending,
    setPending,
    catalogue,
    windowId,
    setWindowId,
    end,
    setEnd,
    name,
    setName,
    cash,
    setCash,
    shares,
    setShares,
    enter,
    setEnter,
    exit,
    setExit,
    template,
    setTemplate,
    strategy,
    setStrategy,
    pythonParameters,
    setPythonParameters,
    dataset,
    setDataset,
    ack,
    setAck,
    error,
    busy,
    setRevision,
    selected,
    choices,
    disabled,
    bind,
    submit,
  };
}
