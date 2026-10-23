import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../src/shared/api.ts';
import {DEFAULT_FREQUENCY, newDraft, readDrafts, saveDraft, resolveFrequency, validateDraftConfig, pythonBacktestConfig} from '../src/shared/drafts.ts';

const config={start:'2024-01-01',end:'2024-01-31',capital:'123,456.7800'};
const now=new Date('2026-10-23T00:00:00Z');

test('frequency uses the visible design default and rejects unknown supplied modes',()=>{
  assert.equal(DEFAULT_FREQUENCY,'1m');assert.equal(newDraft().frequency,'1m');assert.equal(resolveFrequency(undefined),'1m');
  assert.equal(pythonBacktestConfig(config,now).frequency,'1m');
  for(const frequency of ['',null,'daily','日','分钟','5m',0]){
    assert.throws(()=>resolveFrequency(frequency),/运行频率/);
    assert.throws(()=>validateDraftConfig({...config,frequency},now),/运行频率/);
    assert.throws(()=>pythonBacktestConfig({...config,frequency},now),/运行频率/);
  }
});

test('old missing frequency is not migrated on read; saving one draft persists its explicit selection',()=>{
  const {frequency:unused,...legacy}={...newDraft('旧草稿'),...config,id:'old'};
  const daily={...newDraft('日频配置'),...config,id:'daily',frequency:'1d'};
  const previous=globalThis.localStorage, raw=JSON.stringify([legacy,daily]);let text=raw,writes=0;
  globalThis.localStorage={getItem:()=>text,setItem:(key,value)=>{text=value;writes++;}};
  try{
    assert.deepEqual(readDrafts(),[legacy,daily]);assert.equal(text,raw);assert.equal(writes,0);
    assert.equal(pythonBacktestConfig(readDrafts()[0],now).frequency,'1m');
    assert.equal(pythonBacktestConfig(readDrafts()[1],now).frequency,'1d');
    saveDraft({...legacy,frequency:'1d'});
    assert.equal(readDrafts()[0].frequency,'1d');assert.deepEqual(readDrafts()[1],daily);
    saveDraft({...readDrafts()[0],frequency:'1m'});assert.equal(readDrafts()[0].frequency,'1m');
    const invalid=JSON.stringify([{...legacy,frequency:'5m'}]);text=invalid;
    assert.throws(()=>readDrafts(),/草稿格式/);assert.equal(text,invalid);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('serialized POST configuration explicitly includes selected frequency and numeric cash',async()=>{
  const previous=globalThis.fetch, requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,method:options.method,body:JSON.parse(options.body)});return new Response('{}',{headers:{'Content-Type':'application/json'}});};
  try{
    for(const frequency of ['1d','1m',undefined]){
      const source=frequency==='1m'?'# daily-looking comment\npass':'# minute-looking comment\npass';
      const draft={...config,frequency,source};
      await api('/python/jobs',{source,...pythonBacktestConfig(draft,now)});
    }
    assert.deepEqual(requests.map(r=>r.body.frequency),['1d','1m','1m']);
    for(const r of requests){
      assert.equal(r.url,'/api/v1/python/jobs');assert.equal(r.method,'POST');assert.ok(Object.hasOwn(r.body,'frequency'));
      assert.equal(r.body.initial_cash,123456.78);assert.equal(r.body.start_date,config.start);assert.equal(r.body.end_date,config.end);
    }
    assert.equal(requests[1].body.source,'# daily-looking comment\npass');
    assert.throws(()=>pythonBacktestConfig({...config,start:'',frequency:'1d'},now),/有效/);
  }finally{globalThis.fetch=previous;}
});
