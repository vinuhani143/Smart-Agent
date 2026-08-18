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

    const [first, second] = await Promise.all([
      oncePerKey('create:playlist', operation),
      oncePerKey('create:playlist', operation),
    ]);
    assert.equal(first, 1);
    assert.equal(second, 1);
    assert.equal(runs, 1);
  });

  it('reuses a successful result during the settle window', async () => {
    let runs = 0;
    const first = await oncePerKey('create:playlist:settle', async () => {
      runs += 1;
      return 'one';
    }, { settleMs: 200 });
    const second = await oncePerKey('create:playlist:settle', async () => {
      runs += 1;
      return 'two';
    }, { settleMs: 200 });
    assert.equal(first, 'one');
    assert.equal(second, 'one');
    assert.equal(runs, 1);
  });

  it('allows a new run after the settle window', async () => {
    await oncePerKey('create:playlist:again', async () => 'one', { settleMs: 0 });
    const second = await oncePerKey('create:playlist:again', async () => 'two', { settleMs: 0 });
    assert.equal(second, 'two');
  });

  it('does not cache failures', async () => {
    await assert.rejects(() =>
      oncePerKey('create:playlist:fail', async () => {
        throw new Error('boom');
      }),
    );
    const recovered = await oncePerKey('create:playlist:fail', async () => 'ok');
    assert.equal(recovered, 'ok');
  });
});
