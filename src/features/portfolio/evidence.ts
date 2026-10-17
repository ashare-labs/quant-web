import { canonical } from "../../shared/format.ts";
import { isRecord } from "../../shared/json.ts";
import type { PortfolioModel } from "./api";

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const without = (value: object, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k)));
const scopeFor = (mode: PortfolioModel<"PortfolioSelection">["mode"]) =>
  mode === "price_only_no_limits"
    ? "price_only_no_limits_not_total_return"
    : "source_covered_conditional_research";
export function selectionOf(
  request: PortfolioModel<"PortfolioSelection">,
): PortfolioModel<"PortfolioSelection"> {
  const {
    dataset_id,
    securities,
    start_date,
    end_date,
    mode,
    accept_retrospective_state,
  } = request;
  return {
    dataset_id,
    securities: [...securities].sort(),
    start_date,
    end_date,
    mode,
    accept_retrospective_state,
  };
}
export function validatePreflight(
  selection: PortfolioModel<"PortfolioSelection">,
  preflight: PortfolioModel<"PortfolioPreflight">,
) {
  if (
    !same(selectionOf(selection), preflight.selection) ||
    preflight.economic_scope !== scopeFor(selection.mode) ||
    (preflight.ready &&
      (!preflight.input_sha256 ||
        !preflight.scope ||
        !same(preflight.scope.securities, selectionOf(selection).securities) ||
        preflight.scope.start_date !== selection.start_date ||
        preflight.scope.end_date !== selection.end_date))
  ) {
    throw Error(
      "WB_PREFLIGHT_CONFLICT · 预检查与当前证券、日期或研究模式不一致，不能提交。",
    );
  }
}
// This is a separate portfolio contract; v6 validation is deliberately unchanged.
// The API independently re-audits sealed native evidence on GET. These checks
// prevent mixing valid responses from different requests, scopes or revisions.
export function validatePortfolioEvidence(
  id: string,
  job: PortfolioModel<"PortfolioJobView">,
  manifest: PortfolioModel<"PortfolioManifest">,
  logs: PortfolioModel<"JobLogs">,
  result?: PortfolioModel<"PortfolioResult"> | null,
) {
  const preflight = manifest.preflight;
  validatePreflight(job.request, preflight);
  if (
    job.contract_version !== "portfolio-jobs.v1" ||
    manifest.schema_version !== "portfolio-job-manifest.v1" ||
    job.job_id !== id ||
    manifest.job_id !== id ||
    logs.job_id !== id ||
    job.session_sha256 !== manifest.session_sha256 ||
    !same(job.request, manifest.request) ||
    !preflight.ready ||
    preflight.assumption_ack_sha256 !== job.request.assumption_ack_sha256 ||
    manifest.strategy.version_id !== job.request.strategy_version_id ||
    manifest.data_identity.dataset_id !== job.request.dataset_id ||
    !same(manifest.execution_scope, preflight.scope) ||
    !isRecord(manifest.session.details) ||
    manifest.session.details.input_sha256 !== preflight.input_sha256 ||
    job.account_id !== `bt-${manifest.session.run_id}`
  ) {
    throw Error(
      "PORTFOLIO_JOB_CONFLICT · 多股任务、清单、版本、账户或数据范围不一致。",
    );
  }
  if (!result) {
    if (job.status === "succeeded" || job.result)
      throw Error("PORTFOLIO_RESULT_MISSING · 成功任务缺少完整结果。");
    return;
  }
  const finalAccount = result.receipt.final_account;
  const receiptTrades = result.receipt.trades;
  if (
    !isRecord(finalAccount) ||
    !Array.isArray(receiptTrades) ||
    !receiptTrades.every(isRecord)
  )
    throw Error(
      "PORTFOLIO_RESULT_CONFLICT · 原生回执缺少账户或成交记录，已隐藏。",
    );
  if (
    result.contract_version !== "portfolio-result.v1" ||
    job.status !== "succeeded" ||
    !job.result ||
    result.job_id !== id ||
    job.result.result_id !== id ||
    result.account_id !== job.account_id ||
    !same(result.request, job.request) ||
    !same(result.service_identity, manifest.service_identity) ||
    !same(result.strategy, manifest.strategy) ||
    !same(result.scope, manifest.execution_scope) ||
    !same(result.data_identity, manifest.data_identity) ||
    !same(result.assumptions, preflight.assumptions) ||
    !same(result.limitations, preflight.limitations) ||
    result.economic_scope !== preflight.economic_scope ||
    result.summary.metric_scope !== result.economic_scope ||
    result.receipt.identity !== manifest.session.native_identity ||
    !result.audit.passed ||
    !result.audit.accounting_passed ||
    !result.recovery.checkpoint_complete ||
    result.recovery.final_cursor !== job.committed_cursor ||
    job.committed_cursor !== job.total_cursors ||
    !same(
      result.days.map((d) => d.date),
      result.scope.trading_dates,
    ) ||
    result.summary.trade_count !== result.trades.length ||
    result.summary.order_count !== result.orders.length ||
    result.summary.final_equity !== result.account.equity ||
    result.summary.final_cash !== result.account.cash ||
    !same(result.account.positions, finalAccount.positions) ||
    result.account.equity !== finalAccount.equity ||
    result.account.cash !== finalAccount.cash ||
    !same(
      result.days.map((d) => without(d, ["at", "day_fee", "cumulative_fee"])),
      result.receipt.accounts,
    ) ||
    !same(
      result.trades.map((t) => without(t, ["at"])),
      receiptTrades.map((t) => without(t, ["at"])),
    ) ||
    !same(
      result.orders.map((o) => without(o, ["at"])),
      result.receipt.orders,
    ) ||
    !same(result.decisions, result.receipt.decisions) ||
    result.trades.some((t) => !result.scope.securities.includes(t.security)) ||
    result.orders.some((o) => !result.scope.securities.includes(o.security)) ||
    result.days.some((d) =>
      Object.keys(d.positions).some(
        (s) => !result.scope.securities.includes(s),
      ),
    )
  ) {
    throw Error(
      "PORTFOLIO_RESULT_CONFLICT · 多股结果与冻结请求、原生账户或研究范围不一致，已隐藏。",
    );
  }
}
