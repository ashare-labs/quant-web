import { useEffect, useState } from "react";
import { operationKeyFor } from "./compatibility.ts";
import { restoreOperation, type Operation } from "./state.ts";

export function usePortfolioOperation(
  serviceSource: string,
  refresh: () => void,
  setStorageError: (error: string) => void,
  legacySource = "",
) {
  const operationKey = operationKeyFor(serviceSource);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationSource, setOperationSource] = useState("");
  useEffect(() => {
    if (!serviceSource) return;
    try {
      if (legacySource && legacySource !== serviceSource && restoreOperation(localStorage, operationKeyFor(legacySource), legacySource)?.state === "pending")
        throw Error("旧版有未确认请求，但未记录状态环境。请先在原环境核对原请求；不会向当前状态库重发。");
      setOperation(restoreOperation(localStorage, operationKey, serviceSource));
      setOperationSource(serviceSource);
    } catch (e) {
      setStorageError(String(e));
    }
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
  }, [serviceSource, legacySource, operationKey, refresh, setStorageError]);
  const persist = (next: Operation) => {
    localStorage.setItem(operationKey, JSON.stringify(next));
    setOperation(next);
  };
  return { operation, setOperation, operationSource, operationKey, persist };
}
