import { useEffect, useRef, useState } from "react";
import type { Index } from "./api";
import {
  changesScope,
  draftKey,
  draftEnvironmentError,
  freshDraft,
  restoreDraft,
  type Draft,
} from "./draft";

export function usePortfolioDraft(index: Index | null) {
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [restored, setRestored] = useState(false),
    [storageError, setStorageError] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setDraft(restoreDraft(raw));
      setRestored(true);
    } catch (e) {
      setStorageError(
        `无法读取本地草稿或请求记录：${String(e)}。已停止提交，请先导出代码并检查站点存储。`,
      );
    }
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      setStorageError(`草稿无法保存：${String(e)}。已停止提交。`);
    }
  }, [draft, restored]);
  const environmentError = index ? draftEnvironmentError(draft, index.configuration,
    index.catalogue.datasets.some(d => d.dataset_id === draft.dataset)) : "";
  const updateDraft = (value: Partial<Draft>) =>
    setDraft((d) => ({
      ...d,
      ...value,
      ...(("dataset" in value || "environment" in value) && !("publication" in value) ? { publication: "" } : {}),
      ...(changesScope(value) ? { ack: "" } : {}),
      updatedAt: new Date().toISOString(),
    }));
  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draftRef.current));
      return true;
    } catch (e) {
      setStorageError(String(e));
      return false;
    }
  }
  return {
    draft,
    setDraft,
    updateDraft,
    saveDraft,
    restored,
    storageError,
    setStorageError,
    environmentError,
  };
}
