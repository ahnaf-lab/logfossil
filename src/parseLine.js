'use strict';

const { classifySeverity } = require('./severity');

// Matches a leading ISO-8601-ish timestamp, e.g. "2024-03-05T10:15:00Z",
// "2024-03-05 10:15:00.123+05:30". Loose on purpose: many log formats vary
// slightly in separators and fractional-second digits.
const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;

/**
 * Parse a single raw log line into the fields the strata engine needs:
 * when it happened (if determinable), how severe it is, and the message
 * text used for deterministic color/texture jitter.
 *
 * Returns null for blank lines, since those carve no layer.
 */
function parseLine(rawLine) {
  const line = String(rawLine).replace(/\r$/, '');
  if (line.trim().length === 0) {
    return null;
  }

  const match = TIMESTAMP_PATTERN.exec(line);
  let timestampMs = null;
  if (match) {
    const parsed = Date.parse(match[1]);
    if (!Number.isNaN(parsed)) {
      timestampMs = parsed;
    }
  }

  const severity = classifySeverity(line);

  return {
    raw: line,
    message: line,
    timestampMs,
    severity: severity.name,
    severityWeight: severity.weight,
    severityHue: severity.hue,
  };
}

module.exports = { parseLine, TIMESTAMP_PATTERN };
