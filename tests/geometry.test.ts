import test from 'node:test';
import assert from 'node:assert/strict';
import { imageryLabel, validateGeometry } from '../src/lib/map.ts';

test('accepts bounded GeoJSON-compatible point geometry', () => {
  assert.equal(validateGeometry({ type: 'Point', coordinates: [-85.7, 44.5] }), true);
});

test('rejects malformed and oversized geometry', () => {
  assert.equal(validateGeometry({ type: 'Point', coordinates: ['not', 'coordinates'] }), false);
  assert.equal(validateGeometry({ type: 'Point', coordinates: [0, 0] }, 10), false);
});

test('labels missing imagery without implying a provider', () => {
  assert.equal(imageryLabel(null), 'Imagery unavailable — course diagram shown');
  assert.match(imageryLabel({ providerName: 'Operator upload', captureTimestamp: '2026-08-19T00:00:00Z', processingStatus: 'available' }), /imagery captured on 2026-08-19/);
});
