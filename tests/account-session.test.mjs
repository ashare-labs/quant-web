import assert from 'node:assert/strict';
import test from 'node:test';
import {SessionManager,scopedStorage} from '../src/auth/session.ts';
import {newDraft,readDrafts} from '../src/shared/drafts.ts';
import {commitEditorSave,retainEditorDraft} from '../src/shared/editor-state.ts';
import {openProjectDraft,readProjectDraft,retainProjectDraft} from '../src/strategies/project-state.ts';

const owner='64a33153-afd9-4f98-889e-f9bc66a5e98b',friend='b96a19bc-6d5f-4279-9f96-9903f775c41e';
const session=(user=owner,deployment='a'.repeat(32))=>({deployment_id:deployment,user:{id:user,email:user+'@example.com',display_name:''},
  session:{id:'synthetic-device-'+user,idle_expires_at:'2027-01-01T00:00:00Z',absolute_expires_at:'2027-05-01T00:00:00Z'},
  capabilities:{manage_accounts:user===owner,execute_python:user===owner}});
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});

test('concurrent restore and renewal use one request and keep the mounted identity',async()=>{
  let complete,calls=[];
  const manager=new SessionManager(true,async(url,init)=>{calls.push([url,init]);return new Promise(resolve=>{complete=resolve;});});
  const first=Array.from({length:10},()=>manager.refresh());
  assert.equal(calls.length,1);assert.equal(manager.snapshot().status,'checking');
  complete(json(session()));await Promise.all(first);
  const epoch=manager.snapshot().epoch;
  const pending=Array.from({length:10},()=>manager.refresh(true));
  assert.equal(calls.length,2);assert.equal(manager.snapshot().status,'ready');
  assert.equal(calls[1][0],'/api/v1/auth/session/renew');assert.equal(calls[1][1].headers['X-Quant-User'],owner);
  assert.equal(calls[1][1].credentials,'same-origin');assert.equal(calls[1][1].headers.Authorization,undefined);
  complete(json(session()));await Promise.all(pending);assert.equal(manager.snapshot().epoch,epoch);
});

test('offline reconnect retains the page identity and 401 revocation clears it without replay',async()=>{
  let mode='ok',calls=0;
  const manager=new SessionManager(true,async()=>{calls++;if(mode==='offline')throw new TypeError('offline');return mode==='expired'?new Response('',{status:401}):json(session());});
  await manager.refresh();const epoch=manager.snapshot().epoch;
  mode='offline';await manager.refresh(true);
  assert.equal(manager.snapshot().status,'offline');assert.equal(manager.snapshot().session.user.id,owner);assert.equal(manager.snapshot().epoch,epoch);
  mode='ok';await manager.refresh();assert.equal(manager.snapshot().status,'ready');assert.equal(manager.snapshot().epoch,epoch);
  mode='expired';const before=calls;await manager.refresh();assert.equal(calls,before+1);
  assert.equal(manager.snapshot().status,'anonymous');assert.equal(manager.snapshot().session,null);
});

test('a late restore and a late unauthorized response cannot overwrite a newer login',async()=>{
  let complete,count=0;
  const manager=new SessionManager(true,async()=>{count++;if(count===1)return new Promise(resolve=>{complete=resolve;});return json(session(friend));});
  const obsolete=manager.refresh();const epoch=manager.snapshot().epoch;
  await manager.synchronize();assert.equal(manager.snapshot().session.user.id,friend);
  complete(json(session(owner)));await obsolete;assert.equal(manager.snapshot().session.user.id,friend);
  manager.rejectUnauthorized(epoch);assert.equal(manager.snapshot().session.user.id,friend);
  assert.throws(()=>manager.assertCurrent(epoch),/旧请求/);
});

