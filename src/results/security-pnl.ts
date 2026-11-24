import { object, rows, type Row } from '../shared/api.ts';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullable = (v: unknown): v is number | null => v === null || finite(v);
const nonNegInt = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0;

export type SignedTone = 'positive' | 'negative' | 'zero' | 'muted';

export interface SignedDisplay {
  text: string;
  tone: SignedTone;
}

export interface SecurityPnlItem {
  security: string;
  name: string | null;
  position_status: 'closed' | 'holding';
  ending_quantity: number;
  pending_shares: number;
  ending_value: number;
  trade_count: number;
  buy_amount: number;
  sell_amount: number;
  net_pnl: number;
  contribution_pp: number | null;
  breakdown_status: 'ok' | 'unavailable';
  breakdown_reason: string | null;
  realized_spread: number | null;
  unrealized_spread: number | null;
  dividend_cash: number | null;
  fees: number | null;
}

export interface AccountPnlItem {
  key: string;
  label: string;
  pnl: number;
  contribution_pp: number | null;
}

export interface SecurityPnl {
  status: 'ok' | 'reconciliation_error';
  reason: string | null;
  contribution_status: 'ok' | 'unavailable';
  contribution_reason: string | null;
  initial_equity: number;
  final_equity: number;
  external_cash_flow: number;
  total_pnl: number;
  total_contribution_pp: number | null;
  security_count: number;
  win_count: number;
  loss_count: number;
  flat_count: number;
  securities_pnl: number | null;
  securities_contribution_pp: number | null;
  items: SecurityPnlItem[];
  account_items: AccountPnlItem[];
}

export type SecuritySortField = 'contribution_pp' | 'net_pnl' | 'trade_count' | 'buy_amount';
export type SortDirection = 'ascending' | 'descending';

export const SECURITY_PAGE_SIZE = 20;

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function acceptedSecurityPnl(raw: unknown): SecurityPnl | null {
  const s = object(raw);
  if (!['ok', 'reconciliation_error'].includes(String(s.status))
    || !['ok', 'unavailable'].includes(String(s.contribution_status))
    || !finite(s.initial_equity) || s.initial_equity <= 0
    || !finite(s.final_equity) || !finite(s.external_cash_flow) || !finite(s.total_pnl)
    || !nullable(s.total_contribution_pp)
    || !nonNegInt(s.security_count) || !nonNegInt(s.win_count)
    || !nonNegInt(s.loss_count) || !nonNegInt(s.flat_count)
    || !nullable(s.securities_pnl) || !nullable(s.securities_contribution_pp)
    || !Array.isArray(s.items) || !Array.isArray(s.account_items))
    return null;

  const contribOk = s.contribution_status === 'ok';
  if (s.status === 'reconciliation_error') {
    if (typeof s.reason !== 'string' || !s.reason || s.items.length !== 0 || s.account_items.length !== 0)
      return null;
    return s as unknown as SecurityPnl;
  }
  if (s.reason !== null
    || (contribOk ? !finite(s.total_contribution_pp) || !finite(s.securities_contribution_pp)
      : s.total_contribution_pp !== null || s.securities_contribution_pp !== null || typeof s.contribution_reason !== 'string')
    || !finite(s.securities_pnl)
    || s.items.length !== s.security_count
    || s.win_count + s.loss_count + s.flat_count !== s.items.length)
    return null;

  const parsedItems = rows(s.items);
  if (parsedItems.length !== s.items.length)
    return null;
  for (const item of parsedItems) {
    if (typeof item.security !== 'string' || !item.security
      || !(item.name === null || typeof item.name === 'string')
      || !['closed', 'holding'].includes(String(item.position_status))
      || !nonNegInt(item.ending_quantity) || !nonNegInt(item.pending_shares)
      || !finite(item.ending_value) || !nonNegInt(item.trade_count)
      || !finite(item.buy_amount) || !finite(item.sell_amount) || !finite(item.net_pnl)
      || (contribOk ? !finite(item.contribution_pp) : item.contribution_pp !== null)
      || !['ok', 'unavailable'].includes(String(item.breakdown_status))
      || !nullable(item.dividend_cash) || !nullable(item.fees))
      return null;
    if (item.breakdown_status === 'ok') {
      if (item.breakdown_reason !== null || !finite(item.realized_spread) || !finite(item.unrealized_spread))
        return null;
    }
    else if (typeof item.breakdown_reason !== 'string' || item.realized_spread !== null || item.unrealized_spread !== null) {
      return null;
    }
  }

  const parsedAccounts = rows(s.account_items);
  if (parsedAccounts.length !== s.account_items.length)
    return null;
  for (const acc of parsedAccounts) {
    if (typeof acc.key !== 'string' || !acc.key
      || typeof acc.label !== 'string' || !acc.label
      || !finite(acc.pnl)
      || (contribOk ? !finite(acc.contribution_pp) : acc.contribution_pp !== null))
      return null;
  }
  return s as unknown as SecurityPnl;
}

