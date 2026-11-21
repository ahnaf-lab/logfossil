'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { renderCoreSampleSvg } = require('../src/renderer');

function layersFor(lines) {
  const engine = new LayerEngine();
  return lines.map((line) => engine.process(parseLine(line)));
}

test('renders a valid SVG wrapper sized to the stacked layers', () => {
  const layers = layersFor([
    '2024-03-05T10:00:00Z INFO service ready',
    '2024-03-05T10:00:01Z ERROR connection refused',
  ]);
  const svg = renderCoreSampleSvg(layers, { width: 200, scale: 10 });

  const expectedHeight = layers.reduce((sum, l) => sum + Math.max(l.height * 10, 3), 0);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, new RegExp(`width="200" height="${expectedHeight}"`));
  assert.equal((svg.match(/<rect /g) || []).length, layers.length + 1); // + background rect
});

test('rendering the same layers twice produces byte-identical SVG', () => {
  const layers = layersFor([
    '2024-03-05T10:00:00.000Z INFO request a',
    '2024-03-05T10:00:00.200Z INFO request b',
    '2024-03-05T10:00:05Z WARN disk at 80%',
  ]);
  assert.equal(renderCoreSampleSvg(layers), renderCoreSampleSvg(layers));
});

test('unconformity layers render erosion hatching instead of speckle grain', () => {
  const layers = layersFor([
    '2024-03-05T10:00:00Z INFO before the gap',
    '2024-03-05T11:00:00Z ERROR after the gap',
  ]);
  const svg = renderCoreSampleSvg(layers);
  const unconformityBand = svg.split('<g ')[2];
  assert.ok(unconformityBand.includes('<line '));
  assert.ok(!unconformityBand.includes('<circle '));
});

test('an empty layer list still renders a well-formed, empty-height SVG', () => {
  const svg = renderCoreSampleSvg([]);
  assert.match(svg, /viewBox="0 0 320 0"/);
  assert.match(svg, /<\/svg>\s*$/);
});

test('rejects non-array input', () => {
  assert.throws(() => renderCoreSampleSvg('not an array'), TypeError);
});
