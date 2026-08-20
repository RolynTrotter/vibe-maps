/**
 * Wiring: manifest -> controls -> map -> readouts.
 *
 * Everything the user can pick comes from the dataset manifest, so this file
 * has no knowledge of India, caste, or the census. Point it at a different
 * manifest and it renders that instead.
 */

import { loadDataset, series, ranked, aggregate } from './dataset.js';
import { legendRows, format, classOf } from './classify.js';
import { createMap, paint, applyMode, highlight, setSheetInset, LAYERS, currentMode } from './map.js';

const DATASET = 'data/datasets/india-census-2011.json';

const el = (id) => document.getElementById(id);
const state = {
  dataset: null,
  variable: null,
  values: [],
  mode: currentMode(),
  map: null,
  selected: null,
  markers: [],
  showAnnotations: true,
};

init().catch((err) => {
  el('loading').innerHTML =
    `<p class="error"><strong>Could not start.</strong><br>${escapeHtml(err.message)}</p>`;
  console.error(err);
});

async function init() {
  const dataset = await loadDataset(DATASET);
  state.dataset = dataset;
  state.variable = dataset.manifest.variables.find((v) => v.featured) || dataset.manifest.variables[0];

  document.title = `${dataset.manifest.title} · vibe-maps`;
  el('dataset-title').textContent = dataset.manifest.title;
  el('dataset-subtitle').textContent = dataset.manifest.subtitle;

  buildVariablePicker();
  buildGlossary();
  buildLimitations();
  buildAttribution();

  state.map = await createMap('map', dataset, state.mode);
  window.__map = state.map;   // handy for debugging and layout measurement
  wireMapEvents();
  selectVariable(state.variable.id);

  el('loading').remove();
  el('app').hidden = false;

  // Follow the OS theme unless the user has stamped a preference.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.dataset.theme) setMode(currentMode());
  });
  el('theme-toggle').addEventListener('click', () => {
    const next = state.mode === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setMode(next);
  });
  el('panel-toggle').addEventListener('click', () => {
    setPanel(!document.body.classList.contains('panel-open'));
  });
  el('annotations-toggle').addEventListener('change', (e) => {
    state.showAnnotations = e.target.checked;
    renderAnnotations();
  });
}

// --- controls --------------------------------------------------------------

function buildVariablePicker() {
  const { manifest } = state.dataset;
  const host = el('variables');
  for (const group of manifest.groups) {
    const vars = manifest.variables.filter((v) => v.group === group.id);
    if (!vars.length) continue;
    const section = document.createElement('div');
    section.className = 'vgroup';
    section.innerHTML = `<h3>${escapeHtml(group.label)}</h3>`;
    const list = document.createElement('div');
    list.className = 'vlist';
    for (const v of vars) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vbtn';
      b.dataset.id = v.id;
      b.textContent = v.short || v.label;
      b.addEventListener('click', () => selectVariable(v.id));
      list.appendChild(b);
    }
    section.appendChild(list);
    host.appendChild(section);
  }
}

function selectVariable(id) {
  const dataset = state.dataset;
  const variable = dataset.variable(id);
  state.variable = variable;
  state.values = series(variable, dataset.table);

  document.querySelectorAll('.vbtn').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.id === id))
  );

  paint(state.map, dataset, state.values, variable, state.mode);
  renderLegend();
  renderAbout();
  renderRankings();
  renderAnnotations();
  renderReadout();
}

// --- rendering -------------------------------------------------------------

function renderLegend() {
  const { variable, values, mode, dataset } = state;
  const palette = dataset.manifest.palettes[variable.palette];
  const hasZero = values.some((v) => v === 0);
  const rows = legendRows(variable, palette, mode, { hasZero });

  el('legend-title').textContent = variable.label;
  el('legend').innerHTML = rows
    .map(
      (r) => `<li>
        <span class="swatch${r.outline ? ' outlined' : ''}" style="background:${r.color}"></span>
        <span class="lbl">${escapeHtml(r.label)}</span>
        ${r.note ? `<span class="note">${escapeHtml(r.note)}</span>` : ''}
      </li>`
    )
    .join('');
}

function renderAbout() {
  const v = state.variable;
  el('about').innerHTML =
    `<p>${escapeHtml(v.description || '')}</p>` +
    (v.caveat ? `<p class="caveat"><strong>Careful:</strong> ${escapeHtml(v.caveat)}</p>` : '');
}

function renderRankings() {
  const { variable, values, dataset } = state;
  const top = ranked(values, dataset.table, { descending: true, limit: 10 });
  const bottom = ranked(values, dataset.table, { descending: false, limit: 5 });
  const row = (r) =>
    `<li><button type="button" class="rank" data-code="${r.code}">
       <span class="v">${escapeHtml(format(r.value, variable.unit))}</span>
       <span class="d">${escapeHtml(r.district)}</span>
       <span class="s">${escapeHtml(r.state)}</span>
     </button></li>`;

  el('rankings').innerHTML =
    `<h3>Highest</h3><ol class="ranklist">${top.map(row).join('')}</ol>` +
    `<h3>Lowest</h3><ol class="ranklist">${bottom.map(row).join('')}</ol>`;

  el('rankings').querySelectorAll('.rank').forEach((b) =>
    b.addEventListener('click', () => {
      const code = Number(b.dataset.code);
      select(code);
      flyToDistrict(code);
    })
  );
}

