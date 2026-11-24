import { Fragment, useEffect, useState } from 'react';
import { csv, download } from '../shared/api';
import {
  SECURITY_PAGE_SIZE,
  breakdownReasonText,
  contributionBar,
  contributionUnavailableText,
  filterSecurities,
  holdingStatusText,
  maxContributionAbs,
  reconciliationErrorText,
  securityPnlCsv,
  signedMoney,
  signedPoints,
  sortSecurities,
  unsignedCount,
  unsignedMoney,
  type SecurityPnl,
  type SecurityPnlItem,
  type SecuritySortField,
  type SortDirection,
} from './security-pnl';

const FEE_NOTE = '净盈亏 ＝ 已平仓价差 ＋ 期末持仓价差 ＋ 现金分红 － 交易税费；两项价差均按不含税费的纯成交价计算，与「交易详情」含费平仓盈亏、「每日持仓」含买费未实现盈亏的税费归属不同。';
const CONTRIB_NOTE = '净盈亏 ÷ 初始资金换算为百分点；各标的与账户项之和等于账户累计收益率。';

function ContributionValue({ value, maxAbs, available }: {
  value: number | null;
  maxAbs: number;
  available: boolean;
}) {
  if (!available)
    return <span className="security-contrib-blank" aria-label="存在出入金，贡献留空" />;
  const formatted = signedPoints(value);
  const bar = contributionBar(value, maxAbs);
  return <div className="security-contrib-cell">
    <span className="security-contrib-track" aria-hidden="true">
      <i className="security-contrib-zero" />
      {bar.widthPct > 0 && <b
        className={'security-contrib-fill is-' + bar.direction}
        style={{ width: `${bar.widthPct}%` }}
      />}
    </span>
    <span className={'security-num is-' + formatted.tone}>{formatted.text}</span>
  </div>;
}

function BreakdownGrid({ item }: { item: SecurityPnlItem }) {
  const realized = signedMoney(item.realized_spread);
  const unrealized = signedMoney(item.unrealized_spread);
  return <>
    <div className="security-breakdown-grid">
      <div className="security-breakdown-item">
        <span><abbr tabIndex={0} title="卖出成交额减对应移动平均纯买价成本，不含买卖税费。">已平仓价差（元）</abbr></span>
        <strong className={'security-num is-' + realized.tone}>{realized.text}</strong>
      </div>
      <div className="security-breakdown-item">
        <span><abbr tabIndex={0} title="期末持仓市值减未平仓纯买价成本，不含持仓买费；已清仓为 0.00。">期末持仓价差（元）</abbr></span>
        <strong className={'security-num is-' + unrealized.tone}>{unrealized.text}</strong>
      </div>
      <div className="security-breakdown-item">
        <span><abbr tabIndex={0} title="回测期内已派息到账的税前现金分红。">现金分红（元）</abbr></span>
        <strong className="security-num is-neutral">{unsignedMoney(item.dividend_cash)}</strong>
      </div>
      <div className="security-breakdown-item">
        <span><abbr tabIndex={0} title="该标的全部买入与卖出成交的佣金及印花税合计。">交易税费（元）</abbr></span>
        <strong className="security-num is-neutral">{unsignedMoney(item.fees)}</strong>
      </div>
    </div>
    {item.breakdown_status === 'unavailable' && <p className="note security-breakdown-reason">
      {breakdownReasonText(item.breakdown_reason)}
    </p>}
  </>;
}

