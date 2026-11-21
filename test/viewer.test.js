'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { computeBands } = require('../src/renderer');
const { renderViewerHtml } = require('../src/viewer');

function layersFor(lines) {
  const engine = new LayerEngine();
  return lines.map((line) => engine.process(parseLine(line)));
}

test('renders a standalone HTML document embedding the SVG, bands and controls', () => {
  const layers = layersFor([
    '2024-03-05T10:00:00Z INFO service ready',
    '2024-03-05T10:00:01Z ERROR connection refused',
  ]);
  const html = renderViewerHtml(layers);

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(html, /id="tooltip"/);
  assert.match(html, /id="scrubber-thumb"/);

  const embedded = html.match(/id="logfossil-bands">(.*?)<\/script>/s);
  assert.ok(embedded, 'embeds a bands JSON payload');
  const bands = JSON.parse(embedded[1]);
  assert.equal(bands.length, layers.length);
  assert.equal(bands[1].severity, 'ERROR');
});

test('embedded band boundaries match renderCoreSampleSvg geometry exactly', () => {
  const layers = layersFor([
    '2024-03-05T10:00:00Z INFO before the gap',
    '2024-03-05T11:00:00Z ERROR after the gap',
    '2024-03-05T11:00:01Z WARN disk at 80%',
  ]);
  const html = renderViewerHtml(layers);
  const embeddedBands = JSON.parse(html.match(/id="logfossil-bands">(.*?)<\/script>/s)[1]);
  const { bands: expectedBands } = computeBands(layers);

  assert.deepEqual(
    embeddedBands.map((b) => [b.y, b.height]),
    expectedBands.map((b) => [b.y, b.height])
  );
});

test('rendering the same layers twice produces byte-identical HTML', () => {
  const layers = layersFor(['2024-03-05T10:00:00Z INFO request a', '2024-03-05T10:00:05Z WARN slow response']);
  assert.equal(renderViewerHtml(layers), renderViewerHtml(layers));
});

test('a log line containing a script-closing sequence cannot break out of the embedded JSON', () => {
  const layers = layersFor(['2024-03-05T10:00:00Z INFO </script><script>alert(1)</script> payload']);
  const html = renderViewerHtml(layers);

  // The raw closing sequence must never appear verbatim inside the file;
  // it should only show up escaped, inside the JSON string literal.
  assert.ok(!html.includes('</script><script>alert(1)</script> payload'));
  assert.ok(html.includes('<\\/script>'));

  const embeddedBands = JSON.parse(html.match(/id="logfossil-bands">(.*?)<\/script>/s)[1]);
  assert.match(embeddedBands[0].message, /alert\(1\)/);
});

test('an empty layer list still renders a well-formed viewer with an empty-state note', () => {
  const html = renderViewerHtml([]);
  assert.match(html, /id="empty-note"/);
  assert.deepEqual(JSON.parse(html.match(/id="logfossil-bands">(.*?)<\/script>/s)[1]), []);
});

test('rejects non-array input', () => {
  assert.throws(() => renderViewerHtml('not an array'), TypeError);
});
