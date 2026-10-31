import { useState } from 'react';
import { csv, download, num, type Row } from './api';
export type Column = {
  key: string;
  label: string;
  value?: (row: Row) => unknown;
};
export function DataTable({ data, columns, name, exportable = true }: {
  data: Row[];
  columns: Column[];
  name: string;
  exportable?: boolean;
}) {
  const [page, setPage] = useState(0);
  const limit = 50;
  const pages = Math.max(1, Math.ceil(data.length / limit));
  const current = Math.min(page, pages - 1);
  const cell = (r: Row, c: Column) => c.value ? c.value(r) : r[c.key];
  return <>
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {columns.map(c => <th key={c.key}>
              {c.label}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {data.slice(current * limit, (current + 1) * limit).map((r, i) => <tr key={i}>
            {columns.map(c => {
              const v = cell(r, c);
              return <td key={c.key}>
                {typeof v === 'number'
                  ? num(v, 7)
                  : v === undefined
                    || v === null
                    ? '—'
                    : typeof v === 'object'
                      ? JSON.stringify(v)
                      : String(v)}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    {!data.length && <div className="empty">此结果未包含{name}记录。</div>}
    <div className="pagination">
      <button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button>
      <span>{current + 1} / {pages} · {data.length} 条</span>
      <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>下一页</button>
      {exportable
        && <button disabled={!data.length} onClick={() => download(name + '.csv', csv([
          columns.map(c => c.label),
          ...data.map(r => columns.map(c => cell(r, c)))
        ]), 'text/csv;charset=utf-8')}>导出{name} CSV</button>}
    </div>
  </>;
}
