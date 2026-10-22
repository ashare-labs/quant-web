import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, SVGRenderer]);
export function FactorChart({ labels, series, bar = false, label }: { labels: string[]; series: {name: string; values: (number | null)[]}[]; bar?: boolean; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const data = JSON.stringify({labels,series});
  useEffect(() => {
    if (!host.current) return;
    const chart = echarts.init(host.current, undefined, {renderer:'svg'});
    chart.setOption({ color:['#346baf','#31917f','#ba8541','#845eae','#d46165'], grid:{left:65,right:25,top:48,bottom:70}, legend:{top:0}, tooltip:{trigger:'axis',confine:true,renderMode:'richText'}, xAxis:{type:'category',data:labels,axisLabel:{hideOverlap:true}}, yAxis:{type:'value',scale:true,splitLine:{lineStyle:{color:'#edf0f4'}}}, dataZoom:[{type:'inside'},{type:'slider',height:18,bottom:15}], series:series.map(s => ({ name:s.name, type:bar?'bar':'line', data:s.values, connectNulls:false, showSymbol:labels.length<40, symbolSize:5, lineStyle:{width:2}, barMaxWidth:38 })) });
    const observer = new ResizeObserver(() => chart.resize()); observer.observe(host.current);
    return () => { observer.disconnect(); chart.dispose(); };
    // Serialized chart data gives a stable dependency across parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, bar]);
  return <div ref={host} className="factor-chart" role="img" aria-label={label}/>;
}
