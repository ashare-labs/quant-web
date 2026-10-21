import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDraft, submission } from '../../src/features/workbench/draft.ts';
const draft = {...initialDraft, source: 'def initialize(context): pass'};
test('Python form passes actual source, typed parameters and explicit selection', () => {
 const req=submission({...draft, parameters: '{"lookback":7,"shares":200}'}, 'same-key', 'a'.repeat(64));
 assert.equal(req.source,draft.source);assert.deepEqual(req.parameters,{lookback:7,shares:200});
 assert.deepEqual(req.securities,['000001.XSHE','600000.XSHG']);assert.equal(req.idempotency_key,'same-key');
});
test('Invalid Python form never reaches submission', () => {
 for(const patch of [{parameters:'[]'},{parameters:'bad'},{securities:'000001'},{securities:'000001.XSHE,000001.XSHE'},{cash:'NaN'},{cash:'0'},{source:''},{start:'2025-01-01',end:'2024-01-01'}]) assert.throws(()=>submission({...draft,...patch},'k','a'.repeat(64)));
});
