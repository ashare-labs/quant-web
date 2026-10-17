import pin from '../../../contracts/paper.identity.json';
import schema from '../../../contracts/paper.openapi.json';
import { canonical } from '../../shared/format.mjs';
import type { components } from '../../generated/paper';

export type Failure = { code: string; message: string; detail?: string; next_action?: string };
export type Action = components['schemas']['ControlAction'] & Partial<Pick<components['schemas']['AdvanceAction'], 'day'>>;
export type Account = { nav: string; total_cash: string; available_cash: string; frozen_cash: string; positions: Record<string, { quantity: number; sellable: number; price: string; market_value: string; average_cost: string; dividend_receivable: string }> };
export type Config = { account_id: string; strategy_id: string | null; strategy_version: string; scenario_manifest_sha256: string; initial_cash: string; data_mode: string; cash_dividend_policy: string; execution_admission_scope: string; risk: Record<string, string | number | boolean>; universe: string[] };
export type Receipt = { strategy_id: string; scheduled: boolean; reason: string; previous_equity: string; information_cutoff: string; history_sha256: string; signal: { targets: Record<string, number>; weights: Record<string, string>; scores: Record<string, string> } };
export type Decision = { order_admissions?: { row: { security: string; date: string }; report: { admitted_side: string; admission_scope: string }; admission: { ready: boolean; whole_window_ready: boolean } }[]; expected_parent: string | null; strategy_receipt_sha256: string; data_manifest_sha256: string; targets: Record<string, number>; clock_basis: string; strategy_receipt: Receipt | null; rows: { security: string; price_date: string; selected_watermark: string; complete: boolean }[] };
export type Order = { id: number; security: string; side: string; quantity: number; filled: number; status: string; message?: string };
export type Trade = { id: number; order_id: number; security: string; side: string; quantity: number; price: string; cost: string; commission: string; tax: string; at: string };
export type Refusal = { security: string; quantity?: number; code: string; message: string; measured?: string; cap?: string; cash_before?: string };
export type DividendAudit = { security: string; record_date: string; ex_date: string; pay_date: string; record_quantity: number; cash_per_share: string; gross_entitlement: string; cash_paid: string; withholding: string; model_cash_available_at: string; source_event: { payment_time?: string | null; cash_available_at?: string | null; ex_price_cash_deduction?: string } };
export type Report = { schema: string; session_id: string; day: string; intent_id: string; checkpoint_sha256: string; data_mode: string; summary: string; strategy_receipt_sha256: string; native: { opening_reconciliation?: { status: string; cash_delta: string; actions: DividendAudit[] }; account: Account; orders: Record<string, Order>; trades: Trade[]; refusals?: Refusal[]; submissions?: { security: string; quantity: number; order_id: number | null; cash_before: string; cash_after: string; status: string }[]; target_gaps: Record<string, number>; cursor: number; settlement_count: number; reconciliation: { status: string }; risk: Record<string, string> } };
export type Day = { day: string; status: string; attempts: number; intent_id: string; checkpoint_sha: string | null; report_sha: string | null; recovery_required: boolean; error: Failure | null };
export type Replay = { delivery?: { mode: string; source_sha256: string; next_input_day: string | null; received: { day: string; packet_sha256: string; received_at: string }[]; ad_admission: { ready: boolean; issues: unknown[] }; observation_admission?: { ready: boolean; issues: unknown[] }; consumer_contract?: { sha256: string; contract: { api_version: string; immutable_data_producer_version: string; source_commit: string }; references: { order_impact_summary: { strategies: { strategy: string; unresolved_status_orders: number }[] } } } }; next_day: string | null; days: string[]; producer: Record<string, string>; owner_binding_sha256: string | null; limitations: string[]; assumptions: { id: string; text: string }[]; state_mode: string; clock_basis: string; binding: { input_sha256: string; window: { id: string; start: string; end: string } }; preflight: { ready: boolean; gaps: unknown[] } };
export type View = { contract_version: string; session_id: string; identity: string; engine_pin: { sources: string }; config: Config; head: string | null; last_day: string | null; paused: boolean; days: Day[]; selected_day: string | null; decision: Decision | null; report: Report | null; latest_account: Account | null; account_as_of: string | null; events: { sequence: number; day: string | null; kind: string; details: Failure & Record<string, unknown> }[]; replay: Replay | null; continuous_paper_accepted: false; execution_permission: false; historical_pit_verified: false; observed_data_enabled: false };
export type Session = { id: string; config: Config; last_day: string | null; paused: boolean };

export class PaperError extends Error {
  constructor(public failure: Failure) { super(`${failure.code} · ${failure.message}`); }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 140000);
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`/paper-api${path}`, { method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: controller.signal });
    const value = await response.json();
    if (!response.ok) throw new PaperError(value.error || { code: `HTTP_${response.status}`, message: '响应不符合模拟契约。' });
    return value as T;
  } catch (e) {
    if (e instanceof PaperError) throw e;
    throw new PaperError({ code: 'PAPER_NETWORK_UNCERTAIN', message: '连接中断或响应无法核验。账户与报告已隐藏。',
      next_action: '重新读取状态后，使用保留的同日请求确认结果；不要把新一天当作重试。' });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function bootstrap(signal?: AbortSignal): Promise<Session[]> {
  const [caps, actual] = await Promise.all([
    api<Record<string, unknown>>('/capabilities', undefined, signal), api<unknown>('/schema', undefined, signal),
  ]);
  if (caps.contract_version !== pin.contract_version || caps.source_sha256 !== pin.source_sha256
    || caps.continuous_paper_accepted !== false || caps.broker_enabled !== false
    || caps.execution_permission !== false || caps.observed_data_enabled !== false
    || caps.historical_pit_verified !== false || canonical(actual) !== canonical(schema)) {
    throw new PaperError({ code: 'PAPER_SERVICE_MISMATCH', message: '后端源码、契约或能力边界与固定版本不符；操作已禁用。' });
  }
  return (await api<{ sessions: Session[] }>('/sessions', undefined, signal)).sessions;
}

export function verify(view: View, sid: string) {
  if (view.contract_version !== pin.contract_version || view.session_id !== sid
    || view.engine_pin.sources !== pin.source_sha256 || view.continuous_paper_accepted !== false
    || view.execution_permission !== false || view.historical_pit_verified !== false || view.observed_data_enabled !== false) {
    throw new PaperError({ code: 'PAPER_VIEW_MISMATCH', message: '会话身份或能力边界无法核验，旧结果已隐藏。' });
  }
  const r = view.report;
  if (r && (r.session_id !== sid || r.day !== view.selected_day || r.schema !== 'paper-report.v1'
    || r.data_mode !== view.config.data_mode || r.native.reconciliation.status !== 'passed'
    || (view.config.cash_dividend_policy === 'gross_zero_withholding_0900' && r.native.opening_reconciliation?.status !== 'passed')
    || r.strategy_receipt_sha256 !== view.decision?.strategy_receipt_sha256
    || !view.days.some(d => d.day === r.day && d.status === 'committed' && d.checkpoint_sha === r.checkpoint_sha256 && d.intent_id === r.intent_id))) {
    throw new PaperError({ code: 'PAPER_REPORT_MISMATCH', message: '日报与选定日、意图或检查点不匹配，旧结果已隐藏。' });
  }
}

export { pin };
