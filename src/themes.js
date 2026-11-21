'use strict';

const { hslToHex } = require('./layerEngine');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapHue(h) {
  return ((h % 360) + 360) % 360;
}

/**
 * Named color themes. Each is a deterministic transform applied to a
 * layer's derived {h,s,l} at render time (never during layer processing),
 * so the same log always carves the same layers regardless of which theme
 * is used to paint them, and a single core sample can be re-rendered in a
 * different theme without re-reading the source log. "default" is the
 * identity transform, so rendering with it is byte-identical to omitting
 * a theme altogether.
 */
const THEMES = {
  default: { hueShift: 0, satScale: 1, satOffset: 0, lightScale: 1, lightOffset: 0 },
  arctic: { hueShift: 150, satScale: 0.85, satOffset: -10, lightScale: 1.05, lightOffset: 4 },
  ember: { hueShift: -30, satScale: 1.15, satOffset: 10, lightScale: 0.95, lightOffset: -2 },
  mono: { hueShift: 0, satScale: 0, satOffset: 0, lightScale: 1, lightOffset: 0 },
};

const THEME_NAMES = Object.keys(THEMES);

function isIdentity(theme) {
  return (
    theme.hueShift === 0 && theme.satScale === 1 && theme.satOffset === 0 && theme.lightScale === 1 && theme.lightOffset === 0
  );
}

/**
 * Apply a named theme to a derived color, returning a new {h,s,l,hex}
 * without mutating the input. Hue wraps modulo 360; saturation and
 * lightness clamp to the valid 0-100 range after the theme's scale/offset.
 * An identity theme (just "default") passes the color through completely
 * unchanged rather than recomputing hex from h/s/l, since those fields are
 * rounded for display while the original hex may have been derived from
 * unrounded values - recomputing would silently drift the color.
 */
function applyTheme(color, themeName = 'default') {
  const theme = THEMES[themeName];
  if (!theme) {
    throw new RangeError(`logfossil: unknown theme "${themeName}" (known: ${THEME_NAMES.join(', ')})`);
  }

  if (isIdentity(theme)) {
    return { h: color.h, s: color.s, l: color.l, hex: color.hex };
  }

  const h = wrapHue(color.h + theme.hueShift);
  const s = clamp(color.s * theme.satScale + theme.satOffset, 0, 100);
  const l = clamp(color.l * theme.lightScale + theme.lightOffset, 0, 100);

  return { h: Math.round(h), s: Math.round(s), l: Math.round(l), hex: hslToHex(h, s, l) };
}

module.exports = { THEMES, THEME_NAMES, applyTheme };
