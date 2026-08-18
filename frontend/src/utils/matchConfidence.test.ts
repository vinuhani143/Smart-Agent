import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confidenceBand, confidenceLabel } from './matchConfidence';

describe('match confidence', () => {
  it('uses labels rather than color-only status', () => {
    assert.equal(confidenceLabel(confidenceBand('matched', 95)), 'High');
    assert.equal(confidenceLabel(confidenceBand('matched', 80)), 'Medium');
    assert.equal(confidenceLabel(confidenceBand('needs_review', 70)), 'Needs Review');
    assert.equal(confidenceLabel(confidenceBand('not_found', 0)), 'Not Found');
  });
});
