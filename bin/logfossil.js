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
const { THEME_NAMES } = require('../src/themes');
const { renderMultiCoreSvg } = require('../src/multiCore');

function printUsage() {
  process.stdout.write(
    'Usage: logfossil [--svg|--html] [--theme <name>] [file]\n' +
      '       logfossil --follow [--state <path>] [--svg-out <path>] [--html-out <path>] [--theme <name>] <file>\n' +
      '       logfossil --core <name>=<path>[:<theme>] [--core <name>=<path>[:<theme>] ...]\n' +
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
      '  --theme <name> recolors the rendered core (--svg/--html/--svg-out/\n' +
      `  --html-out). Known themes: ${THEME_NAMES.join(', ')}.\n` +
      '  With --follow, runs as a daemon: reads the whole file once to catch\n' +
      '  up, then keeps polling for appended lines, emitting one JSON layer\n' +
      '  per new line and persisting resumable state to --state (default:\n' +
      '  "<file>.logfossil-state.json") so a restart picks up where it left\n' +
      '  off instead of re-reading the file. With --svg-out / --html-out,\n' +
      '  also rewrites the SVG image / HTML viewer of everything tailed so\n' +
      '  far on each batch of new lines.\n' +
      '  --core reads each named file in full and composes all of them into\n' +
      '  one side-by-side multi-core SVG printed to stdout, so logs from\n' +
      '  different sources can be compared column by column. Repeat --core\n' +
      '  for each source; an optional ":<theme>" suffix per core picks its\n' +
      '  color theme (default: a different built-in theme per column).\n'
  );
}

function findOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || index === argv.length - 1) {
    return null;
  }
  return argv[index + 1];
}

/**
 * Find the bare positional file path argument, skipping both flags and the
 * values that follow value-taking flags (e.g. the "arctic" in
 * "--theme arctic") so they are never mistaken for the file path.
 */
function findFilePath(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      i += 1;
    } else if (!arg.startsWith('--')) {
      return arg;
    }
  }
  return null;
}

const VALUE_FLAGS = new Set(['--state', '--svg-out', '--html-out', '--theme', '--core']);

/**
 * Parse one "--core" value: "name=path" or "name=path:theme". The theme
 * suffix is only split off when it matches a known theme name, so a path
 * containing a literal colon (e.g. a Windows drive letter) is left intact.
 */
function parseCoreSpec(spec) {
  const eq = spec.indexOf('=');
  if (eq <= 0) {
    throw new Error(`invalid --core value "${spec}" (expected name=path or name=path:theme)`);
  }
  const name = spec.slice(0, eq);
  let filePath = spec.slice(eq + 1);
  let theme;
  const lastColon = filePath.lastIndexOf(':');
  if (lastColon > 0 && THEME_NAMES.includes(filePath.slice(lastColon + 1))) {
    theme = filePath.slice(lastColon + 1);
    filePath = filePath.slice(0, lastColon);
  }
  if (!filePath) {
    throw new Error(`invalid --core value "${spec}": path cannot be empty`);
  }
  return { name, filePath, theme };
}

function readLayersFromFile(filePath) {
  const lines = fs.readFileSync(path.resolve(filePath), 'utf8').split('\n');
  const engine = new LayerEngine();
  const layers = [];
  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) {
      layers.push(engine.process(entry));
    }
  }
  return layers;
}

function runMultiCore(argv) {
  const specs = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--core' && i + 1 < argv.length) {
      specs.push(argv[i + 1]);
      i += 1;
    }
  }

  try {
    const cores = specs.map((spec) => {
      const { name, filePath, theme } = parseCoreSpec(spec);
      return { name, theme, layers: readLayersFromFile(filePath) };
    });
    process.stdout.write(renderMultiCoreSvg(cores));
  } catch (err) {
    process.stderr.write(`logfossil: ${err.message}\n`);
    process.exitCode = 1;
  }
}

function runFollow(argv) {
  const filePath = findFilePath(argv);
  if (!filePath) {
    process.stderr.write('logfossil: --follow requires a log file path\n');
    process.exitCode = 1;
    return;
  }

  const resolvedFile = path.resolve(filePath);
  const statePath = findOption(argv, '--state') || `${resolvedFile}.logfossil-state.json`;
  const svgOutPath = findOption(argv, '--svg-out');
  const htmlOutPath = findOption(argv, '--html-out');
  const theme = findOption(argv, '--theme');
  if (theme && !THEME_NAMES.includes(theme)) {
    process.stderr.write(`logfossil: unknown theme "${theme}" (known: ${THEME_NAMES.join(', ')})\n`);
    process.exitCode = 1;
    return;
  }
  const renderOptions = theme ? { theme } : {};

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
      fs.writeFileSync(svgOutPath, renderCoreSampleSvg(daemon.getLayers(), renderOptions));
    }
    if (changed && htmlOutPath) {
      fs.writeFileSync(htmlOutPath, renderViewerHtml(daemon.getLayers(), renderOptions));
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

  if (argv.includes('--core')) {
    runMultiCore(argv);
    return;
  }

  const theme = findOption(argv, '--theme');
  if (theme && !THEME_NAMES.includes(theme)) {
    process.stderr.write(`logfossil: unknown theme "${theme}" (known: ${THEME_NAMES.join(', ')})\n`);
    process.exitCode = 1;
    return;
  }
  const renderOptions = theme ? { theme } : {};

  const svgMode = argv.includes('--svg');
  const htmlMode = argv.includes('--html');
  const bufferMode = svgMode || htmlMode;
  const filePath = findFilePath(argv);
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
      process.stdout.write(
        htmlMode
          ? renderViewerHtml(bufferedLayers, renderOptions)
          : renderCoreSampleSvg(bufferedLayers, renderOptions)
      );
    });
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main };