function SecuritySummaryFooter({ securities, maxAbs }: {
  securities: SecurityPnl;
  maxAbs: number;
}) {
  const available = securities.contribution_status === 'ok';
  const secSubtotal = signedMoney(securities.securities_pnl);
  const total = signedMoney(securities.total_pnl);
  const totalPts = signedPoints(securities.total_contribution_pp);
  const showSecSubtotal = securities.security_count >= 2 || securities.account_items.length > 0;
  return <div className="security-summary" aria-label="标的盈亏与账户总账汇总">
    <div className="security-summary-counts">
      <span>交易标的 <b>{unsignedCount(securities.security_count)}</b> 只</span>
      <span>盈 <b className="positive">{unsignedCount(securities.win_count)}</b> ／ 亏 <b className="negative">{unsignedCount(securities.loss_count)}</b> ／ 平 <b>{unsignedCount(securities.flat_count)}</b></span>
      <span>初始资金 <b>¥ {unsignedMoney(securities.initial_equity)}</b></span>
    </div>
    <div className="security-summary-ledger">
      {showSecSubtotal && <div className="security-ledger-row">
        <span>各标的净盈亏小计</span>
        <span className={'security-num is-' + secSubtotal.tone}>{secSubtotal.text} 元</span>
        {available && <span className={'security-num is-' + signedPoints(securities.securities_contribution_pp).tone}>
          {signedPoints(securities.securities_contribution_pp).text} 百分点
        </span>}
      </div>}
      {securities.account_items.map(acc => {
        const pnl = signedMoney(acc.pnl);
        return <div className="security-ledger-row is-account-item" key={acc.key}>
          <span>{acc.label}<small className="security-ledger-tag">账户／跨期项</small></span>
          <span className={'security-num is-' + pnl.tone}>{pnl.text} 元</span>
          {available && <ContributionValue value={acc.contribution_pp} maxAbs={maxAbs} available={available} />}
        </div>;
      })}
      <div className="security-ledger-row is-total">
        <span>合计（账户总盈亏）</span>
        <strong className={'security-num is-' + total.tone}>{total.text} 元</strong>
        {available
          ? <strong className={'security-num is-' + totalPts.tone} title="等于账户累计收益率（百分点）">{totalPts.text} 百分点</strong>
          : <span className="muted">出入金不闭合贡献</span>}
      </div>
    </div>
  </div>;
}

const sortLabels: Record<SecuritySortField, string> = {
  contribution_pp: '累计收益贡献',
  net_pnl: '净盈亏',
  trade_count: '成交笔数',
  buy_amount: '买入总额',
};

