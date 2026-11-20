'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');

test('extracts a leading ISO-8601 timestamp', () => {
  const entry = parseLine('2024-03-05T10:15:00Z INFO service ready');
  assert.equal(entry.timestampMs, Date.parse('2024-03-05T10:15:00Z'));
  assert.equal(entry.severity, 'INFO');
});

test('returns null timestamp when none is present', () => {
  const entry = parseLine('service ready');
  assert.equal(entry.timestampMs, null);
});

test('returns null for blank lines', () => {
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('   '), null);
});

test('strips trailing carriage returns', () => {
  const entry = parseLine('plain message\r');
  assert.equal(entry.message, 'plain message');
});
