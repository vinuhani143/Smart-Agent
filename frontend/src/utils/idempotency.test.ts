import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createIdempotencyGuard } from './idempotency';

describe('createIdempotencyGuard', () => {
  it('reuses a key for the same in-flight payload', () => {
    const guard = createIdempotencyGuard();
    const first = guard.keyFor({ name: 'Mix' });
    const second = guard.keyFor({ name: 'Mix' });
    assert.equal(first, second);
    const other = guard.keyFor({ name: 'Other' });
    assert.notEqual(other, first);
    guard.reset();
    const after = guard.keyFor({ name: 'Mix' });
    assert.notEqual(after, first);
  });
});