export function ResultSecurityPnl({ resultName, jobId, securities, loading, error, onViewTrades }: {
  resultName: string;
  jobId: string;
  securities: SecurityPnl | undefined;
  loading: boolean;
  error: string;
  onViewTrades: (security: string) => void;
}) {
  const [sortField, setSortField] = useState<SecuritySortField>('contribution_pp');
  const [sortDir, setSortDir] = useState<SortDirection>('descending');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setSortField('contribution_pp');
    setSortDir('descending');
    setQuery('');
    setPage(0);
    setExpanded([]);
    setAnnouncement('');
  }, [jobId]);

  if (loading && !securities)
    return <p className="note" role="status">正在读取标的盈亏归因…</p>;
  if (!securities)
    return <p className="note" role="status">{error ? '派生分析不可用，暂无法展示标的盈亏。' : '当前记录尚未提供标的盈亏归因。'}</p>;
  if (securities.status === 'reconciliation_error')
    return <div className="notice error security-reconcile-error" role="alert">
      <span>{reconciliationErrorText(securities.reason)}</span>
    </div>;

  const contribAvailable = securities.contribution_status === 'ok';
  const maxAbs = maxContributionAbs(securities);
  const captionId = 'security-pnl-caption-' + (jobId || 'default');

  if (securities.security_count === 0) {
    return <div className="security-pnl-view">
      {!contribAvailable && <div className="notice security-cashflow-banner" role="status">
        <span>{contributionUnavailableText(securities.contribution_reason)}</span>
      </div>}
      <div className="empty security-empty-box" role="status">
        回测全程无成交且无持仓记录。
        {securities.account_items.length > 0 && <p className="note">期间产生的现金利息等账户级变动已在下方明示单列。</p>}
      </div>
      <SecuritySummaryFooter securities={securities} maxAbs={maxAbs} />
    </div>;
  }

  if (securities.security_count === 1) {
    const item = securities.items[0];
    const net = signedMoney(item.net_pnl);
    return <div className="security-pnl-view">
      <p className="note security-caliber-bar">
        {FEE_NOTE}
        {contribAvailable ? ' ' + CONTRIB_NOTE : ''}
      </p>
      {!contribAvailable && <div className="notice security-cashflow-banner" role="status">
        <span>{contributionUnavailableText(securities.contribution_reason)}</span>
      </div>}
      <article className="security-single-card" aria-label="单标的盈亏详情">
        <div className="security-single-head">
          <div className="security-single-identity">
            <h2>
              {item.name ? <>{item.name}<span className="security-single-code">（{item.security}）</span></> : item.security}
            </h2>
            <span className={'security-badge ' + (item.position_status === 'holding' ? 'is-holding' : 'is-closed')}>
              {holdingStatusText(item, true)}
            </span>
          </div>
          <button type="button" onClick={() => onViewTrades(item.security)}>查看成交记录</button>
        </div>
        <div className="security-single-metrics">
          <div className="security-metric-box">
            <span><abbr tabIndex={0} title={FEE_NOTE}>净盈亏（元）</abbr></span>
            <strong className={'security-num is-' + net.tone}>{net.text}</strong>
          </div>
          <div className="security-metric-box">
            <span>
              <abbr tabIndex={0} title={contribAvailable ? CONTRIB_NOTE : contributionUnavailableText(securities.contribution_reason)}>
                累计收益贡献（百分点）
              </abbr>
            </span>
            {contribAvailable
              ? <ContributionValue value={item.contribution_pp} maxAbs={maxAbs} available={true} />
              : <span className="muted security-contrib-na">出入金不闭合，留空</span>}
          </div>
          <div className="security-metric-box">
            <span>成交笔数</span>
            <strong className="security-num is-neutral">{unsignedCount(item.trade_count)}</strong>
          </div>
          <div className="security-metric-box">
            <span>买入总额（元）</span>
            <strong className="security-num is-neutral">{unsignedMoney(item.buy_amount)}</strong>
          </div>
        </div>
        <div className="security-single-breakdown">
          <h3>盈亏来源拆解</h3>
          <BreakdownGrid item={item} />
        </div>
      </article>
      <SecuritySummaryFooter securities={securities} maxAbs={maxAbs} />
    </div>;
  }

  const filtered = filterSecurities(securities.items, query);
  const sorted = sortSecurities(filtered, sortField, sortDir);
  const paginated = sorted.length > SECURITY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / SECURITY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = paginated
    ? sorted.slice(currentPage * SECURITY_PAGE_SIZE, (currentPage + 1) * SECURITY_PAGE_SIZE)
    : sorted;

  const isMostProfit = (sortField === 'contribution_pp' || sortField === 'net_pnl') && sortDir === 'descending';
  const isMostLoss = (sortField === 'contribution_pp' || sortField === 'net_pnl') && sortDir === 'ascending';

  function applySort(field: SecuritySortField, nextDir: SortDirection) {
    setSortField(field);
    setSortDir(nextDir);
    setPage(0);
    setAnnouncement(`已按${sortLabels[field]}${nextDir === 'descending' ? '降序' : '升序'}排列，共 ${filtered.length} 只标的`);
  }

  function handleHeaderSort(field: SecuritySortField) {
    const nextDir: SortDirection = sortField === field
      ? (sortDir === 'descending' ? 'ascending' : 'descending')
      : 'descending';
    applySort(field, nextDir);
  }

  function toggleRow(secCode: string) {
    setExpanded(prev => prev.includes(secCode) ? prev.filter(x => x !== secCode) : [...prev, secCode]);
  }

  const ariaSortFor = (field: SecuritySortField): { 'aria-sort'?: 'ascending' | 'descending' } =>
    sortField === field ? { 'aria-sort': sortDir } : {};

  return <div className="security-pnl-view">
    <p className="note security-caliber-bar">
      {FEE_NOTE}
      {contribAvailable ? ' ' + CONTRIB_NOTE : ''}
    </p>
    {!contribAvailable && <div className="notice security-cashflow-banner" role="status">
      <span>{contributionUnavailableText(securities.contribution_reason)}</span>
    </div>}
    <div className="security-toolbar">
      <div className="security-quick-sort" role="group" aria-label="盈亏快速切换">
        <button
          type="button"
          className={isMostProfit ? 'selected' : ''}
          aria-pressed={isMostProfit}
          onClick={() => applySort('contribution_pp', 'descending')}
        >盈利最多</button>
        <button
          type="button"
          className={isMostLoss ? 'selected' : ''}
          aria-pressed={isMostLoss}
          onClick={() => applySort('contribution_pp', 'ascending')}
        >亏损最多</button>
      </div>
      <div className="security-search">
        <input
          type="search"
          aria-label="按名称或代码筛选标的"
          placeholder="筛选标的名称或代码…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {query.trim() && <button type="button" className="text-button" onClick={() => {
          setQuery('');
          setPage(0);
        }}>清空</button>}
      </div>
      <button
        type="button"
        className="security-export-btn"
        onClick={() => download(`${resultName || '回测'}-标的盈亏.csv`, csv(securityPnlCsv(securities, sorted)), 'text/csv;charset=utf-8')}
      >导出 CSV</button>
    </div>
    <div role="status" className="sr-status">{announcement}</div>
    <div tabIndex={0} role="region" aria-labelledby={captionId} className="tablewrap security-tablewrap">
      <table className="security-table">
        <caption id={captionId} className="sr-status">标的盈亏排行表</caption>
        <thead>
          <tr>
            <th scope="col">标的（点击行展开拆解）</th>
            <th scope="col" className="num-col" {...ariaSortFor('net_pnl')}>
              <button type="button" onClick={() => handleHeaderSort('net_pnl')} title={FEE_NOTE}>
                <span>净盈亏（元）</span>
                <span className="sort-indicator" aria-hidden="true" />
              </button>
            </th>
            <th scope="col" className="contrib-col" {...ariaSortFor('contribution_pp')}>
              <button
                type="button"
                onClick={() => handleHeaderSort('contribution_pp')}
                title={contribAvailable ? CONTRIB_NOTE : contributionUnavailableText(securities.contribution_reason)}
              >
                <span className="th-stack">
                  <span>累计收益贡献（百分点）</span>
                  <small>{contribAvailable ? '净盈亏÷初始资金 · 合计数等于累计收益率' : '存在出入金，贡献留空'}</small>
                </span>
                <span className="sort-indicator" aria-hidden="true" />
              </button>
            </th>
            <th scope="col" className="num-col" {...ariaSortFor('trade_count')}>
              <button type="button" onClick={() => handleHeaderSort('trade_count')}>
                <span>成交笔数</span>
                <span className="sort-indicator" aria-hidden="true" />
              </button>
            </th>
            <th scope="col" className="num-col" {...ariaSortFor('buy_amount')}>
              <button type="button" onClick={() => handleHeaderSort('buy_amount')}>
                <span>买入总额（元）</span>
                <span className="sort-indicator" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map(item => {
            const isOpen = expanded.includes(item.security);
            const net = signedMoney(item.net_pnl);
            return <Fragment key={item.security}>
              <tr
                className={'security-row' + (isOpen ? ' is-expanded' : '')}
                onClick={() => toggleRow(item.security)}
              >
                <td className="security-target-cell">
                  <button
                    type="button"
                    className="security-row-toggle"
                    aria-expanded={isOpen}
                    onClick={e => {
                      e.stopPropagation();
                      toggleRow(item.security);
                    }}
                  >
                    <span className="security-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    <span className="security-label-group">
                      {item.name
                        ? <><strong>{item.name}</strong><small>{item.security}</small></>
                        : <strong>{item.security}</strong>}
                    </span>
                    {item.position_status === 'holding' && <span className="security-badge is-holding">持仓中</span>}
                  </button>
                </td>
                <td className={'num-col security-num is-' + net.tone}>{net.text}</td>
                <td className="contrib-col">
                  <ContributionValue value={item.contribution_pp} maxAbs={maxAbs} available={contribAvailable} />
                </td>
                <td className="num-col security-num is-neutral">{unsignedCount(item.trade_count)}</td>
                <td className="num-col security-num is-neutral">{unsignedMoney(item.buy_amount)}</td>
              </tr>
              {isOpen && <tr className="security-detail-row">
                <td colSpan={5}>
                  <div className="security-detail-panel">
                    <div className="security-detail-header">
                      <span>
                        {item.name ? `${item.name}（${item.security}）` : item.security}
                        {' · '}
                        {holdingStatusText(item, true)}
                      </span>
                      <button type="button" onClick={() => onViewTrades(item.security)}>查看成交记录</button>
                    </div>
                    <BreakdownGrid item={item} />
                  </div>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div>
    {!visible.length && <div className="empty">未找到匹配「{query.trim()}」的标的。</div>}
    {paginated && <div className="pagination">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
      <span>{currentPage + 1} / {totalPages} · 共 {sorted.length} 只标的</span>
      <button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
    </div>}
    <SecuritySummaryFooter securities={securities} maxAbs={maxAbs} />
  </div>;
}
