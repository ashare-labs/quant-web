export const services = [
  { domain: 'portfolio', prefix: '/portfolio-api', backend: '/api/v1/portfolio', port: 18839 },
  { domain: 'tasks', prefix: '/tasks-api', backend: '/api/v1/tasks/daily', port: 18839 },
  { domain: 'execution', prefix: '/execution-api', backend: '/api/v1', port: 18839 },
  { domain: 'paper', prefix: '/paper-api', backend: '/api/v1/paper', port: 18818 },
];
export function loopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API URL must be a plain HTTP loopback origin without credentials or a path.');
  }
  return url.origin;
}
export function frontendPort(value = '41839') {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('FRONTEND_PORT must be 1024–65535.');
  return port;
}
export function createProxy(env = process.env) {
  return Object.fromEntries(services.map(service => [service.prefix + '/', {
    target: loopbackUrl(env[`${service.domain.toUpperCase()}_API_URL`] || `http://127.0.0.1:${service.port}`),
    changeOrigin: true,
    rewrite: path => service.backend + path.slice(service.prefix.length),
  }]));
}
