'use strict';

const { hashToInt, hashToUnit } = require('./hash');

const DEFAULT_BUCKET_MS = 1000; // window used to measure "volume" (burstiness)
const DEFAULT_UNCONFORMITY_GAP_MS = 60_000; // silence long enough to mark an erosion gap
const MAX_VOLUME_BONUS_LINES = 8; // extra lines in a bucket beyond this add no more thickness

const UNCONFORMITY_COLOR = { h: 30, s: 8, l: 38 }; // flat, weathered-rock gray-brown

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHex(channel) {
  return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
}

function hslToHex(h, s, l) {
  // Standard HSL -> RGB conversion (h in degrees, s/l as 0-100 percentages).
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return `#${toHex((r + m) * 255)}${toHex((g + m) * 255)}${toHex((b + m) * 255)}`;
}

/**
 * Deterministically derive a color for a layer from its severity hue plus a
 * small hash-driven jitter, so lines sharing a severity still look like
 * distinct, naturally varying sediment rather than flat identical blocks.
 */
function deriveColor(entry) {
  const jitterKey = `${entry.severity}:${entry.message}`;
  const satJitter = (hashToUnit(jitterKey, 0) - 0.5) * 20; // +/-10
  const lightJitter = (hashToUnit(jitterKey, 8) - 0.5) * 16; // +/-8

  const h = entry.severityHue;
  const s = clamp(55 + satJitter, 20, 85);
  const l = clamp(45 + lightJitter, 22, 72);

  return { h: Math.round(h), s: Math.round(s), l: Math.round(l), hex: hslToHex(h, s, l) };
}

/**
 * LayerEngine turns a stream of parsed log entries into deterministic
 * sediment layers. Each layer's height, color and texture seed depend only
 * on the entry itself and the bounded state already visible in prior
 * entries (last timestamp, current volume bucket) - never on wall-clock
 * time or randomness - so replaying the same log always reproduces the
 * same core sample.
 */
class LayerEngine {
  constructor(options = {}) {
    this.bucketMs = options.bucketMs || DEFAULT_BUCKET_MS;
    this.unconformityGapMs = options.unconformityGapMs || DEFAULT_UNCONFORMITY_GAP_MS;
    this.lastTimestampMs = null;
    this.currentBucketKey = null;
    this.currentBucketVolume = 0;
  }

  _trackVolume(timestampMs) {
    if (timestampMs == null) {
      this.currentBucketVolume += 1;
      return this.currentBucketVolume;
    }
    const bucketKey = Math.floor(timestampMs / this.bucketMs);
    if (bucketKey === this.currentBucketKey) {
      this.currentBucketVolume += 1;
    } else {
      this.currentBucketKey = bucketKey;
      this.currentBucketVolume = 1;
    }
    return this.currentBucketVolume;
  }

  /**
   * Process one parsed entry (see parseLine) and return its layer.
   */
  process(entry) {
    if (!entry) {
      throw new TypeError('LayerEngine.process requires a parsed entry');
    }

    const bucketVolume = this._trackVolume(entry.timestampMs);

    let gapMs = 0;
    if (entry.timestampMs != null && this.lastTimestampMs != null) {
      gapMs = Math.max(0, entry.timestampMs - this.lastTimestampMs);
    }
    if (entry.timestampMs != null) {
      this.lastTimestampMs = entry.timestampMs;
    }

    const isUnconformity = gapMs >= this.unconformityGapMs;

    const volumeBonus = Math.min(bucketVolume - 1, MAX_VOLUME_BONUS_LINES) * 0.8;
    const baseHeight = entry.severityWeight + volumeBonus;
    const height = isUnconformity ? 1.5 : Math.round(baseHeight * 100) / 100;

    const color = isUnconformity ? { ...UNCONFORMITY_COLOR, hex: hslToHex(30, 8, 38) } : deriveColor(entry);

    const textureSeed = hashToInt(`${entry.severity}:${entry.message}:${entry.timestampMs}`);

    return {
      severity: entry.severity,
      timestampMs: entry.timestampMs,
      gapMs,
      bucketVolume,
      isUnconformity,
      height,
      color,
      textureSeed,
    };
  }
}

module.exports = { LayerEngine, deriveColor, hslToHex };
