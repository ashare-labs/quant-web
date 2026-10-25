import {num, object, pct, rows, type Row} from '../shared/api.ts';

export const metricDefinitions = [
  ['net_return','策略收益','期末权益相对期初资金的净收益，已包含账本费用。','percent'],
  ['annual_return','策略年化收益','按已声明的交易观察值年化；短样本保留空值。','percent'],
  ['excess_return','超额收益','策略净值 ÷ 基准净值 − 1；与超额曲线、超额回撤使用同一相对净值。','percent'],
  ['benchmark_return','基准收益','所选基准在相同评价区间的累计价格收益。','percent'],
  ['alpha','阿尔法','扣除无风险收益后的日收益回归截距，按声明因子复利年化。','ratio'],
  ['beta','贝塔','策略与基准日收益的协方差除以基准方差。','ratio'],
  ['sharpe','夏普比率','策略日收益减无风险日收益的均值除以样本标准差，再年化。','ratio'],
  ['win_rate','胜率','已完成持仓周期中盈利周期的比例；未平仓周期不计入。','percent'],
  ['profit_loss_ratio','盈亏比','已完成周期的平均净盈利除以平均净亏损绝对值。','ratio'],
  ['max_drawdown','最大回撤','从期初资金开始计算的日终峰值至谷值最大跌幅。','percent'],
  ['sortino','索提诺比率','以声明的无风险收益为目标，使用全样本下行偏差。','ratio'],
  ['daily_excess_return','日均超额收益','同日策略收益减基准收益的算术平均。','percent'],
  ['excess_max_drawdown','超额收益最大回撤','策略净值与基准净值之比的最大回撤。','percent'],
  ['excess_sharpe','超额收益夏普比率','沿用主动日收益 / 跟踪误差，与信息比率同口径。','ratio'],
  ['daily_win_rate','日胜率','正收益交易日占全部有效交易日的比例，平盘日计入分母。','percent'],
  ['winning_trades','盈利次数','净盈亏大于零的已完成持仓周期数。','count'],
  ['losing_trades','亏损次数','净盈亏小于零的已完成持仓周期数。','count'],
  ['information_ratio','信息比率','主动日收益均值除以样本跟踪误差，再按声明因子年化。','ratio'],
  ['volatility','策略波动率','策略日收益样本标准差的年化值。','percent'],
  ['benchmark_volatility','基准波动率','同日基准收益样本标准差的年化值。','percent'],
] as const;
export type MetricKey = typeof metricDefinitions[number][0];
export interface Metric {value: number|null; unit: string; status: string; reason: string|null; sample_count: number}
export interface Point {
  date: string; equity: number; cash: number|null; positions_value: number|null;
  return: number|null; pnl: number; nav: number; cumulative_return: number;
  benchmark_return: number|null; benchmark_cumulative_return: number|null;
  excess_return: number|null; drawdown: number; buy_value: number|null; sell_value: number|null;
  relative_nav?: number|null; return_difference?: number|null;
}
export interface BenchmarkOption {value:string; label:string}
export interface Comparison {selection:string; source:'frozen'|'derived'; options:BenchmarkOption[]; reference_status:string; reference_reason:string|null}
export interface Analysis {
  schema_version: 'aq.analysis.v1'; calculation_version: string; analysis_id: string; job_id: string; source_sha256: string;
  metrics: Record<MetricKey,Metric>; policy: Row; series: Point[];
  initial_equity: number; sample_count: number; engine: Row; benchmark: Row|null;
  drawdowns: Row[]; monthly: Row[]; rolling: Row[]; costs: Row; trading: Row; quality: Row;
  comparison?: Comparison; excess_drawdowns?: Row[]; return_difference?: Metric;
}
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullable = (v: unknown) => v === null || finite(v);
const validDate=(value: unknown): value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function acceptedAnalysis(raw: unknown, jobId: string, sourceSha?: string): Analysis|null {
  const a=object(raw), metrics=object(a.metrics), policy=object(a.policy), points=rows(a.series);
  if(a.schema_version!=='aq.analysis.v1'||!['returns-v1','returns-v2'].includes(String(a.calculation_version))||a.job_id!==jobId
    ||typeof a.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.source_sha256)
    ||(sourceSha!==undefined&&a.source_sha256!==sourceSha)||!finite(a.initial_equity)
    ||a.initial_equity<=0||!finite(policy.annualization)||!nullable(policy.risk_free_annual)
    ||policy.evaluation_frequency!=='1d'||policy.timezone!=='Asia/Shanghai'
    ||!Array.isArray(a.series)||points.length!==a.series.length||points.length===0
    ||!finite(a.sample_count)||a.sample_count!==points.length) return null;
  for(const [key,,,unit] of metricDefinitions){
    const m=object(metrics[key]);
    if(!nullable(m.value)||m.unit!==unit||!['ok','unavailable'].includes(String(m.status))
      ||(m.status==='ok'?!finite(m.value):m.value!==null)||!finite(m.sample_count)
      ||(m.status==='unavailable'&&typeof m.reason!=='string')) return null;
  }
  let previous='';
  for(const p of points){
    if(!validDate(p.date)||p.date<=previous
      ||!['equity','pnl','nav','cumulative_return','drawdown'].every(k=>finite(p[k]))
      ||!['cash','positions_value','return','benchmark_return','benchmark_cumulative_return',
        'excess_return','buy_value','sell_value'].every(k=>nullable(p[k]))) return null;
    previous=p.date;
  }
  for(const key of ['drawdowns','monthly','rolling']) if(!Array.isArray(a[key])) return null;
  if(a.calculation_version==='returns-v2'&&(policy.excess_return!=='relative_nav_return'
    ||typeof a.analysis_id!=='string'||!/^[a-f0-9]{64}$/.test(a.analysis_id)
    ||!Array.isArray(a.excess_drawdowns)||points.some(p=>!nullable(p.relative_nav)||!nullable(p.return_difference))))return null;
  return a as unknown as Analysis;
}
export function selectedAnalysis(raw:unknown,jobId:string,sourceSha:string|undefined,selection='frozen') {
  if(typeof sourceSha!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha))return null;
  const a=acceptedAnalysis(raw,jobId,sourceSha),c=object(a?.comparison);
  return a?.calculation_version==='returns-v2'&&c.selection===selection&&['frozen','derived'].includes(String(c.source))
    &&Array.isArray(c.options)&&c.options.every(v=>typeof object(v).value==='string'&&typeof object(v).label==='string')?a:null;
}
export function metricDefinition(key:MetricKey,analysis:Analysis|null) {
  if(key==='excess_return'&&analysis?.calculation_version==='returns-v1')return '旧口径：策略累计收益减基准累计收益（收益差）。';
  return metricDefinitions.find(item=>item[0]===key)![2];
}

