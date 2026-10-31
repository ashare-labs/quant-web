import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configureApiProxy, observeApi } from './scripts/preview-api';

const dependency = createRequire(import.meta.url);
const pages = [
  'index',
  'strategies',
  'strategy-editor',
  'backtests',
  'backtest-results',
  'simulations',
  'factors',
];

const service = process.env.QUANT_SERVICE_URL;
const directApi = process.env.AQ_API_URL || process.env.ASHARE_API_URL;
const directPaper = process.env.PAPER_API_URL || process.env.ASHARE_PAPER_URL;
const frontendPort = Number(process.env.FRONTEND_PORT || 41846);

if (service && (directApi || directPaper)) {
  throw new Error('Account profile accepts QUANT_SERVICE_URL only; remove legacy direct-engine proxies.');
}

const api = service || directApi;
const paper = service ? undefined : directPaper;

if (service) {
  const target = new URL(service);
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    !target.port ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('QUANT_SERVICE_URL must be an explicit private loopback origin.');
  }
}

const proxy = {
  ...(api ? { '/api': { target: api, changeOrigin: false, configure: configureApiProxy } } : {}),
  ...(paper
    ? {
        '/paper-api': {
          target: paper,
          configure: configureApiProxy,
          rewrite: (path: string) => path.replace(/^\/paper-api/, ''),
        },
      }
    : {}),
};

export default defineConfig({
  define: { __QUANT_ACCOUNT_MODE__: JSON.stringify(!!service) },
  cacheDir: '.local/vite-cache',
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        dirname(dependency.resolve('font-awesome/package.json')),
      ],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy,
  },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page, resolve(import.meta.dirname, page + '.html')])),
    },
  },
  plugins: [
    {
      name: 'account-profile',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'quant-profile.json',
          source: JSON.stringify({ accounts: !!service }),
        });
      },
    },
    {
      name: 'unconfigured-api',
      configureServer(server) {
        install(server);
      },
      configurePreviewServer(server) {
        let profile = false;
        try {
          profile = JSON.parse(readFileSync(resolve('dist/quant-profile.json'), 'utf8')).accounts === true;
        } catch {
          if (service) {
            throw new Error('Build the account profile before previewing it.');
          }
        }
        if (profile !== !!service) {
          throw new Error('Build and preview must use the same account profile.');
        }
        install(server);
      },
    },
  ],
});

function install(server: {
  middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
}) {
  server.middlewares.use(observeApi);
  server.middlewares.use((req, res, next) => {
    if (service && req.url?.startsWith('/paper-api/')) {
      res.statusCode = 410;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: { code: 'OWNED_RESOURCE_REQUIRED', message: '请通过账号后端访问模拟账户。' },
        }),
      );
      return;
    }
    if ((!api && req.url?.startsWith('/api/')) || (!paper && req.url?.startsWith('/paper-api/'))) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: { code: 'SERVICE_NOT_CONFIGURED', message: '尚未连接研究服务。' },
        }),
      );
    } else {
      next();
    }
  });
}
