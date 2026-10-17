import { defineConfig } from 'vite';
import { createProxy, frontendPort } from './scripts/proxy-config.mjs';

const server = { host: '127.0.0.1', port: frontendPort(process.env.FRONTEND_PORT), strictPort: true, proxy: createProxy() };
export default defineConfig({ server, preview: server });
