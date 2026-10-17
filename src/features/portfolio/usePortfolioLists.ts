import { useEffect, useState } from "react";
import type { Index } from "./api";
import { algorithmName } from "./PortfolioUi";

export function usePortfolioLists(page: string, current: Index | null) {
  const [strategySearch, setStrategySearch] = useState(""),
    [taskSearch, setTaskSearch] = useState("");
  const search = page === "strategies" ? strategySearch : taskSearch;
  const [stateFilter, setStateFilter] = useState("all"),
    [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [search, stateFilter, page]);
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
  return {
    search,
    setStrategySearch,
    setTaskSearch,
    stateFilter,
    setStateFilter,
    listPage,
    setListPage,
    jobs,
    versions,
  };
}
