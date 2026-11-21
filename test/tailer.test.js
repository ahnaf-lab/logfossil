'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { TailDaemon } = require('../src/tailer');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'logfossil-tail-'));
}

test('initial pollOnce catches up on content already in the file', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(
    logPath,
    '2024-03-05T10:00:00Z INFO service ready\n2024-03-05T10:00:01Z WARN disk at 80%\n'
  );

  const daemon = new TailDaemon(logPath, statePath);
  const changed = daemon.pollOnce();

  assert.equal(changed, true);
  assert.equal(daemon.getLayers().length, 2);
  assert.equal(fs.existsSync(statePath), true);
  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(persisted.offset, fs.statSync(logPath).size);
});

test('a later pollOnce only processes newly appended lines, not the whole file again', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(logPath, '2024-03-05T10:00:00Z INFO service ready\n');

  const daemon = new TailDaemon(logPath, statePath);
  daemon.pollOnce();
  const firstLayer = daemon.getLayers()[0];

  fs.appendFileSync(logPath, '2024-03-05T10:00:05Z ERROR connection refused\n');
  daemon.pollOnce();

  const layers = daemon.getLayers();
  assert.equal(layers.length, 2);
  assert.deepEqual(layers[0], firstLayer);
  assert.equal(layers[1].severity, 'ERROR');
});

test('a partial line without a trailing newline is not processed until it is completed', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(logPath, '2024-03-05T10:00:00Z INFO unfinished lin');

  const daemon = new TailDaemon(logPath, statePath);
  daemon.pollOnce();
  assert.equal(daemon.getLayers().length, 0);

  fs.appendFileSync(logPath, 'e\n');
  daemon.pollOnce();
  assert.equal(daemon.getLayers().length, 1);
  assert.equal(daemon.getLayers()[0].severity, 'INFO');
});

test('a fresh TailDaemon pointed at the same statePath resumes without reprocessing', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(
    logPath,
    '2024-03-05T10:00:00.000Z INFO request a\n2024-03-05T10:00:00.200Z INFO request b\n'
  );

  const first = new TailDaemon(logPath, statePath);
  first.pollOnce();
  assert.equal(first.getLayers().length, 2);

  const resumed = new TailDaemon(logPath, statePath);
  assert.deepEqual(resumed.getLayers(), first.getLayers());

  // A burst continuing the same volume bucket should see the resumed volume
  // count, proving the engine's internal state (not just the layer list)
  // survived the restart.
  fs.appendFileSync(logPath, '2024-03-05T10:00:00.400Z INFO request c\n');
  resumed.pollOnce();
  const layers = resumed.getLayers();
  assert.equal(layers.length, 3);
  assert.equal(layers[2].bucketVolume, 3);
});

test('truncating the file in place is detected and read position resets without losing history', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(logPath, '2024-03-05T10:00:00Z INFO before truncate\n');

  const daemon = new TailDaemon(logPath, statePath);
  daemon.pollOnce();
  assert.equal(daemon.getLayers().length, 1);

  // Replacement content is deliberately shorter than the pre-truncate
  // offset, so the shrink is observable at the next poll - truncation that
  // happens to regrow past the old offset before the next poll is a known
  // limitation of size-based detection, documented in the README.
  fs.truncateSync(logPath, 0);
  fs.writeFileSync(logPath, '2024-03-05T10:05:00Z WARN x\n');
  daemon.pollOnce();

  const layers = daemon.getLayers();
  assert.equal(layers.length, 2);
  assert.equal(layers[0].severity, 'INFO');
  assert.equal(layers[1].severity, 'WARN');
  assert.equal(daemon.offset, fs.statSync(logPath).size);
});

test('stop() persists final state so it can be reloaded later', () => {
  const dir = makeTmpDir();
  const logPath = path.join(dir, 'app.log');
  const statePath = path.join(dir, 'app.log.state.json');
  fs.writeFileSync(logPath, '2024-03-05T10:00:00Z INFO service ready\n');

  const daemon = new TailDaemon(logPath, statePath);
  daemon.pollOnce();
  daemon.stop();

  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(persisted.layers.length, 1);
  assert.equal(persisted.filePath, path.resolve(logPath));
});
