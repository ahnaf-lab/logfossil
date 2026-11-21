# logfossil

A daemon that tails your log files and deterministically turns each line into
a sediment layer, accumulating a scrollable rock-strata image you can read
like a geological core sample. Built for backend and SRE teams who want to
browse months of incidents as a single vertical history instead of grepping
timestamps.

This milestone adds **multi-core config**: named color themes that recolor
a rendered core without touching the underlying layers, and a side-by-side
composer that lines up several named log sources as separate columns in
one image, so logs from different services can be visually compared
instead of merged line-by-line. It builds on the strata engine
(severity/volume/gap → layer), the core renderer (layers → one scrollable
SVG "core sample" image), the offline viewer (the same image wrapped in a
self-contained HTML page with a hover tooltip and scrub bar), and the tail
daemon (`--follow` mode, which keeps a log file open, reads whatever lines
have been appended since the last check, and turns each one into a layer
as it arrives, persisting enough state to disk after every batch that
stopping and restarting resumes exactly where it left off instead of
re-reading the whole file). All of this is exercised through the same CLI,
which can also print one JSON layer per log line or, with `--svg`, the
composed SVG image alone.

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

### Offline viewer

Add `--html` to get a standalone, self-contained HTML page instead: the
same core-sample image, in a scrollable viewport, with a hover tooltip
showing each layer's severity, timestamp, gap, volume and message as the
mouse moves over it, plus a vertical scrub bar on the right that can be
dragged (or clicked) to jump to any point in the core instantly instead of
scrolling through everything in between:

```
node bin/logfossil.js --html path/to/app.log > core-sample.html
```

Open the resulting file directly from disk in any browser — it makes no
network requests and loads no external scripts, fonts or stylesheets, so it
keeps working offline and the whole file can be archived or shared as one
artifact.

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
open that file in a browser and watch the strata grow; `--html-out <path>`
does the same for the full offline viewer (hover tooltips and scrub bar
included), so reloading that page always shows the latest core:

```
node bin/logfossil.js --follow --svg-out core-sample.svg path/to/app.log
node bin/logfossil.js --follow --html-out core-sample.html path/to/app.log
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

### Color themes

Add `--theme <name>` to any `--svg`, `--html`, `--svg-out` or `--html-out`
render to recolor the bands without touching the underlying layers — the
same log still carves the exact same heights and gaps, only the palette
changes. Built-in themes: `default` (the original severity-hued palette,
and the only one applied when `--theme` is omitted), `arctic` (cooler,
brighter, less saturated), `ember` (warmer, more saturated) and `mono`
(fully desaturated, grayscale bands):

```
node bin/logfossil.js --svg --theme arctic path/to/app.log > core-sample.svg
```

### Side-by-side multi-core view

Use `--core <name>=<path>` (repeatable) instead of a single file argument
to compose several log files into one image, each as its own labeled
column with its own independent layer stack, so sources can be compared
side by side rather than interleaved:

```
node bin/logfossil.js --core web=web.log --core db=db.log > cores.svg
```

Append `:<theme>` to a core's value to pick that column's theme
explicitly (e.g. `--core db=db.log:mono`); columns left unspecified cycle
through the built-in themes by position so adjacent columns are visually
distinct by default. `--core` always prints a single composed SVG to
stdout; it does not support `--follow`.

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
 "color":{"h":30,"s":8,"l":38,"hex":"#696159"},"textureSeed":3037049883,
 "message":"2024-03-05T11:50:00Z ERROR connection refused"}
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
- **message** is the original line, truncated to 200 characters, kept
  alongside the derived fields so the offline viewer's hover tooltip can
  show the actual log text for a layer, not just its statistics.

The same input always produces the same sequence of layers: nothing in the
engine depends on wall-clock time or randomness.

Programmatic API (see `src/index.js`):

```js
const {
  parseLine,
  LayerEngine,
  renderCoreSampleSvg,
  renderViewerHtml,
  renderMultiCoreSvg,
  TailDaemon,
  THEME_NAMES,
} = require('logfossil');

const engine = new LayerEngine();
const layers = [
  '2024-03-05T10:00:00Z INFO service ready',
  '2024-03-05T10:00:01Z ERROR connection refused',
].map((line) => engine.process(parseLine(line)));

const svg = renderCoreSampleSvg(layers); // scrollable SVG core-sample string
const html = renderViewerHtml(layers); // standalone offline viewer page
const themed = renderCoreSampleSvg(layers, { theme: 'arctic' }); // same layers, recolored

// Compose two independently-processed sources into one side-by-side image:
const dbEngine = new LayerEngine();
const dbLayers = ['2024-03-05T10:00:00Z WARN db slow'].map((line) => dbEngine.process(parseLine(line)));
const multiSvg = renderMultiCoreSvg([
  { name: 'web', layers },
  { name: 'db', layers: dbLayers, theme: 'mono' },
]);

console.log(THEME_NAMES); // ['default', 'arctic', 'ember', 'mono']

// Tail a live file, resuming from ./app.log.state.json if it already exists:
const daemon = new TailDaemon('./app.log', './app.log.state.json');
daemon.on('layer', (layer) => console.log(layer));
daemon.start(); // reads existing content once, then polls for new lines
```

No external dependencies are used anywhere in this milestone: file
tailing is built on Node's own `fs` (reading, stat'ing, and atomically
persisting state via write-then-rename) and `string_decoder` (safely
decoding UTF-8 across chunk boundaries that may split a multi-byte
character) — both standard library. The offline viewer is a plain HTML
file with inline CSS and vanilla JavaScript (no bundler, no framework, no
`<script src>` or `fetch` of anything); the only runtime risk worth calling
out is that log lines are untrusted text, so the per-layer data embedded
for the hover tooltip is passed through `JSON.stringify` (with any
`</script` sequence inside a message broken up so it can't close the
surrounding tag early) and rendered back with `textContent`, never
`innerHTML`, so a crafted log line can't execute as markup or script in the
viewer.

Run the test suite with:

```
npm test
```

## Status

This project is built autonomously, milestone by milestone, and each change
is gated on its automated tests passing before it is accepted.
