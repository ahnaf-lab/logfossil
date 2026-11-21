'use strict';

/**
 * Mulberry32: a small, fast, deterministic PRNG. Given the same 32-bit seed
 * it always produces the same sequence, which is what lets the renderer turn
 * a layer's textureSeed into reproducible grain/speckle placement.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { mulberry32 };
