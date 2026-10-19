import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectConnection } from '../../scripts/doctor.mjs';

test('doctor probes the same execution API override used by Vite', async () => {
  let url;
  const result = await inspectConnection({ ASHARE_API_URL:'http://127.0.0.1:18839', EXECUTION_API_URL:'http://127.0.0.1:19002' }, async value => {
    url=value; return new Response(JSON.stringify({ configured:true,kind:'product',profile:'product',configuration_id:'a'.repeat(64),assets:[{kind:'local_daily',path:'/chosen/market'}] }));
  });
  assert.equal(url,'http://127.0.0.1:19002/api/v1/product/config');
  assert.equal(result.ready,true); assert.equal(result.assets[0].path,'/chosen/market');
});
test('doctor distinguishes offline, HTTP error, malformed and unconfigured responses', async () => {
  assert.equal((await inspectConnection({},async()=>{throw new TypeError('offline');})).state,'backend_unreachable');
  assert.equal((await inspectConnection({},async()=>new Response('',{status:503}))).state,'backend_http_error');
  assert.equal((await inspectConnection({},async()=>new Response('<html>'))).state,'invalid_configuration_response');
  assert.equal((await inspectConnection({},async()=>new Response(JSON.stringify({configured:false,assets:[]})))).state,'product_not_configured');
});
