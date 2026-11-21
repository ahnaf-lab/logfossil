'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { THEME_NAMES, applyTheme } = require('../src/themes');

test('the default theme is the identity transform', () => {
  const color = { h: 205, s: 60, l: 48 };
  const themed = applyTheme(color, 'default');
  assert.equal(themed.h, color.h);
  assert.equal(themed.s, color.s);
  assert.equal(themed.l, color.l);
});

test('omitting a theme name falls back to default', () => {
  const color = { h: 0, s: 70, l: 40 };
  assert.deepEqual(applyTheme(color), applyTheme(color, 'default'));
});

test('a non-default theme shifts the hue and keeps channels in range', () => {
  const color = { h: 350, s: 80, l: 60 };
  const themed = applyTheme(color, 'arctic');
  assert.notEqual(themed.h, color.h);
  assert.ok(themed.h >= 0 && themed.h < 360);
  assert.ok(themed.s >= 0 && themed.s <= 100);
  assert.ok(themed.l >= 0 && themed.l <= 100);
  assert.match(themed.hex, /^#[0-9a-f]{6}$/);
});

test('the mono theme strips saturation to produce a grayscale hex', () => {
  const themed = applyTheme({ h: 42, s: 90, l: 55 }, 'mono');
  assert.equal(themed.s, 0);
  const [r, g, b] = [themed.hex.slice(1, 3), themed.hex.slice(3, 5), themed.hex.slice(5, 7)];
  assert.equal(r, g);
  assert.equal(g, b);
});

test('rejects an unknown theme name', () => {
  assert.throws(() => applyTheme({ h: 0, s: 0, l: 0 }, 'nonexistent'), RangeError);
});

test('every built-in theme name round-trips through applyTheme', () => {
  for (const name of THEME_NAMES) {
    const themed = applyTheme({ h: 100, s: 50, l: 50, hex: '#808080' }, name);
    assert.match(themed.hex, /^#[0-9a-f]{6}$/);
  }
});
