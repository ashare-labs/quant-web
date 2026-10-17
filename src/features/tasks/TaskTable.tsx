import type { ReactNode } from 'react';

export function TaskTable({ name, headers, rows, empty }: { name: string; headers: string[]; rows: ReactNode[][]; empty: string }) {
  return rows.length ? <div className="task-scroll" tabIndex={0} role="region" aria-label={`${name}，可横向滚动`}><table aria-label={name}><thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{value ?? '未提供'}</td>)}</tr>)}</tbody></table></div> : <p className="task-empty">{empty}</p>;
}
