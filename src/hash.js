'use strict';

const crypto = require('crypto');

/**
 * Deterministic hex digest of a string. Same input always yields the same
 * output, which is the property the whole strata engine depends on: a given
 * log line must always carve out the same layer.
 */
function hashHex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * Deterministic unsigned 32-bit integer derived from a hex digest window.
 * Used both as a texture seed and as raw material for jitter calculations.
 */
function hashToInt(input, offset = 0) {
  const hex = hashHex(input);
  const start = offset % (hex.length - 8);
  return parseInt(hex.slice(start, start + 8), 16);
}

/**
 * Deterministic float in [0, 1) derived from the same hash, so callers that
 * want jitter/noise don't each reimplement the normalization.
 */
function hashToUnit(input, offset = 0) {
  return hashToInt(input, offset) / 0xffffffff;
}

module.exports = { hashHex, hashToInt, hashToUnit };
