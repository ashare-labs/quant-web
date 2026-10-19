import { ApiError, requestJson } from '../../shared/http';

export const contract = 'local-online-accounts.v1';
export type AccountSummary = { account_id: string; label: string; identity: string; last_day: string; status: 'settled'; runtime_compatible: true };
export type Position = { quantity: number; sellable: number; price: string; market_value: string; average_cost: string; dividend_receivable: string };
export type Trade = { id: number; order_id: number; security: string; side: 'BUY' | 'SELL'; quantity: number; price: string; commission: string; tax: string; cost: string };
export type AccountView = AccountSummary & {
  contract_version: string; head: string; days: string[]; model: string; read_only: true; next_day_authorized: false;
  account: { total_cash: string; available_cash: string; frozen_cash: string; nav: string; positions: Record<string, Position>; open_orders: unknown[] };
  orders: { id: number; security: string; side: string; quantity: number; filled: number; remaining: number; status: string }[];
  trades: Trade[]; fees: string; cursor: number; settlement_count: number; review_sha256: string; limitations: string[];
};
const base = '/execution-api/online-accounts';
const invalid = () => new ApiError('ACCOUNT_RESPONSE_INVALID', '账户响应不符合登记契约，旧结果已隐藏。');
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): value is string => typeof value === 'string'
  && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
const nonnegative = (value: unknown): value is string => amount(value) && Number(value) >= 0;
const summaryValid = (value: unknown): value is AccountSummary & Record<string, unknown> => record(value) && typeof value.account_id === 'string'
  && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value.account_id) && text(value.label) && hash(value.identity)
  && date(value.last_day) && value.status === 'settled' && value.runtime_compatible === true;
const positionValid = (value: unknown): value is Position => record(value) && integer(value.quantity) && integer(value.sellable)
  && value.sellable <= value.quantity && nonnegative(value.price) && nonnegative(value.market_value)
  && amount(value.average_cost) && nonnegative(value.dividend_receivable)
  && (value.quantity === 0 ? Number(value.market_value) === 0 : Number(value.price) > 0 && Number(value.market_value) > 0);
const side = (value: unknown) => value === 'BUY' || value === 'SELL';
const orderValid = (value: unknown) => record(value) && integer(value.id) && text(value.security) && side(value.side)
  && integer(value.quantity) && value.quantity > 0 && integer(value.filled) && integer(value.remaining)
  && value.filled + value.remaining === value.quantity
  && (value.status === 'FILLED' ? value.remaining === 0 : value.status === 'CANCELLED' || value.status === 'REJECTED');
const tradeValid = (value: unknown) => record(value) && integer(value.id) && integer(value.order_id) && text(value.security) && side(value.side)
  && integer(value.quantity) && value.quantity > 0 && nonnegative(value.price) && Number(value.price) > 0
  && nonnegative(value.commission) && nonnegative(value.tax) && nonnegative(value.cost);
const detailValid = (value: unknown): value is AccountView => record(value) && summaryValid(value)
  && value.contract_version === contract && hash(value.head) && hash(value.review_sha256)
  && value.read_only === true && value.next_day_authorized === false && text(value.model)
  && Array.isArray(value.days) && value.days.length > 0 && value.days.every(date) && value.days.includes(value.last_day)
  && integer(value.cursor) && integer(value.settlement_count) && value.settlement_count > 0
  && Array.isArray(value.limitations) && value.limitations.every(text) && nonnegative(value.fees)
  && record(value.account) && amount(value.account.total_cash) && amount(value.account.nav)
  && nonnegative(value.account.available_cash) && amount(value.account.frozen_cash) && Number(value.account.frozen_cash) === 0
  && Array.isArray(value.account.open_orders) && value.account.open_orders.length === 0
  && record(value.account.positions) && Object.entries(value.account.positions).every(([security, p]) => text(security) && positionValid(p))
  && Array.isArray(value.orders) && value.orders.every(orderValid) && Array.isArray(value.trades) && value.trades.every(tradeValid);

export async function readAccounts(signal?: AbortSignal): Promise<AccountSummary[]> {
  const value = await requestJson<unknown>(base, '', undefined, signal);
  if (!record(value) || value.contract_version !== contract || !Array.isArray(value.accounts) || !value.accounts.every(summaryValid)
    || new Set(value.accounts.map(item => item.account_id)).size !== value.accounts.length) throw invalid();
  return value.accounts;
}

export async function readAccount(selected: AccountSummary, signal?: AbortSignal): Promise<AccountView> {
  const value = await requestJson<unknown>(base, '/' + encodeURIComponent(selected.account_id), undefined, signal);
  if (!detailValid(value) || value.account_id !== selected.account_id || value.identity !== selected.identity) throw invalid();
  return value;
}
