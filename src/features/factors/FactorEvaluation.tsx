import { useState } from 'react';
import { FactorChart } from './FactorChart';
import { evaluation, excludedReason, percent, type Evaluation } from './evaluation';
import { number } from './model';

export function FactorEvaluation({value}: {value: unknown}) {
  if (!value) return <div className="factor-empty"><h3>这次运行仅计算了因子值</h3><p>选择单因子评价后新建运行，评价结果会保存在这里。已有结果不会被重新计算或覆盖。</p></div>;
  let report: Evaluation;
  try { report = evaluation(value); } catch (e) { return <p role="alert" className="factor-error">{(e as Error).message}</p>; }
  return <Report report={report}/>;
}
function Report({report:r}: {report: Evaluation}) {
  const [horizon,setHorizon] = useState(r.config.horizons[0]);
  const [view,setView] = useState('ic');
  const metric = r.summary.find(s=>s.horizon===horizon), coverage = r.coverage.by_horizon.find(s=>s.horizon===horizon);
  const ic=r.ic.filter(p=>p.horizon===horizon), rank=r.rank_ic.filter(p=>p.horizon===horizon), spreads=r.spread.filter(p=>p.horizon===horizon);
  const qs=Array.from({length:r.config.quantiles},(_,i)=>i+1), dates=ic.map(p=>p.date);
  const quantile=r.quantile_returns.filter(p=>p.horizon===horizon), monthly=r.stability.filter(p=>p.horizon===horizon&&p.kind==='monthly'), rolled=r.stability.filter(p=>p.horizon===horizon&&p.kind==='rolling');
  const lookup = <T extends {date:string}>(rows:T[], field:(p:T)=>number|null) => { const m=new Map(rows.map(p=>[p.date,field(p)])); return dates.map(d=>m.get(d)??null); };
  return <div className="factor-evaluation-view">
    <div className="factor-chart-controls"><label>收益观察期<select value={horizon} onChange={e=>setHorizon(Number(e.target.value))}>{r.config.horizons.map(h=><option key={h} value={h}>{h} 个交易日</option>)}</select></label><p>信号后第 {r.config.lag} 个交易日收盘进入，持有 {horizon} 个交易日。方向 {r.config.direction===1?'正向':'反向'}，至少 {r.config.min_assets} 只有效股票。</p></div>
    <div className="factor-metrics"><div><small>平均 IC</small><strong>{number(metric?.ic.mean)}</strong><small>{metric?.ic.n??0} 个有效截面</small></div><div><small>平均 RankIC</small><strong>{number(metric?.rank_ic.mean)}</strong><small>均值/标准差 {number(metric?.rank_ic.mean_over_std)} · 未年化</small></div><div><small>高组 − 低组平均收益</small><strong>{percent(metric?.spread.mean)}</strong><small>独立分组收益 · 非净值</small></div><div><small>有效收益配对</small><strong>{coverage?.paired??'—'} / {coverage?.eligible??'—'}</strong><small>因子有效单元 {r.coverage.finite_factor_cells} / {r.coverage.input_cells}</small></div></div>
    <div className="factor-segments factor-evaluation-tabs" aria-label="评价图表">{[['ic','IC / RankIC'],['groups','分层收益'],['stability','稳定性'],['turnover','换手'],['cost','成本敏感性']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
    {view==='ic'&&<FactorChart label="IC 与 RankIC 时间序列" labels={dates} series={[{name:'IC',values:ic.map(p=>p.value)},{name:'RankIC',values:lookup(rank,p=>p.value)}]}/>}
    {view==='groups'&&<><FactorChart label="每组独立持有期收益" labels={dates} series={qs.map(q=>({name:'Q'+q,values:lookup(quantile.filter(p=>p.quantile===q),p=>p.mean_return)}))}/><p className="factor-input-note">纵轴为小数收益（0.01 = 1%）。每组所有已选股票均有完整价格路径才返回均值；不对幸存成员重新加权。</p><FactorChart label="高组减低组独立收益" labels={dates} series={[{name:'Q高 − Q低',values:lookup(spreads,p=>p.value)}]}/></>}
    {view==='stability'&&<><FactorChart label="滚动 IC 稳定性" labels={rolled.map(p=>p.period)} series={[{name:r.config.rolling_window+'日 IC 均值',values:rolled.map(p=>p.ic_mean)},{name:'RankIC 均值',values:rolled.map(p=>p.rank_ic_mean)}]}/><div className="table-scroll"><table><thead><tr><th>月份</th><th>IC 均值</th><th>RankIC 均值</th><th>高低组收益差</th><th>有效 RankIC 日数</th></tr></thead><tbody>{monthly.map(p=><tr key={p.period}><td>{p.period}</td><td>{number(p.ic_mean)}</td><td>{number(p.rank_ic_mean)}</td><td>{percent(p.spread_mean)}</td><td>{p.observations}</td></tr>)}</tbody></table></div></>}
    {view==='turnover'&&<><FactorChart label="相邻交易日分组成员换手" labels={dates} series={qs.map(q=>({name:'Q'+q,values:lookup(r.turnover.filter(p=>p.quantile===q),p=>p.value)}))}/><p className="factor-input-note">新增成员数 / 当前成员数；首日或相邻截面缺失时为空，不跨缺失日连接，不代表实际成交权重。</p></>}
    {view==='cost'&&<><div className="table-scroll"><table><thead><tr><th>单边成本（bp）</th><th>高组收益</th><th>低组收益</th><th>高低组收益差</th><th>共同有效日数</th></tr></thead><tbody>{r.cost_sensitivity.filter(p=>p.horizon===horizon).map(p=><tr key={p.cost_bps}><td>{p.cost_bps}</td><td>{percent(p.top_mean)}</td><td>{percent(p.bottom_mean)}</td><td>{percent(p.spread_mean)}</td><td>{p.n}</td></tr>)}</tbody></table></div><p className="factor-input-note">每个独立持有组支付一次完整买入和卖出（2 × 单边成本）；高低组组合支付 4 × 单边成本。未计净额结算、借券费及实际成交。</p></>}
    <details className="factor-evaluation-coverage" open={!!r.coverage.rejected_quantile_dates.length||!!Object.keys(coverage?.excluded||{}).length}><summary>覆盖与排除原因</summary><p>已分组 {r.coverage.quantized_cells} 个单元；{r.coverage.rejected_quantile_dates.length} 个截面无法分组。</p><ul>{Object.entries(coverage?.excluded||{}).map(([key,n])=><li key={key}>{excludedReason[key]||key}：{n}</li>)}</ul>{r.coverage.rejected_quantile_dates.length>0&&<div className="factor-exclusions">{r.coverage.rejected_quantile_dates.map(d=><p key={d.date}>{d.date} · {excludedReason[d.reason]||d.reason} · {d.n} 只</p>)}</div>}</details>
    <div className="factor-evaluation-policy"><p>价格口径：{r.config.price_basis}</p><p>股票范围：{r.config.universe_label}</p><p>固定样本存在回顾选择与存活偏差；历史可见性未获认证。缺失未来价格可能影响 IC 的观测样本。</p><p>这些是统计诊断：不模拟 T+1、停牌、涨跌停、流动性、整手、借券或成交。重叠持有期收益不累计为策略净值，均值/标准差不是显著性检验。</p><small>{r.engine.library} {r.engine.version} · {r.schema}</small></div>
  </div>;
}
