import test from 'node:test';
import assert from 'node:assert/strict';
import {randomId} from '../src/shared/random-id.ts';
import {newDraft} from '../src/shared/drafts.ts';

test('private HTTP browser without randomUUID can create a draft and request IDs',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  const getRandomValues=crypto.getRandomValues.bind(crypto);
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues}});
  try {
    const ids=Array.from({length:1000},()=>randomId());
    ids.push(newDraft().id);
    assert.equal(new Set(ids).size,ids.length);
    for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  } finally {Object.defineProperty(globalThis,'crypto',original);}
});
