'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { StringDecoder } = require('string_decoder');
const { parseLine } = require('./parseLine');
const { LayerEngine } = require('./layerEngine');
const { loadState, saveState } = require('./stateStore');

const DEFAULT_POLL_MS = 500;
const DEFAULT_READ_CHUNK = 64 * 1024;

/**
 * Tails a single log file: on each `pollOnce`, reads whatever bytes have
 * been appended since the last read, turns complete lines into strata
 * layers via LayerEngine, and persists enough state to disk (byte offset,
 * file identity, engine internals, the accumulated layers themselves) that
 * a new process can resume exactly where the last one left off instead of
 * re-reading and re-carving the whole file from scratch.
 */
class TailDaemon extends EventEmitter {
  constructor(filePath, statePath, options = {}) {
    super();
    this.filePath = path.resolve(filePath);
    this.statePath = statePath;
    this.pollMs = options.pollMs || DEFAULT_POLL_MS;
    this.engine = new LayerEngine(options);
    this.layers = [];
    this.offset = 0;
    this.inode = null;
    this.carry = '';
    this.decoder = new StringDecoder('utf8');
    this._timer = null;

    this._restore();
  }

  _restore() {
    const state = loadState(this.statePath);
    if (!state || state.filePath !== this.filePath) {
      return;
    }
    this.offset = typeof state.offset === 'number' ? state.offset : 0;
    this.inode = state.inode ?? null;
    this.carry = typeof state.carry === 'string' ? state.carry : '';
    this.layers = Array.isArray(state.layers) ? state.layers : [];
    this.engine.importState(state.engineState);
  }

  _persist() {
    saveState(this.statePath, {
      filePath: this.filePath,
      inode: this.inode,
      offset: this.offset,
      carry: this.carry,
      engineState: this.engine.exportState(),
      layers: this.layers,
    });
  }

  _consumeChunk(text) {
    const combined = this.carry + text;
    const lines = combined.split('\n');
    this.carry = lines.pop();
    for (const rawLine of lines) {
      const entry = parseLine(rawLine);
      if (!entry) {
        continue;
      }
      const layer = this.engine.process(entry);
      this.layers.push(layer);
      this.emit('layer', layer);
    }
  }

  _resetReadPosition() {
    this.offset = 0;
    this.carry = '';
    this.decoder = new StringDecoder('utf8');
  }

  /**
   * Run one read-and-catch-up cycle. Detects file rotation (a new inode at
   * the same path) and in-place truncation (the file shrinking below the
   * last known offset) and restarts reading from byte 0 in either case,
   * while keeping the engine and accumulated layers so the core sample
   * continues the same history rather than starting over. Returns true if
   * any new bytes were read. Exposed directly (not just via the internal
   * polling timer) so callers and tests can drive it deterministically.
   */
  pollOnce() {
    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }

    if (this.inode !== null && stat.ino !== this.inode) {
      this._resetReadPosition();
    } else if (stat.size < this.offset) {
      this._resetReadPosition();
    }
    this.inode = stat.ino;

    if (stat.size <= this.offset) {
      return false;
    }

    const end = stat.size;
    const buffer = Buffer.alloc(Math.min(end - this.offset, DEFAULT_READ_CHUNK));
    let position = this.offset;
    let bytesRead = 0;

    const fd = fs.openSync(this.filePath, 'r');
    try {
      while (position < end) {
        const want = Math.min(buffer.length, end - position);
        const read = fs.readSync(fd, buffer, 0, want, position);
        if (read <= 0) {
          break;
        }
        this._consumeChunk(this.decoder.write(buffer.subarray(0, read)));
        position += read;
        bytesRead += read;
      }
    } finally {
      fs.closeSync(fd);
    }

    this.offset += bytesRead;
    this._persist();
    return bytesRead > 0;
  }

  /**
   * Begin polling on an interval (an initial `pollOnce` runs immediately,
   * synchronously, so callers see any already-appended content right away).
   */
  start() {
    if (this._timer) {
      return;
    }
    this.pollOnce();
    this._timer = setInterval(() => {
      try {
        this.pollOnce();
      } catch (err) {
        this.emit('error', err);
      }
    }, this.pollMs);
    if (typeof this._timer.unref === 'function') {
      this._timer.unref();
    }
  }

  /** Stop polling and persist final state. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._persist();
  }

  getLayers() {
    return this.layers.slice();
  }
}

module.exports = { TailDaemon };
