import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart as ELine } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([ELine, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
export default function LineChart({labels, series, title}: {labels: string[]; series: {name: string; values: (number|null)[]}[]; title: string}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!ref.current)return;const chart=echarts.init(ref.current);chart.setOption({color:['#255da8','#d46a56','#399b78'],tooltip:{trigger:'axis'},legend:{bottom:0},grid:{left:65,right:25,top:22,bottom:60},xAxis:{type:'category',data:labels,boundaryGap:false,axisLine:{lineStyle:{color:'#c9ced5'}},axisLabel:{color:'#67717f',formatter:(value:string)=>/^\d{4}-\d{2}-\d{2}T/.test(value)?value.slice(0,10):value}},yAxis:{type:'value',scale:true,axisLabel:{color:'#67717f'},splitLine:{lineStyle:{color:'#edf0f3'}}},series:series.map(s=>({name:s.name,data:s.values,type:'line',showSymbol:labels.length<20,connectNulls:false,smooth:false}))});const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current);return()=>{observer.disconnect();chart.dispose();};},[labels,series]);
  return <figure><figcaption>{title}</figcaption><div ref={ref} className="line-chart" role="img" aria-label={title}/></figure>;
}
