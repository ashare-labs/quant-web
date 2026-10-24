import {useEffect,useRef,useState} from 'react';
import * as echarts from 'echarts/core';
import {LineChart,BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkAreaComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {dateRangeIndex,money,rangeStart,type Analysis} from './model';

echarts.use([LineChart,BarChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkAreaComponent,CanvasRenderer]);
const escaped=(value: unknown)=>String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
const red='#bd514c',green='#34816b',blue='#315f9d',orange='#d59b45';

export default function ResultChart({analysis}:{analysis:Analysis}) {
  const ref=useRef<HTMLDivElement>(null), chart=useRef<echarts.ECharts|null>(null);
  const rows=analysis.series, [range,setRange]=useState<[number,number]>([0,rows.length]);
  useEffect(()=>{setRange([0,rows.length]);},[analysis.source_sha256,rows.length]);
  useEffect(()=>{
    if(!ref.current)return;
    const instance=echarts.init(ref.current);chart.current=instance;
    const observer=new ResizeObserver(()=>instance.resize());observer.observe(ref.current);
    return()=>{observer.disconnect();instance.dispose();chart.current=null;};
  },[]);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    const labels=['期初',...rows.map(r=>r.date)],hasBenchmark=rows.some(r=>r.benchmark_cumulative_return!==null);
    const axes=[0,1,2].map(index=>({type:'category' as const,gridIndex:index,data:labels,boundaryGap:false,
      axisLine:{lineStyle:{color:'#cfd5db'}},axisTick:{show:false},axisLabel:{show:index===2,color:'#667482',fontSize:11}}));
    const series:unknown[]=[{name:'策略收益',type:'line',showSymbol:false,connectNulls:false,
      data:[0,...rows.map(r=>r.cumulative_return)],lineStyle:{width:2,color:blue},itemStyle:{color:blue}},
      ...(hasBenchmark?[{name:'基准收益',type:'line',showSymbol:false,connectNulls:false,
        data:[0,...rows.map(r=>r.benchmark_cumulative_return)],lineStyle:{width:1.5,color:orange},itemStyle:{color:orange}}]:[]),
      {name:'每日盈亏',type:'bar',xAxisIndex:1,yAxisIndex:1,barMaxWidth:12,
        data:[null,...rows.map(r=>({value:r.pnl,itemStyle:{color:r.pnl>=0?red:green}}))]},
      {name:'买入成交额',type:'bar',xAxisIndex:2,yAxisIndex:2,barMaxWidth:10,
        data:[null,...rows.map(r=>r.buy_value)],itemStyle:{color:red}},
      {name:'卖出成交额',type:'bar',xAxisIndex:2,yAxisIndex:2,barMaxWidth:10,
        data:[null,...rows.map(r=>r.sell_value===null?null:-r.sell_value)],itemStyle:{color:green}}];
    instance.setOption({animation:false,grid:[{left:78,right:25,top:30,height:225},
      {left:78,right:25,top:310,height:90},{left:78,right:25,top:452,height:90}],
      legend:{top:0,data:hasBenchmark?['策略收益','基准收益']:['策略收益'],textStyle:{fontSize:12}},
      tooltip:{trigger:'axis',confine:true,axisPointer:{type:'line'},formatter:(input:unknown)=>{
        const points=Array.isArray(input)?input:[],index=Number(points[0]?.dataIndex??0);
        if(index===0)return '期初资金<br/>'+money(analysis.initial_equity)+' 元';
        const row=rows[index-1];if(!row)return '';
        const percent=(n:number|null)=>n===null?'—':(n*100).toFixed(2)+'%';
        return `${escaped(row.date)}<br/>策略收益　${percent(row.cumulative_return)}<br/>基准收益　${percent(row.benchmark_cumulative_return)}<br/>当日盈亏　${money(row.pnl)} 元<br/>买入成交额　${money(row.buy_value)} 元<br/>卖出成交额　${money(row.sell_value)} 元`;
      }},axisPointer:{link:[{xAxisIndex:'all'}]},xAxis:axes,
      yAxis:[{type:'value',gridIndex:0,axisLabel:{formatter:(v:number)=>(v*100).toFixed(1)+'%',color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}},
        {type:'value',gridIndex:1,name:'每日盈亏（元）',nameLocation:'end',nameTextStyle:{align:'left',padding:[0,0,0,0],color:'#667482'},axisLabel:{formatter:(v:number)=>v.toLocaleString(),color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}},
        {type:'value',gridIndex:2,name:'每日买卖（元）',nameTextStyle:{align:'left',color:'#667482'},axisLabel:{formatter:(v:number)=>Math.abs(v).toLocaleString(),color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}}],
      dataZoom:[{type:'slider',xAxisIndex:[0,1,2],bottom:2,height:22,startValue:range[0],endValue:range[1],filterMode:'none'},
        {type:'inside',xAxisIndex:[0,1,2],startValue:range[0],endValue:range[1],filterMode:'none',zoomOnMouseWheel:false}],
      series}, {notMerge:true});
  },[analysis,rows,range]);
  const first=rows[0].date,last=rows.at(-1)!.date;
  const chooseDate=(value:string,end:boolean)=>{
    const index=dateRangeIndex(rows,value,end);if(index===null)return;
    setRange(current=>end?[Math.min(current[0],index),index]:[index,Math.max(current[1],index)]);
  };
  return <section className="result-performance" aria-label="收益与交易图表">
    <div className="result-chart-toolbar"><div className="result-range" aria-label="收益图范围">
      <span>缩放</span><button onClick={()=>setRange([rangeStart(rows,1),rows.length])}>1个月</button>
      <button onClick={()=>setRange([rangeStart(rows,12),rows.length])}>1年</button>
      <button onClick={()=>setRange([0,rows.length])}>全部</button></div>
      <div className="result-dates"><label>从 <input aria-label="图表开始日期" type="date" min={first} max={last}
        value={rows[Math.max(0,range[0]-1)]?.date??first} onChange={e=>chooseDate(e.target.value,false)}/></label>
        <label>至 <input aria-label="图表结束日期" type="date" min={first} max={last}
          value={rows[Math.max(0,range[1]-1)]?.date??last} onChange={e=>chooseDate(e.target.value,true)}/></label></div></div>
    <div ref={ref} className="result-linked-chart" role="img" aria-label="策略与基准累计收益、每日盈亏、每日买卖成交额联动图"/>
    <p className="result-chart-key"><span>买入 <i style={{background:red}}/></span><span>卖出 <i style={{background:green}}/></span>
      <span>成交额按买卖方向显示；日终采样</span></p>
  </section>;
}
