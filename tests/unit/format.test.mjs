import test from 'node:test';
import assert from 'node:assert/strict';
import { money, time, canonical } from '../../src/shared/format.ts';
test('financial strings retain all digits and trailing decimals', () => {
  for (const value of ['9007199254740993.12345678', '0.00', '9000.00']) assert.equal(money(value), value);
  assert.equal(money(null), '—');
});
test('clock explicitly converts UTC to Asia/Shanghai', () => assert.equal(time('2026-09-28T01:30:00Z'), '2026-09-28 09:30:00 +08:00'));
test('contract comparison ignores key ordering but preserves structure', () => {
  assert.equal(canonical({ b: 2, a: [1, 2] }), canonical({ a: [1, 2], b: 2 }));
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
});
