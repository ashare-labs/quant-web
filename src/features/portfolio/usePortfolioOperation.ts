import { useEffect, useState } from "react";
import { operationKeyFor } from "./compatibility.ts";
import { restoreOperation, type Operation } from "./state.ts";

export function usePortfolioOperation(
  serviceSource: string,
  refresh: () => void,
  setStorageError: (error: string) => void,
) {
  const operationKey = operationKeyFor(serviceSource);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationSource, setOperationSource] = useState("");
  useEffect(() => {
    if (!serviceSource) return;
    try {
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
  }, [serviceSource, operationKey, refresh, setStorageError]);
  const persist = (next: Operation) => {
    localStorage.setItem(operationKey, JSON.stringify(next));
    setOperation(next);
  };
  return { operation, setOperation, operationSource, operationKey, persist };
}
