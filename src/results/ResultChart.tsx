import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { dateRangeIndex, rangeStart, type Analysis } from './model';
import { colors, curves, logarithmAvailable, performanceOption, zoomRange, type Drawdown, type Visibility } from './chart';
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent, CanvasRenderer]);
export default function ResultChart({ analysis }: {
  analysis: Analysis;
}) {
  const ref = useRef<HTMLDivElement>(null), chart = useRef<echarts.ECharts | null>(null);
  const rows = analysis.series, [range, setRange] = useState<[
    number,
    number
  ]>([0, rows.length]);
  const [visible, setVisible] = useState<Visibility>({
    strategy: true,
    benchmark: true,
    excess: true
  });
  const [log, setLog] = useState(false);
  const [drawdown, setDrawdown] = useState<Drawdown>('strategy');
  const lines = curves(analysis);
  const canLog = logarithmAvailable(analysis);
  const hasExcess = lines.some(line => line.key === 'excess');
  useEffect(() => { setRange([0, rows.length]); }, [analysis.analysis_id, rows.length]);
  useEffect(() => {
    if (!ref.current)
      return;
    const instance = echarts.init(ref.current);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    instance.on('datazoom', () => {
      const value = zoomRange(instance.getOption());
      if (value)
        setRange(value);
    });
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(performanceOption(analysis, range, visible, log && canLog, drawdown) as echarts.EChartsCoreOption, { notMerge: true });
  }, [analysis, range, visible, log, canLog, drawdown]);
  const first = rows[0].date, last = rows.at(-1)!.date;
  const chooseDate = (value: string, end: boolean) => {
    const index = dateRangeIndex(rows, value, end);
    if (index === null)
      return;
    setRange(current => end ? [Math.min(current[0], index), index] : [index, Math.max(current[1], index)]);
  };
  return <section className="result-performance" aria-label="收益与交易图表">
    <div className="result-chart-toolbar"><div className="result-range" aria-label="收益图范围">
      <span>缩放</span><button onClick={() => setRange([rangeStart(rows, 1), rows.length])}>1个月</button>
      <button onClick={() => setRange([rangeStart(rows, 12), rows.length])}>1年</button>
      <button onClick={() => setRange([0, rows.length])}>全部</button></div>
      <div className="result-dates">
        <label>从 <input aria-label="图表开始日期" type="date" min={first} max={last} value={rows[Math.max(0, range[0] - 1)]?.date ?? first} onChange={e => chooseDate(e.target.value, false)} /></label>
        <label>至 <input aria-label="图表结束日期" type="date" min={first} max={last} value={rows[Math.max(0, range[1] - 1)]?.date ?? last} onChange={e => chooseDate(e.target.value, true)} /></label>
      </div></div>
    <div className="result-chart-controls">
      <div className="result-chart-legend" aria-label="收益曲线图例">
        {lines.map(line => <label key={line.key}>
          <input type="checkbox" checked={visible[line.key]} aria-label={'显示' + line.name} onChange={e => setVisible(current => ({ ...current, [line.key]: e.target.checked }))} />
          <i style={{ background: colors[line.key] }} />
          {line.name}
        </label>)}
      </div>
      <div className="result-chart-options">
        <label>坐标 <select aria-label="收益坐标" value={log && canLog ? 'log' : 'linear'} onChange={e => setLog(e.target.value === 'log')}>
          <option value="linear">普通</option>
          <option value="log" disabled={!canLog}>对数{!canLog ? '（净值含零）' : ''}</option>
        </select></label>
        <label>回撤区间 <select aria-label="回撤区间" value={drawdown} onChange={e => setDrawdown(e.target.value as Drawdown)}>
          <option value="strategy">策略最大回撤</option>
          <option value="excess" disabled={!hasExcess}>超额最大回撤</option>
          <option value="none">不显示</option>
        </select></label>
      </div>
    </div>
    <div ref={ref} className="result-linked-chart" role="img" aria-label="策略、基准与相对超额收益、每日盈亏、每日买卖成交额联动图" />
    <p className="result-chart-key">
      <span>买入 <i style={{ background: colors.buy }} /></span>
      <span>卖出 <i style={{ background: colors.sell }} /></span>
      <span>{log && canLog ? '对数坐标基于正净值；' : ''}成交额按买卖方向显示；日终采样</span>
    </p>
  </section>;
}
