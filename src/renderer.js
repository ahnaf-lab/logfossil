'use strict';

const { mulberry32 } = require('./rng');
const { applyTheme } = require('./themes');

const DEFAULT_WIDTH = 320;
const DEFAULT_SCALE = 6; // pixels per unit of layer.height
const MIN_LAYER_PX = 3; // every layer stays visible even at minimum height
const MAX_SPECKLES = 6;
const BACKGROUND = '#0b0a09';
const UNCONFORMITY_LINE_COLOR = '#1a1714';

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic "grain" for one layer: a handful of speckles scattered
 * inside its band, seeded by the layer's textureSeed so the same layer
 * always renders identical texture. Unconformity layers get flat erosion
 * hatching instead, since they represent a gap rather than deposited rock.
 */
function renderBand(layer, width, y, height, themeName) {
  const themedColor = applyTheme(layer.color, themeName);
  const fill = themedColor.hex;
  const title = escapeXml(
    `${layer.severity} gap=${layer.gapMs}ms vol=${layer.bucketVolume}${
      layer.isUnconformity ? ' unconformity' : ''
    }`
  );

  let marks = '';
  if (layer.isUnconformity) {
    const lineCount = 2;
    for (let i = 0; i < lineCount; i += 1) {
      const ly = round2(y + (height * (i + 1)) / (lineCount + 1));
      marks += `<line x1="0" y1="${ly}" x2="${width}" y2="${ly}" stroke="${UNCONFORMITY_LINE_COLOR}" stroke-width="0.6" stroke-opacity="0.5"/>\n`;
    }
  } else {
    const rng = mulberry32(layer.textureSeed);
    const speckleColor = themedColor.l < 50 ? '#ffffff' : '#000000';
    const speckleOpacity = themedColor.l < 50 ? 0.12 : 0.08;
    const speckleCount = Math.min(MAX_SPECKLES, Math.max(1, Math.round(height / 4)));
    for (let i = 0; i < speckleCount; i += 1) {
      const sx = round2(rng() * width);
      const sy = round2(y + rng() * height);
      const r = round2(0.6 + rng() * 1.2);
      marks += `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${speckleColor}" fill-opacity="${speckleOpacity}"/>\n`;
    }
  }

  return (
    `<g data-severity="${layer.severity}">\n` +
    `<title>${title}</title>\n` +
    `<rect x="0" y="${y}" width="${width}" height="${height}" fill="${fill}"/>\n` +
    `${marks}</g>\n`
  );
}

/**
 * Stack layers top-to-bottom into pixel bands (y + height per layer), the
 * same geometry renderCoreSampleSvg draws. Exposed separately so other
 * consumers (e.g. the offline HTML viewer) can line up hit-testing and
 * tooltip positions with the exact band boundaries the SVG was drawn with,
 * without re-deriving the stacking math themselves.
 */
function computeBands(layers, options = {}) {
  if (!Array.isArray(layers)) {
    throw new TypeError('computeBands requires an array of layers');
  }

  const scale = options.scale || DEFAULT_SCALE;

  let cumulativeY = 0;
  const bands = layers.map((layer) => {
    const pxHeight = Math.max(round2(layer.height * scale), MIN_LAYER_PX);
    const band = { layer, y: round2(cumulativeY), height: pxHeight };
    cumulativeY += pxHeight;
    return band;
  });

  return { bands, totalHeight: round2(cumulativeY) };
}

/**
 * Compose a list of layers (from LayerEngine.process) into a single tall
 * SVG "core sample": layers stack top-to-bottom in the order given (the
 * first layer processed is the top of the sample, so scrolling down reveals
 * later log history), each one a flat-colored band sized from its height.
 * Everything here is a pure function of the input layers, so the same log
 * always renders the exact same image.
 */
function renderCoreSampleSvg(layers, options = {}) {
  if (!Array.isArray(layers)) {
    throw new TypeError('renderCoreSampleSvg requires an array of layers');
  }

  const width = options.width || DEFAULT_WIDTH;
  const themeName = options.theme || 'default';
  const { bands, totalHeight } = computeBands(layers, options);

  const body = bands.map(({ layer, y, height }) => renderBand(layer, width, y, height, themeName)).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
    `viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="logfossil core sample">\n` +
    `<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="${BACKGROUND}"/>\n` +
    `${body}` +
    `</svg>\n`
  );
}

module.exports = {
  renderCoreSampleSvg,
  computeBands,
  escapeXml,
  DEFAULT_WIDTH,
  DEFAULT_SCALE,
  BACKGROUND,
};
