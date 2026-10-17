import { ApiError, errorText } from "../execution/api";

export function Json({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
export function Raw({
  title,
  value,
  open = false,
}: {
  title: string;
  value: unknown;
  open?: boolean;
}) {
  return (
    <details open={open}>
      <summary>{title} · 后端原文</summary>
      <Json value={value} />
    </details>
  );
}
export function Values({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="pairs">
      {Object.entries(value).map(([key, val]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{typeof val === "object" ? JSON.stringify(val) : String(val)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ReadError({ error }: { error?: unknown }) {
  return error ? (
    <div role="alert" className="error">
      <strong>{errorText(error)}</strong>
      {error instanceof ApiError && (
        <Values
          value={{
            origin: error.origin ?? "未提供",
            details: error.details ?? null,
          }}
        />
      )}
      <p>本次读取未成功；拒绝不等于没有数据，前端不补零、不降低要求。</p>
    </div>
  ) : null;
}
