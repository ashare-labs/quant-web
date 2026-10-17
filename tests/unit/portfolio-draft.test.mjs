import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDraft, restoreDraft, definitionAlgorithm, changesScope } from '../../src/features/portfolio/draft.ts';

test('saved draft preserves exact cash and selection; missing legacy fields use defaults', () => {
  const saved = { ...freshDraft(), cash: '1000.00000001', securities: ['600000.XSHG'], name: '保存草稿', retrospective: true };
  assert.deepEqual(restoreDraft(JSON.stringify(saved)), saved);
  const { volume, updatedAt, ...legacy } = saved;
  assert.deepEqual(restoreDraft(JSON.stringify(legacy)), saved);
});
test('invalid browser storage fails closed before restoring typed state', () => {
  for (const raw of ['{broken', 'null', '[]', JSON.stringify({ ...freshDraft(), cash: 1000 }), JSON.stringify({ ...freshDraft(), securities: [1] }), JSON.stringify({ ...freshDraft(), retrospective: 'true' })])
    assert.throws(() => restoreDraft(raw));
});
test('scope edits invalidate acknowledgements, while name/code/cash edits preserve the same selection', () => {
  for (const key of ['dataset', 'securities', 'start', 'end', 'mode', 'retrospective']) assert.equal(changesScope({ [key]: '' }), true);
  for (const key of ['name', 'code', 'cash', 'volume', 'version', 'ack']) assert.equal(changesScope({ [key]: '' }), false);
  assert.equal(definitionAlgorithm('{"algorithm":"equal-weight"}'), 'equal-weight');
  for (const raw of ['null', '{}', '{broken', '{"algorithm":42}']) assert.equal(definitionAlgorithm(raw), '');
});
