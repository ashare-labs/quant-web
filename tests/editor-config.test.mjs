import test from 'node:test';
import assert from 'node:assert/strict';
import { todayInShanghai, validateDateRange } from '../src/shared/dates.ts';
import { formatCapital, unformatCapital, parseCapital } from '../src/shared/capital.ts';
import { newDraft, readDrafts, validateConfig, validateDraftConfig } from '../src/shared/drafts.ts';

const now = new Date('2026-10-23T16:00:00Z'); // Shanghai is already on the 24th.
const complete = { start: '2026-10-24', end: '2026-10-24', capital: '100000' };

test('business today follows Shanghai midnight, independent of the device timezone', () => {
  for (const [instant, expected] of [
    ['2026-10-23T15:59:59.999Z', '2026-10-23'],
    ['2026-10-23T16:00:00.000Z', '2026-10-24'],
    ['2026-10-23T23:59:59.999Z', '2026-10-24'],
    ['2026-10-24T00:00:00.000Z', '2026-10-24'],
    ['2026-12-31T16:00:00.000Z', '2027-01-01'],
  ]) assert.equal(todayInShanghai(new Date(instant)), expected);
});

test('today is inclusive for both dates and tomorrow is rejected for either', () => {
  assert.equal(validateConfig(complete, now), 100000);
  assert.doesNotThrow(() => validateConfig({ ...complete, start: '2026-10-23' }, now));
  for (const change of [
    { start: '2026-10-25' },
    { end: '2026-10-25' },
    {
      start: '2027-01-01',
      end: '2028-01-01'
    }
  ]) {
    assert.throws(() => validateConfig({ ...complete, ...change }, now), /不能晚于今天/);
    assert.throws(() => validateDraftConfig({ ...complete, ...change }, now), /不能晚于今天/);
  }
  assert.throws(() => validateConfig(complete, new Date('2026-10-23T15:59:59.999Z')), /不能晚于今天/);
});

test('complete configuration rejects missing, malformed, impossible and reversed dates', () => {
  for (const day of ['', '2026-1-01', 'not-a-date', '2026-02-29', '2024-02-30', '0000-01-01']) {
    assert.throws(() => validateConfig({ ...complete, start: day }, now), /有效的开始和结束日期/);
    assert.throws(() => validateConfig({ ...complete, end: day }, now), /有效的开始和结束日期/);
  }
  assert.doesNotThrow(() => validateDateRange({
    start: '2024-02-29',
    end: '2024-02-29'
  }, { today: '2024-02-29' }));
  assert.throws(() => validateConfig({ ...complete, end: '2026-10-23' }, now), /不能早于开始日期/);
  assert.throws(() => validateDraftConfig({
    ...complete,
    end: '2026-10-23'
  }, now), /不能早于开始日期/);
});

test('unified draft save allows missing fields while validating every supplied field', () => {
  for (const partial of [
    { start: '', end: '', capital: '' },
    { ...complete, start: '', capital: '' },
    { ...complete, end: '' },
    { ...complete, capital: '' },
  ]) {
    assert.doesNotThrow(() => validateDraftConfig(partial, now));
    assert.throws(() => validateConfig(partial, now));
  }
  assert.throws(() => validateDraftConfig({
    start: '2026-10-25',
    end: '',
    capital: ''
  }, now), /不能晚于今天/);
  assert.throws(() => validateDraftConfig({
    start: '',
    end: '2026-10-25',
    capital: ''
  }, now), /不能晚于今天/);
  assert.throws(() => validateDraftConfig({ ...complete, start: '2026-02-30' }, now), /有效/);
  assert.throws(() => validateDraftConfig({ ...complete, capital: '-1' }, now), /初始资金/);
});

test('capital grouping preserves every typed digit, decimals, and intermediate edits', () => {
  for (const [raw, expected] of [
    ['', ''], ['1', '1'], ['999', '999'], ['1000', '1,000'],
    ['100000', '100,000'], ['1234567', '1,234,567'], ['1234567890', '1,234,567,890'],
    ['1000.', '1,000.'], ['1234567.0500', '1,234,567.0500'],
    ['0.000000001', '0.000000001'], ['001000.00', '001,000.00'],
    ['.5', '.5'], ['-', '-'], ['-1000.25', '-1,000.25'],
  ]) {
    assert.equal(formatCapital(raw), expected);
    assert.equal(unformatCapital(expected), raw);
  }
});

test('pasted grouped amounts and decimals yield the same numeric capital', () => {
  for (const [pasted, raw, amount] of [
    ['100,000', '100000', 100000],
    [' 1,234,567.0500 ', '1234567.0500', 1234567.05],
    ['0.50', '0.50', 0.5],
    ['100,000,000.01', '100000000.01', 100000000.01],
    ['10,000,000,000', '10000000000', 10000000000],
  ]) {
    assert.equal(unformatCapital(pasted), raw);
    assert.equal(parseCapital(pasted), amount);
    assert.equal(validateConfig({ ...complete, capital: pasted }, now), amount);
  }
});

test('capital limits remain enforced without turning bad text into another amount', () => {
  for (const value of [
    '',
    ' ',
    '.',
    '-',
    '0',
    '-0.50',
    'NaN',
    'Infinity',
    '10,000,000,000.01',
    '1e309',
    '1.2.3',
    'abc100',
    '0x10'
  ]) {
    assert.throws(() => parseCapital(value), /初始资金/);
  }
  assert.equal(formatCapital('abc100'), 'abc100');
});

test('only new drafts receive 100000; existing amounts and empty fields are not rewritten', () => {
  const existing = [
    {
      id: 'old',
      name: '已有金额',
      source: 'pass',
      folder: '',
      start: '2024-01-01',
      end: '',
      capital: '76543.2100',
      updated: 'old'
    },
    {
      id: 'blank',
      name: '已有空白',
      source: '',
      folder: '',
      start: '',
      end: '',
      capital: '',
      updated: 'old'
    },
  ];
  const map = new Map([['quantweb-strategy-drafts-v1', JSON.stringify(existing)]]);
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => map.get(key)
      ?? null,
    setItem: (key, value) => map.set(key, value)
  };
  try {
    assert.deepEqual(readDrafts(), existing);
    const created = newDraft('新策略');
    assert.equal(created.capital, '100000');
    assert.equal(created.start, '');
    assert.equal(created.end, '');
    assert.deepEqual(readDrafts().filter(draft => draft.id !== created.id), existing);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
