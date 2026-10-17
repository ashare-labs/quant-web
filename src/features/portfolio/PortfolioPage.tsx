import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  readPortfolio,
  readDetail,
  request,
  type PortfolioModel,
  type Index,
  type Detail,
  type Job,
  type Strategy,
} from "./api";
import { ApiError, errorText } from "../../shared/http";
import { canonical, money, time } from "../../shared/format.mjs";
import {
  labels,
  canCancel,
  validPortfolioCash as validCash,
  validVolumeRatio,
  restoreOperation,
  completeOperation,
  actionSatisfied,
} from "./state.mjs";
import { StrategyEditor } from "../strategies/StrategyEditor";
import { PortfolioResults } from "./PortfolioResults";
import { ScopeNote, ResearchAssumptions, ResearchLimitations, algorithmName } from "./PortfolioUi";
import { selectionOf, validatePreflight } from "./evidence.mjs";
import { assertSameService, operationKeyFor } from "./compatibility.mjs";
import "font-awesome/css/font-awesome.css";
import "./portfolio.css";

const base = "#/portfolio";
const draftKey = "quant-web.portfolio.portfolio-draft.v1";
const defaultRules = JSON.stringify({ template: "daily_portfolio.v1", algorithm: "equal-weight" }, null, 2);
type Draft = {
  name: string; code: string; version: string; dataset: string;
  securities: string[]; start: string; end: string; cash: string; volume: string;
  mode: "covered_research" | "price_only_no_limits"; retrospective: boolean;
  ack: string; updatedAt: string;
};
type Operation = {
  pin: string;
  action: "create" | "cancel" | "resume";
  body: PortfolioModel<"PortfolioCreate"> | Record<string, never>;
  jobId?: string;
  attemptCount?: number;
  state: "pending" | "done" | "rejected";
  error?: string;
};
function freshDraft(): Draft {
  return { name: "组合策略", code: defaultRules, version: "", dataset: "", securities: [],
    start: "", end: "", cash: "1000000.00", volume: "", mode: "covered_research",
    retrospective: false, ack: "", updatedAt: "" };
}
function definitionAlgorithm(code: string) {
  try { return JSON.parse(code).algorithm || ""; } catch { return ""; }
}
const short = (s?: string) => (s ? s.slice(0, 12) : "—");
const icon = (name: string) => (
  <i aria-hidden="true" className={`fa fa-${name}`} />
);
function Status({ job }: { job: Job }) {
  return (
    <span className={`qw-status ${job.status}`}>
      {icon(
        job.status === "succeeded"
          ? "check-circle"
          : job.status === "failed"
            ? "exclamation-circle"
            : job.status === "running"
              ? "spinner"
              : "circle-o",
      )}{" "}
      {labels[job.status]}
      {job.recovery_required ? " · 需恢复" : ""}
    </span>
  );
}
function Alert({ children }: { children?: ReactNode }) {
  return children ? (
    <div className="qw-alert" role="alert">
      {children}
    </div>
  ) : null;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="qw-empty">{children}</div>;
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="qw-table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c ?? "—"}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>
                <Empty>暂无记录</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PortfolioPage({ route }: { route: string }) {
  const parts = route.slice(2).split("/"),
    page = parts[1] || "strategies",
    selectedId = page === "results" ? parts[2] || "" : "";
  const tab = parts[3] || "overview";
  const [index, setIndex] = useState<Index | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState("");
  const [reading, setReading] = useState(true),
    [online, setOnline] = useState(navigator.onLine),
    [revision, setRevision] = useState(0),
    [at, setAt] = useState("");
  const [draft, setDraft] = useState<Draft>(freshDraft),
    [storageError, setStorageError] = useState(""),
    [operation, setOperation] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState(""),
    [strategySearch, setStrategySearch] = useState(""),
    [taskSearch, setTaskSearch] = useState("");
  const search = page === "strategies" ? strategySearch : taskSearch;
  const [stateFilter, setStateFilter] = useState("all"),
    [listPage, setListPage] = useState(1),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false);
  const [preflight, setPreflight] = useState<{ source: string; value: PortfolioModel<"PortfolioPreflight"> } | null>(null);
  const [checking, setChecking] = useState(false), [preflightError, setPreflightError] = useState("");
  const [restored, setRestored] = useState(false);
  const [identity, setIdentity] = useState<PortfolioModel<"PortfolioIdentity"> | null>(null);
  const serviceSource = identity?.source_sha256 || "";
  const operationKey = operationKeyFor(serviceSource);
  const [operationSource, setOperationSource] = useState("");
  const lock = useRef(false),
    draftRef = useRef(draft);
  draftRef.current = draft;
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const v = JSON.parse(raw);
        if (
          !v ||
          !["covered_research", "price_only_no_limits"].includes(v.mode) ||
          typeof v.code !== "string" ||
          typeof v.name !== "string" ||
          !Array.isArray(v.securities) || v.securities.some((s: unknown) => typeof s !== "string")
        )
          throw Error("草稿格式无效");
        setDraft({ ...freshDraft(), ...v });
      }
      setRestored(true);
    } catch (e) {
      setStorageError(
        `无法读取本地草稿或请求记录：${String(e)}。已停止提交，请先导出代码并检查站点存储。`,
      );
    }
    const net = () => {
      setOnline(navigator.onLine);
      setIndex(null);
      setDetail(null);
      refresh();
    };
    addEventListener("online", net);
    addEventListener("offline", net);
    return () => {
      removeEventListener("online", net);
      removeEventListener("offline", net);
    };
  }, [refresh]);
  useEffect(() => {
    if (!serviceSource) return;
    setPreflight(null);
    setPreflightError("");
    setActionError("");
    setNotice("");
    setDraft(d => ({ ...d, ack: "" }));
    try {
      setOperation(restoreOperation(localStorage, operationKey, serviceSource));
      setOperationSource(serviceSource);
    } catch (e) { setStorageError(String(e)); }
    const sync = (e: StorageEvent) => {
      if (e.key === operationKey) {
        try {
          setOperation(
            restoreOperation(localStorage, operationKey, serviceSource),
          );
          refresh();
        } catch (e) {
          setStorageError(String(e));
        }
      }
    };
    addEventListener("storage", sync);
    return () => removeEventListener("storage", sync);
  }, [serviceSource, operationKey, refresh]);
  useEffect(() => {
    if (!online) {
      setIndex(null);
      setDetail(null);
      setReading(false);
      return;
    }
    if (busy) {
      setReading(false);
      return;
    }
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setReading(true);
    setIndex(null);
    setDetail(null);
    setError("");
    async function poll() {
      try {
        const fresh = await readPortfolio(controller.signal);
        const next = selectedId
          ? await readDetail(selectedId, fresh.catalogue.service_identity, controller.signal)
          : null;
        if (live) {
          setIdentity(fresh.catalogue.service_identity);
          setIndex(fresh);
          setDetail(next);
          setError("");
          setAt(new Date().toISOString());
        }
      } catch (e) {
        if (live) {
          setIndex(null);
          setDetail(null);
          setError(errorText(e));
        }
      } finally {
        if (live) {
          setReading(false);
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, revision, online, busy]);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      setStorageError(`草稿无法保存：${String(e)}。已停止提交。`);
    }
  }, [draft, restored]);
  useEffect(() => {
    setListPage(1);
  }, [search, stateFilter, page]);
  useEffect(() => {
    if (!index || draft.dataset) return;
    const d = index.catalogue.datasets.find(d => d.action_coverage.status === "source_covered") || index.catalogue.datasets[0];
    if (d) setDraft(v => ({ ...v, dataset: d.dataset_id, start: d.trading_dates[0] || "", end: d.trading_dates.at(-1) || "" }));
  }, [index, draft.dataset]);
  const update = (value: Partial<Draft>) => {
    const changedScope = ["dataset", "securities", "start", "end", "mode", "retrospective"].some(k => k in value);
    if (changedScope) { setPreflight(null); setPreflightError(""); }
    setDraft(d => ({ ...d, ...value, ...(changedScope ? { ack: "" } : {}), updatedAt: new Date().toISOString() }));
  };
  const current = online && !error && !busy && restored && operationSource === serviceSource ? index : null;
  const dataset = index?.catalogue.datasets.find(d => d.dataset_id === draft.dataset);
  const feeModel = index?.catalogue.fee_models.find(f => f.id === "fixed-commission-tax.v1");
  const registered = index?.strategies.find(s => s.version_id === draft.version);
  const matched = registered && safeCanonical(draft.code) === canonical(registered.definition);
  const selection: PortfolioModel<"PortfolioSelection"> = {
    dataset_id: draft.dataset, securities: [...draft.securities].sort(), start_date: draft.start, end_date: draft.end,
    mode: draft.mode, accept_retrospective_state: draft.retrospective,
  };
  const selectionReady = !!dataset && draft.securities.length > 0 && new Set(draft.securities).size === draft.securities.length
    && draft.securities.every(s => dataset.securities.includes(s))
    && dataset.trading_dates.includes(draft.start) && dataset.trading_dates.includes(draft.end) && draft.start <= draft.end;
  const currentPreflight = preflight?.source === serviceSource
    && canonical(preflight.value.selection) === canonical(selection) ? preflight.value : null;
  async function checkSelection() {
    if (!current || !selectionReady || checking) return;
    const checkedSelection = selection;
    setChecking(true); setPreflight(null); setPreflightError(""); update({ack:""});
    try {
      const fresh = await readPortfolio();
      assertSameService(fresh.catalogue.service_identity, current.catalogue.service_identity);
      const value = await request<PortfolioModel<"PortfolioPreflight">>("/preflight", checkedSelection);
      validatePreflight(checkedSelection, value);
      setPreflight({ source: current.catalogue.service_identity.source_sha256, value });
    } catch(e) { setPreflightError(errorText(e)); }
    finally { setChecking(false); }
  }
  const active = detail?.job;
  const persist = (next: Operation) => {
    localStorage.setItem(operationKey, JSON.stringify(next));
    setOperation(next);
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draftRef.current));
      setNotice("草稿已保存在此浏览器。");
    } catch (e) {
      setStorageError(String(e));
    }
  };

  async function registerRules() {
    if (lock.current || !current || storageError) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    try {
      const definition = JSON.parse(draft.code);
      const fresh = await readPortfolio();
      assertSameService(fresh.catalogue.service_identity, current.catalogue.service_identity);
      const version = await request<Strategy>("/strategies", definition);
      if (!fresh.strategies.some((s) => s.version_id === version.version_id))
        setNotice("已注册新策略版本；已有任务保留原版本。");
      else setNotice("此代码已注册，复用同一版本。");
      update({
        version: version.version_id,
        code: JSON.stringify(version.definition, null, 2),
      });
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
      refresh();
    }
  }
  function selectStrategy(s: Strategy, name = `${algorithmName(s.definition.algorithm)}策略`) {
    update({ version: s.version_id, code: JSON.stringify(s.definition, null, 2), name, ack: "" });
    location.hash = `${base}/editor`;
  }
  function editSelectedTask() {
    if (!detail) return;
    const r = detail.job.request;
    selectStrategy(detail.manifest.strategy);
    update({ name:r.name, dataset:r.dataset_id, securities:r.securities, start:r.start_date, end:r.end_date,
      cash:r.initial_cash, volume:r.volume_ratio || "", mode:r.mode, retrospective:r.accept_retrospective_state, ack:"" });
  }
  async function prepareNew() {
    if (!current || operation?.state === "pending" || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!navigator.locks)
        throw Error("浏览器不支持跨标签页请求锁，请使用当前 Chrome。");
      await navigator.locks.request(
        operationKey,
        { ifAvailable: true },
        (guard) => {
          if (!guard) throw Error("另一标签页正在提交，请稍后重新读取。");
          const existing = restoreOperation(
            localStorage,
            operationKey,
            serviceSource,
          );
          if (existing?.state === "pending")
            throw Error("另一标签页有请求待确认，请先核对原请求。");
          localStorage.removeItem(operationKey);
          setOperation(null);
          setActionError("");
          setNotice("已准备新的回测请求。参数与策略版本会重新冻结。");
          location.hash = `${base}/editor`;
        },
      );
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
      refresh();
    }
  }
  async function mutate(action: Operation["action"], retry = false) {
    if (lock.current || !current || storageError) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      if (!navigator.locks)
        throw Error(
          "浏览器不支持跨标签页请求锁，提交已停止。请使用当前 Chrome。",
        );
      await navigator.locks.request(
        operationKey,
        { ifAvailable: true },
        async (guard) => {
          if (!guard) throw Error("另一标签页正在提交同一任务，请稍后刷新。");
          const existing = restoreOperation(
            localStorage,
            operationKey,
            serviceSource,
          ) as Operation | null;
          let op: Operation;
          if (retry) {
            if (!existing || existing.state !== "pending")
              throw Error("没有待确认的请求。");
            op = existing;
          } else {
            if (existing?.state === "pending")
              throw Error("有请求待确认，请先重试原请求。");
            if (action === "create" && existing?.state === "done")
              throw Error("本次回测已提交。请点击“准备新回测”后再创建。");
            if (action === "create") {
              if (!runReady || !currentPreflight?.ready)
                throw Error("请核对版本、证券、日期、资金，并完成本次预检查和假设确认。");
              op = {
                pin: serviceSource,
                action,
                body: {
                  name: draft.name.trim(),
                  idempotency_key: `qw-${crypto.randomUUID()}`,
                  ...selection,
                  contract_version: "portfolio-jobs.v1",
                  strategy_version_id: draft.version,
                  initial_cash: draft.cash,
                  fee_model: "fixed-commission-tax.v1",
                  volume_ratio: draft.volume || null,
                  assumption_ack_sha256: currentPreflight.assumption_ack_sha256,
                },
                state: "pending",
              };
            } else {
              if (!active) throw Error("请先选择任务。");
              op = {
                pin: serviceSource,
                action,
                body: {},
                jobId: active.job_id,
                attemptCount: active.attempt_count,
                state: "pending",
              };
            }
            // Persist before any mutation. A lost response or refresh retains these exact bytes.
            persist(op);
          }
          const fresh = await readPortfolio();
          assertSameService(fresh.catalogue.service_identity, current.catalogue.service_identity);
          if (op.pin !== fresh.catalogue.service_identity.source_sha256)
            throw Error("PORTFOLIO_SERVICE_CHANGED · 原请求属于其他服务，已停止重发。");
          let known =
            op.action === "create"
              ? fresh.jobs.find(
                  (j) =>
                    j.request.idempotency_key ===
                    (op.body as PortfolioModel<"PortfolioCreate">).idempotency_key,
                )
              : fresh.jobs.find((j) => j.job_id === op.jobId);
          if (known && actionSatisfied(op, known)) {
            persist(completeOperation(op, known.job_id));
            location.hash = `${base}/results/${known.job_id}`;
            setNotice("已核对原请求，继续查看同一任务。");
            return;
          }
          const rejectBeforeSend = (message: string) => {
            persist({ ...op, state: "rejected", error: message });
            throw new ApiError("ACTION_UNAVAILABLE", message);
          };
          if (
            op.action === "create" &&
            !fresh.catalogue.native_ready
          )
            rejectBeforeSend(
              fresh.catalogue.native_error ||
                "数据或运行环境未准备完成",
            );
          if (op.action !== "create") {
            known = await request<Job>(`/jobs/${op.jobId}`);
            if (op.action === "cancel" && !canCancel(known))
              rejectBeforeSend("当前状态不能取消，请重新读取任务。");
            if (op.action === "resume" && !known.can_resume)
              rejectBeforeSend("后端当前不允许恢复此任务。");
          }
          try {
            const job = await request<Job>(
              op.action === "create"
                ? "/jobs"
                : `/jobs/${op.jobId}/${op.action}`,
              op.body,
            );
            persist(completeOperation(op, job.job_id));
            location.hash = `${base}/results/${job.job_id}`;
            setNotice(
              op.action === "create"
                ? "创建请求已提交，执行进度见任务状态。"
                : op.action === "resume"
                  ? "恢复请求已提交，执行进度见任务状态。"
                  : "取消请求已记录，保留已提交结果。",
            );
          } catch (e) {
            persist({
              ...op,
              state:
                e instanceof ApiError && !e.uncertain ? "rejected" : "pending",
              error: errorText(e),
            });
            throw e;
          }
        },
      );
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
      refresh();
    }
  }
  const runReady = !!current && !!matched && selectionReady && current.catalogue.native_ready
    && !!feeModel && validCash(draft.cash) && validVolumeRatio(draft.volume)
    && !!currentPreflight?.ready && draft.ack === currentPreflight.assumption_ack_sha256
    && !!draft.name.trim() && operation?.state !== "pending" && operation?.state !== "done" && !storageError && !checking;
  const jobs = (current?.jobs || []).filter(
    (j) =>
      (stateFilter === "all" || j.status === stateFilter) &&
      `${j.request.name} ${j.job_id} ${j.request.strategy_version_id} ${j.request.securities.join(" ")}`
        .toLowerCase()
        .includes(taskSearch.toLowerCase()),
  );
  const versions = (current?.strategies || []).filter((s) =>
    `${s.version_id} ${s.definition.algorithm} ${algorithmName(s.definition.algorithm)}`
      .toLowerCase()
      .includes(strategySearch.toLowerCase()),
  );
  const title =
    page === "editor"
      ? draft.name
      : page === "results"
        ? active?.request.name || "回测结果"
        : page === "tasks"
          ? "回测任务"
          : "策略列表";
  return (
    <div className="qw-app">
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
            编辑并注册组合算法定义，选择真实数据、证券集合、日期与资金，通过预检查并确认假设后运行。代码编辑器仅编辑注册定义；任意 Python 暂不受此接口支持。任务由独立 worker 执行，刷新不会重新提交。
          </p>
          <p>
            本应用为独立的 quant-web，与聚宽官方无关联。当前服务：{current?.catalogue.service_identity.backend_version || "尚未连接"}{" "}
            · 源码 {current ? short(current.catalogue.service_identity.source_sha256) : "—"}。
            <a href="#/tasks/daily">日频任务与结果</a>
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
      {page === "editor" && (
        <div className="qw-workspace">
          <section className="qw-code-pane" aria-label="策略编辑">
            <div className="qw-editor-toolbar">
              <button onClick={saveDraft}>{icon("save")} 保存草稿</button>
              <button className="qw-primary" disabled={!current || busy || !!storageError} onClick={registerRules}>注册版本</button>
              <span className="qw-saved">草稿已自动保存</span>
              <select aria-label="组合算法" value={definitionAlgorithm(draft.code)} onChange={e => update({code: JSON.stringify({template:"daily_portfolio.v1",algorithm:e.target.value},null,2)})}>
                <option value="">选择算法</option>{index?.catalogue.strategy_algorithms.map(a => <option key={a} value={a}>{algorithmName(a)}</option>)}
              </select>
              <button aria-label="下载定义" onClick={() => download("strategy-definition.json",draft.code)}>{icon("download")}</button>
            </div>
            <p className="qw-definition-note">策略定义 JSON · 执行服务内的固定组合算法。本版不执行任意 Python；编辑后的定义须重新注册并绑定版本。</p>
            <StrategyEditor value={draft.code} language="json" onChange={code => update({code})} onSave={saveDraft}/>
            <div className="qw-editor-status"><span>JSON · daily_portfolio.v1</span><span>{draft.code.split("\n").length} 行 · UTF-8</span><span>{matched ? `已注册 ${short(draft.version)}` : "草稿未匹配执行版本"}</span></div>
          </section>
          <section className="qw-run-pane" aria-label="回测设置">
            <div className="qw-run-toolbar">
              <select aria-label="开始日期" value={draft.start} onChange={e => update({start:e.target.value})}><option value="">开始日期</option>{dataset?.trading_dates.map(d => <option key={d}>{d}</option>)}</select>
              <span>至</span><select aria-label="结束日期" value={draft.end} onChange={e => update({end:e.target.value})}><option value="">结束日期</option>{dataset?.trading_dates.map(d => <option key={d}>{d}</option>)}</select>
              <label className="qw-cash"><span>￥</span><input aria-label="初始资金" inputMode="decimal" value={draft.cash} onChange={e => update({cash:e.target.value})}/></label>
              <select aria-label="频率" value="1d" disabled><option value="1d">每天</option></select>
              <button className="qw-primary qw-run-button" disabled={!runReady || busy} onClick={() => void mutate("create")}>{busy ? "提交中…" : draft.mode === "price_only_no_limits" ? "运行价格诊断" : "运行回测"}</button>
            </div>
            <div className="qw-config">
              <div className="qw-config-row"><label>数据窗口<select aria-label="数据窗口" value={draft.dataset} onChange={e => {
                const d=index?.catalogue.datasets.find(d=>d.dataset_id===e.target.value);
                update({dataset:e.target.value,securities:[],start:d?.trading_dates[0]||"",end:d?.trading_dates.at(-1)||""});
              }}><option value="">选择已导入数据</option>{index?.catalogue.datasets.map(d=><option key={d.dataset_id} value={d.dataset_id}>{d.name} · {d.trading_dates[0]}—{d.trading_dates.at(-1)}</option>)}</select></label></div>
              <fieldset className="qw-securities"><legend>证券集合 · 已选 {draft.securities.length} 只</legend>{dataset?.securities.map(s=><label className="qw-check" key={s}><input type="checkbox" aria-label={s} checked={draft.securities.includes(s)} onChange={e=>update({securities:e.target.checked?[...draft.securities,s].sort():draft.securities.filter(v=>v!==s)})}/>{s}</label>)}</fieldset>
              <div className="qw-config-row"><label className="qw-version-select">执行版本<select aria-label="执行版本" value={draft.version} onChange={e=>{const s=index?.strategies.find(s=>s.version_id===e.target.value);if(s)selectStrategy(s,draft.name);}}><option value="">先注册或选择版本</option>{index?.strategies.map(s=><option key={s.version_id} value={s.version_id}>{algorithmName(s.definition.algorithm)} · {short(s.version_id)}</option>)}</select></label><button className="qw-text-button" onClick={()=>setSettings(v=>!v)}>{settings?"收起":"费用与参数"} {icon(settings?"angle-up":"angle-down")}</button></div>
              {settings && <div className="qw-extra"><div className="qw-fees">{[["买入佣金率","buy_commission_rate"],["卖出佣金率","sell_commission_rate"],["最低佣金","minimum_commission"],["卖出税率","sell_tax_rate"],["过户费","transfer_fee"],["滑点","slippage"]].map(([name,key])=><label key={key}>{name}<input readOnly value={String(feeModel?.[key]??"—")}/></label>)}</div><p>固定跨期研究模型，不代表历史法定费率。费用由原生引擎计算，当前模型只读。</p><label>成交量参与率（可选，0 &lt; 比例 ≤ 1）<input aria-label="成交量参与率" placeholder="留空使用默认；例如 0.10" value={draft.volume} onChange={e=>update({volume:e.target.value})}/></label></div>}
              <div className="qw-config-row"><label>研究模式<select aria-label="研究模式" value={draft.mode} onChange={e=>update({mode:e.target.value as Draft["mode"]})}><option value="covered_research">来源覆盖的条件研究</option><option value="price_only_no_limits">价格诊断（无限价、无公司行动）</option></select></label></div>
              <ScopeNote mode={draft.mode} scope={currentPreflight?.economic_scope}/>
              <label className="qw-check qw-retrospective"><input type="checkbox" checked={draft.retrospective} onChange={e=>update({retrospective:e.target.checked})}/>接受已声明的回溯状态研究模型（不代表历史 PIT）</label>
              <div className="qw-preflight-row"><button disabled={!current || !selectionReady || busy || checking} onClick={()=>void checkSelection()}>{checking?"正在检查…":"检查数据与假设"}</button><span>{currentPreflight ? currentPreflight.ready?`检查通过 · ${currentPreflight.scope?.trading_dates.length} 日 · ${draft.securities.length} 只证券`:`检查未通过 · ${currentPreflight.gaps.length} 项缺口`:"证券、日期或模式变化后须重新检查"}</span></div>
              {preflightError && <p className="qw-error-text">{preflightError}</p>}
              {currentPreflight && <>
                {!!currentPreflight.gaps.length && <details className="qw-preflight-gaps" open><summary>数据缺口 · {currentPreflight.gaps.length} 项</summary><pre>{JSON.stringify(currentPreflight.gaps,null,2)}</pre></details>}
                <details className="qw-assumptions"><summary>本次研究假设与限制 · {currentPreflight.assumptions.length} 项假设</summary><ResearchAssumptions values={currentPreflight.assumptions}/><ResearchLimitations values={currentPreflight.limitations} mode={draft.mode}/></details>
                {currentPreflight.ready && <label className="qw-check"><input type="checkbox" checked={draft.ack===currentPreflight.assumption_ack_sha256} onChange={e=>update({ack:e.target.checked?currentPreflight.assumption_ack_sha256:""})}/>已阅读并接受本次证券、日期与模式的研究假设</label>}
              </>}
              {dataset && <details className="qw-assumptions"><summary>数据来源与目录范围</summary><p>只使用导入目录中的实际证券与交易日，预检查还会核验 120 日预热及所需下一开市日；不会补行情或替换证券。</p><pre>{JSON.stringify({dataset_id:dataset.dataset_id,input_sha256:dataset.input_sha256,state_mode:dataset.state_mode,action_coverage:dataset.action_coverage,source_refs:dataset.source_refs,limitations:dataset.limitations},null,2)}</pre></details>}
              {!validCash(draft.cash) && <p className="qw-error-text">资金须大于 0，使用十进制文本，最多 8 位小数、40 个字符。</p>}
              {!validVolumeRatio(draft.volume) && <p className="qw-error-text">参与率应留空，或使用大于 0 且不超过 1 的十进制文本。</p>}
              {current && !current.catalogue.native_ready && <p className="qw-error-text">原生执行环境不可用：{current.catalogue.native_error}</p>}
              {current && !current.catalogue.datasets.length && <p className="qw-error-text">尚无导入数据，请按本地启动说明导入授权数据。</p>}
              {operation?.state === "done" && <p className="qw-submitted">本次请求已提交。<a href={`${base}/results/${operation.jobId}`}>查看结果</a><button onClick={prepareNew}>准备新回测</button></p>}
              {operation?.state === "rejected" && <p className="qw-error-text">上次请求已拒绝：{operation.error}<button onClick={prepareNew}>修改后重新提交</button></p>}
            </div>
            <div className="qw-log-tabs"><strong>日志</strong><span>错误</span><button onClick={refresh} disabled={busy||reading}>{icon("refresh")} 刷新状态</button></div>
            <div className="qw-console"><p>{current?`服务已连接 · ${current.catalogue.service_identity.backend_version}`:"等待任务服务连接…"}</p><p>{matched?`执行版本 ${draft.version}`:"编辑完成后注册定义，任务将冻结算法、数据与参数。"}</p><p>{operation?.error||actionError||"启动后可在回测详情查看原生权益、逐证券成交/持仓、决策和完整日志。"}</p></div>
          </section>
        </div>
      )}
      {(page === "strategies" || page === "tasks") && (
        <main
          className={`qw-list-page ${page === "strategies" ? "strategy-list" : "task-list"}`}
        >
          <div className="qw-list-heading">
            <h2>
              {page === "strategies"
                ? "策略列表"
                : `共有 ${jobs.length} 个回测任务`}
            </h2>
            <input
              aria-label="搜索策略或任务"
              placeholder={
                page === "strategies"
                  ? "搜索版本或类型…"
                  : "搜索策略名称 / 任务 ID…"
              }
              value={search}
              onChange={(e) =>
                page === "strategies"
                  ? setStrategySearch(e.target.value)
                  : setTaskSearch(e.target.value)
              }
            />
          </div>
          <div className="qw-list-tools">
            <button
              className="qw-primary"
              onClick={() => {
                if (operation?.state === "pending") {
                  location.hash = `${base}/editor`;
                  return;
                }
                update({ ...freshDraft() });
                location.hash = `${base}/editor`;
              }}
            >
              {icon("plus")} 新建策略
            </button>
            <a className="qw-button" href={`${base}/editor`}>
              {icon("file-code-o")} 继续草稿
            </a>
            <button onClick={refresh} disabled={reading || busy}>
              {icon("refresh")} 刷新
            </button>
            {page === "tasks" && (
              <select
                aria-label="任务状态筛选"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="all">全部状态</option>
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <span className="qw-list-summary">
              {current
                ? `排队 ${current.service.counts.queued || 0} · 运行 ${current.service.counts.running || 0} · 可用队列 ${current.service.available_pending}`
                : "等待连接"}
            </span>
          </div>
          {reading && !current ? (
            <Empty>正在读取策略版本与任务状态…</Empty>
          ) : !current ? (
            <Empty>无法读取服务，请检查连接后刷新。</Empty>
          ) : page === "strategies" ? (
            <>
              <p className="qw-muted">
                全部已注册版本 · 相同算法定义复用版本，编辑后重新注册
              </p>
              <Table
                headers={[
                  "策略版本",
                  "类型",
                  "注册时间",
                  "历史回测",
                  "最近状态",
                  "操作",
                ]}
                rows={versions
                  .slice((listPage - 1) * 12, listPage * 12)
                  .map((s) => {
                    const runs = current.jobs.filter(
                      (j) =>
                        j.request.strategy_version_id ===
                          s.version_id,
                    );
                    return [
                      <button
                        className="qw-link"
                        title={s.version_id}
                        onClick={() => selectStrategy(s)}
                      >
                        {icon("file-code-o")} {short(s.version_id)}
                      </button>,
                      <span className="qw-type">
                        {algorithmName(s.definition.algorithm)}
                      </span>,
                      time(s.created_at),
                      <a
                        href={`${base}/tasks`}
                        onClick={() => {
                          setTaskSearch(s.version_id);
                          setStateFilter("all");
                        }}
                      >
                        {runs.length}
                      </a>,
                      runs[0] ? (
                        <Status job={runs[0]} />
                      ) : (
                        <span className="qw-muted">未运行</span>
                      ),
                      <button
                        className="qw-link"
                        onClick={() => selectStrategy(s)}
                      >
                        编辑策略
                      </button>,
                    ];
                  })}
              />
            </>
          ) : (
            <Table
              headers={[
                "策略名称",
                "策略版本",
                "创建时间 +08:00",
                "时间范围",
                "证券集合",
                "研究范围",
                "初始资金",
                "进度",
                "状态",
                "操作",
              ]}
              rows={jobs.slice((listPage - 1) * 12, listPage * 12).map((j) => [
                <a href={`${base}/results/${j.job_id}`} title={j.job_id}>
                  {j.request.name}
                </a>,
                <code>
                  {short(j.request.strategy_version_id)}
                </code>,
                time(j.created_at),
                `${j.request.start_date} → ${j.request.end_date}`,
                j.request.securities.join("、"),
                j.request.mode === "price_only_no_limits" ? "价格诊断 · 非总回报" : "条件研究",
                money(j.request.initial_cash),
                <span>
                  {j.committed_cursor} / {j.total_cursors}
                </span>,
                <Status job={j} />,
                <a href={`${base}/results/${j.job_id}`}>查看详情</a>,
              ])}
            />
          )}
          <div className="qw-pagination">
            <button
              disabled={listPage === 1}
              onClick={() => setListPage((n) => n - 1)}
            >
              上一页
            </button>
            <span>
              {listPage} /{" "}
              {Math.max(
                1,
                Math.ceil(
                  (page === "strategies" ? versions.length : jobs.length) / 12,
                ),
              )}
            </span>
            <button
              disabled={
                listPage * 12 >=
                (page === "strategies" ? versions.length : jobs.length)
              }
              onClick={() => setListPage((n) => n + 1)}
            >
              下一页
            </button>
            <small>每页 12 行</small>
          </div>
          {current && !current.strategies.length && page === "strategies" && (
            <Empty>
              尚无策略版本。打开工作台，选择组合算法、编辑定义并注册版本。
            </Empty>
          )}
        </main>
      )}
      {page === "results" && (
        <>
          {active && (
            <div className="qw-run-summary">
              <span>
                设置：{detail?.manifest.execution_scope.start_date} 到{" "}
                {detail?.manifest.execution_scope.end_date}，￥
                {money(active.request.initial_cash)}，每天 · {active.request.securities.length} 只证券
              </span>
              <span>
                状态：
                <Status job={active} />
              </span>
              <span className="qw-type">
                {detail ? algorithmName(detail.manifest.strategy.definition.algorithm) : "—"}
              </span>
              <div className="qw-summary-actions">
                <button onClick={refresh} disabled={reading || busy}>
                  {icon("refresh")} 刷新
                </button>
                <button
                  onClick={() => void mutate("cancel")}
                  disabled={
                    !current ||
                    !canCancel(active) ||
                    operation?.state === "pending" ||
                    !!storageError
                  }
                >
                  取消回测
                </button>
                <button
                  onClick={() => void mutate("resume")}
                  disabled={
                    !current ||
                    !active.can_resume ||
                    operation?.state === "pending" ||
                    !!storageError
                  }
                >
                  恢复原任务
                </button>
                <button
                  onClick={() =>
                    download(
                      `${active.job_id}.json`,
                      JSON.stringify(detail, null, 2),
                    )
                  }
                >
                  {icon("download")} 导出
                </button>
              </div>
            </div>
          )}
          <div className="qw-results-layout">
            <aside aria-label="回测结果导航">
              {[
                ["overview", "收益概述", "line-chart"],
                ["trades", "交易详情", "list-alt"],
                ["positions", "每日持仓与权益", "bar-chart"],
                ["logs", "日志输出", "file-text-o"],
                ["decisions", "逐日决策", "tasks"],
                ["code", "策略版本", "code"],
                ["details", "运行信息", "info-circle"],
              ].map(([key, name, i]) => (
                <a
                  key={key}
                  className={tab === key ? "active" : ""}
                  href={`${base}/results/${selectedId}/${key}`}
                >
                  {icon(i)}
                  {name}
                </a>
              ))}
              <div className="qw-sidebar-meta">
                <p>最后读取</p>
                <time>{at ? time(at) : "—"}</time>
                <p>策略版本</p>
                <code title={detail?.manifest.strategy.version_id}>
                  {short(detail?.manifest.strategy.version_id)}
                </code>
                <p>{detail?.job.request.mode === "price_only_no_limits" ? "价格诊断 · 非总回报" : "本地条件研究"}</p>
              </div>
            </aside>
            <section className="qw-result-panel">
              {reading && !detail ? (
                <Empty>正在读取任务、清单、日志与结果…</Empty>
              ) : !detail ? (
                <Empty>
                  {selectedId
                    ? "结果暂不可用。请重试读取，或返回任务列表。"
                    : "从回测列表选择一个任务。"}
                  <a href={`${base}/tasks`}>返回回测列表</a>
                </Empty>
              ) : (
                <>
                  {active?.error && (
                    <Alert>{JSON.stringify(active.error)}</Alert>
                  )}
                  {active && active.status !== "succeeded" && (
                    <div className="qw-progress">
                      <strong>{labels[active.status]}</strong>
                      <span>
                        已提交 {active.committed_cursor} /{" "}
                        {active.total_cursors} 个游标 · 第{" "}
                        {active.attempt_count} 次尝试
                      </span>
                      <progress
                        value={active.committed_cursor}
                        max={active.total_cursors || 1}
                      />
                      <small>
                        {active.status === "queued"
                          ? "等待独立 worker。刷新页面不会重新提交。"
                          : active.status === "cancelling"
                            ? "正在等待安全停止；已提交成交保留。"
                            : active.can_resume
                              ? "可恢复同一任务；恢复后由 worker 继续执行。"
                              : "任务状态由服务确认。"}
                        {active.recovery_required ? " 当前需要恢复。" : ""}
                      </small>
                    </div>
                  )}
                  <ScopeNote mode={detail.job.request.mode} scope={detail.manifest.preflight.economic_scope} assumptions={detail.manifest.preflight.assumptions} limitations={detail.manifest.preflight.limitations}/><PortfolioResults key={`${detail.job.job_id}/${tab}`} detail={detail} tab={tab} />
                </>
              )}
            </section>
          </div>
        </>
      )}
      {!["editor", "strategies", "tasks", "results"].includes(page) && (
        <Empty>
          页面不存在。<a href={`${base}/strategies`}>返回策略列表</a>
        </Empty>
      )}
      <footer className="qw-footer">
        <span>quant-web · 本地研究</span>
        <span>
          AQ {current?.catalogue.service_identity.backend_version || "未连接"} · 源码 {current ? short(current.catalogue.service_identity.source_sha256) : "—"} ·{" "}
          {at ? `更新于 ${time(at)}` : "等待连接"}
        </span>
      </footer>
    </div>
  );
}

function safeCanonical(value: string) {
  try {
    return canonical(JSON.parse(value));
  } catch {
    return "";
  }
}
