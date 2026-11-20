'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');

test('same entry sequence always produces the same layers', () => {
  const lines = [
    '2024-03-05T10:00:00Z INFO service ready',
    '2024-03-05T10:00:01Z WARN disk at 80%',
    '2024-03-05T10:02:30Z ERROR connection refused',
  ];

  const runOnce = () => {
    const engine = new LayerEngine();
    return lines.map((line) => engine.process(parseLine(line)));
  };

  assert.deepEqual(runOnce(), runOnce());
});

test('higher severity produces a taller layer than lower severity, all else equal', () => {
  const engine = new LayerEngine();
  const info = engine.process(parseLine('2024-03-05T10:00:00Z INFO steady state'));
  const error = engine.process(parseLine('2024-03-05T10:00:05Z ERROR steady state'));
  assert.ok(error.height > info.height);
});

test('a burst of lines in the same window thickens the layer (volume)', () => {
  const engine = new LayerEngine();
  const first = engine.process(parseLine('2024-03-05T10:00:00.000Z INFO request a'));
  const second = engine.process(parseLine('2024-03-05T10:00:00.200Z INFO request b'));
  assert.equal(second.bucketVolume, 2);
  assert.ok(second.height > first.height);
});

test('a large time gap is marked as an unconformity with a thin, muted layer', () => {
  const engine = new LayerEngine({ unconformityGapMs: 60_000 });
  engine.process(parseLine('2024-03-05T10:00:00Z INFO before the gap'));
  const after = engine.process(parseLine('2024-03-05T11:00:00Z ERROR after the gap'));
  assert.equal(after.isUnconformity, true);
  assert.equal(after.height, 1.5);
  assert.match(after.color.hex, /^#[0-9a-f]{6}$/);
  assert.ok(after.gapMs >= 60_000);
});

test('texture seed is a deterministic unsigned 32-bit integer', () => {
  const engine = new LayerEngine();
  const layer = engine.process(parseLine('2024-03-05T10:00:00Z DEBUG seeded'));
  assert.ok(Number.isInteger(layer.textureSeed));
  assert.ok(layer.textureSeed >= 0 && layer.textureSeed <= 0xffffffff);
});

test('color is a valid #rrggbb hex string', () => {
  const engine = new LayerEngine();
  const layer = engine.process(parseLine('2024-03-05T10:00:00Z WARN colorful'));
  assert.match(layer.color.hex, /^#[0-9a-f]{6}$/);
});

test('different messages at the same severity still get distinct colors (natural variation)', () => {
  const engine = new LayerEngine();
  const a = engine.process(parseLine('2024-03-05T10:00:00Z INFO alpha message'));
  const b = engine.process(parseLine('2024-03-05T10:00:05Z INFO bravo message entirely different'));
  assert.notEqual(a.color.hex, b.color.hex);
});
