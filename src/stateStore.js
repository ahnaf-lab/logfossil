'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load a previously saved tail-daemon state file. Returns null (rather than
 * throwing) when the file doesn't exist yet or is corrupt, so callers can
 * treat "no resumable state" the same way whether this is the first run or
 * a damaged state file - either way, starting fresh is the safe behavior.
 */
function loadState(statePath) {
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist state to disk atomically: write to a sibling temp file, then
 * rename it over the real path. A crash or kill mid-write can only ever
 * leave the previous valid state file in place, never a half-written one.
 */
function saveState(statePath, state) {
  const dir = path.dirname(statePath);
  const tmpPath = path.join(dir, `.${path.basename(statePath)}.tmp-${process.pid}`);
  fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

module.exports = { loadState, saveState };
