export interface ReadProgress {
  phase: 'connecting' | 'receiving' | 'processing';
  receivedBytes: number;
  totalBytes: number | null;
}
/** Observe the response body, without estimating server work or truncating JSON. */
export async function readResponse(response: Response, signal: AbortSignal | undefined, report: (progress: ReadProgress) => void): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  const encoding = response.headers.get('content-encoding');
  // Fetch exposes decoded bytes. An encoded Content-Length is not its denominator.
  const totalBytes = (!encoding || encoding === 'identity') && Number.isSafeInteger(length) && length > 0 ? length : null;
  let receivedBytes = 0, lastUpdate = 0;
  const progress = (phase: ReadProgress['phase']) => report({ phase, receivedBytes, totalBytes });
  progress('receiving');
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    signal?.throwIfAborted();
    progress('processing');
    return text;
  }
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => { }); };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder(), chunks: string[] = [];
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done)
        break;
      receivedBytes += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
      if (Date.now() - lastUpdate >= 200) {
        progress('receiving');
        lastUpdate = Date.now();
      }
    }
    chunks.push(decoder.decode());
    progress('processing');
    return chunks.join('');
  }
  finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
