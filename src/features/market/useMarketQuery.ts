import { useEffect, useRef, useState } from "react";
import { api } from "../execution/api";

import {
  type Coverage,
  type Description,
  type Field,
  fields,
  type Query,
  type Read,
  record,
  descriptorSecurities,
  parseSecurities,
  type Security,
} from "./model";
export function useMarketQuery(enabled: boolean) {
  const [aliases, setAliases] = useState<string[]>();
  const [aliasError, setAliasError] = useState<unknown>();
  const [aliasesRevision, setAliasesRevision] = useState(0);
  const [alias, setAlias] = useState("");
  const [dataset, setDataset] = useState("");
  const [selected, setSelected] = useState<Security[]>([]);
  const [securityInput, setSecurityInput] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"range" | "count">("range");
  const [count, setCount] = useState("2");
  const [wanted, setWanted] = useState<Field[]>(fields);
  const [visibility, setVisibility] =
    useState<NonNullable<Query["visibility"]>>("snapshot");
  const [asOf, setAsOf] = useState("");
  const [adjustment, setAdjustment] =
    useState<NonNullable<Query["adjustment"]>>("none");
  const [requirements, setRequirements] = useState({
    require_complete: false,
    require_fresh: false,
    require_final: false,
    require_tradable: false,
  });
  const [description, setDescription] = useState<Description>();
  const [read, setRead] = useState<Read>();
  const [coverage, setCoverage] = useState<Coverage>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("rows");
  const generation = useRef(0);
  const requestLock = useRef(false);

  useEffect(() => {
    let live = true;
    setAliasError(undefined);
    setAliases(undefined);
    api<string[]>("/market/stores")
      .then((value) => {
        if (live) {
          setAliases(value);
          setAlias((previous) =>
            value.includes(previous) ? previous : "",
          );
        }
      })
      .catch((e) => {
        if (live) setAliasError(e);
      });
    return () => {
      live = false;
    };
  }, [aliasesRevision]);
  useEffect(() => {
    generation.current++;
    setDescription(undefined);
    setSelected([]);
    setSecurityInput("");
    setRead(undefined);
    setCoverage(undefined);
    setError(undefined);
    setBusy(false);
    requestLock.current = false;
  }, [alias, dataset]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function query(): Query {
    return {
      securities: selected,
      ...(mode === "count" ? { count: Number(count) } : { start, end }),
      fields: wanted,
      visibility,
      ...(visibility !== "snapshot" ? { as_of: asOf } : {}),
      adjustment,
      ...requirements,
    };
  }
  async function load(kind: "description" | "prices" | "coverage") {
    if (requestLock.current || !enabled) return;
    requestLock.current = true;
    setBusy(true);
    setError(undefined);
    setRead(undefined);
    setCoverage(undefined);
    const token = ++generation.current;
    const path = `/market/${encodeURIComponent(alias)}/${encodeURIComponent(dataset)}`;
    try {
      const result =
        kind === "description"
          ? await api<Description>(path)
          : kind === "prices"
            ? await api<Read>(`${path}/prices`, query(), true)
            : await api<Coverage>(
                `${path}/coverage`,
                { securities: selected, start, end },
                true,
              );
      if (token !== generation.current) return;
      setDescription(result);
      if (kind === "prices") {
        setRead(result as Read);
        setTab("rows");
      }
      if (kind === "coverage") {
        setCoverage(result as Coverage);
        setTab("coverage");
      }
    } catch (e) {
      if (token === generation.current) setError(e);
    } finally {
      if (token === generation.current) {
        requestLock.current = false;
        setBusy(false);
      }
    }
  }
  const validIdentity =
    aliases?.includes(alias) && /^[a-f0-9]{64}$/.test(dataset);
  const priceValid =
    selected.length > 0 &&
    wanted.length > 0 &&
    (mode === "count"
      ? Number.isInteger(Number(count)) &&
        Number(count) >= 1 &&
        Number(count) <= 1000
      : !!start && !!end) &&
    (visibility === "snapshot" || !!asOf);
  const source = record(description?.descriptor).source;
  const securities = [...new Set([...descriptorSecurities(description?.descriptor), ...selected])].sort();
  const blocked = !enabled || busy || !validIdentity;

  function applySecurities() {
    try { setSelected(parseSecurities(securityInput)); setRead(undefined); setCoverage(undefined); setError(undefined); }
    catch (e) { setError(e); }
  }

  return {
    aliases,
    aliasError,
    setAliasesRevision,
    alias,
    setAlias,
    dataset,
    setDataset,
    selected,
    setSelected,
    securities,
    securityInput,
    setSecurityInput,
    applySecurities,
    start,
    setStart,
    end,
    setEnd,
    mode,
    setMode,
    count,
    setCount,
    wanted,
    setWanted,
    visibility,
    setVisibility,
    asOf,
    setAsOf,
    adjustment,
    setAdjustment,
    requirements,
    setRequirements,
    description,
    read,
    coverage,
    error,
    busy,
    tab,
    setTab,
    load,
    priceValid,
    source,
    blocked,
  };
}
export type MarketQuery = ReturnType<typeof useMarketQuery>;
