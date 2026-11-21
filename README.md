# logfossil

A daemon that tails your log files and deterministically turns each line into
a sediment layer, accumulating a scrollable rock-strata image you can read
like a geological core sample. Built for backend and SRE teams who want to
browse months of incidents as a single vertical history instead of grepping
timestamps.

This milestone adds the **core renderer** on top of the strata engine: the
deterministic mapping from a log line's severity, local volume (burstiness),
and time gap since the previous line into a layer's height, color, and
texture seed, composed into a single scrollable SVG "core sample" image.
Later milestones will add the file-tailing daemon that keeps this image
growing live; for now the renderer is exercised through a small CLI that
either prints one JSON layer per log line or, with `--svg`, the whole
composed image.

## Install

Requires Node.js 18 or later. No external dependencies.

```
npm install
```

## Usage

Run the CLI against a log file, or pipe lines into it over stdin:

```
node bin/logfossil.js path/to/app.log
tail -f app.log | node bin/logfossil.js
```

Add `--svg` to get a single scrollable SVG core-sample image composed from
the whole log instead of the per-line JSON stream:

```
node bin/logfossil.js --svg path/to/app.log > core-sample.svg
```

The image stacks one flat-colored band per layer top to bottom, in the order
the lines occurred (so scrolling down shows more recent history), each band
sized from its deterministic height. Bands get a scattering of subtle
speckles seeded from the layer's `textureSeed`, so the grain pattern is
reproducible rather than flat solid color. Unconformity layers (long gaps in
logging) render thin with erosion-line hatching instead of speckles, so they
read visually as a gap rather than deposited rock. Because every input to
the renderer is deterministic, the same log file always produces the exact
same SVG, byte for byte — this is verified with a golden test against a
fixed fixture (`test/fixtures/sample.log` / `test/fixtures/sample.svg`).

Each line of output is a JSON object describing one layer:

```
{"severity":"ERROR","timestampMs":1709638200000,"gapMs":5399000,
 "bucketVolume":1,"isUnconformity":true,"height":1.5,
 "color":{"h":30,"s":8,"l":38,"hex":"#696159"},"textureSeed":3037049883}
```

- **height** grows with severity (TRACE through FATAL) and with how many
  lines landed in the same short time window (volume/burstiness).
- **color** is derived from severity (hue) plus a small deterministic jitter
  from the message text, so same-severity lines still look like natural
  variation rather than flat identical blocks.
- **isUnconformity** marks a gap in logging long enough to represent an
  erosion surface (default: 60 seconds of silence); these layers are thin
  and rendered in a flat weathered-rock color regardless of severity.
- **textureSeed** is a deterministic 32-bit integer for seeding the rock
  texture/noise pattern in the eventual rendered image.

The same input always produces the same sequence of layers: nothing in the
engine depends on wall-clock time or randomness.

Programmatic API (see `src/index.js`):

```js
const { parseLine, LayerEngine, renderCoreSampleSvg } = require('logfossil');

const engine = new LayerEngine();
const layers = [
  '2024-03-05T10:00:00Z INFO service ready',
  '2024-03-05T10:00:01Z ERROR connection refused',
].map((line) => engine.process(parseLine(line)));

const svg = renderCoreSampleSvg(layers); // scrollable SVG core-sample string
```

Run the test suite with:

```
npm test
```

## Status

This project is built autonomously, milestone by milestone, and each change
is gated on its automated tests passing before it is accepted.
