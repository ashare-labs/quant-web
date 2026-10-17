import type { components } from "../../generated/portfolio";
import { requestJson, ApiError } from "../../shared/http";
import { canonical } from "../../shared/format.ts";
import { validatePortfolioEvidence } from "./evidence.ts";
import { assertSameService, verifyCompatibility } from "./compatibility.ts";
import contract from "../../../contracts/portfolio.openapi.json";

export type PortfolioModel<K extends keyof components["schemas"]> =
  components["schemas"][K];
export type Job = PortfolioModel<"PortfolioJobView">;
export type Strategy = PortfolioModel<"PortfolioStrategyVersion">;
export const request = <T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => requestJson<T>("/portfolio-api", path, body, signal);
export async function readPortfolio(signal?: AbortSignal) {
  const [catalogue, schema, service, listing, strategies] =
    await Promise.all([
      request<PortfolioModel<"PortfolioCatalogue">>("/catalogue", undefined, signal),
      request<unknown>("/openapi.json", undefined, signal),
      request<PortfolioModel<"PortfolioServiceStatus">>("/service", undefined, signal),
      request<PortfolioModel<"PortfolioJobList">>("/jobs", undefined, signal),
      request<Strategy[]>("/strategies", undefined, signal),
    ]);
  verifyCompatibility(catalogue, schema, service, contract);
  return {
    catalogue,
    service,
    jobs: listing.items.sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
    strategies: strategies.sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  };
}
export type Index = Awaited<ReturnType<typeof readPortfolio>>;
export async function readDetail(id: string, identity: PortfolioModel<"PortfolioIdentity">, signal?: AbortSignal) {
  if (!/^m2job-[a-f0-9]{32}$/.test(id))
    throw new ApiError(
      "INVALID_JOB_ID",
      "任务地址无效。请从任务列表重新选择。",
    );
  const path = `/jobs/${id}`;
  const job = await request<Job>(path, undefined, signal);
  const [manifest, logs, result] = await Promise.all([
    request<PortfolioModel<"PortfolioManifest">>(`${path}/manifest`, undefined, signal),
    request<PortfolioModel<"JobLogs">>(`${path}/logs`, undefined, signal),
    job.result
      ? request<PortfolioModel<"PortfolioResult">>(`${path}/result`, undefined, signal)
      : Promise.resolve(null),
  ]);
  assertSameService(manifest.service_identity, identity);
  if (result) assertSameService(result.service_identity, identity);
  const after = await request<Job>(path, undefined, signal);
  if (canonical(job) !== canonical(after))
    throw new ApiError(
      "PORTFOLIO_SNAPSHOT_CHANGED",
      "任务正在更新，正在重新读取同一份结果。",
    );
  validatePortfolioEvidence(id, job, manifest, logs, result);
  return { job, manifest, logs, result };
}
export type Detail = Awaited<ReturnType<typeof readDetail>>;
