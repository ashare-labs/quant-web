// Preserve spelling. Only the file service can resolve filesystem aliases.
export function isStrategyPath(value: unknown, allowRoot = false): value is string {
  return typeof value === 'string' && (allowRoot && value === '' || !!value
    && new TextEncoder().encode(value).length <= 1024
    && !/[\\:\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(part => !!part && part !== '.' && part !== '..' && new TextEncoder().encode(part).length <= 255));
}
export function isStrategyId(value: unknown): value is string {
  return isStrategyPath(value) && value.endsWith('.py');
}
