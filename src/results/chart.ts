import {finite,money,type Analysis} from './model.ts';

export type CurveKey='strategy'|'benchmark'|'excess';
export type Visibility=Record<CurveKey,boolean>;
export type Drawdown='none'|'strategy'|'excess';
export const colors={strategy:'#315f9d',benchmark:'#d59b45',excess:'#7b639a',buy:'#bd514c',sell:'#34816b'};
const escaped=(value:unknown)=>String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));

export function curves(analysis:Analysis) {
  const rows=analysis.series;
  return [
    {key:'strategy' as const,name:'策略收益',values:rows.map(r=>r.cumulative_return),nav:rows.map(r=>r.nav)},
    ...(rows.some(r=>r.benchmark_cumulative_return!==null)?[
      {key:'benchmark' as const,name:String(analysis.benchmark?.name||analysis.benchmark?.security||'基准收益'),
        values:rows.map(r=>r.benchmark_cumulative_return),nav:rows.map(r=>r.benchmark_cumulative_return===null?null:1+r.benchmark_cumulative_return)},
      ...(analysis.calculation_version==='returns-v2'?[
        {key:'excess' as const,name:'超额收益',values:rows.map(r=>r.excess_return),nav:rows.map(r=>r.relative_nav??null)},
      ]:[]),
    ]:[]),
  ];
}
export const logarithmAvailable=(analysis:Analysis)=>curves(analysis).every(line=>line.nav.every(v=>v===null||v>0));

export function performanceOption(analysis:Analysis,range:[number,number],visible:Visibility,logarithmic:boolean,drawdown:Drawdown) {
  const rows=analysis.series,lines=curves(analysis),labels=['期初',...rows.map(r=>r.date)];
  const log=logarithmic&&logarithmAvailable(analysis);
  const episode=(drawdown==='excess'?analysis.excess_drawdowns:analysis.drawdowns)?.[0];
  const series:unknown[]=lines.filter(line=>visible[line.key]).map(line=>({
    id:line.key,name:line.name,type:'line',showSymbol:false,connectNulls:false,
    data:[log?1:0,...(log?line.nav:line.values)],lineStyle:{width:line.key==='strategy'?2:1.5,color:colors[line.key]},itemStyle:{color:colors[line.key]},
    ...(line.key===drawdown&&episode?{markArea:{silent:true,itemStyle:{color:'rgba(92,112,135,0.10)'},
      label:{show:true,position:'insideTopLeft',color:'#667482',fontSize:11},
      data:[[{name:drawdown==='excess'?'超额最大回撤':'策略最大回撤',xAxis:episode.peak_date??'期初'}, {xAxis:episode.trough_date}]]}}:{}),
  }));
  series.push(
    {name:'每日盈亏',type:'bar',xAxisIndex:1,yAxisIndex:1,barMaxWidth:12,
      data:[null,...rows.map(r=>({value:r.pnl,itemStyle:{color:r.pnl>=0?colors.buy:colors.sell}}))]},
    {name:'买入成交额',type:'bar',xAxisIndex:2,yAxisIndex:2,barMaxWidth:10,
      data:[null,...rows.map(r=>r.buy_value)],itemStyle:{color:colors.buy}},
    {name:'卖出成交额',type:'bar',xAxisIndex:2,yAxisIndex:2,barMaxWidth:10,
      data:[null,...rows.map(r=>r.sell_value===null?null:-r.sell_value)],itemStyle:{color:colors.sell}},
  );
  const axes=[0,1,2].map(index=>({type:'category',gridIndex:index,data:labels,boundaryGap:false,
    axisLine:{lineStyle:{color:'#cfd5db'}},axisTick:{show:false},axisLabel:{show:index===2,color:'#667482',fontSize:11}}));
  return {animation:false,grid:[{left:78,right:25,top:20,height:235},
    {left:78,right:25,top:310,height:90},{left:78,right:25,top:452,height:90}],
    tooltip:{trigger:'axis',confine:true,axisPointer:{type:'line'},formatter:(input:unknown)=>{
      const points=Array.isArray(input)?input:[],index=Number(points[0]?.dataIndex??0);
      if(index===0)return '期初资金<br/>'+money(analysis.initial_equity)+' 元';
      const row=rows[index-1];if(!row)return '';
      const percent=(n:number|null)=>n===null?'—':(n*100).toFixed(2)+'%';
      const profits=lines.filter(line=>visible[line.key]).map(line=>`${escaped(line.name)}　${percent(line.values[index-1])}`);
      return [escaped(row.date),...profits,`当日盈亏　${money(row.pnl)} 元`,`买入成交额　${money(row.buy_value)} 元`,`卖出成交额　${money(row.sell_value)} 元`].join('<br/>');
    }},axisPointer:{link:[{xAxisIndex:'all'}]},xAxis:axes,
    yAxis:[{type:log?'log':'value',gridIndex:0,logBase:10,scale:log,
      axisLabel:{formatter:(v:number)=>((log?v-1:v)*100).toFixed(1)+'%',color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}},
      {type:'value',gridIndex:1,name:'每日盈亏（元）',nameLocation:'end',nameTextStyle:{align:'left',color:'#667482'},axisLabel:{formatter:(v:number)=>v.toLocaleString(),color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}},
      {type:'value',gridIndex:2,name:'每日买卖（元）',nameTextStyle:{align:'left',color:'#667482'},axisLabel:{formatter:(v:number)=>Math.abs(v).toLocaleString(),color:'#667482'},splitLine:{lineStyle:{color:'#edf0f3'}}}],
    dataZoom:[{type:'slider',xAxisIndex:[0,1,2],bottom:2,height:22,startValue:range[0],endValue:range[1],filterMode:'none'},
      {type:'inside',xAxisIndex:[0,1,2],startValue:range[0],endValue:range[1],filterMode:'none',zoomOnMouseWheel:false}],
    series};
}

export function zoomRange(option:unknown):[number,number]|null {
  const zoom=(option as {dataZoom?:{startValue?:unknown;endValue?:unknown}[]})?.dataZoom?.[0];
  return finite(zoom?.startValue)&&finite(zoom?.endValue)?[zoom.startValue,zoom.endValue]:null;
}
