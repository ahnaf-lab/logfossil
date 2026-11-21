#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { renderCoreSampleSvg } = require('../src/renderer');
const { renderViewerHtml } = require('../src/viewer');
const { TailDaemon } = require('../src/tailer');

function printUsage() {
  process.stdout.write(
    'Usage: logfossil [--svg|--html] [file]\n' +
      '       logfossil --follow [--state <path>] [--svg-out <path>] [--html-out <path>] <file>\n' +
      '  Reads a log file (or stdin, if no file is given) one line at a time\n' +
      '  and prints one JSON "layer" per line to stdout: deterministic height,\n' +
      '  color and texture seed derived from that line\'s severity, volume and\n' +
      '  gap since the previous line.\n' +
      '  With --svg, buffers all layers instead and prints one scrollable SVG\n' +
      '  core-sample image composed from the whole log.\n' +
      '  With --html, buffers all layers instead and prints a standalone HTML\n' +
      '  offline viewer: the same core-sample image in a scrollable page with\n' +
      '  a hover tooltip per layer and a vertical scrub bar for jumping to\n' +
      '  any point in the core instantly.\n' +
      '  With --follow, runs as a daemon: reads the whole file once to catch\n' +
      '  up, then keeps polling for appended lines, emitting one JSON layer\n' +
      '  per new line and persisting resumable state to --state (default:\n' +
      '  "<file>.logfossil-state.json") so a restart picks up where it left\n' +
      '  off instead of re-reading the file. With --svg-out / --html-out,\n' +
      '  also rewrites the SVG image / HTML viewer of everything tailed so\n' +
      '  far on each batch of new lines.\n'
  );
}

function findOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || index === argv.length - 1) {
    return null;
  }
  return argv[index + 1];
}

const VALUE_FLAGS = new Set(['--state', '--svg-out', '--html-out']);

function runFollow(argv) {
  let filePath = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      i += 1; // skip this flag's value
    } else if (!arg.startsWith('--')) {
      filePath = arg;
    }
  }
  if (!filePath) {
    process.stderr.write('logfossil: --follow requires a log file path\n');
    process.exitCode = 1;
    return;
  }

  const resolvedFile = path.resolve(filePath);
  const statePath = findOption(argv, '--state') || `${resolvedFile}.logfossil-state.json`;
  const svgOutPath = findOption(argv, '--svg-out');
  const htmlOutPath = findOption(argv, '--html-out');

  const daemon = new TailDaemon(resolvedFile, statePath);
  daemon.on('layer', (layer) => {
    process.stdout.write(`${JSON.stringify(layer)}\n`);
  });
  daemon.on('error', (err) => {
    process.stderr.write(`logfossil: ${err.message}\n`);
  });

  const tick = () => {
    const changed = daemon.pollOnce();
    if (changed && svgOutPath) {
      fs.writeFileSync(svgOutPath, renderCoreSampleSvg(daemon.getLayers()));
    }
    if (changed && htmlOutPath) {
      fs.writeFileSync(htmlOutPath, renderViewerHtml(daemon.getLayers()));
    }
  };

  tick();
  const timer = setInterval(tick, daemon.pollMs);

  const shutdown = () => {
    clearInterval(timer);
    daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return;
  }

  if (argv.includes('--follow')) {
    runFollow(argv);
    return;
  }

  const svgMode = argv.includes('--svg');
  const htmlMode = argv.includes('--html');
  const bufferMode = svgMode || htmlMode;
  const filePath = argv.find((arg) => !arg.startsWith('--'));
  const input = filePath ? fs.createReadStream(path.resolve(filePath)) : process.stdin;

  input.on('error', (err) => {
    process.stderr.write(`logfossil: ${err.message}\n`);
    process.exitCode = 1;
  });

  const engine = new LayerEngine();
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const bufferedLayers = bufferMode ? [] : null;

  rl.on('line', (line) => {
    const entry = parseLine(line);
    if (!entry) {
      return;
    }
    const layer = engine.process(entry);
    if (bufferMode) {
      bufferedLayers.push(layer);
    } else {
      process.stdout.write(`${JSON.stringify(layer)}\n`);
    }
  });

  if (bufferMode) {
    rl.on('close', () => {
      process.stdout.write(htmlMode ? renderViewerHtml(bufferedLayers) : renderCoreSampleSvg(bufferedLayers));
    });
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main };
