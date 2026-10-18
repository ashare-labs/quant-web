import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptorSecurities, parseSecurities } from '../../src/features/market/model.ts';

test('published research securities come from descriptors or explicit input, never a two-stock fallback', () => {
  assert.deepEqual(descriptorSecurities({ scope: [{ security: '600519.XSHG', frequency: 'daily' }, { security: '000002.XSHE' }] }), ['000002.XSHE', '600519.XSHG']);
  assert.deepEqual(descriptorSecurities({ securities: ['600036.XSHG', '600519.XSHG', '000002.XSHE'] }), ['000002.XSHE', '600036.XSHG', '600519.XSHG']);
  assert.deepEqual(descriptorSecurities(undefined), []);
  assert.deepEqual(parseSecurities('600519.XSHG, 000002.XSHE 600519.XSHG'), ['000002.XSHE', '600519.XSHG']);
  for (const value of ['', '600519', 'bad', '600519.XSHG BAD']) assert.throws(() => parseSecurities(value));
});
