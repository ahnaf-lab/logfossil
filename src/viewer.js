'use strict';

const { renderCoreSampleSvg, computeBands, DEFAULT_WIDTH } = require('./renderer');

/**
 * Serialize a value as JSON for embedding inside an inline <script> tag.
 * Log-derived strings (a layer's message) are untrusted input, so any
 * "</script" substring must be broken up — otherwise it would close the
 * surrounding tag early and let raw log content be parsed as markup,
 * regardless of the script's declared type.
 */
function toInlineJson(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

/**
 * Build the standalone offline viewer: a single HTML file with no external
 * requests, no dependencies, and no network calls, containing:
 *   - the same deterministic SVG core sample `renderCoreSampleSvg` produces,
 *     in a scrollable viewport;
 *   - a per-layer metadata table (band boundaries, severity, timestamp,
 *     gap, volume, message) used to drive a hover tooltip as the mouse
 *     moves over the core;
 *   - a vertical scrub bar whose thumb is dragged (or clicked) to jump to
 *     any point in the core instantly, for scanning months of history
 *     without incrementally scrolling through all of it.
 * Purely a function of the input layers: the same layers always produce
 * the same HTML file, byte for byte.
 */
function renderViewerHtml(layers, options = {}) {
  if (!Array.isArray(layers)) {
    throw new TypeError('renderViewerHtml requires an array of layers');
  }

  const width = options.width || DEFAULT_WIDTH;
  const svg = renderCoreSampleSvg(layers, options);
  const { bands, totalHeight } = computeBands(layers, options);

  const bandMeta = bands.map(({ layer, y, height }) => ({
    y,
    height,
    severity: layer.severity,
    timestampMs: layer.timestampMs,
    gapMs: layer.gapMs,
    bucketVolume: layer.bucketVolume,
    isUnconformity: layer.isUnconformity,
    message: layer.message,
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>logfossil core sample</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    background: #0b0a09;
    color: #d8d2c8;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #layout { display: flex; height: 100vh; }
  #core-viewport {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
  }
  #core-viewport svg { display: block; }
  #scrubber {
    flex: 0 0 18px;
    position: relative;
    background: #15120f;
    border-left: 1px solid #262019;
    cursor: pointer;
  }
  #scrubber-thumb {
    position: absolute;
    left: 2px;
    right: 2px;
    background: #6b5c45;
    border-radius: 2px;
    cursor: grab;
  }
  #scrubber-thumb:active { cursor: grabbing; background: #8a7555; }
  #tooltip {
    position: fixed;
    display: none;
    max-width: 320px;
    padding: 6px 9px;
    background: #1c1812;
    border: 1px solid #3a3022;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.5;
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-word;
    z-index: 10;
  }
  #tooltip .severity { font-weight: 600; }
  #empty-note { padding: 16px; color: #887d68; }
</style>
</head>
<body>
<div id="layout">
  <div id="core-viewport">${svg}</div>
  <div id="scrubber"><div id="scrubber-thumb"></div></div>
</div>
<div id="tooltip"></div>
${bands.length === 0 ? '<p id="empty-note">No layers to display.</p>' : ''}
<script type="application/json" id="logfossil-bands">${toInlineJson(bandMeta)}</script>
<script type="application/json" id="logfossil-meta">${toInlineJson({ width, totalHeight })}</script>
<script>
(function () {
  'use strict';

  var bands = JSON.parse(document.getElementById('logfossil-bands').textContent);
  var meta = JSON.parse(document.getElementById('logfossil-meta').textContent);
  var viewport = document.getElementById('core-viewport');
  var tooltip = document.getElementById('tooltip');
  var scrubber = document.getElementById('scrubber');
  var thumb = document.getElementById('scrubber-thumb');

  // Bands are already in top-to-bottom order with no gaps between them, so
  // a binary search on the sorted y boundaries finds the hovered layer.
  function bandAt(y) {
    var lo = 0;
    var hi = bands.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var band = bands[mid];
      if (y < band.y) {
        hi = mid - 1;
      } else if (y >= band.y + band.height) {
        lo = mid + 1;
      } else {
        return band;
      }
    }
    return null;
  }

  function formatTimestamp(ms) {
    return typeof ms === 'number' ? new Date(ms).toISOString() : 'unknown';
  }

  function showTooltip(clientX, clientY, band) {
    tooltip.textContent = '';
    var head = document.createElement('div');
    head.className = 'severity';
    head.textContent = band.severity + (band.isUnconformity ? ' (unconformity)' : '');
    var body = document.createElement('div');
    body.textContent =
      'time: ' + formatTimestamp(band.timestampMs) + '\\n' +
      'gap: ' + band.gapMs + 'ms\\n' +
      'volume: ' + band.bucketVolume + '\\n' +
      band.message;
    tooltip.appendChild(head);
    tooltip.appendChild(body);
    tooltip.style.display = 'block';
    var offsetX = 16;
    var offsetY = 8;
    var left = clientX + offsetX;
    var top = clientY + offsetY;
    if (left + tooltip.offsetWidth > window.innerWidth) {
      left = clientX - tooltip.offsetWidth - offsetX;
    }
    if (top + tooltip.offsetHeight > window.innerHeight) {
      top = window.innerHeight - tooltip.offsetHeight - offsetY;
    }
    tooltip.style.left = Math.max(0, left) + 'px';
    tooltip.style.top = Math.max(0, top) + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  viewport.addEventListener('mousemove', function (event) {
    var rect = viewport.getBoundingClientRect();
    var withinX = event.clientX - rect.left;
    if (withinX < 0 || withinX > meta.width) {
      hideTooltip();
      return;
    }
    var y = event.clientY - rect.top + viewport.scrollTop;
    var band = bandAt(y);
    if (!band) {
      hideTooltip();
      return;
    }
    showTooltip(event.clientX, event.clientY, band);
  });
  viewport.addEventListener('mouseleave', hideTooltip);

  function layoutThumb() {
    var total = meta.totalHeight || 1;
    var visibleFraction = Math.min(1, viewport.clientHeight / total);
    var trackHeight = scrubber.clientHeight;
    var thumbHeight = Math.max(16, trackHeight * visibleFraction);
    var scrollFraction = viewport.scrollHeight > viewport.clientHeight
      ? viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight)
      : 0;
    var thumbTop = (trackHeight - thumbHeight) * scrollFraction;
    thumb.style.height = thumbHeight + 'px';
    thumb.style.top = thumbTop + 'px';
  }

  function scrollToFraction(fraction) {
    var clamped = Math.max(0, Math.min(1, fraction));
    viewport.scrollTop = clamped * (viewport.scrollHeight - viewport.clientHeight);
  }

  function fractionFromPointer(clientY) {
    var rect = scrubber.getBoundingClientRect();
    return (clientY - rect.top) / rect.height;
  }

  var dragging = false;
  thumb.addEventListener('pointerdown', function (event) {
    dragging = true;
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener('pointermove', function (event) {
    if (!dragging) {
      return;
    }
    scrollToFraction(fractionFromPointer(event.clientY));
  });
  thumb.addEventListener('pointerup', function (event) {
    dragging = false;
    thumb.releasePointerCapture(event.pointerId);
  });
  scrubber.addEventListener('click', function (event) {
    if (event.target === thumb) {
      return;
    }
    scrollToFraction(fractionFromPointer(event.clientY));
  });

  viewport.addEventListener('scroll', layoutThumb);
  window.addEventListener('resize', layoutThumb);
  layoutThumb();
})();
</script>
</body>
</html>
`;
}

module.exports = { renderViewerHtml };