function formatTwoDecimals(absValue: number): string {
  return absValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Signed red/green/grey formatter strictly for:
 * 净盈亏, 已平仓价差, 期末持仓价差, and 累计收益贡献（百分点，无 %）.
 */
export function signedTwoDecimal(value: unknown): SignedDisplay {
  if (!finite(value))
    return { text: '—', tone: 'muted' };
  const cents = Math.round(value * 100);
  if (cents === 0)
    return { text: '0.00', tone: 'zero' };
  const absText = formatTwoDecimals(Math.abs(cents) / 100);
  return cents > 0
    ? { text: '+' + absText, tone: 'positive' }
    : { text: '-' + absText, tone: 'negative' };
}

export const signedMoney = signedTwoDecimal;
export const signedPoints = signedTwoDecimal;

/**
 * Neutral unsigned 2-decimal formatter for:
 * 买入总额, 现金分红, 交易税费.
 */
export function unsignedMoney(value: unknown): string {
  if (!finite(value))
    return '—';
  const cents = Math.abs(Math.round(value * 100)) / 100;
  return formatTwoDecimals(cents);
}

/**
 * Neutral unsigned integer formatter for:
 * 成交笔数, 持仓股数.
 */
export function unsignedCount(value: unknown): string {
  if (!finite(value))
    return '—';
  return Math.round(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function contributionBar(value: number | null, maxAbs: number): {
  direction: 'positive' | 'negative' | 'zero';
  widthPct: number;
} {
  if (!finite(value) || maxAbs <= 0)
    return { direction: 'zero', widthPct: 0 };
  const cents = Math.round(value * 100);
  if (cents === 0)
    return { direction: 'zero', widthPct: 0 };
  const ratio = Math.min(1, Math.abs(value) / maxAbs);
  const widthPct = Math.max(2, Number((ratio * 50).toFixed(2)));
  return {
    direction: cents > 0 ? 'positive' : 'negative',
    widthPct
  };
}

export function maxContributionAbs(sec: SecurityPnl): number {
  if (sec.contribution_status !== 'ok')
    return 0;
  let max = 0;
  for (const item of sec.items)
    if (finite(item.contribution_pp))
      max = Math.max(max, Math.abs(item.contribution_pp));
  for (const acc of sec.account_items)
    if (finite(acc.contribution_pp))
      max = Math.max(max, Math.abs(acc.contribution_pp));
  return max;
}

export function securityDisplayTitle(security: string, name: string | null | undefined): string {
  const clean = typeof name === 'string' ? name.trim() : '';
  return clean && clean !== security ? `${clean}（${security}）` : security;
}

export function holdingStatusText(item: SecurityPnlItem, detailed: boolean): string {
  if (item.position_status === 'closed')
    return detailed ? '已清仓' : '';
  if (!detailed)
    return '持仓中';
  if (item.ending_quantity > 0 && item.pending_shares > 0)
    return `持仓中 · ${unsignedCount(item.ending_quantity)} 股（含待到账 ${unsignedCount(item.pending_shares)} 股）`;
  if (item.ending_quantity > 0)
    return `持仓中 · ${unsignedCount(item.ending_quantity)} 股`;
  return `持仓中 · 待到账 ${unsignedCount(item.pending_shares)} 股`;
}

export function breakdownReasonText(reason: string | null): string {
  if (reason === 'corporate_share_adjustment')
    return '含送转股等份额变动，暂不支持拆分已平仓价差与期末持仓价差；标的净盈亏与收益贡献已按账本实绩准确计入。';
  return reason ? '公司行为复杂，暂不支持拆分两项价差；标的净盈亏与收益贡献已按账本实绩准确计入。' : '';
}

export function contributionUnavailableText(reason: string | null): string {
  if (reason === 'external_cash_flows')
    return '回测期间存在出入金，无法按单一初始资金闭合换算收益率贡献，贡献列留空，仅展示净盈亏（元）。';
  return '当前账本不支持按单一初始资金换算累计收益贡献，仅展示净盈亏（元）。';
}

const reconciliationReasons: Record<string, string> = {
  missing_trades: '缺少成交明细记录',
  invalid_trade_record: '成交记录字段缺失或格式无效',
  unmatched_position_history: '逐日持仓数量与成交及份额变动无法对齐',
  missing_position_snapshots: '缺少逐日持仓快照',
  invalid_position_snapshot: '持仓快照数值无效',
  missing_account_cash: '缺少账户现金字段',
  cash_ledger_mismatch: '成交、分红或利息现金流与账户期末现金未对齐',
  corporate_records_incomplete: '公司行为记录不完整',
  corporate_tax_model_unsupported: '分红税费模型暂不支持归因对账',
  corporate_cash_unsettled: '存在未标记除息或到账阶段的分红记录',
  corporate_record_basis_mismatch: '分红登记日持仓基数或应收分红与账本不一致',
  corporate_record_date_outside_result: '分红登记日超出回测区间',
  corporate_payment_outside_result: '已到账分红派息日超出回测区间',
  missing_pending_share_valuation: '在途送转股缺少期末估值',
  invalid_cash_interest: '现金利息记录格式或金额不一致',
  invalid_external_cash_flow: '出入金记录格式无效',
  equity_reconciliation_mismatch: '各标的及账户项目净盈亏合计与账户总盈亏不一致',
};

export function reconciliationErrorText(reason: string | null): string {
  const detail = reason ? (reconciliationReasons[reason] || reason) : '账本数据不一致';
  return `归因对账异常：${detail}，无法与账户总盈亏闭合，已停止展示归因明细。`;
}

export function filterSecurities(items: SecurityPnlItem[], query: string): SecurityPnlItem[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return items;
  return items.filter(item => {
    const title = securityDisplayTitle(item.security, item.name).toLowerCase();
    return item.security.toLowerCase().includes(q)
      || (item.name?.toLowerCase().includes(q) ?? false)
      || title.includes(q);
  });
}

export function sortSecurities(
  items: SecurityPnlItem[],
  field: SecuritySortField,
  direction: SortDirection,
): SecurityPnlItem[] {
  const factor = direction === 'ascending' ? 1 : -1;
  const numericValue = (item: SecurityPnlItem): number => {
    if (field === 'contribution_pp')
      return finite(item.contribution_pp) ? item.contribution_pp : item.net_pnl;
    return item[field];
  };
  return [...items].sort((a, b) => {
    const diff = (numericValue(a) - numericValue(b)) * factor;
    if (diff !== 0)
      return diff;
    return collator.compare(a.security, b.security);
  });
}

export function securityPnlCsv(sec: SecurityPnl, items: SecurityPnlItem[]): unknown[][] {
  const header = [
    '标的代码',
    '标的名称',
    '期末持仓状态',
    '期末持仓股数',
    '净盈亏(元)',
    '累计收益贡献(百分点)',
    '已平仓价差(元)',
    '期末持仓价差(元)',
    '现金分红(元)',
    '交易税费(元)',
    '成交笔数',
    '买入总额(元)',
    '说明',
  ];
  const body: unknown[][] = items.map(item => [
    item.security,
    item.name ?? '',
    holdingStatusText(item, true),
    item.ending_quantity + item.pending_shares,
    Number(item.net_pnl.toFixed(2)),
    finite(item.contribution_pp) ? Number(item.contribution_pp.toFixed(2)) : '',
    finite(item.realized_spread) ? Number(item.realized_spread.toFixed(2)) : '',
    finite(item.unrealized_spread) ? Number(item.unrealized_spread.toFixed(2)) : '',
    finite(item.dividend_cash) ? Number(item.dividend_cash.toFixed(2)) : '',
    finite(item.fees) ? Number(item.fees.toFixed(2)) : '',
    item.trade_count,
    Number(item.buy_amount.toFixed(2)),
    item.breakdown_status === 'unavailable' ? breakdownReasonText(item.breakdown_reason) : '',
  ]);
  for (const acc of sec.account_items) {
    body.push([
      acc.key,
      acc.label,
      '账户级/跨期项',
      '',
      Number(acc.pnl.toFixed(2)),
      finite(acc.contribution_pp) ? Number(acc.contribution_pp.toFixed(2)) : '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }
  body.push([
    'TOTAL',
    '账户总盈亏合计',
    `交易标的 ${sec.security_count} 只（盈 ${sec.win_count} / 亏 ${sec.loss_count} / 平 ${sec.flat_count}）`,
    '',
    Number(sec.total_pnl.toFixed(2)),
    finite(sec.total_contribution_pp) ? Number(sec.total_contribution_pp.toFixed(2)) : '',
    '',
    '',
    '',
    '',
    '',
    '',
    sec.contribution_status === 'unavailable' ? contributionUnavailableText(sec.contribution_reason) : '',
  ]);
  return [header, ...body];
}

export function filterTradeRows(allRows: Row[], query: string): Row[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return allRows;
  return allRows.filter(row => {
    const code = String(row.security_code ?? row.security ?? '').toLowerCase();
    const name = String(row.security_name ?? '').toLowerCase();
    const display = String(row.security ?? '').toLowerCase();
    return code.includes(q) || name.includes(q) || display.includes(q);
  });
}

export function tradeSecurityOptions(allRows: Row[], sec: SecurityPnl | null | undefined): Array<{
  code: string;
  name: string | null;
  label: string;
}> {
  const map = new Map<string, string | null>();
  for (const item of sec?.items ?? [])
    map.set(item.security, item.name);
  for (const row of allRows) {
    const code = String(row.security_code ?? row.security ?? '');
    if (code && !map.has(code)) {
      const rawName = typeof row.security_name === 'string' && row.security_name ? row.security_name : null;
      map.set(code, rawName);
    }
  }
  return [...map.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([code, name]) => ({
      code,
      name,
      label: securityDisplayTitle(code, name)
    }));
}

export function describeTradeFilter(
  query: string,
  options: Array<{ code: string; name: string | null; label: string }>,
): string {
  const trimmed = query.trim();
  if (!trimmed)
    return '';
  const lower = trimmed.toLowerCase();
  const exact = options.find(opt =>
    opt.code.toLowerCase() === lower
    || (opt.name && opt.name.toLowerCase() === lower)
    || opt.label.toLowerCase() === lower
  );
  return exact ? exact.label : trimmed;
}
