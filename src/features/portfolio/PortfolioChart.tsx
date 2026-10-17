import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { PortfolioModel } from "./api";
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  SVGRenderer,
]);
export function PortfolioChart({
  result,
  compact = false,
}: {
  result: PortfolioModel<"PortfolioResult">;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Polling returns new objects for the same immutable result. Preserve zoom and
  // legend selection until the plotted values actually change.
  const chartData = JSON.stringify({
    days: result.days,
    initial_cash: result.summary.initial_cash,
  });
  useEffect(() => {
    const chart = echarts.init(host.current!, undefined, { renderer: "svg" });
    const days = result.days,
      dates = days.map((d) => d.date);
    chart.setOption({
      animation: false,
      color: ["#5875a4", "#a45858", "#659fab"],
      textStyle: {
        fontFamily: '"Microsoft Yahei", "Helvetica Neue", Arial, sans-serif',
        fontSize: 12,
        color: "#80858a",
      },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => String(v) },
      legend: {
        top: 8,
        left: 24,
        data: ["账户权益", "初始资金", "现金"],
        selected: { 现金: false },
      },
      grid: compact
        ? [{ top: 55, left: 28, right: 90, bottom: 50 }]
        : [
            { top: 70, left: 28, right: 100, height: "52%" },
            { left: 28, right: 100, top: "72%", height: "13%" },
          ],
      xAxis: compact
        ? [
            {
              type: "category",
              data: dates,
              boundaryGap: true,
              axisLine: { lineStyle: { color: "#cfd3d7" } },
            },
          ]
        : [
            {
              type: "category",
              data: dates,
              boundaryGap: true,
              axisLabel: { show: false },
            },
            {
              type: "category",
              data: dates,
              boundaryGap: true,
              gridIndex: 1,
              axisLine: { lineStyle: { color: "#cfd3d7" } },
            },
          ],
      yAxis: compact
        ? [
            {
              type: "value",
              scale: true,
              position: "right",
              name: "CNY",
              splitLine: { lineStyle: { color: "#d9dce1" } },
            },
          ]
        : [
            {
              type: "value",
              scale: true,
              position: "right",
              name: "CNY",
              splitLine: { lineStyle: { color: "#d9dce1" } },
            },
            {
              type: "value",
              position: "right",
              name: "日费用",
              gridIndex: 1,
              splitNumber: 2,
              splitLine: { lineStyle: { color: "#e3e5e8" } },
            },
          ],
      dataZoom: [
        { type: "inside", xAxisIndex: compact ? [0] : [0, 1] },
        {
          type: "slider",
          xAxisIndex: compact ? [0] : [0, 1],
          height: 20,
          bottom: 8,
          borderColor: "#c6cdd6",
          fillerColor: "rgba(95,125,162,.2)",
        },
      ],
      series: [
        {
          name: "账户权益",
          type: "line",
          data: days.map((d) => d.equity),
          symbolSize: 5,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.12 },
        },
        {
          name: "初始资金",
          type: "line",
          data: dates.map(() => result.summary.initial_cash),
          symbol: "none",
          lineStyle: { width: 1, type: "dashed" },
        },
        {
          name: "现金",
          type: "line",
          data: days.map((d) => d.cash),
          symbol: "none",
          lineStyle: { width: 1 },
        },
        ...(compact
          ? []
          : [
              {
                name: "日费用",
                type: "bar",
                data: days.map((d) => d.day_fee),
                xAxisIndex: 1,
                yAxisIndex: 1,
                barMaxWidth: 40,
              },
            ]),
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [chartData, compact]);
  return (
    <div
      className={`qw-chart ${compact ? "compact" : ""}`}
      role="img"
      aria-label={`账户权益曲线，${result.days.length} 个交易日，最终权益 ${result.summary.final_equity} 元`}
      ref={host}
    />
  );
}
