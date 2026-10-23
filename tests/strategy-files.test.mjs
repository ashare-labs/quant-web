import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {api, ApiError} from '../src/shared/api.ts';
import {childPath, displayName, parentDirectory, directoryQuery, fileHref, createDirectory, readStrategyFile, saveStrategyFile, StrategySaveError} from '../src/shared/strategy-files.ts';
import {newDraft, readDrafts, readFolders, saveDraft} from '../src/shared/drafts.ts';

const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
afterEach(() => {globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const failure=(code,status=503,save_state)=>json({error:{code,message:code,details:{save_state}}},status);

test('Chinese nested paths are encoded once; typed names cannot escape their directory',()=>{
  const path=childPath('研究/日频','动量.py',true);
  assert.equal(path,'研究/日频/动量.py');assert.equal(displayName(path),'动量');assert.equal(parentDirectory(path),'研究/日频');
  assert.equal(displayName('.py'),'.py');assert.equal(displayName('dir/ leading.py'),' leading');
  assert.equal(childPath('','新策略',true),'新策略.py');
  assert.equal(new URLSearchParams(fileHref(path).split('?')[1]).get('file'),path);
  assert.equal(new URLSearchParams(directoryQuery('中文 % #').split('?')[1]).get('path'),'中文 % #');
  for(const name of ['', ' ', '.', '..', '../escape', 'a/b', 'a\\b', 'C:foo', 'a\nb'])assert.throws(()=>childPath('',name,true));
});

test('directory/file operations use the exact API with uncached reads and explicit overwrite',async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,...options});return json(options.method==='GET'?{path:'研究/策略.py',source:'中文\r\n'}:{path:JSON.parse(options.body).path});};
  await createDirectory('研究');
  await saveStrategyFile('研究/策略.py','',false);
  await saveStrategyFile('研究/策略.py','中文\r\n',true);
  assert.equal((await readStrategyFile('研究/策略.py')).source,'中文\r\n');
  assert.deepEqual(calls.map(c=>c.method),['POST','PUT','PUT','GET']);
  assert.equal(calls[0].url,'/api/v1/python/directories');
  assert.deepEqual(JSON.parse(calls[1].body),{path:'研究/策略.py',source:'',overwrite:false});
  assert.deepEqual(JSON.parse(calls[2].body),{path:'研究/策略.py',source:'中文\r\n',overwrite:true});
  assert.equal(calls[3].cache,'no-store');assert.equal(calls[3].body,undefined);
});

test('new same-name files are rejected without retrying or overwriting',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return failure('STRATEGY_FILE_EXISTS',409);};
  await assert.rejects(saveStrategyFile('existing.py','replacement',false),e=>e instanceof StrategySaveError&&e.message.includes('同名文件已存在')&&!e.readbackMatches);
  assert.equal(calls,1);
});

test('confirmed storage failure remains unsaved and does not claim an uncertain write',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return failure('STORAGE_FULL',503,'not_saved');};
  await assert.rejects(saveStrategyFile('a.py','new',true),e=>e instanceof ApiError&&!e.uncertain);
  assert.equal(calls,1);
});

test('uncertain writes read back once but never resolve as successful, even for matching content',async()=>{
  for(const source of ['new','old']){
    const calls=[];globalThis.fetch=async(url,options)=>{calls.push(options.method);return options.method==='PUT'?failure('STRATEGY_SAVE_UNCERTAIN',503,'uncertain'):json({path:'a.py',source});};
    await assert.rejects(saveStrategyFile('a.py','new',true),e=>e instanceof StrategySaveError&&e.readbackMatches===(source==='new')&&e.message.includes('尚未确认'));
    assert.deepEqual(calls,['PUT','GET']);
  }
});

test('network failure and malformed success responses preserve contents and trigger readback',async()=>{
  for(const mode of ['network','bad-response','wrong-path','null']){
    const calls=[];globalThis.fetch=async(url,options)=>{calls.push(options.method);if(options.method==='GET')throw Error('offline');if(mode==='network')throw Error('offline');return mode==='bad-response'?new Response('not json'):json(mode==='null'?null:{path:'other.py'});};
    await assert.rejects(saveStrategyFile('a.py','new',false),e=>e instanceof StrategySaveError&&!e.readbackMatches&&e.message.includes('编辑内容已保留'));
    assert.deepEqual(calls,['PUT','GET']);
  }
});

test('malformed file reads cannot become editable source',async()=>{
  for(const result of [null,{}, {path:'other.py',source:'wrong'}, {path:'a.py'}]){
    globalThis.fetch=async()=>json(result);
    await assert.rejects(readStrategyFile('a.py'),e=>e instanceof ApiError&&!e.uncertain);
  }
});

test('reading and saving one legacy draft retains other drafts, empty capital, and folder records',()=>{
  const old={...newDraft('旧策略','旧目录'),id:'old',source:'old source',capital:'76543.2100'};
  const untouched={...newDraft('保留'),id:'untouched',capital:''};
  const map=new Map([['quantweb-strategy-drafts-v1',JSON.stringify([old,untouched])],['quantweb-folders-v1','["旧目录","空目录"]']]);
  let writes=0;globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes++;map.set(k,v);}};
  assert.deepEqual(readDrafts(),[old,untouched]);assert.deepEqual(readFolders(),['旧目录','空目录']);assert.equal(writes,0);
  saveDraft({...old,filePath:'旧目录/旧策略.py'});
  assert.deepEqual(readDrafts().find(d=>d.id==='untouched'),untouched);
  assert.equal(readDrafts().find(d=>d.id==='old').capital,'76543.2100');
  assert.equal(map.get('quantweb-folders-v1'),'["旧目录","空目录"]');
});

test('existing POST clients retain their method and uncertainty semantics',async()=>{
  let method;globalThis.fetch=async(url,options)=>{method=options.method;return failure('UNAVAILABLE');};
  await assert.rejects(api('/factors/jobs',{}),e=>e.uncertain);assert.equal(method,'POST');
});
