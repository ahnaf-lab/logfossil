'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { renderMultiCoreSvg } = require('../src/multiCore');
const { renderCoreSampleSvg } = require('../src/renderer');

function layersFor(lines) {
  const engine = new LayerEngine();
  return lines.map((line) => engine.process(parseLine(line)));
}

test('composes multiple cores side by side into one wider SVG', () => {
  const web = layersFor(['2024-03-05T10:00:00Z INFO web ready', '2024-03-05T10:00:01Z ERROR web failed']);
  const db = layersFor(['2024-03-05T10:00:00Z WARN db slow']);

  const svg = renderMultiCoreSvg([
    { name: 'web', layers: web },
    { name: 'db', layers: db },
  ]);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /aria-label="logfossil multi-core sample"/);
  assert.match(svg, />web</);
  assert.match(svg, />db</);
  assert.equal((svg.match(/<g transform="translate\(/g) || []).length, 2);
});

test('each core keeps its own independent layer stack and color theme', () => {
  const lines = ['2024-03-05T10:00:00Z ERROR something broke'];
  const a = layersFor(lines);
  const b = layersFor(lines);

  const svg = renderMultiCoreSvg([
    { name: 'a', layers: a, theme: 'default' },
    { name: 'b', layers: b, theme: 'mono' },
  ]);

  // Same source line, different themes, so the two rendered fills differ.
  const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  assert.ok(fills.length >= 4); // background x2 + band x2 at minimum
  assert.notEqual(fills[1], fills[3]);
});

test('rendering the same cores twice produces byte-identical SVG', () => {
  const layers = layersFor(['2024-03-05T10:00:00Z INFO a', '2024-03-05T10:00:01Z WARN b']);
  const cores = [{ name: 'only', layers }];
  assert.equal(renderMultiCoreSvg(cores), renderMultiCoreSvg(cores));
});

test('a single core composes to the same band content as a plain render', () => {
  const layers = layersFor(['2024-03-05T10:00:00Z INFO solo line']);
  const solo = renderCoreSampleSvg(layers, { theme: 'default' });
  const composed = renderMultiCoreSvg([{ name: 'solo', layers, theme: 'default' }]);

  const soloInner = solo.match(/^<svg[^>]*>\n([\s\S]*)<\/svg>\n?$/)[1];
  assert.ok(composed.includes(soloInner));
});

test('rejects an empty core list', () => {
  assert.throws(() => renderMultiCoreSvg([]), TypeError);
});

test('rejects a core missing layers', () => {
  assert.throws(() => renderMultiCoreSvg([{ name: 'bad' }]), TypeError);
});
