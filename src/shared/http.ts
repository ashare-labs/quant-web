export class ApiError extends Error {
  code: string;
  uncertain: boolean;
  details?: unknown;
  origin?: string | null;
  constructor(code: string, message: string, uncertain = false, details?: unknown, origin?: string | null) {
    super(message);
    this.code = code;
    this.uncertain = uncertain;
    this.details = details;
    this.origin = origin;
  }
}

export const errorText = (error: unknown) => error instanceof ApiError ? `${error.code} · ${error.message}` : String(error);

/** One transport for product clients; never imports a feature, fixture or service pin. */
export async function requestJson<T>(base: string, path: string, body?: unknown, signal?: AbortSignal,
  options: { timeoutMs?: number; codePrefix?: string; uncertainMessage?: string } = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs ?? 45000);
  const mutation = body !== undefined;
  const prefix = options.codePrefix ? `${options.codePrefix}_` : '';
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store',
    });
    let value;
    try { value = JSON.parse(await response.text()); }
    catch { throw new ApiError(`${prefix}INVALID_RESPONSE`, `HTTP ${response.status} 非 JSON，旧结果已隐藏。`, mutation); }
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      const hint = retry && /^\d+$/.test(retry) ? (mutation ? ` 服务建议 ${retry} 秒后重试原请求和幂等键。` : ` 服务建议 ${retry} 秒后重新读取。`) : '';
      const detail = Array.isArray(value.detail)
        ? value.detail.map((item: { loc: unknown[]; msg: string }) => `${item.loc.join('.')}: ${item.msg}`).join('；')
        : JSON.stringify(value.detail ?? value);
      throw new ApiError(value.error?.code ?? `HTTP_${response.status}`, (value.error?.message ?? detail) + hint,
        mutation && response.status >= 500, value.error?.details, value.error?.origin);
    }
    return value as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`${prefix}${mutation ? 'NETWORK_UNCERTAIN' : 'BACKEND_UNREACHABLE'}`,
      mutation ? (options.uncertainMessage ??
        '连接失败或超时。提交可能已写入；重新读取后，只能用保存的请求和原幂等键确认。') :
        '无法连接后端或等待响应超时。请确认配置中的 API 已启动，然后重新读取。', mutation);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
