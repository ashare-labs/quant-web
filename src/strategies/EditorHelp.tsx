import { object } from '../shared/api';
import { validDate } from '../shared/dates';

export function EditorHelp({ catalogue, empty = false }: { catalogue: unknown; empty?: boolean }) {
  const coverage = object(object(catalogue).data_availability);
  const start = typeof coverage.calendar_start === 'string' && validDate(coverage.calendar_start)
    ? coverage.calendar_start : '';
  const end = typeof coverage.calendar_end === 'string' && validDate(coverage.calendar_end)
    ? coverage.calendar_end : '';
  return <div className="editor-help">
    <p className="note">日期需按真实数据填写，未自动预填。
      {start && end ? ` 当前发布的交易日历范围为 ${start} 至 ${end}；这只是日历范围，不代表每只证券都具备回测所需数据。` : ' 当前尚无已核实的可回测日期范围。'}
      上市区间、行情字段与所需历史数据仍须通过服务检查。</p>
    <details open={empty}>
      <summary>aquant 入门与数据限制</summary>
      <ul>
        <li><code>initialize(context)</code> 初始化策略；<code>run_daily(callback, time="after_close")</code> 注册每日回调。</li>
        <li>策略参数请直接在 Python 代码中定义；<code>record(equity=context.portfolio.total_value)</code> 记录观察值。</li>
        <li>原价历史查询请显式传 <code>fq=None</code>。复权、财务和基准数据的覆盖需要单独核对，原价 1d / 1m 行情不代表完整回测能力。</li>
        <li>新回测默认比较基准为沪深 300（000300.XSHG）。入门模板调用 <code>set_benchmark(None)</code> 关闭比较，不会补造缺失的基准数据；也可在初始化中指定 <code>set_benchmark(code)</code>。</li>
        <li>当前交易模型固定佣金率 0.0003、最低佣金 5 元、卖出税率 0.001，固定滑点为 0。<code>set_order_cost</code> 只核对成本与冻结模型一致；<code>set_slippage</code> 仅接受 <code>FixedSlippage(0)</code>，不能据此调整成本或滑点。</li>
      </ul>
    </details>
  </div>;
}
