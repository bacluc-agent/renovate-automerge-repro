const assert = require('node:assert/strict');
const test = require('node:test');
const ms = require('ms');

test('formats milliseconds', () => {
  assert.equal(ms(1000), '1s');
});
