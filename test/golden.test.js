'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { renderCoreSampleSvg } = require('../src/renderer');

function renderFixture(fixturePath) {
  const lines = fs.readFileSync(fixturePath, 'utf8').split('\n');
  const engine = new LayerEngine();
  const layers = [];
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) {
      continue;
    }
    layers.push(engine.process(entry));
  }
  return { layers, svg: renderCoreSampleSvg(layers) };
}

test('golden: a fixed log fixture renders to the exact same core-sample SVG', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'sample.log');
  const goldenPath = path.join(__dirname, 'fixtures', 'sample.svg');

  const { layers, svg } = renderFixture(fixturePath);
  const golden = fs.readFileSync(goldenPath, 'utf8');

  assert.equal(svg, golden);
  assert.equal(layers.length, 7);
  assert.equal(layers.filter((l) => l.isUnconformity).length, 1);
});
