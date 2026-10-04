import test from 'node:test';
import assert from 'node:assert/strict';
import { INVOICES, COST_CENTERS } from '../public/sandbox/data.js';

test('sandbox has the three expert invoices and the unseen EUR 7,200 case', () => {
  assert.equal(INVOICES.length, 4);
  assert.ok(INVOICES.some((i) => i.category === 'Equipment' && i.amount > 5000 && i.costCenter === '4711'));
  assert.ok(INVOICES.some((i) => i.country === 'CZ'));
  assert.ok(INVOICES.some((i) => /December/.test(i.supplier)));
  const unseen = INVOICES.find((i) => i.amount === 7200);
  assert.equal(unseen.asset, '');
  assert.ok(INVOICES.every((i) => COST_CENTERS.some((c) => c.code === i.costCenter)));
});
