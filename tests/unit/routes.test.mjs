import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, defaultRoute } from '../../src/app/routes.ts';
import { createProxy, frontendPort, loopbackUrl } from '../../scripts/proxy-config.mjs';

test('functional navigation resolves nested task and run IDs without accepting prefix collisions', () => {
  assert.equal(resolveRoute('').route,defaultRoute);
  assert.equal(defaultRoute, '#/data');
  for (const [route,feature] of [['#/data','product'],['#/portfolio/results/id','portfolio'],['#/tasks/daily/id/details','tasks'],['#/paper','paper'],['#/market','market'],['#/execution/runs/id','execution']]) assert.equal(resolveRoute(route).feature,feature);
  for (const route of ['#/portfolio-old','#/m2','#/br1','#/acceptance','#/workbench']) assert.equal(resolveRoute(route).feature,'not-found');
});
test('deployment exports one API origin for product and task state with explicit overrides', () => {
  const proxy = createProxy({ ASHARE_API_URL: 'http://127.0.0.1:19999', ASHARE_PAPER_URL: 'http://127.0.0.1:19998', TASKS_API_URL: 'http://127.0.0.1:19000' });
  for (const prefix of ['/portfolio-api/', '/execution-api/']) assert.equal(proxy[prefix].target, 'http://127.0.0.1:19999');
  assert.equal(proxy['/paper-api/'].target, 'http://127.0.0.1:19998');
  assert.equal(proxy['/tasks-api/'].target, 'http://127.0.0.1:19000');
  assert.equal(proxy['/execution-api/'].rewrite('/execution-api/product/config'), '/api/v1/product/config');
});
test('proxies route each current domain to its declared backend path', () => {
  const proxy=createProxy({TASKS_API_URL:'http://localhost:19000'});
  assert.equal(proxy['/tasks-api/'].target,'http://localhost:19000');
  assert.equal(proxy['/tasks-api/'].rewrite('/tasks-api/jobs/a?x=1'),'/api/v1/tasks/daily/jobs/a?x=1');
  assert.equal(proxy['/execution-api/'].rewrite('/execution-api/market/stores'),'/api/v1/market/stores');
  assert.equal(proxy['/portfolio-api/'].rewrite('/portfolio-api/jobs'),'/api/v1/portfolio/jobs');
  assert.equal(proxy['/paper-api/'].rewrite('/paper-api/sessions'),'/api/v1/paper/sessions');
});
test('local proxy configuration rejects credentials, remote origins and invalid ports', () => {
  for(const url of ['https://localhost','http://user:password@localhost','http://example.test','http://localhost/path','http://localhost?token=x']) assert.throws(()=>loopbackUrl(url));
  for(const port of ['0','80','65536','x','1.5']) assert.throws(()=>frontendPort(port));
  assert.equal(frontendPort(),41839);assert.equal(loopbackUrl('http://[::1]:18839'),'http://[::1]:18839');
});
