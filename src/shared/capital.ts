export const DEFAULT_CAPITAL = '100000';

export const unformatCapital = (value: string) => value.replaceAll(',', '').trim();

// Format digits as text so editing never rounds decimals or drops a trailing decimal point.
export function formatCapital(value: string): string {
  const raw = unformatCapital(value), match = /^([+-]?)(\d*)(\.\d*)?$/.exec(raw);
  if (!match) return raw;
  return match[1] + match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (match[3] || '');
}

export function parseCapital(value: string): number {
  const raw = unformatCapital(value), cash = Number(raw);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) || !Number.isFinite(cash) || cash <= 0 || cash > 100000000) throw new Error('初始资金须大于 0 且不超过 1 亿元。');
  return cash;
}
