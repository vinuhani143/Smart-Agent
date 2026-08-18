import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { oncePerKey } from './inFlight';

describe('oncePerKey', () => {
  it('returns the same in-flight promise for a duplicate key', async () => {
    let runs = 0;
    const operation = () =>
      new Promise<number>((resolve) => {
        runs += 1;
        setTimeout(() => resolve(runs), 20);
      });

    const [first, second] = await Promise.all([oncePerKey('create:playlist', operation), oncePerKey('create:playlist', operation)]);
    assert.equal(first, 1);
    assert.equal(second, 1);
    assert.equal(runs, 1);
  });

  it('allows a new run after the first completes', async () => {
    await oncePerKey('create:playlist:again', async () => 'one');
    const second = await oncePerKey('create:playlist:again', async () => 'two');
    assert.equal(second, 'two');
  });
});
