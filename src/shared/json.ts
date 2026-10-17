export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// JSON.parse produces JSON values; callers still validate their domain shape.
export const parseJson = (text: string): JsonValue =>
  JSON.parse(text) as JsonValue;
