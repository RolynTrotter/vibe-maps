/**
 * The map surface: MapLibre GL reading vector tiles out of a single PMTiles
 * file over HTTP range requests.
 *
 * There is no basemap and no tile server. PMTiles is one static file that
 * GitHub Pages serves like any other, and the client fetches byte ranges out
 * of it, so the whole app is a directory of files with no backend, no API key
 * and nothing to keep running. It is also why this scales: swapping district
 * polygons for sub-district or village ones changes the size of that file and
 * nothing else about the architecture.
 *
 * Deliberately no basemap imagery underneath. A choropleth is a figure, not a
 * location — roads and terrain under it would compete with the very colour
 * differences the map exists to show.
 */

import { colorExpression } from './classify.js';

export const LAYERS = {
  fill: 'district-fill',
  line: 'district-line',
  states: 'state-line',
  hover: 'district-hover',
};

const SURFACE = { light: '#fcfcfb', dark: '#1a1a19' };
const HAIRLINE = { light: 'rgba(0,0,0,0.16)', dark: 'rgba(255,255,255,0.16)' };
const STATELINE = { light: 'rgba(0,0,0,0.42)', dark: 'rgba(255,255,255,0.46)' };
const HOVERLINE = { light: '#0b0b0b', dark: '#ffffff' };

export function currentMode() {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === 'dark' || stamped === 'light') return stamped;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export async function createMap(container, dataset, mode) {
  const { geometry } = dataset.manifest;

  // Teach MapLibre to read pmtiles:// URLs.
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const tilesUrl = new URL(geometry.pmtiles, location.href).href;

  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        districts: { type: 'vector', url: `pmtiles://${tilesUrl}` },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': SURFACE[mode] } },
        {
          id: LAYERS.fill,
          type: 'fill',
          source: 'districts',
          'source-layer': geometry.sourceLayer,
          paint: { 'fill-color': SURFACE[mode], 'fill-antialias': true },
        },
        {
          id: LAYERS.line,
          type: 'line',
          source: 'districts',
          'source-layer': geometry.sourceLayer,
          paint: {
            'line-color': HAIRLINE[mode],
            // District hairlines would turn the Gangetic plain into a grey
            // smear at national zoom, so they fade in as you approach them.
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.15, 6, 0.5, 9, 0.9],
          },
        },
        {
          id: LAYERS.states,
          type: 'line',
          source: 'districts',
          'source-layer': 'states',
          paint: {
            'line-color': STATELINE[mode],
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 1.2, 9, 2],
          },
        },
        {
          id: LAYERS.hover,
          type: 'line',
          source: 'districts',
          'source-layer': geometry.sourceLayer,
          filter: ['==', ['get', geometry.joinKey], -1],
          paint: { 'line-color': HOVERLINE[mode], 'line-width': 2 },
        },
      ],
    },
    center: geometry.center,
    zoom: geometry.zoom,
    minZoom: 2,
    maxZoom: 9,
    maxBounds: geometry.maxBounds,
    attributionControl: false,
    // Rotation on a choropleth is all cost and no benefit, and on a phone a
    // stray two-finger twist while pinch-zooming leaves the map crooked with
    // no obvious way back.
    dragRotate: false,
    pitchWithRotate: false,
    touchZoomRotate: true,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  await new Promise((resolve) => map.on('load', resolve));

  // A fixed zoom cannot serve a 1400px desktop column and a 390px phone at
  // once -- India overflowed the phone badly. Fit the region's own bounds
  // instead, and keep refitting on resize/rotate until the user takes over.
  let userHasMoved = false;
  const fit = () => {
    if (userHasMoved) return;
    map.fitBounds(geometry.bounds, { padding: fitPadding(), duration: 0 });
  };
  for (const ev of ['dragstart', 'zoomstart', 'rotatestart']) {
    map.on(ev, (e) => { if (e.originalEvent) userHasMoved = true; });
  }
  map.on('resize', fit);
  fit();

  return map;
}

/** Repaint for a new variable. One paint property, no source churn. */
export function paint(map, dataset, values, variable, mode) {
  const { manifest, table } = dataset;
  const palette = manifest.palettes[variable.palette];
  map.setPaintProperty(
    LAYERS.fill,
    'fill-color',
    colorExpression(values, table, variable, palette, mode, manifest.geometry.joinKey)
  );
}

/** Recolour the furniture when the theme flips. */
export function applyMode(map, mode) {
  map.setPaintProperty('bg', 'background-color', SURFACE[mode]);
  map.setPaintProperty(LAYERS.line, 'line-color', HAIRLINE[mode]);
  map.setPaintProperty(LAYERS.states, 'line-color', STATELINE[mode]);
  map.setPaintProperty(LAYERS.hover, 'line-color', HOVERLINE[mode]);
}

/** Keep the fitted region clear of the top bar; the sheet is handled below. */
function fitPadding() {
  const wide = matchMedia('(min-width: 900px)').matches;
  return wide
    ? { top: 40, right: 40, bottom: 40, left: 40 }
    : { top: 74, right: 16, bottom: 40, left: 16 };
}

/**
 * Lift the map clear of the bottom sheet while it is open.
 *
 * The alternative -- permanently biasing the fit upward -- leaves the closed
 * state, which is the state you actually read the map in, sitting high with a
 * band of dead space under it. Easing the camera padding instead means the
 * country is centred when the sheet is down and pushed above it when it is up.
 */
export function setSheetInset(map, px) {
  if (matchMedia('(min-width: 900px)').matches) return;
  map.easeTo({ padding: { top: 74, right: 16, bottom: 40 + px, left: 16 }, duration: 260 });
}

export function highlight(map, joinKey, code) {
  map.setFilter(LAYERS.hover, ['==', ['get', joinKey], code ?? -1]);
}
