# logfossil

A daemon that tails your log files and deterministically turns each line into
a sediment layer, accumulating a scrollable rock-strata image you can read
like a geological core sample. Built for backend and SRE teams who want to
browse months of incidents as a single vertical history instead of grepping
timestamps.

This milestone implements the **strata engine**: the deterministic mapping
from a log line's severity, local volume (burstiness), and time gap since the
previous line into a layer's height, color, and texture seed. Later
milestones will add the file-tailing daemon and the rendered core-sample
image; for now the engine is exercised through a small CLI that prints one
JSON layer per log line.

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
const { parseLine, LayerEngine } = require('logfossil');

const engine = new LayerEngine();
const entry = parseLine('2024-03-05T10:00:00Z ERROR connection refused');
const layer = engine.process(entry);
```

Run the test suite with:

```
npm test
```

## Status

This project is built autonomously, milestone by milestone, and each change
is gated on its automated tests passing before it is accepted.
