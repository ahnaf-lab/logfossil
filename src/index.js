'use strict';

const { parseLine, TIMESTAMP_PATTERN } = require('./parseLine');
const { classifySeverity, SEVERITY_LEVELS } = require('./severity');
const { LayerEngine, deriveColor, hslToHex } = require('./layerEngine');
const { hashHex, hashToInt, hashToUnit } = require('./hash');
const { renderCoreSampleSvg } = require('./renderer');
const { TailDaemon } = require('./tailer');
const { loadState, saveState } = require('./stateStore');

module.exports = {
  parseLine,
  TIMESTAMP_PATTERN,
  classifySeverity,
  SEVERITY_LEVELS,
  LayerEngine,
  deriveColor,
  hslToHex,
  hashHex,
  hashToInt,
  hashToUnit,
  renderCoreSampleSvg,
  TailDaemon,
  loadState,
  saveState,
};
