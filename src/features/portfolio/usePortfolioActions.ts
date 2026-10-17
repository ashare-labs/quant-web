import type { RefObject } from "react";
import { ApiError, errorText } from "../../shared/http";
import { parseJson } from "../../shared/json.ts";
import { algorithmName } from "./PortfolioUi";
import {
  readPortfolio,
  request,
  type Detail,
  type Index,
  type Job,
  type PortfolioModel,
  type Strategy,
} from "./api";
import { assertSameService } from "./compatibility.ts";
import { base, type Draft } from "./draft";
import {
  actionSatisfied,
  canCancel,
  completeOperation,
  restoreOperation,
  type Operation,
} from "./state.ts";

type ActionsInput = {
  current: Index | null;
  detail: Detail | null;
  draft: Draft;
  storageError: string;
  operation: Operation | null;
  operationKey: string;
  serviceSource: string;
  currentPreflight: PortfolioModel<"PortfolioPreflight"> | null;
  selection: PortfolioModel<"PortfolioSelection">;
  runReady: boolean;
  lock: RefObject<boolean>;
  setBusy: (value: boolean) => void;
  setActionError: (value: string) => void;
  setNotice: (value: string) => void;
  setOperation: (value: Operation | null) => void;
  persist: (value: Operation) => void;
  update: (patch: Partial<Draft>) => void;
  refresh: () => void;
};
export function usePortfolioActions({
  current,
  detail,
  draft,
  storageError,
  operation,
  operationKey,
  serviceSource,
  currentPreflight,
  selection,
  runReady,
  lock,
  setBusy,
  setActionError,
  setNotice,
  setOperation,
  persist,
  update,
  refresh,
}: ActionsInput) {
  const active = detail?.job;
  async function registerRules() {
    if (lock.current || !current || storageError) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    try {
      const definition = parseJson(draft.code);
      const fresh = await readPortfolio();
      assertSameService(
        fresh.catalogue.service_identity,
        current.catalogue.service_identity,
      );
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
  function selectStrategy(
    s: Strategy,
    name = `${algorithmName(s.definition.algorithm)}策略`,
  ) {
    update({
      version: s.version_id,
      code: JSON.stringify(s.definition, null, 2),
      name,
      ack: "",
    });
    location.hash = `${base}/editor`;
  }
  function editSelectedTask() {
    if (!detail) return;
    const r = detail.job.request;
    selectStrategy(detail.manifest.strategy);
    update({
      name: r.name,
      dataset: r.dataset_id,
      securities: r.securities,
      start: r.start_date,
      end: r.end_date,
      cash: r.initial_cash,
      volume: r.volume_ratio || "",
      mode: r.mode,
      retrospective: r.accept_retrospective_state,
      ack: "",
    });
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
          );
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
                throw Error(
                  "请核对版本、证券、日期、资金，并完成本次预检查和假设确认。",
                );
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
                } satisfies PortfolioModel<"PortfolioCreate">,
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
          assertSameService(
            fresh.catalogue.service_identity,
            current.catalogue.service_identity,
          );
          if (op.pin !== fresh.catalogue.service_identity.source_sha256)
            throw Error(
              "PORTFOLIO_SERVICE_CHANGED · 原请求属于其他服务，已停止重发。",
            );
          let known =
            op.action === "create"
              ? fresh.jobs.find(
                  (j) => j.request.idempotency_key === op.body.idempotency_key,
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
          if (op.action === "create" && !fresh.catalogue.native_ready)
            rejectBeforeSend(
              fresh.catalogue.native_error || "数据或运行环境未准备完成",
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
  return {
    registerRules,
    selectStrategy,
    editSelectedTask,
    prepareNew,
    mutate,
  };
}
