import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configureApiProxy, observeApi } from './scripts/preview-api';
const dependency = createRequire(import.meta.url);
const pages = ['index', 'strategies', 'strategy-editor', 'backtests', 'backtest-results', 'simulations', 'factors'];
const api = process.env.AQ_API_URL, paper = process.env.PAPER_API_URL;
const proxy = {
  ...(api ? { '/api': { target: api, changeOrigin: false, configure: configureApiProxy } } : {}),
  ...(paper ? { '/paper-api': { target: paper, configure: configureApiProxy, rewrite: (path: string) => path.replace(/^\/paper-api/, '') } } : {}),
};
export default defineConfig({
  cacheDir: '.local/vite-cache',
  server: { host: '127.0.0.1', port: 41846, strictPort: true, proxy, fs: {allow: [searchForWorkspaceRoot(process.cwd()), dirname(dependency.resolve('font-awesome/package.json'))]} },
  preview: { host: '127.0.0.1', port: 41846, strictPort: true, proxy },
  build: { rollupOptions: { input: Object.fromEntries(pages.map(page => [page, resolve(import.meta.dirname, page + '.html')])) } },
  plugins: [{ name: 'unconfigured-api', configureServer(server) { install(server); }, configurePreviewServer(server) { install(server); } }],
});
function install(server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
  server.middlewares.use(observeApi);
  server.middlewares.use((req, res, next) => {
    if ((!api && req.url?.startsWith('/api/')) || (!paper && req.url?.startsWith('/paper-api/'))) {
      res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'SERVICE_NOT_CONFIGURED', message: '尚未连接研究服务。' } }));
    } else next();
  });
}
