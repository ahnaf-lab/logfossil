# logfossil

A daemon that tails your log files and deterministically turns each line into
a sediment layer, accumulating a scrollable rock-strata image you can read
like a geological core sample. Built for backend and SRE teams who want to
browse months of incidents as a single vertical history instead of grepping
timestamps.

This milestone adds the **tail daemon** on top of the strata engine and core
renderer: `--follow` mode keeps a log file open, reads whatever lines have
been appended since the last check, and turns each one into a layer as it
arrives. Progress (byte offset, file identity, engine internals, and the
accumulated layers themselves) is persisted to disk after every batch of new
lines, so stopping and restarting the daemon resumes exactly where it left
off instead of re-reading and re-carving the whole file. Earlier milestones
added the strata engine (severity/volume/gap → layer) and the core renderer
(layers → one scrollable SVG "core sample" image); both are exercised
through the same CLI, which can also print one JSON layer per log line or,
with `--svg`, the whole composed image in one shot.

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

### Tailing a live log file

Use `--follow` to run as a daemon against a live log file instead of a
one-shot read. It reads the whole file once to catch up, then keeps polling
for appended lines (every 500ms by default), printing one JSON layer per new
line as it arrives:

```
node bin/logfossil.js --follow path/to/app.log
```

Resumable state (byte offset, file identity, engine internals, and every
layer carved so far) is written to `<file>.logfossil-state.json` after each
batch of new lines, or to the path given with `--state`:

```
node bin/logfossil.js --follow --state /var/lib/logfossil/app.state.json path/to/app.log
```

Killing and restarting the daemon against the same state file resumes
exactly where it left off — it does not re-read or re-emit lines it already
processed. `--svg-out <path>` additionally rewrites a full SVG core-sample
snapshot of everything tailed so far on every batch of new lines, so you can
open that file in a browser and watch the strata grow:

```
node bin/logfossil.js --follow --svg-out core-sample.svg path/to/app.log
```

The daemon handles the common ways a log file changes under it: in-place
truncation (e.g. logrotate's `copytruncate`) and rotation (the path being
replaced with a new file) are both detected, and reading simply restarts
from byte 0 of the current file while the accumulated layers and engine
state carry over, so the core sample keeps the same continuous history
instead of restarting. One narrow edge case is not detected: if a truncate
and rewrite both happen between two polls *and* the new file happens to be
at least as large as the old read offset, that specific truncation is
missed (polling only observes the file's state at each check, not every
write in between) — in practice this requires the rewritten file to
coincidentally land on-or-past the exact byte offset already read, which is
rare for real log rotation.

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
const { parseLine, LayerEngine, renderCoreSampleSvg, TailDaemon } = require('logfossil');

const engine = new LayerEngine();
const layers = [
  '2024-03-05T10:00:00Z INFO service ready',
  '2024-03-05T10:00:01Z ERROR connection refused',
].map((line) => engine.process(parseLine(line)));

const svg = renderCoreSampleSvg(layers); // scrollable SVG core-sample string

// Tail a live file, resuming from ./app.log.state.json if it already exists:
const daemon = new TailDaemon('./app.log', './app.log.state.json');
daemon.on('layer', (layer) => console.log(layer));
daemon.start(); // reads existing content once, then polls for new lines
```

No external dependencies are used anywhere in this milestone: file
tailing is built on Node's own `fs` (reading, stat'ing, and atomically
persisting state via write-then-rename) and `string_decoder` (safely
decoding UTF-8 across chunk boundaries that may split a multi-byte
character) — both standard library.

Run the test suite with:

```
npm test
```

## Status

This project is built autonomously, milestone by milestone, and each change
is gated on its automated tests passing before it is accepted.
