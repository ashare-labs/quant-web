import type { ReactNode } from "react";
import type { Job } from "./api";
import { labels } from "./state.ts";

export const short = (s?: string) => (s ? s.slice(0, 12) : "—");
export const algorithmNames: Record<string, string> = {
  "equal-weight": "等权持有",
  "daily-equal-weight": "每日等权",
  momentum: "动量",
  trend: "趋势",
  "weekly-reversal": "每周反转",
  "low-volatility": "低波动",
  "momentum-low-volatility": "动量低波动",
};
export const algorithmName = (value: string) => algorithmNames[value] || value;
export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="qw-table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c ?? "—"}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>
                <div className="qw-empty">暂无记录</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function ResearchAssumptions({ values }: { values: unknown[] }) {
  return (
    <>
      {values.map((value, i) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return (
            <p key={i}>
              {typeof value === "string" ? value : JSON.stringify(value)}
            </p>
          );
        const item = value as Record<string, unknown>;
        if (item.scope === "source_provenance_only") {
          return (
            <div className="qw-source-assumption" key={i}>
              <p>
                <strong>仅供来源追溯，不作为本次执行规则。</strong>
              </p>
              {typeof item.text === "string" && <p>{item.text}</p>}
              <details>
                <summary>查看来源原始假设（不用于本次执行）</summary>
                <pre>{JSON.stringify(item, null, 2)}</pre>
              </details>
            </div>
          );
        }
        return (
          <p key={i}>
            {typeof item.text === "string" ? item.text : JSON.stringify(item)}
          </p>
        );
      })}
    </>
  );
}
export function ResearchLimitations({
  values,
  mode,
}: {
  values: string[];
  mode: string;
}) {
  return (
    <>
      {mode === "price_only_no_limits" && (
        <p>
          <strong>
            以下包含输入来源的历史模型限制。本次诊断仍不应用涨跌停约束及公司行动。
          </strong>
        </p>
      )}
      {values.map((value, i) => (
        <p key={i}>{value}</p>
      ))}
    </>
  );
}
export function ScopeNote({
  mode,
  scope,
  assumptions,
  limitations,
}: {
  mode: string;
  scope?: string;
  assumptions?: unknown[];
  limitations?: string[];
}) {
  const diagnostic = mode === "price_only_no_limits";
  return (
    <div className={`qw-scope-note ${diagnostic ? "diagnostic" : ""}`}>
      <strong>
        {diagnostic ? "价格诊断 · 非总回报" : "有来源覆盖的条件研究"}
      </strong>
      <p>
        {diagnostic
          ? "本次不应用涨跌停约束，不计公司行动。此模式允许缺限价或行动证据的价格研究；曲线和指标仅反映原价股票与现金，不能视为完整可交易回测。"
          : "采用声明的回溯状态与费用模型；历史当时可见性及完整公司行动链未认证，不代表实际可成交收益。"}
      </p>
      {scope && <small>结果范围：{scope}</small>}
      {(assumptions || limitations) && (
        <details>
          <summary>查看本次研究假设与限制</summary>
          {assumptions && <ResearchAssumptions values={assumptions} />}
          {limitations && (
            <ResearchLimitations values={limitations} mode={mode} />
          )}
        </details>
      )}
    </div>
  );
}
export function percent(value: string | null | undefined) {
  if (value == null) return "—";
  // Decimal-text shift only; do not round or invent unavailable metrics.
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const fraction = (match[3] || "").padEnd(2, "0");
  const whole = (match[2] + fraction.slice(0, 2)).replace(/^0+(?=\d)/, "");
  const tail = fraction.slice(2).replace(/0+$/, "");
  return `${match[1]}${whole}${tail ? "." + tail : ""}%`;
}

export const icon = (name: string) => (
  <i aria-hidden="true" className={`fa fa-${name}`} />
);
export function Status({ job }: { job: Job }) {
  return (
    <span className={`qw-status ${job.status}`}>
      {icon(
        job.status === "succeeded"
          ? "check-circle"
          : job.status === "failed"
            ? "exclamation-circle"
            : job.status === "running"
              ? "spinner"
              : "circle-o",
      )}{" "}
      {labels[job.status]}
      {job.recovery_required ? " · 需恢复" : ""}
    </span>
  );
}
export function Alert({ children }: { children?: ReactNode }) {
  return children ? (
    <div className="qw-alert" role="alert">
      {children}
    </div>
  ) : null;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="qw-empty">{children}</div>;
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
