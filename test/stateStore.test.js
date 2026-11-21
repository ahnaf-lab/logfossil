'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadState, saveState } = require('../src/stateStore');

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logfossil-state-'));
  return path.join(dir, 'state.json');
}

test('loadState returns null when no state file exists yet', () => {
  const statePath = tmpStatePath();
  assert.equal(loadState(statePath), null);
});

test('loadState returns null for a corrupt state file instead of throwing', () => {
  const statePath = tmpStatePath();
  fs.writeFileSync(statePath, '{not valid json', 'utf8');
  assert.equal(loadState(statePath), null);
});

test('saveState then loadState round-trips the exact object', () => {
  const statePath = tmpStatePath();
  const state = { filePath: '/var/log/app.log', offset: 42, inode: 7, layers: [{ a: 1 }] };
  saveState(statePath, state);
  assert.deepEqual(loadState(statePath), state);
});

test('saveState writes atomically, leaving no temp file behind', () => {
  const statePath = tmpStatePath();
  saveState(statePath, { ok: true });
  const dirEntries = fs.readdirSync(path.dirname(statePath));
  assert.deepEqual(dirEntries, [path.basename(statePath)]);
});
