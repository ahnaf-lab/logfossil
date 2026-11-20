'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifySeverity } = require('../src/severity');

test('classifies ERROR lines', () => {
  assert.equal(classifySeverity('2024-01-01T00:00:00Z ERROR database down').name, 'ERROR');
});

test('classifies WARN and WARNING as the same level', () => {
  assert.equal(classifySeverity('a warn message').name, 'WARN');
  assert.equal(classifySeverity('a warning message').name, 'WARN');
});

test('defaults to INFO when no keyword is present', () => {
  assert.equal(classifySeverity('server started on port 3000').name, 'INFO');
});

test('FATAL outweighs an incidental mention of info', () => {
  const result = classifySeverity('FATAL: info subsystem crashed');
  assert.equal(result.name, 'FATAL');
  assert.ok(result.weight > classifySeverity('info subsystem ok').weight);
});