export const reasons: Record<string,string> = {
  not_computed:'尚未计算', missing_analysis:'尚未生成分析', missing_benchmark:'未配置基准',
  invalid_benchmark:'基准数据不完整', invalid_benchmark_value:'基准价格无效',
  benchmark_session_mismatch:'基准日期不齐', invalid_benchmark_initial_date:'基准起点无效',
  benchmark_disabled:'已关闭基准', BENCHMARK_RELEASE_UNAVAILABLE:'未固定基准数据源',
  BENCHMARK_SOURCE_UNAVAILABLE:'基准发布不可读取', BENCHMARK_SOURCE_INVALID:'基准来源校验失败',
  BENCHMARK_SECURITY_UNAVAILABLE:'发布中无此基准', BENCHMARK_CALENDAR_UNAVAILABLE:'缺冻结交易日历',
  BENCHMARK_BASE_MISSING:'缺基期收盘价', BENCHMARK_DAILY_GAP:'基准交易日缺失',
  insufficient_samples:'样本不足', missing_session_calendar:'缺交易日历', missing_risk_free_rate:'未设无风险利率',
  zero_variance:'收益无波动', zero_benchmark_variance:'基准无波动',
  zero_tracking_error:'跟踪误差为零', no_downside_returns:'无下行收益',
  no_closed_trades:'无已完成交易', no_winning_trades:'无盈利交易', no_losing_trades:'无亏损交易',
  missing_trades:'缺成交记录', invalid_trade_record:'成交字段不全',
  unmatched_position_history:'持仓无法对账', missing_position_snapshots:'缺持仓记录',
  invalid_position_snapshot:'持仓字段不全', missing_account_cash:'缺现金字段',
  cash_ledger_mismatch:'成交现金未对齐', corporate_share_adjustment:'送转归因待支持',
  corporate_cash_unsettled:'分红尚未结算', corporate_record_basis_mismatch:'分红持仓未对齐',
  corporate_record_date_outside_result:'缺分红登记日持仓', corporate_records_incomplete:'公司行为记录不全',
  corporate_tax_model_unsupported:'分红税模型待支持', corporate_payment_outside_result:'缺分红结算日',
  zero_equity_base:'前日权益为零', non_finite_result:'结果不可定义', not_a_closing_fill:'非平仓成交',
};
export const reasonText=(reason: unknown)=>typeof reason==='string'?(reasons[reason]||'数据不足'):'';
export const metricText=(m: Pick<Metric,'value'|'unit'>)=>m.unit==='percent'?pct(m.value):num(m.value,m.unit==='count'?0:3);
export const money=(v: unknown)=>finite(v)?v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const priceText=(v:unknown)=>finite(v)?v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
export function resultMetrics(summary: Row, analysis: Analysis|null): Record<MetricKey,Metric> {
  return Object.fromEntries(metricDefinitions.map(([key,,,unit])=>[key,analysis?.metrics[key]??{
    value:['net_return','max_drawdown'].includes(key)&&finite(summary[key])?summary[key]:null, unit,
    status:['net_return','max_drawdown'].includes(key)&&finite(summary[key])?'ok':'unavailable',
    reason:['net_return','max_drawdown'].includes(key)&&finite(summary[key])?null:'missing_analysis',sample_count:0,
  }])) as Record<MetricKey,Metric>;
}
export function metricCsv(summary: Row, analysis: Analysis|null): unknown[][] {
  const metrics=resultMetrics(summary,analysis);
  return [['指标','数值','单位','状态','原因','样本数','计算版本','基准选择','分析标识'],...metricDefinitions.map(([key,label])=>{
    const m=metrics[key];return [label,m.value,m.unit,m.status,reasonText(m.reason),m.sample_count,
      analysis?.calculation_version??'',analysis?.comparison?.selection??'frozen',analysis?.analysis_id??''];
  })];
}
export function rangeStart(points: Point[], months: number): number {
  if(!points.length)return 0;
  const last=new Date(points.at(-1)!.date+'T00:00:00Z'),day=last.getUTCDate();
  last.setUTCDate(1);last.setUTCMonth(last.getUTCMonth()-months);
  const days=new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()+1,0)).getUTCDate();
  last.setUTCDate(Math.min(day,days));
  const cutoff=last.toISOString().slice(0,10), found=points.findIndex(p=>p.date>=cutoff);
  return found<=0?0:found+1; // Index 0 is the initial-equity anchor.
}
export function dateRangeIndex(points: Point[], day: string, end: boolean): number|null {
  if(!validDate(day)||!points.length)return null;
  const i=end?points.map(p=>p.date<=day).lastIndexOf(true):points.findIndex(p=>p.date>=day);
  if(i<0)return null;
  return !end&&i===0?0:i+1;
}
export function analysisPath(path: string|null, result: Row|null, inline: Analysis|null, family: string, selection?:string) {
  return path&&result&&!inline&&family!=='factors'?path+(selection===undefined?'/analysis':'/result/analysis?'+new URLSearchParams({analysis_version:'returns-v2',benchmark:selection})):null;
}
export function timeParts(value: unknown): [string,string] {
  if(typeof value!=='string')return ['—','—'];
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value))return [value.slice(0,10),value.slice(11)];
  if(!Number.isFinite(Date.parse(value)))return ['—','—'];
  const formatted=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)).split(' ');
  return [formatted[0],formatted[1]||'—'];
}
export function tradeRows(native: Row, analysis: Analysis|null): Row[] {
  const orders=new Map(rows(native.orders).map(r=>[String(r.order_id),r]));
  const pnls=new Map(rows(analysis?.trading.fill_pnl).map(r=>[String(r.trade_id),r]));
  return rows(native.trades).map(trade=>{
    const order=orders.get(String(trade.order_id))??{},[date,time]=timeParts(trade.at),qty=trade.amount??trade.quantity;
    const cost=finite(trade.commission)&&finite(trade.tax)?trade.commission+trade.tax:null;
    const kind=order.order_type??order.type;
    return {date,time,order_time:timeParts(order.add_time)[1],security:trade.security??trade.order_book_id,
      side:trade.side==='BUY'?'买':trade.side==='SELL'?'卖':'—',
      order_type:kind==='MARKET'?'市价单':kind==='LIMIT'?'限价单':'—',
      quantity:finite(qty)?num(qty,0):'—',price:priceText(trade.price),
      notional:money(finite(qty)&&finite(trade.price)?qty*trade.price:null),
      pnl:money(pnls.get(String(trade.trade_id))?.value),fees:money(cost)};
  });
}
export function holdingRows(native: Row, analysis: Analysis|null): Row[] {
  const pnl=new Map(rows(analysis?.trading.positions).map(r=>[String(r.date)+'/'+String(r.security),r]));
  return rows(native.accounts).flatMap(account=>{
    const date=timeParts(account.at)[0];
    const stock=Object.entries(object(account.positions)).map(([security,raw])=>{
      const p=object(raw), derived=pnl.get(date+'/'+security)??{};
      return {date,security,quantity:num(p.total_amount,0),closeable:num(p.closeable_amount,0),
        price:priceText(p.price),value:money(p.value),pnl:money(derived.unrealized_pnl),weight:pct(derived.weight)};
    });
    const fullCash=finite(account.available_cash)&&finite(account.locked_cash)?account.available_cash+account.locked_cash:null;
    return [...stock,{date,security:fullCash!==null?'现金（含冻结）':'可用现金',quantity:'—',closeable:'—',price:'—',
      value:money(fullCash??account.available_cash),pnl:'—',weight:'—'}];
  });
}
