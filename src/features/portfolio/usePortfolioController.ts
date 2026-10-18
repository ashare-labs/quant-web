import { useEffect, useRef, useState } from "react";
import { canonical } from "../../shared/format.ts";
import { changesScope, safeCanonical, type Draft } from "./draft";
import { validPortfolioCash as validCash, validVolumeRatio } from "./state.ts";
import { usePortfolioActions } from "./usePortfolioActions";
import { usePortfolioDraft } from "./usePortfolioDraft";
import { usePortfolioLists } from "./usePortfolioLists";
import { usePortfolioOperation } from "./usePortfolioOperation";
import { usePortfolioPreflight } from "./usePortfolioPreflight";
import { usePortfolioSnapshot } from "./usePortfolioSnapshot";
import { requestIdentity } from "./api";

// Keep draft, request and list state mounted while only the route's view changes.
export function usePortfolioController(route: string) {
  const parts = route.slice(2).split("/"),
    page = parts[1] || "strategies";
  const selectedId = page === "results" ? parts[2] || "" : "",
    tab = parts[3] || "overview";
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false);
  const lock = useRef(false);
  const snapshot = usePortfolioSnapshot(selectedId, busy);
  const { index, detail, online, error, refresh, identity } = snapshot;
  const draftState = usePortfolioDraft(index);
  const {
    draft,
    setDraft,
    updateDraft,
    restored,
    storageError,
    setStorageError,
    environmentError,
  } = draftState;
  const serviceSource = identity?.source_sha256 || "";
  const operationIdentity = index ? requestIdentity(index) : "";
  const operations = usePortfolioOperation(
    operationIdentity,
    refresh,
    setStorageError,
    serviceSource,
  );
  const { operation, operationSource } = operations;
  const current =
    online && !error && !busy && restored && operationSource === operationIdentity
      ? index
      : null;
  const preflight = usePortfolioPreflight(
    draft,
    index,
    current,
    operationIdentity,
    () => updateDraft({ ack: "" }),
  );
  const { invalidate, selectionReady, checking, currentPreflight } = preflight;
  useEffect(() => {
    if (!serviceSource) return;
    invalidate();
    setActionError("");
    setNotice("");
    setDraft((d) => ({ ...d, ack: "" }));
  }, [operationIdentity, serviceSource, invalidate, setDraft]);
  const update = (patch: Partial<Draft>) => {
    if (changesScope(patch)) invalidate();
    updateDraft(patch);
  };
  const feeModel = index?.catalogue.fee_models.find(
    (f) => f.id === "fixed-commission-tax.v1",
  );
  const registered = index?.strategies.find(
    (s) => s.version_id === draft.version,
  );
  const matched =
    registered &&
    safeCanonical(draft.code) === canonical(registered.definition);
  const runReady =
    !!current &&
    !!matched &&
    selectionReady &&
    current.catalogue.native_ready &&
    !!feeModel &&
    validCash(draft.cash) &&
    validVolumeRatio(draft.volume) &&
    !!currentPreflight?.ready &&
    draft.ack === currentPreflight.assumption_ack_sha256 &&
    !!draft.name.trim() &&
    operation?.state !== "pending" &&
    operation?.state !== "done" &&
    !storageError &&
    !environmentError &&
    !checking;
  const actions = usePortfolioActions({
    current,
    detail,
    draft,
    storageError,
    ...operations,
    operationIdentity,
    currentPreflight,
    selection: preflight.selection,
    runReady,
    lock,
    setBusy,
    setActionError,
    setNotice,
    update,
    refresh,
  });
  const lists = usePortfolioLists(page, current);
  const active = detail?.job;
  const title =
    page === "editor"
      ? draft.name
      : page === "results"
        ? active?.request.name || "回测结果"
        : page === "tasks"
          ? "回测任务"
          : "策略列表";
  const saveDraft = () => {
    if (draftState.saveDraft()) setNotice("草稿已保存在此浏览器。");
  };
  return {
    ...snapshot,
    ...preflight,
    ...actions,
    ...lists,
    page,
    selectedId,
    tab,
    title,
    draft,
    update,
    saveDraft,
    storageError,
    environmentError,
    operation,
    busy,
    actionError,
    notice,
    setNotice,
    settings,
    setSettings,
    help,
    setHelp,
    current,
    feeModel,
    matched,
    runReady,
    active,
  };
}
export type PortfolioController = ReturnType<typeof usePortfolioController>;
