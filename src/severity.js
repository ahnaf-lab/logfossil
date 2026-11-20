'use strict';

// Ordered most to least severe. A line is scanned for the first of these
// keywords it contains, so "FATAL" wins over an incidental "info" elsewhere
// in the same message.
const SEVERITY_LEVELS = [
  { name: 'FATAL', pattern: /\bfatal\b/i, weight: 13, hue: 350 },
  { name: 'ERROR', pattern: /\berror\b/i, weight: 8, hue: 0 },
  { name: 'WARN', pattern: /\bwarn(?:ing)?\b/i, weight: 5, hue: 42 },
  { name: 'INFO', pattern: /\binfo\b/i, weight: 3, hue: 205 },
  { name: 'DEBUG', pattern: /\bdebug\b/i, weight: 2, hue: 150 },
  { name: 'TRACE', pattern: /\btrace\b/i, weight: 1, hue: 265 },
];

const DEFAULT_SEVERITY = { name: 'INFO', weight: 3, hue: 205 };

const SEVERITY_BY_NAME = new Map(
  SEVERITY_LEVELS.map((level) => [level.name, level])
);

/**
 * Classify a raw log line's severity. Falls back to INFO when no known
 * keyword is present, since that is the most common unmarked log level.
 */
function classifySeverity(text) {
  for (const level of SEVERITY_LEVELS) {
    if (level.pattern.test(text)) {
      return { name: level.name, weight: level.weight, hue: level.hue };
    }
  }
  return { ...DEFAULT_SEVERITY };
}

module.exports = { classifySeverity, SEVERITY_LEVELS, SEVERITY_BY_NAME, DEFAULT_SEVERITY };
