#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { parseLine } = require('../src/parseLine');
const { LayerEngine } = require('../src/layerEngine');
const { renderCoreSampleSvg } = require('../src/renderer');

function printUsage() {
  process.stdout.write(
    'Usage: logfossil [--svg] [file]\n' +
      '  Reads a log file (or stdin, if no file is given) one line at a time\n' +
      '  and prints one JSON "layer" per line to stdout: deterministic height,\n' +
      '  color and texture seed derived from that line\'s severity, volume and\n' +
      '  gap since the previous line.\n' +
      '  With --svg, buffers all layers instead and prints one scrollable SVG\n' +
      '  core-sample image composed from the whole log.\n'
  );
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return;
  }

  const svgMode = argv.includes('--svg');
  const filePath = argv.find((arg) => !arg.startsWith('--'));
  const input = filePath ? fs.createReadStream(path.resolve(filePath)) : process.stdin;

  input.on('error', (err) => {
    process.stderr.write(`logfossil: ${err.message}\n`);
    process.exitCode = 1;
  });

  const engine = new LayerEngine();
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const bufferedLayers = svgMode ? [] : null;

  rl.on('line', (line) => {
    const entry = parseLine(line);
    if (!entry) {
      return;
    }
    const layer = engine.process(entry);
    if (svgMode) {
      bufferedLayers.push(layer);
    } else {
      process.stdout.write(`${JSON.stringify(layer)}\n`);
    }
  });

  if (svgMode) {
    rl.on('close', () => {
      process.stdout.write(renderCoreSampleSvg(bufferedLayers));
    });
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main };
