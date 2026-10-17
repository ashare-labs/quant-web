import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../../src/shared/http.ts';

test('shared transport preserves exact JSON bodies and never retries a mutation', async t => {
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,options) => { requests.push({url,options}); return new Response('{"cash":"1.0010"}',{status:200}); });
  const body={idempotency_key:'same-key',cash:'1.0010'};
  assert.deepEqual(await requestJson('/tasks-api','/jobs',body),{cash:'1.0010'});
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/tasks-api/jobs');
  assert.equal(requests[0].options.method,'POST');assert.equal(requests[0].options.body,JSON.stringify(body));
});
test('HTTP errors retain backend codes and retry advice; server failures stay uncertain', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response(JSON.stringify({error:{code:'CAPACITY_FULL',message:'Wait',details:{queued:4}}}),{status:503,headers:{'Retry-After':'2'}}));
  await assert.rejects(requestJson('/tasks-api','/jobs',{}),error => error instanceof ApiError && error.code==='CAPACITY_FULL' && error.uncertain && error.details.queued===4 && error.message.includes('2 秒'));
});
test('invalid success responses and aborted requests cannot be shown as confirmed results', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response('<html>proxy failure</html>',{status:200}));
  await assert.rejects(requestJson('/tasks-api','/jobs',{},undefined,{codePrefix:'TASKS'}),error => error.code==='TASKS_INVALID_RESPONSE' && error.uncertain);
  t.mock.method(globalThis,'fetch',async (_url,{signal}) => { assert.equal(signal.aborted,true); throw new DOMException('aborted','AbortError'); });
  const controller=new AbortController();controller.abort();
  await assert.rejects(requestJson('/tasks-api','/jobs',{},controller.signal,{codePrefix:'TASKS'}),error => error.code==='TASKS_NETWORK_UNCERTAIN' && error.uncertain);
});
