import { useCallback, useEffect, useState } from "react";
import { errorText } from "../../shared/http";
import {
  readDetail,
  readPortfolio,
  type Detail,
  type Index,
  type PortfolioModel,
} from "./api";

export function usePortfolioSnapshot(selectedId: string, busy: boolean) {
  const [index, setIndex] = useState<Index | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(true),
    [online, setOnline] = useState(navigator.onLine);
  const [revision, setRevision] = useState(0),
    [at, setAt] = useState("");
  const [identity, setIdentity] =
    useState<PortfolioModel<"PortfolioIdentity"> | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
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
          ? await readDetail(
              selectedId,
              fresh.catalogue.service_identity,
              controller.signal,
            )
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
  return { index, detail, error, reading, online, at, identity, refresh };
}
