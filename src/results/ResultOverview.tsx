import { lazy, Suspense } from 'react';
import { csv, download, object, pct, rows, type Row } from '../shared/api';
import { DataTable } from '../shared/DataTable';
import { finite, metricCsv, metricDefinition, metricDefinitions, metricText, money, reasonText, resultMetrics, type Analysis, type BenchmarkOption } from './model';
const ResultChart = lazy(() => import('./ResultChart'));
const LegacyChart = lazy(() => import('../shared/LineChart'));
export function ResultOverview({ result, analysis, loading, error, benchmark }: {
  result: Row;
  analysis: Analysis | null;
  loading: boolean;
  error: string;
  benchmark: {
    selection: string;
    options: BenchmarkOption[];
    onSelect: (value: string) => void;
  };
}) {
  const summary = object(result.summary);
  const native = object(result.native);
  const metrics = resultMetrics(summary, analysis);
  const accounts = rows(native.accounts);
  const worst = analysis?.drawdowns[0];
  return <>
    <div className="result-benchmark">
      <label>比较基准 <select aria-label="比较基准" value={benchmark.selection} onChange={e => benchmark.onSelect(e.target.value)}>
        {benchmark.options.map(option => <option key={option.value} value={option.value}>
          {option.label}
        </option>)}
      </select></label>
      <span role="status">
        {loading ? '正在读取比较…' : error ? '比较暂不可用' : analysis?.comparison?.source === 'derived' ? '派生比较 · 原结果保留' : analysis?.benchmark?.selection_source === 'default' ? '原始基准 · 默认沪深300' : '原始基准'}
        {!loading && !error && analysis?.metrics.benchmark_return.value === null ? ' · ' + reasonText(analysis.metrics.benchmark_return.reason) : ''}
      </span>
    </div>
    <div className="metrics result-metrics">{metricDefinitions.map(([key, label]) => {
      const definition = metricDefinition(key, analysis);
      const m = metrics[key];
      const reason = reasonText(m.reason);
      const color = m.value !== null && ['net_return', 'annual_return', 'excess_return', 'benchmark_return', 'daily_excess_return'].includes(key) ? m.value > 0 ? 'positive' : m.value < 0 ? 'negative' : '' : '';
      return <div className="metric" key={key}>
        <span>
          <abbr tabIndex={0} title={definition}>
            {label}
          </abbr>
        </span>
        <strong className={color} title={reason || definition}>{metricText(m)}</strong>
        <small>{m.value === null ? reason : '\u00a0'}</small>
      </div>;
    })}</div>
    {analysis ? <>
      <div className="result-account-summary">
        <span>期初资金 <b>
          {money(analysis.initial_equity)}
        </b></span>
        <span>期末权益 <b>{money(analysis.series.at(-1)?.equity)}</b></span>
        <span title="佣金与交易税已计入权益，不再重复扣除。">成交费用 <b>{money(analysis.costs.total)}</b></span>
        <span title="账本已支付现金分红；税模型详见口径。">现金分红 <b>
          {money(analysis.costs.dividend_cash)}
        </b></span>
      </div>
      <Suspense fallback={<p className="note">正在绘制收益图…</p>}>
        <ResultChart analysis={analysis} />
      </Suspense>
      <p className="result-drawdown-note">最大回撤区间：{worst ? `${worst.peak_date ?? '期初'} — ${worst.trough_date}` : '无回撤'}
        {worst && <>；{worst.recovery_date ? `恢复于 ${worst.recovery_date}` : '截至期末尚未恢复'}</>}</p>
      <p className="note result-policy">日终评价 · {analysis.sample_count} 个交易日 · 年化因子 {String(analysis.policy.annualization)} ·
        无风险年利率 {pct(analysis.policy.risk_free_annual)}{analysis.policy.risk_free_source === 'assumed_zero' ? '（零利率假设）' : ''}
        {analysis.benchmark?.status === 'ok' ? ` · ${String(analysis.benchmark.name || analysis.benchmark.security)}（${analysis.benchmark.return_type === 'total_return' ? '全收益' : '价格收益'}）` : ' · 基准未就绪'}
        {object(analysis.quality.corporate_account_model).tax === 'gross_cash_no_tax' ? ' · 分红按税前模型' : ''} · 相对净值超额</p>
    </> : <>
      <p className="note" role="status">{loading ? '正在读取派生分析…' : error ? '派生分析暂不可用。' : '此记录尚未提供派生分析。'} <span title={error}>缺少的指标保留为空。</span></p>
      {accounts.length > 0 && <Suspense fallback={<p className="note">正在绘制权益图…</p>}>
        <LegacyChart title="账户权益 · 每日收盘" labels={accounts.map(a => String(a.at || ''))} series={[{ name: '账户权益', values: accounts.map(a => finite(a.total_value) ? a.total_value : null) }]} />
      </Suspense>}
    </>}
    <div className="result-export">
      <button disabled={loading} onClick={() => download(String(result.name || '回测') + '-指标.csv', csv(metricCsv(summary, analysis)), 'text/csv;charset=utf-8')}>导出指标 CSV</button>
    </div>
    {analysis && <details className="result-more"><summary>更多分析：回撤恢复、月度与滚动表现</summary>
      <h2>回撤与恢复</h2><DataTable name="回撤区间" data={analysis.drawdowns} columns={[
        {
          key: 'peak_date',
          label: '峰值日',
          value: r => r.peak_date ?? '期初'
        }, { key: 'trough_date', label: '谷值日' },
        {
          key: 'depth',
          label: '回撤深度',
          value: r => pct(r.depth)
        }, { key: 'decline_sessions', label: '下跌交易日' },
        { key: 'recovery_date', label: '恢复日', value: r => r.recovery_date ?? '尚未恢复' },
        { key: 'recovery_sessions', label: '恢复交易日' }, { key: 'underwater_sessions', label: '水下交易日' },
      ]} />
      <h2>月度表现</h2><div className="result-months">
        {analysis.monthly.map(row => <div key={String(row.month)} className={finite(row.return) && row.return < 0 ? 'loss' : 'gain'}>
          <span>
            {String(row.month)}
          </span>
          <strong>{pct(row.return)}</strong>
          <small>基准 {pct(row.benchmark_return)}</small>
          <small>{row.boundary_month ? '区间首 / 末月' : '\u00a0'}</small>
        </div>)}
      </div>
      <h2>滚动表现</h2><DataTable name="滚动表现" data={analysis.rolling} columns={[
        { key: 'date', label: '窗口截止日' }, { key: 'window', label: '交易日窗口' },
        { key: 'return', label: '区间收益', value: r => pct(r.return) },
        { key: 'volatility', label: '年化波动率', value: r => pct(r.volatility) },
        {
          key: 'sharpe',
          label: '夏普比率',
          value: r => metricText({ value: finite(r.sharpe) ? r.sharpe : null, unit: 'ratio' })
        },
      ]} />
    </details>}
  </>;
}
