import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greetingForHour } from './greeting';

describe('greetingForHour', () => {
  it('returns morning, afternoon, and evening greetings', () => {
    assert.equal(greetingForHour(8), 'Good Morning');
    assert.equal(greetingForHour(15), 'Good Afternoon');
    assert.equal(greetingForHour(21), 'Good Evening');
  });
});
