// Preserve spelling. Only the file service can resolve filesystem aliases.
export function isStrategyPath(value: unknown, allowRoot = false): value is string {
  return typeof value === 'string' && (allowRoot && value === '' || !!value
    && new TextEncoder().encode(value).length <= 1024
    && !/[\\:\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(part => !!part && part !== '.' && part !== '..' && new TextEncoder().encode(part).length <= 255));
}
export function isStrategyFilePath(value: unknown): value is string {
  return isStrategyPath(value) && value.endsWith('.py');
}

export function isProjectId(value: unknown): value is string {return typeof value === 'string' && /^aqproj-[a-f0-9]{32}$/.test(value);}
export function isStrategyId(value: unknown): value is string {return isProjectId(value) || isStrategyFilePath(value);}