function renderAnnotations() {
  state.markers.forEach((m) => m.remove());
  state.markers = [];
  const notes = state.variable.annotations || [];
  el('annotations-row').hidden = notes.length === 0;
  el('annotations-count').textContent = notes.length
    ? `${notes.length} note${notes.length > 1 ? 's' : ''} on this map`
    : '';
  if (!state.showAnnotations) return;

  for (const note of notes) {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.setAttribute('aria-label', note.title);
    pin.textContent = 'i';
    const popup = new maplibregl.Popup({ offset: 14, maxWidth: '280px', closeButton: true })
      .setHTML(`<h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.body)}</p>`);
    const marker = new maplibregl.Marker({ element: pin })
      .setLngLat([note.lng, note.lat])
      .setPopup(popup)
      .addTo(state.map);
    state.markers.push(marker);
  }
}

function renderReadout() {
  const host = el('readout');
  const { selected, dataset, variable } = state;
  if (selected === null) {
    host.innerHTML = `<p class="hint">Tap a district for its numbers.</p>`;
    return;
  }
  const i = dataset.indexOf(selected);
  if (i === undefined) {
    host.innerHTML =
      `<p class="hint"><strong>Not enumerated.</strong> This is the area of Jammu &amp; Kashmir
       the 2011 census could not cover. It carries no figures — which is different from
       carrying a zero.</p>`;
    return;
  }
  const { table } = dataset;
  // Every variable for this district, so a click answers more than the
  // question currently on screen.
  const rows = dataset.manifest.variables
    .map((v) => {
      const val = series(v, table)[i];
      const here = v.id === variable.id;
      return `<tr${here ? ' class="current"' : ''}>
        <th>${escapeHtml(v.short || v.label)}</th>
        <td>${escapeHtml(format(val, v.unit))}</td></tr>`;
    })
    .join('');

  host.innerHTML = `
    <h3>${escapeHtml(table.districts[i])}</h3>
    <p class="sub">${escapeHtml(table.states[i])} · population ${table.columns.Population[i].toLocaleString('en-IN')}</p>
    <table class="readout-table">${rows}</table>`;
}

function buildGlossary() {
  const g = state.dataset.manifest.glossary || [];
  if (!g.length) return el('glossary-section').remove();
  el('glossary').innerHTML = g
    .map(
      (t) => `<dt>${escapeHtml(t.term)}${t.expansion ? ` <span class="exp">${escapeHtml(t.expansion)}</span>` : ''}</dt>
              <dd>${escapeHtml(t.note)}</dd>`
    )
    .join('');
}

function buildLimitations() {
  const l = state.dataset.manifest.limitations || [];
  el('limitations').innerHTML = l.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function buildAttribution() {
  const a = state.dataset.manifest.attribution;
  el('attribution').innerHTML =
    `<p>${escapeHtml(a.data)}</p><p>${escapeHtml(a.boundaries)}</p>` +
    (a.note ? `<p class="caveat">${escapeHtml(a.note)}</p>` : '');
}

// --- map interaction -------------------------------------------------------

function wireMapEvents() {
  const { map } = state;
  const joinKey = state.dataset.manifest.geometry.joinKey;

  map.on('click', LAYERS.fill, (e) => {
    const f = e.features?.[0];
    if (f) select(Number(f.properties[joinKey]));
  });

  // Pointer devices get a hover tooltip; touch gets the panel readout, which
  // does not vanish the moment a finger lifts.
  if (matchMedia('(hover: hover)').matches) {
    const tip = el('tooltip');
    map.on('mousemove', LAYERS.fill, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const code = Number(f.properties[joinKey]);
      const i = state.dataset.indexOf(code);
      const name = i === undefined ? 'Not enumerated' : state.dataset.table.districts[i];
      const val = i === undefined ? '—' : format(state.values[i], state.variable.unit);
      tip.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(val)}</span>`;
      tip.hidden = false;
      tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
      highlight(map, joinKey, code);
    });
    map.on('mouseleave', LAYERS.fill, () => {
      map.getCanvas().style.cursor = '';
      tip.hidden = true;
      highlight(map, joinKey, state.selected);
    });
  }
}

function select(code) {
  state.selected = code;
  highlight(state.map, state.dataset.manifest.geometry.joinKey, code);
  renderReadout();
  if (!matchMedia('(min-width: 900px)').matches) setPanel(true);
}

/** Open or close the sheet, easing the map out from under it. */
function setPanel(open) {
  document.body.classList.toggle('panel-open', open);
  const sheet = open ? el('panel').getBoundingClientRect().height : 0;
  setSheetInset(state.map, sheet);
}

function flyToDistrict(code) {
  // No per-district centroid is shipped, so query what is already rendered.
  const joinKey = state.dataset.manifest.geometry.joinKey;
  const feats = state.map.querySourceFeatures('districts', {
    sourceLayer: state.dataset.manifest.geometry.sourceLayer,
    filter: ['==', ['get', joinKey], code],
  });
  if (!feats.length) return;
  const b = new maplibregl.LngLatBounds();
  const walk = (coords) =>
    typeof coords[0] === 'number' ? b.extend(coords) : coords.forEach(walk);
  feats.forEach((f) => walk(f.geometry.coordinates));
  if (!b.isEmpty()) state.map.fitBounds(b, { padding: 80, maxZoom: 7, duration: 700 });
}

function setMode(mode) {
  state.mode = mode;
  applyMode(state.map, mode);
  paint(state.map, state.dataset, state.values, state.variable, mode);
  renderLegend();
  el('theme-toggle').setAttribute('aria-label', mode === 'dark' ? 'Switch to light' : 'Switch to dark');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