test('logout is confirmed server-side and offline errors do not claim successful revocation',async()=>{
  let offline=false,requests=[];
  const manager=new SessionManager(true,async(url,init)=>{requests.push([url,init]);if(url.endsWith('/logout')){if(offline)throw new TypeError('offline');return new Response(null,{status:204});}return json(session());});
  await manager.refresh();offline=true;await assert.rejects(manager.logout());assert.equal(manager.snapshot().status,'ready');
  offline=false;await manager.logout();assert.equal(manager.snapshot().status,'anonymous');
  assert.equal(requests.at(-1)[1].headers['X-Quant-User'],owner);
});

test('login uses a form and cannot expose password or credentials in session state',async()=>{
  const requests=[];
  const manager=new SessionManager(true,async(url,init)=>{requests.push([url,init]);return url.endsWith('/login')?new Response(null,{status:204}):json(session());});
  await manager.login('owner@example.com','synthetic secret');
  assert.equal(requests[0][1].body.get('password'),'synthetic secret');
  assert.equal(requests[0][1].headers['X-Requested-With'],'quant-web');
  assert.ok(!JSON.stringify(manager.snapshot()).includes('synthetic secret'));
});

test('drafts and pending writes are scoped by deployment and owner; legacy keys stay untouched',()=>{
  const values=new Map([['quantweb-strategy-drafts-v1','legacy owner draft']]);
  const backing={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const state=value=>({status:'ready',session:value,epoch:1,error:''});
  const a=scopedStorage(backing,state(session())),b=scopedStorage(backing,state(session(friend))),other=scopedStorage(backing,state(session(owner,'b'.repeat(32))));
  assert.equal(a.getItem('quantweb-strategy-drafts-v1'),null);assert.equal(b.getItem('quantweb-strategy-drafts-v1'),null);
  a.setItem('same','A');b.setItem('same','B');assert.equal(a.getItem('same'),'A');assert.equal(b.getItem('same'),'B');assert.equal(other.getItem('same'),null);
  a.setItem('same','late A result');assert.equal(b.getItem('same'),'B');
  assert.equal(values.get('quantweb-strategy-drafts-v1'),'legacy owner draft');
  assert.throws(()=>scopedStorage(backing,{status:'anonymous',session:null,epoch:2,error:''}),/账号未确认/);
});

test('a renewal detecting another tab account switch restores that account once',async()=>{
  let switched=false;const calls=[];
  const manager=new SessionManager(true,async(url)=>{calls.push(url);return url.endsWith('/renew')
    ?new Response('',{status:409}):json(session(switched?friend:owner));});
  await manager.refresh();switched=true;await manager.refresh(true);
  assert.equal(manager.snapshot().status,'ready');assert.equal(manager.snapshot().session.user.id,friend);
  assert.deepEqual(calls,['/api/v1/auth/session','/api/v1/auth/session/renew','/api/v1/auth/session']);
});

test('late single-file and project retention keep the initiating storage scope',async()=>{
  const records=new Map(),backing={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const scope=user=>scopedStorage(backing,{status:'ready',session:session(user),epoch:1,error:''});
  const a=scope(owner),b=scope(friend),draft={...newDraft(),id:'same',source:'owner source',filePath:'same.py'};
  retainEditorDraft({...draft,source:'friend source'},b);
  const project=openProjectDraft({path:'same',strategy_id:'aqproj-'+'a'.repeat(32),entrypoint:'main.py',files:{'main.py':'owner project'},revision:'0'.repeat(64)}).draft;
  retainProjectDraft({...project,files:{'main.py':'friend project'}},b);
  await Promise.resolve();
  commitEditorSave(draft,{...draft,workingCopy:false},draft.source,a);retainProjectDraft(project,a);
  assert.equal(readDrafts(a)[0].source,'owner source');assert.equal(readDrafts(b)[0].source,'friend source');
  assert.equal(readProjectDraft(project.strategy_id,a).files['main.py'],'owner project');
  assert.equal(readProjectDraft(project.strategy_id,b).files['main.py'],'friend project');
});
