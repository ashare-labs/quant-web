import { useCallback, useState } from "react";
import { canonical } from "../../shared/format.ts";
import { errorText } from "../../shared/http";
import { readPortfolio, request, type Index, type PortfolioModel } from "./api";
import { assertSameService } from "./compatibility.ts";
import { draftEnvironmentError, type Draft } from "./draft";
import { assertSameEnvironment } from "../../shared/product-config";
import { validatePreflight } from "./evidence.ts";
import { datasetModeError } from "./dataset-mode.ts";

export function usePortfolioPreflight(
  draft: Draft,
  index: Index | null,
  current: Index | null,
  requestSource: string,
  clearAcknowledgement: () => void,
) {
  const dataset = index?.catalogue.datasets.find(
    (d) => d.dataset_id === draft.dataset,
  );
  const [preflight, setPreflight] = useState<{
    source: string;
    value: PortfolioModel<"PortfolioPreflight">;
  } | null>(null);
  const [checking, setChecking] = useState(false),
    [preflightError, setPreflightError] = useState("");
  const invalidate = useCallback(() => {
    setPreflight(null);
    setPreflightError("");
  }, []);
  const selection: PortfolioModel<"PortfolioSelection"> = {
    dataset_id: draft.dataset,
    securities: [...draft.securities].sort(),
    start_date: draft.start,
    end_date: draft.end,
    mode: draft.mode,
    accept_retrospective_state: draft.retrospective,
  };
  const modeError = datasetModeError(dataset, draft.mode);
  const selectionReady =
    !!dataset &&
    !!index && !draftEnvironmentError(draft, index.configuration, !!dataset) &&
    !modeError &&
    draft.securities.length > 0 &&
    new Set(draft.securities).size === draft.securities.length &&
    draft.securities.every((s) => dataset.securities.includes(s)) &&
    dataset.trading_dates.includes(draft.start) &&
    dataset.trading_dates.includes(draft.end) &&
    draft.start <= draft.end;
  const currentPreflight =
    preflight?.source === requestSource &&
    canonical(preflight.value.selection) === canonical(selection)
      ? preflight.value
      : null;
  async function checkSelection() {
    if (!current || !selectionReady || checking) return;
    const checkedSelection = selection;
    setChecking(true);
    setPreflight(null);
    setPreflightError("");
    clearAcknowledgement();
    try {
      const fresh = await readPortfolio();
      assertSameService(
        fresh.catalogue.service_identity,
        current.catalogue.service_identity,
      );
      assertSameEnvironment(fresh.configuration, current.configuration);
      const value = await request<PortfolioModel<"PortfolioPreflight">>(
        "/preflight",
        checkedSelection,
      );
      validatePreflight(checkedSelection, value);
      setPreflight({
        source: requestSource,
        value,
      });
    } catch (e) {
      setPreflightError(errorText(e));
    } finally {
      setChecking(false);
    }
  }
  return {
    dataset,
    modeError,
    selection,
    selectionReady,
    currentPreflight,
    checking,
    preflightError,
    checkSelection,
    invalidate,
  };
}
