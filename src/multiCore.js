'use strict';

const { renderCoreSampleSvg, escapeXml, DEFAULT_WIDTH, DEFAULT_SCALE, BACKGROUND } = require('./renderer');
const { THEME_NAMES } = require('./themes');

const DEFAULT_GAP = 24; // horizontal space between adjacent cores, in px
const LABEL_HEIGHT = 24; // vertical space reserved above each core for its name
const LABEL_COLOR = '#d8d2c8';
const DIVIDER_COLOR = '#262019';

const SVG_WRAPPER_PATTERN = /^<svg[^>]*>\n([\s\S]*)<\/svg>\n?$/;

/**
 * Strip the outer <svg> wrapper a single-core render produced, leaving just
 * its background rect and band markup so it can be re-embedded, translated,
 * into a shared multi-core canvas.
 */
function extractInnerMarkup(svg) {
  const match = svg.match(SVG_WRAPPER_PATTERN);
  if (!match) {
    throw new Error('logfossil: unexpected SVG shape while composing multi-core view');
  }
  return match[1];
}

function validateCores(cores) {
  if (!Array.isArray(cores) || cores.length === 0) {
    throw new TypeError('renderMultiCoreSvg requires a non-empty array of cores');
  }
  for (const core of cores) {
    if (!core || typeof core.name !== 'string' || core.name.length === 0) {
      throw new TypeError('each core requires a non-empty string "name"');
    }
    if (!Array.isArray(core.layers)) {
      throw new TypeError(`core "${core.name}" requires an array of "layers"`);
    }
  }
}

/**
 * Compose multiple named log sources ("cores") into one side-by-side
 * rock-strata image, each core keeping its own independent layer stack and
 * (optionally) its own color theme, so logs from different services can be
 * visually compared column by column instead of merged line-by-line. Each
 * core is rendered through the exact same deterministic single-core
 * pipeline (`renderCoreSampleSvg`) and then translated into place, so the
 * result stays a pure function of the input layers: the same cores always
 * produce the same composed SVG, byte for byte. When a core has no
 * explicit `theme`, one is assigned deterministically by its column index
 * (cycling through the built-in themes) purely so adjacent columns are
 * visually distinguishable at a glance.
 */
function renderMultiCoreSvg(cores, options = {}) {
  validateCores(cores);

  const width = options.width || DEFAULT_WIDTH;
  const scale = options.scale || DEFAULT_SCALE;
  const gap = options.gap != null ? options.gap : DEFAULT_GAP;

  const columns = cores.map((core, index) => {
    const theme = core.theme || THEME_NAMES[index % THEME_NAMES.length];
    const svg = renderCoreSampleSvg(core.layers, { width, scale, theme });
    const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
    const columnHeight = heightMatch ? Number(heightMatch[1]) : 0;
    return { name: core.name, inner: extractInnerMarkup(svg), height: columnHeight };
  });

  const totalWidth = columns.length * width + gap * (columns.length - 1);
  const tallestColumn = Math.max(0, ...columns.map((c) => c.height));
  const totalHeight = LABEL_HEIGHT + tallestColumn;

  let body = '';
  columns.forEach((column, index) => {
    const x = index * (width + gap);
    body += `<text x="${x}" y="${LABEL_HEIGHT - 8}" fill="${LABEL_COLOR}" font-family="monospace" font-size="12">${escapeXml(
      column.name
    )}</text>\n`;
    body += `<g transform="translate(${x},${LABEL_HEIGHT})">\n${column.inner}</g>\n`;
    if (index > 0) {
      const dividerX = x - gap / 2;
      body += `<line x1="${dividerX}" y1="0" x2="${dividerX}" y2="${totalHeight}" stroke="${DIVIDER_COLOR}" stroke-width="1"/>\n`;
    }
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
    `viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-label="logfossil multi-core sample">\n` +
    `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${BACKGROUND}"/>\n` +
    `${body}` +
    `</svg>\n`
  );
}

module.exports = { renderMultiCoreSvg, DEFAULT_GAP };
