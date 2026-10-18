import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createProxy, frontendPort } from './scripts/proxy-config.mjs';

const dependency = createRequire(import.meta.url);
const server = { host: '127.0.0.1', port: frontendPort(process.env.FRONTEND_PORT), strictPort: true, proxy: createProxy(),
  watch: { ignored: ['**/.local/**'] },
  // Allow this dependency's font assets when packages are shared read-only by worktrees.
  fs: { allow: [searchForWorkspaceRoot(process.cwd()), dirname(dependency.resolve('font-awesome/package.json'))] } };
export default defineConfig({ cacheDir: '.local/vite-cache', server, preview: server });
