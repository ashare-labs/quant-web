import { ApiError, requestJson } from '../../shared/http';

export const contract = 'local-online-accounts.v1';
export type AccountSummary = { account_id: string; label: string; identity: string; last_day: string; status: 'settled'; runtime_compatible: true };
export type Position = { quantity: number; sellable: number; price: string; market_value: string };
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
const summaryValid = (value: AccountSummary) => value && typeof value.account_id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value.account_id)
  && typeof value.label === 'string' && hash(value.identity) && /^\d{4}-\d{2}-\d{2}$/.test(value.last_day) && value.status === 'settled' && value.runtime_compatible === true;
const amount = (value: unknown) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));

export async function readAccounts(signal?: AbortSignal): Promise<AccountSummary[]> {
  const value = await requestJson<{ contract_version: string; accounts: AccountSummary[] }>(base, '', undefined, signal);
  if (value.contract_version !== contract || !Array.isArray(value.accounts) || !value.accounts.every(summaryValid)
    || new Set(value.accounts.map(item => item.account_id)).size !== value.accounts.length) throw invalid();
  return value.accounts;
}

export async function readAccount(selected: AccountSummary, signal?: AbortSignal): Promise<AccountView> {
  const value = await requestJson<AccountView>(base, '/' + encodeURIComponent(selected.account_id), undefined, signal);
  if (value.contract_version !== contract || !summaryValid(value) || value.account_id !== selected.account_id || value.identity !== selected.identity
    || !hash(value.head) || !hash(value.review_sha256) || value.read_only !== true || value.next_day_authorized !== false
    || !value.account || !amount(value.account.total_cash) || !amount(value.account.nav) || !amount(value.fees)
    || !Array.isArray(value.orders) || !Array.isArray(value.trades) || !Array.isArray(value.limitations)
    || !value.account.positions || typeof value.account.positions !== 'object') throw invalid();
  return value;
}
