'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashHex, hashToInt, hashToUnit } = require('../src/hash');

test('hashHex is deterministic for the same input', () => {
  assert.equal(hashHex('hello'), hashHex('hello'));
});

test('hashHex differs for different input', () => {
  assert.notEqual(hashHex('hello'), hashHex('hello!'));
});

test('hashToInt produces a value within unsigned 32-bit range', () => {
  const value = hashToInt('some log line');
  assert.ok(Number.isInteger(value));
  assert.ok(value >= 0 && value <= 0xffffffff);
});

test('hashToUnit produces a value within [0, 1)', () => {
  const value = hashToUnit('some log line');
  assert.ok(value >= 0 && value < 1);
});
