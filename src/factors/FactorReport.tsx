import { lazy, Suspense, useState } from 'react';
import { csv, download, num, pct } from '../shared/api';
import { DataTable } from '../shared/DataTable';
import { Empty, ErrorNotice, JsonDetails, Tabs } from '../shared/ui';
import type { Result } from './api';
import { evaluation, type Evaluation } from './evaluation';
const LineChart = lazy(() => import('../shared/LineChart'));
export function FactorReport({ result }: {
  result: Result;
}) {
  const [tab, setTab] = useState('因子值');
  let report: Evaluation | null = null;
  let error = '';
  if (result.evaluation)
    try {
      report = evaluation(result.evaluation);
    }
    catch (e) {
      error = (e as Error).message;
    }
  return <section className="factor-report">
    <Tabs values={['因子值', '单因子评价']} selected={tab} onChange={setTab} />
    <div className="metrics factor-metrics">
      <div className="metric">
        <span>有效单元</span>
        <strong>{num(result.summary.valid_cells, 0)} / {num(result.summary.total_cells, 0)}</strong>
      </div>
      <div className="metric">
        <span>覆盖率</span>
        <strong>
          {pct(result.summary.coverage)}
        </strong>
      </div>
      <div className="metric">
        <span>缺失单元</span>
        <strong>
          {num(result.summary.missing_cells, 0)}
        </strong>
      </div>
    </div>
    {tab === '因子值' ? <DataTable name="因子值" data={result.rows} columns={[{
      key: 'date',
      label: '日期'
    }, {
      key: 'security',
      label: '证券'
    }, {
      key: 'value',
      label: '数值',
      value: r => r.value ?? r.value_text
    }, { key: 'status', label: '状态' }, { key: 'reason', label: '原因' }]} /> : <>
      <ErrorNotice message={error} />
      {report ? <EvaluationView report={report} /> : !error && <Empty>此运行未请求单因子评价。</Empty>}
    </>}
    <JsonDetails title="本次数据来源与冻结配置" value={{
      request: result.request,
      provenance: result.provenance
    }} />
    <details className="diagnostics">
      <summary>诊断导出</summary>
      <p className="note">完整诊断保留服务原始字段。普通结果请使用上方 CSV。</p>
      <button onClick={() => download(result.request.name + '-诊断.json', JSON.stringify(result, null, 2), 'application/json')}>导出诊断 JSON</button>
    </details>
  </section>;
}
function EvaluationView({ report: r }: {
  report: Evaluation;
}) {
  const [horizon, setHorizon] = useState(r.config.horizons[0]);
  const [tab, setTab] = useState('IC / RankIC');
  const summary = r.summary.find(s => s.horizon === horizon);
  const ic = r.ic.filter(p => p.horizon === horizon);
  const rank = r.rank_ic.filter(p => p.horizon === horizon);
  return <>
    <div className="toolbar">
      <label>收益观察期 <select value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
        {r.config.horizons.map(h => <option key={h} value={h}>{h} 个交易日</option>)}
      </select></label>
      <span className="note">信号后第 {r.config.lag} 个交易日收盘进入 · 独立持有期收益</span>
    </div>
    <div className="metrics factor-metrics">
      <div className="metric">
        <span>IC 均值</span>
        <strong>
          {num(summary?.ic.mean)}
        </strong>
      </div>
      <div className="metric">
        <span>RankIC 均值</span>
        <strong>
          {num(summary?.rank_ic.mean)}
        </strong>
      </div>
      <div className="metric">
        <span>IC 均值 / 标准差（未年化）</span>
        <strong>
          {num(summary?.ic.mean_over_std)}
        </strong>
      </div>
    </div>
    <Tabs values={['IC / RankIC', '分层收益', '换手率', '成本敏感性']} selected={tab} onChange={setTab} />
    {tab === 'IC / RankIC' && <>
      <Suspense fallback={<Empty>正在绘制评价曲线…</Empty>}>
        <LineChart title="IC / RankIC 时间序列" labels={ic.map(p => p.date)} series={[
          {
            name: 'IC',
            values: ic.map(p => p.value)
          },
          {
            name: 'RankIC',
            values: ic.map(p => rank.find(v => v.date === p.date)?.value
              ?? null)
          }
        ]} />
      </Suspense>
      <button onClick={() => download('IC.csv', csv([
        [
          '日期',
          '观察期',
          'IC',
          'RankIC'
        ],
        ...ic.map(p => [
          p.date,
          p.horizon,
          p.value,
          rank.find(v => v.date === p.date)?.value
        ])
      ]), 'text/csv;charset=utf-8')}>导出 IC CSV</button>
    </>}
    {tab === '分层收益'
      && <DataTable name="分层收益" data={r.quantile_returns.filter(p => p.horizon === horizon)} columns={[
        {
          key: 'date',
          label: '日期'
        },
        {
          key: 'quantile',
          label: '分位组'
        },
        {
          key: 'mean_return',
          label: '独立收益（小数）'
        },
        {
          key: 'n',
          label: '有效股票'
        },
        {
          key: 'selected_n',
          label: '所选股票'
        }
      ]} />}
    {tab === '换手率'
      && <DataTable name="换手率" data={r.turnover} columns={[
        {
          key: 'date',
          label: '日期'
        },
        {
          key: 'quantile',
          label: '分位组'
        },
        {
          key: 'value',
          label: '成员换手（小数）'
        },
        {
          key: 'n',
          label: '成员数'
        }
      ]} />}
    {tab === '成本敏感性'
      && <DataTable name="成本敏感性" data={r.cost_sensitivity.filter(p => p.horizon === horizon)} columns={[
        {
          key: 'cost_bps',
          label: '单边成本（bp）'
        },
        {
          key: 'top_mean',
          label: '高组收益'
        },
        {
          key: 'bottom_mean',
          label: '低组收益'
        },
        {
          key: 'spread_mean',
          label: '高低组差'
        },
        {
          key: 'n',
          label: '有效观测'
        }
      ]} />}
    <p className="note">{r.config.price_basis} · 固定股票范围的统计评价，不模拟实际成交；独立持有期收益不累计为策略净值。</p>
    <JsonDetails title="覆盖、排除原因与评价说明" value={{
      coverage: r.coverage,
      warnings: r.warnings,
      engine: r.engine
    }} />
  </>;
}
