import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProxyOptions } from 'vite';

// The API protocol and a small request receipt survive gateway failures.
// Do not log source code, file paths in query strings, credentials or bodies.
export function observeApi(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = req.url?.split('?', 1)[0] || '';
  if (!path.startsWith('/api/') && !path.startsWith('/paper-api/')) return next();
  const requestId = randomUUID(), started = Date.now();
  res.setHeader('X-QuantWeb-Request-Id', requestId);
  res.once('finish', () => console.info(JSON.stringify({event:'api-response', request_id:requestId,
    method:req.method, path, status:res.statusCode, content_type:res.getHeader('Content-Type'),
    duration_ms:Date.now()-started})));
  next();
}

export const configureApiProxy: NonNullable<ProxyOptions['configure']> = proxy => {
  proxy.on('error', (_error, _request, response) => {
    if (!('writeHead' in response) || response.headersSent || response.writableEnded) return;
    response.writeHead(502, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(JSON.stringify({api_version:'v1',error:{code:'UPSTREAM_UNAVAILABLE',
      message:'前端代理无法取得研究服务响应。请恢复服务连接后，使用原请求重试。',
      details:{submission_state:'unknown'}}}));
  });
};
