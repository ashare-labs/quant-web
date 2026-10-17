import type { ReactNode } from "react";
import { statuses, type Run } from "./model";
export function Json({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
export function Badge({ status }: { status: Run["status"] }) {
  return (
    <span className={`badge ${status}`}>
      {statuses[status]} <span className="english">{status}</span>
    </span>
  );
}
export function ErrorBox({ text }: { text?: string }) {
  return text ? (
    <div role="alert" className="error">
      {text}
    </div>
  ) : null;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Pairs({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="pairs">
      {Object.entries(value).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  if (!rows.length) return <Empty>后端当前未输出记录。</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
