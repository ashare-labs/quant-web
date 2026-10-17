import { curveGeometry } from "./evidence.ts";
import type { Point } from "./snapshots";
export function Curve({
  points,
  day,
  select,
}: {
  points: Point[];
  day: string;
  select: (day: string) => void;
}) {
  const geometry = curveGeometry(points);
  if (!geometry)
    return (
      <p className="task-empty">
        尚无可绘制的已提交权益。缺失值不补零，不生成示例曲线。
      </p>
    );
  return (
    <figure className="task-curve">
      <svg
        viewBox="0 0 800 218"
        role="img"
        aria-label="后端逐日权益曲线，精确金额见下方逐日表"
      >
        <line x1="64" y1="26" x2="776" y2="26" className="task-grid" />
        <line x1="64" y1="176" x2="776" y2="176" className="task-grid" />
        <text x="64" y="18">
          {points[geometry.highIndex].equity} CNY
        </text>
        <text x="64" y="197">
          {points[0].day}
        </text>
        <text x="776" y="197" textAnchor="end">
          {points.at(-1)!.day}
        </text>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={geometry.coordinates
            .map((p: { x: number; y: number }) => `${p.x},${p.y}`)
            .join(" ")}
        />
        {geometry.coordinates.map((p: { x: number; y: number }, i: number) => (
          <circle
            key={points[i].day}
            cx={p.x}
            cy={p.y}
            r={points[i].day === day ? 5 : 3}
            fill={points[i].day === day ? "#b66524" : "currentColor"}
          >
            <title>
              {points[i].day} · {points[i].equity} CNY
            </title>
          </circle>
        ))}
      </svg>
      <figcaption>
        逐日原生权益 · {points.length} 个已提交日 · 金额单位 CNY。最低原值{" "}
        {points[geometry.lowIndex].equity}，最高原值{" "}
        {points[geometry.highIndex].equity}。连线用于定位，不计算收益率或回撤。
      </figcaption>
      <label>
        定位交易日
        <select
          aria-label="定位交易日"
          value={day}
          onChange={(e) => select(e.target.value)}
        >
          {points.map((p) => (
            <option key={p.day} value={p.day}>
              {p.day} · {p.equity} CNY
            </option>
          ))}
        </select>
      </label>
    </figure>
  );
}
