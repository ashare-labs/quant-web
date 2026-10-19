import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createProxy, frontendPort } from './proxy-config.mjs';

export async function inspectConnection(env = process.env, fetcher = fetch) {
  const api = createProxy(env)['/execution-api/'].target;
  const common = { schema: 'quant-web.connection-check.v1', api_origin: api,
    frontend_origin: `http://127.0.0.1:${frontendPort(env.FRONTEND_PORT)}` };
  let response;
  try { response = await fetcher(`${api}/api/v1/product/config`, { signal: AbortSignal.timeout(5000), cache: 'no-store' }); }
  catch { return { ...common, ready: false, state: 'backend_unreachable',
    message: 'API未启动、地址不可达或响应超时。此检查不会启动服务；请用选定部署清单启动API后重试。' }; }
  if (!response.ok) return { ...common, ready: false, state: 'backend_http_error', http_status: response.status };
  let config;
  try { config = await response.json(); }
  catch { return { ...common, ready: false, state: 'invalid_configuration_response' }; }
  if (!config || typeof config.configured !== 'boolean' || !Array.isArray(config.assets))
    return { ...common, ready: false, state: 'invalid_configuration_response' };
  if (!config.configured || config.kind !== 'product') return { ...common, ready: false,
    state: 'product_not_configured', error: config.error ?? null };
  if (!/^[a-f0-9]{64}$/.test(config.configuration_id ?? ''))
    return { ...common, ready: false, state: 'invalid_configuration_response' };
  return { ...common, ready: true, state: 'configured', profile: config.profile,
    configuration_id: config.configuration_id, assets: config.assets,
    limitations: config.limitations ?? [] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await inspectConnection();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ready ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ ready: false, state: 'invalid_address_configuration', message: error.message }));
    process.exitCode = 2;
  }
}
