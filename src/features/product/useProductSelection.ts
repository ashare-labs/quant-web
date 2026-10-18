import { useEffect, useRef, useState } from "react";
import { ApiError, errorText } from "../../shared/http";
import { readProductConfig, type ProductConfig } from "../../shared/product-config";
import { useOnline } from "../../shared/useOnline";
import { draftEnvironmentError, draftKey, freshDraft, restoreDraft } from "../portfolio/draft";
import type { ResearchMode } from "../portfolio/dataset-mode";
import { publishSelection, readCatalogue, readCoverage, readPrices, type Catalogue, type Coverage, type Prices, type Security, type Selection, type ReleaseSelection } from "./api";
import { draftFromRelease, publicationReady, selectedReference, selectionKey, validSelection } from "./selection";

export function useProductSelection() {
  const online = useOnline();
  const [config, setConfig] = useState<ProductConfig | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Security[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [source, setSource] = useState("auto");
  const [mode, setMode] = useState<ResearchMode>("covered_research");
  const [referenceSet, setReferenceSet] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [priceRead, setPriceRead] = useState<{ key: string; value: Prices } | null>(null);
  const [coverageRead, setCoverageRead] = useState<{ key: string; value: Coverage } | null>(null);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<unknown>(null);
  const [draftWarning, setDraftWarning] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const selection: Selection = { securities: selected.map(s => s.security).sort(), start, end, source };
  const releaseSelection: ReleaseSelection = { ...selection, reference_set: referenceSet || null, mode };
  const key = selectionKey(selection);
  const coverageKey = `${key}:${referenceSet}`;
  const prices = priceRead?.key === key ? priceRead.value : null;
  const coverage = coverageRead?.key === coverageKey ? coverageRead.value : null;
  const reference = config ? selectedReference(config, referenceSet || null) : null;
  const available = !!config?.configured && config.kind === "product" && online;
  const canPublish = available && !busy && publicationReady(config, releaseSelection, coverage, prices, acknowledged);

  function failure(e: unknown) {
    setError(errorText(e));
    setErrorDetails(e instanceof ApiError ? e.details : null);
    setPriceRead(null); setCoverageRead(null); setAcknowledged(false);
  }
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setConfig(null); setCatalogue(null); setPriceRead(null); setCoverageRead(null); setAcknowledged(false); setError(""); setErrorDetails(null); setBusy("");
    if (!online) return;
    setBusy("读取配置");
    void (async () => {
      try {
        const current = await readProductConfig(controller.signal);
        if (!live) return;
        setConfig(current);
        setReferenceSet(current.default_reference_set || "");
        try {
          const raw = localStorage.getItem(draftKey);
          setDraftWarning(raw ? draftEnvironmentError(restoreDraft(raw), current, true) : "");
        } catch { setDraftWarning("已有浏览器草稿无法读取。发布前会再次核对，不会自动覆盖损坏草稿。"); }
        if (current.configured && current.kind === "product") {
          const listing = await readCatalogue(current, "", 0, controller.signal);
          if (live) setCatalogue(listing);
        }
      } catch (e) { if (live) failure(e); }
      finally { if (live) setBusy(""); }
    })();
    return () => { live = false; controller.abort(); };
  }, [online, revision]);

  // Reads are bound to exact selection keys; edits also clear acknowledgement.
  useEffect(() => { setPriceRead(null); setCoverageRead(null); setAcknowledged(false); }, [start, end, source, selected, referenceSet, mode]);

  async function search(offset = 0, searched = query.trim()) {
    if (!config || !available || busy || lock.current) return;
    lock.current = true; setBusy("搜索证券"); setError(""); setErrorDetails(null); setCatalogue(null);
    try { setCatalogue(await readCatalogue(config, searched, offset)); }
    catch (e) { failure(e); }
    finally { setBusy(""); lock.current = false; }
  }
  function toggle(security: Security, checked: boolean) {
    setSelected(items => checked
      ? items.some(s => s.security === security.security) ? items : [...items, security]
      : items.filter(s => s.security !== security.security));
  }
  async function loadPrices() {
    if (!config || !available || busy || lock.current || !validSelection(selection)) return;
    lock.current = true; setBusy("读取真实行情"); setError(""); setErrorDetails(null); setPriceRead(null);
    try { setPriceRead({ key, value: await readPrices(config, selection) }); }
    catch (e) { failure(e); }
    finally { setBusy(""); lock.current = false; }
  }
  async function checkCoverage() {
    if (!config || !available || busy || lock.current || !validSelection(selection)) return;
    lock.current = true; setBusy("检查普通回测覆盖"); setError(""); setErrorDetails(null); setCoverageRead(null);
    try { setCoverageRead({ key: coverageKey, value: await readCoverage(config, { ...selection, reference_set: referenceSet || null }) }); }
    catch (e) { failure(e); }
    finally { setBusy(""); lock.current = false; }
  }
  async function publish() {
    if (!config || !canPublish || lock.current) return;
    lock.current = true; setBusy("发布回测数据"); setError(""); setErrorDetails(null);
    try {
      // Validate storage before publishing so a malformed old draft is not silently overwritten.
      const raw = localStorage.getItem(draftKey);
      const previous = raw ? restoreDraft(raw) : freshDraft();
      const release = await publishSelection(config, releaseSelection);
      const next = draftFromRelease(config, release, releaseSelection, acknowledged, previous);
      localStorage.setItem(draftKey, JSON.stringify(next));
      location.hash = "#/portfolio/editor";
    } catch (e) { failure(e); }
    finally { setBusy(""); lock.current = false; }
  }
  return { config, catalogue, query, setQuery, selected, start, setStart, end, setEnd, source, setSource,
    mode, setMode, referenceSet, setReferenceSet, reference, coverage, canPublish,
    acknowledged, setAcknowledged, prices, error, errorDetails, draftWarning, busy, available, online, selection,
    search, toggle, loadPrices, checkCoverage, publish, refresh: () => setRevision(v => v + 1) };
}
