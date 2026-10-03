(() => {
'use strict';

const MAP = window.LONGING_MAP;
const TILE = MAP.tile;
const THUMB_PPU = MAP.thumbPpu;
const STORE_KEY = 'longing-map:v1';
const LAYOUT_KEY = 'longing-map:layout:v1';
const MAX_Z = 160;
const TILE_CACHE_LIMIT = 160;
const GREAT_CAVE = 67;

// ---------------------------------------------------------------- marker types
const TYPES = [
  { id: 'note',     name: 'Note',       color: '#eadfc4', icon: '<path d="M5 19l2.2-.5L18.5 7.2a2 2 0 0 0-2.8-2.8L4.5 15.7 4 18z"/><path d="M14 6l3 3"/>' },
  { id: 'coal',     name: 'Coal',       color: '#bdb7ae', icon: '<path d="M4 15l3-6 5-2 6 2 2 6-3 4H8z"/><path d="M9 11l3 2 3-3M12 13v4"/>' },
  { id: 'moss',     name: 'Moss',       color: '#97c672', icon: '<path d="M12 21v-8"/><path d="M12 13c0-4-3-7-8-7 0 4 3 7 8 7z"/><path d="M12 11c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z"/>' },
  { id: 'mushroom', name: 'Mushroom',   color: '#e3976b', icon: '<path d="M3.5 12a8.5 7 0 0 1 17 0z"/><path d="M10 12v6.5a2 2 0 0 0 4 0V12"/><path d="M8 8.5h.01M15 7h.01"/>' },
  { id: 'crystal',  name: 'Crystal',    color: '#ee92ba', icon: '<path d="M12 2.5l5.5 6.5L12 21.5 6.5 9z"/><path d="M6.5 9h11M12 2.5v19"/>' },
  { id: 'book',     name: 'Book',       color: '#d6ae6e', icon: '<path d="M3 5.5h6a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5.5h-6a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H21z"/>' },
  { id: 'item',     name: 'Item',       color: '#f2d24f', icon: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>' },
  { id: 'water',    name: 'Water',      color: '#74b9e6', icon: '<path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.8-6.8 6-11z"/>' },
  { id: 'wait',     name: 'Takes time', color: '#b9a3ea', icon: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5.5 8 9s-8 4-8 9M16 3c0 5-8 5.5-8 9s8 4 8 9"/>' },
  { id: 'passage',  name: 'Passage',    color: '#dbbb8e', icon: '<path d="M5 21V11a7 7 0 0 1 14 0v10"/><path d="M3 21h18M9 21v-7a3 3 0 0 1 6 0v7"/>' },
  { id: 'blocked',  name: 'Blocked',    color: '#e66b5d', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>' },
  { id: 'mystery',  name: 'Mystery',    color: '#88c1e1', icon: '<path d="M9 9a3 3 0 1 1 4.2 2.75c-.75.35-1.2 1-1.2 1.85V15"/><path d="M12 18.5v.01"/>' },
  { id: 'star',     name: 'Favourite',  color: '#f6e27c', icon: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>' },
];
const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));
const icon = t => `<svg viewBox="0 0 24 24">${(TYPE[t] || TYPE.note).icon}</svg>`;

const KIND_LABEL = { walk: 'passage', door: 'doorway', dark: 'dark climb', mystery: 'mystery door', uncanny: 'uncanny',
  secret: 'hidden passage', dig: 'dig through', climb: 'climb' };
const LABEL_RGB = '239,227,200';   // same as the room labels
const HOME = 4;
const SPECIAL = new Set(['mystery', 'uncanny', 'secret', 'dig', 'climb']);
const FOG_KINDS = new Set(['walk', 'door', 'dark', 'climb']);

// ---------------------------------------------------------------- geometry helpers
const round2 = v => Math.round(v * 100) / 100;
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), a[0] + t * dx, a[1] + t * dy];
}
// Ramer–Douglas–Peucker: reduce a waypoint chain to a few editable bend points
function simplify(pts, eps) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, dmax = 0;
    for (let k = i + 1; k < j; k++) { const d = segDist(pts[k], pts[i], pts[j])[0]; if (d > dmax) { dmax = d; best = k; } }
    if (dmax > eps) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]).map(p => [p[0], p[1]]);
}

// ---------------------------------------------------------------- rooms & links
// bx/by are the generated positions; x/y are where the room is drawn after applying the layout.
const rooms = MAP.rooms.map(r => ({ ...r, bx: r.rect[0], by: r.rect[1], x: r.rect[0], y: r.rect[1], w: r.rect[2], h: r.rect[3], area: r.rect[2] * r.rect[3] }));
const roomById = new Map(rooms.map(r => [r.id, r]));
const primaryId = id => roomById.get(id)?.sharedWith ?? id;
const primaries = rooms.filter(r => !r.sharedWith).sort((a, b) => b.area - a.area);
const groupOf = new Map(primaries.map(p => [p.id, [p, ...rooms.filter(r => r.sharedWith === p.id)]]));
const keySeen = {};
const links = MAP.links.map(l => {
  const base = `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}-${l.kind}`;
  const n = keySeen[base] = (keySeen[base] ?? -1) + 1;
  return { ...l, key: n ? `${base}#${n}` : base, ga: primaryId(l.a), gb: primaryId(l.b),
    pa0: [l.pa[0], l.pa[1]], pb0: [l.pb[0], l.pb[1]], pa: { x: l.pa[0], y: l.pa[1] }, pb: { x: l.pb[0], y: l.pb[1] },
    defaultBends: l.bends ? l.bends.map(p => [p[0], p[1]]) : null, bendFrame: null };   // baked bends are absolute
});
// The dark climbs out of the Great Cave follow its waypoints: turn them into the default bends of those links.
for (const p of MAP.paths) {
  const l = links.find(k => k.kind === 'dark' && ((k.a === GREAT_CAVE && k.b === p.to) || (k.b === GREAT_CAVE && k.a === p.to)));
  if (!l) continue;
  const pts = simplify(p.pts, 2.5);
  if (l.a === GREAT_CAVE) { l.pa0 = pts[0]; l.defaultBends = pts.slice(1); }
  else { l.pb0 = pts[0]; l.defaultBends = pts.slice(1).reverse(); }
  l.bendFrame = GREAT_CAVE;   // these follow the Great Cave when it moves
}
const neighbours = new Map(primaries.map(p => [p.id, new Set()]));
for (const l of links) {
  if (!FOG_KINDS.has(l.kind) || l.ga === l.gb) continue;
  neighbours.get(l.ga).add(l.gb); neighbours.get(l.gb).add(l.ga);
}
const OUTLIERS = new Set([60, 69, 73]);

// Direction of every connection: a depth-first walk from Home over ordinary passages (walk-throughs, doorways,
// dark climbs). Rooms reachable only through mystery doors, digging or climbing are added afterwards, so those
// shortcuts don't reshape the tree. A connection points from the room found earlier to the one found later;
// real one-way passages keep their actual direction.
const dfsOrder = new Map();
(() => {
  const ORDINARY = { walk: 0, door: 1, dark: 2 };
  const adj = new Map(primaries.map(p => [p.id, []]));
  for (const l of links) {
    if (!(l.kind in ORDINARY) || l.ga === l.gb) continue;
    adj.get(l.ga).push([ORDINARY[l.kind], l.gb]); adj.get(l.gb).push([ORDINARY[l.kind], l.ga]);
  }
  for (const list of adj.values()) list.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let n = 0;
  const dfs = root => {
    dfsOrder.set(root, n++);
    const stack = [[root, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], nb = adj.get(top[0]);
      if (top[1] >= nb.length) { stack.pop(); continue; }
      const to = nb[top[1]++][1];
      if (!dfsOrder.has(to)) { dfsOrder.set(to, n++); stack.push([to, 0]); }
    }
  };
  dfs(HOME);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of links) if (dfsOrder.has(l.ga) !== dfsOrder.has(l.gb)) { dfs(dfsOrder.has(l.ga) ? l.gb : l.ga); grew = true; }
  }
  for (const p of primaries) if (!dfsOrder.has(p.id)) dfs(p.id);
  for (const l of links) l.fwd = l.oneway || dfsOrder.get(l.ga) <= dfsOrder.get(l.gb);
})();


// ---------------------------------------------------------------- state (markers, visited, notes, settings)
const DEFAULT_SETTINGS = { brightness: 1.35, pathways: 0.5, stepFade: 0.9, labels: true, markerLabels: true, fog: true };
let state = { markers: [], visited: { 3: true, 4: true }, notes: {}, view: null, settings: { ...DEFAULT_SETTINGS } };
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state = {
      markers: Array.isArray(s.markers) ? s.markers.filter(validMarker) : [],
      visited: s.visited && typeof s.visited === 'object' ? s.visited : {},
      notes: s.notes && typeof s.notes === 'object' ? s.notes : {},
      view: s.view || null,
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
      markersBase: s.markersBase || null,
    };
  } catch (e) { console.warn('Could not load saved map data', e); }
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, view })); }
    catch (e) { console.warn('Could not save map data', e); }
  }, 250);
}
// Markers are stored relative to their room's default position. When a new default layout is baked in,
// markers saved against the generated positions or an earlier default are shifted once by how far their room moved.
function shiftToBase(markers, fromBase) {
  if (!LAYOUT_BASE || fromBase === LAYOUT_BASE) return;
  const shift = fromBase ? MAP.baseShifts?.[fromBase] : MAP.bakedShift;
  if (!shift) return;
  for (const m of markers) {
    const sft = m.room != null && shift[roomById.get(m.room)?.sharedWith ?? m.room];
    if (sft) { m.x = +(m.x + sft[0]).toFixed(3); m.y = +(m.y + sft[1]).toFixed(3); }
  }
}
function migrateMarkers() {
  if (state.markersBase === LAYOUT_BASE) return;
  shiftToBase(state.markers, state.markersBase);
  state.markersBase = LAYOUT_BASE;
  save();
}
function validMarker(m) { return m && typeof m.x === 'number' && typeof m.y === 'number' && typeof m.id === 'string'; }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------- layout (room offsets + connection bends)
// rooms: { primaryId: [dx, dy] } offsets from the generated position.
// bends: { linkKey: [[x, y], ...] } absolute bend points from the link's `a` end to its `b` end.
// ends:  { linkKey: { a: [x, y], b: [x, y] } } moved connection ends, in their room's generated frame.
const LAYOUT_BASE = MAP.layoutBase || null;   // id of the default layout baked into data/map.js
const emptyLayout = () => ({ version: 1, base: LAYOUT_BASE, updated: 0, rooms: {}, bends: {}, ends: {} });
let layout = emptyLayout();
let layoutSource = 'default';   // where the current layout lives: 'default' | 'project' | 'browser'
let layoutServer = false;       // true when served by tools/serve.py, which can write data/layout.js
function cleanLayout(x) {
  if (!x || typeof x !== 'object' || !x.rooms || !x.bends || typeof x.rooms !== 'object' || typeof x.bends !== 'object') return null;
  if ((x.base || null) !== LAYOUT_BASE) return null;   // made against an older default layout
  const ok = v => typeof v === 'number' && isFinite(v);
  const out = emptyLayout();
  out.updated = +x.updated || 0;
  for (const [k, v] of Object.entries(x.rooms)) if (groupOf.has(+k) && Array.isArray(v) && ok(v[0]) && ok(v[1])) out.rooms[k] = [v[0], v[1]];
  for (const [k, v] of Object.entries(x.bends)) if (Array.isArray(v) && v.every(p => Array.isArray(p) && ok(p[0]) && ok(p[1]))) out.bends[k] = v.map(p => [p[0], p[1]]);
  for (const [k, v] of Object.entries(x.ends && typeof x.ends === 'object' ? x.ends : {})) {
    const e = {};
    for (const side of ['a', 'b']) if (Array.isArray(v?.[side]) && ok(v[side][0]) && ok(v[side][1])) e[side] = [v[side][0], v[side][1]];
    if (e.a || e.b) out.ends[k] = e;
  }
  return out;
}
function loadLayout() {
  const fromFile = cleanLayout(window.LONGING_LAYOUT);
  let fromLocal = null;
  try { fromLocal = cleanLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null')); } catch (e) { /* ignore */ }
  if (fromFile && (!fromLocal || fromFile.updated >= fromLocal.updated)) { layout = fromFile; layoutSource = 'project'; }
  else if (fromLocal) { layout = fromLocal; layoutSource = 'browser'; }
  applyLayout();
}
const roomOff = pid => layout.rooms[pid] || [0, 0];
function setOff(pid, dx, dy) {
  dx = round2(dx); dy = round2(dy);
  if (dx === 0 && dy === 0) delete layout.rooms[pid]; else layout.rooms[pid] = [dx, dy];
}
function applyLayout() {
  for (const r of rooms) { const [dx, dy] = roomOff(primaryId(r.id)); r.x = r.bx + dx; r.y = r.by + dy; }
  for (const l of links) {
    const [ax, ay] = roomOff(l.ga), [bx, by] = roomOff(l.gb);
    const e = layout.ends[l.key], a0 = e?.a || l.pa0, b0 = e?.b || l.pb0;
    l.pa.x = a0[0] + ax; l.pa.y = a0[1] + ay;
    l.pb.x = b0[0] + bx; l.pb.y = b0[1] + by;
  }
  requestRender();
}
function linkBends(l) {
  const own = layout.bends[l.key];
  if (own) return own;
  if (l.defaultBends) {
    const [dx, dy] = l.bendFrame != null ? roomOff(l.bendFrame) : [0, 0];
    return l.defaultBends.map(([x, y]) => [x + dx, y + dy]);
  }
  return [];
}
const controlPoints = l => [[l.pa.x, l.pa.y], ...linkBends(l), [l.pb.x, l.pb.y]];
const isDefaultLayout = () => !Object.keys(layout.rooms).length && !Object.keys(layout.bends).length && !Object.keys(layout.ends).length;

let layoutTimer = 0;
function saveLayout() {
  layout.updated = Date.now();
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) { console.warn('Could not save layout', e); }
  if (!layoutServer) { layoutSource = 'browser'; return setLayoutStatus(); }
  pushLayout();
}
function pushLayout() {
  clearTimeout(layoutTimer);
  setLayoutStatus('Saving…');
  layoutTimer = setTimeout(async () => {
    try {
      const r = await fetch('api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      layoutSource = 'project'; setLayoutStatus();
    } catch (e) {
      layoutSource = 'browser';
      setLayoutStatus('Could not write data/layout.js — kept in this browser');
    }
  }, 350);
}
function setLayoutStatus(msg) {
  const text = msg || (isDefaultLayout() ? 'Default layout' : layoutSource === 'project' ? 'Saved to data/layout.js' : 'Saved in this browser');
  document.querySelectorAll('.layout-status').forEach(el => { el.textContent = text; });
  $('#layout-hint').hidden = layoutServer;
}
async function probeLayoutServer() {
  if (/^https?:$/.test(location.protocol)) {
    try { const r = await fetch('api/layout', { cache: 'no-store' }); if (r.ok) layoutServer = !!(await r.json()).save; }
    catch (e) { /* plain static server: layout stays in the browser */ }
  }
  // this browser holds a newer layout than data/layout.js (edited without the server, or the file was replaced): write it back
  if (layoutServer && layoutSource === 'browser' && !isDefaultLayout()) return pushLayout();
  setLayoutStatus();
}

// undo / redo over layout snapshots
const undoStack = [], redoStack = [];
const snap = () => JSON.stringify({ rooms: layout.rooms, bends: layout.bends, ends: layout.ends });
function commit(before) {
  if (before === snap()) return;
  undoStack.push(before); if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  saveLayout(); updateUndoButtons();
}
function restore(s) {
  const o = JSON.parse(s);
  layout.rooms = o.rooms; layout.bends = o.bends; layout.ends = o.ends || {};
  applyLayout(); saveLayout();
}
function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); updateUndoButtons(); toast('Undone'); }
function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); updateUndoButtons(); toast('Redone'); }
function updateUndoButtons() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

// ---------------------------------------------------------------- dom
const $ = s => document.querySelector(s);
const stage = $('#stage'), artCv = $('#art'), lineCv = $('#lines'), stepsCv = $('#steps');
const art = artCv.getContext('2d'), lc = lineCv.getContext('2d'), sc = stepsCv.getContext('2d');
const labelsEl = $('#labels'), markersEl = $('#markers');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- view
let W = 0, H = 0, dpr = 1;
let view = { cx: 0, cy: 0, z: 4 };
let minZ = 0.5;
const toScreen = (x, y) => [(x - view.cx) * view.z + W / 2, (y - view.cy) * view.z + H / 2];
const toWorld = (sx, sy) => [(sx - W / 2) / view.z + view.cx, (sy - H / 2) / view.z + view.cy];
function boundsOf(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return { x0, y0, x1, y1 };
}
function panelWidth() { return $('#panel').classList.contains('collapsed') || innerWidth <= 760 ? 0 : $('#panel').offsetWidth; }
// Fit a set of rooms into the free area between the toolbar (left), title bar (top) and panel (right).
function fitView(list, pad = 40) {
  const b = boundsOf(list);
  const left = innerWidth > 760 ? 70 : 0, top = 64, right = panelWidth();
  const bottom = editing && innerWidth > 760 ? 70 : 0;   // the edit bar sits at the bottom
  const usableW = Math.max(200, W - left - right - pad * 2), usableH = Math.max(200, H - top - bottom - pad * 2);
  const z = Math.min(usableW / Math.max(1, b.x1 - b.x0), usableH / Math.max(1, b.y1 - b.y0), 60);
  return { cx: (b.x0 + b.x1) / 2 - (left - right) / 2 / z, cy: (b.y0 + b.y1) / 2 - (top - bottom) / 2 / z, z };
}
function fitAll() {
  const shown = state.settings.fog ? primaries.filter(r => visibility(r.id) !== 'none') : primaries;
  flyTo(fitView(shown.length ? shown : primaries));
}
function clampZ(z) { return Math.max(minZ, Math.min(MAX_Z, z)); }
function zoomAt(sx, sy, factor) {
  const [wx, wy] = toWorld(sx, sy);
  view.z = clampZ(view.z * factor);
  view.cx = wx - (sx - W / 2) / view.z;
  view.cy = wy - (sy - H / 2) / view.z;
  changed();
}
let anim = 0;
function flyTo(target, ms = 550) {
  cancelAnimationFrame(anim);
  const from = { ...view }, to = { ...target, z: clampZ(target.z) };
  const t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    view.z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e);
    view.cx = from.cx + (to.cx - from.cx) * e;
    view.cy = from.cy + (to.cy - from.cy) * e;
    changed();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function flyToRoom(id) {
  const r = roomById.get(primaryId(id));
  const pw = panelWidth();
  const z = Math.min((W - pw - 160) / r.w, (H - 200) / r.h, 70);
  flyTo({ cx: r.x + r.w / 2 + pw / 2 / z, cy: r.y + r.h / 2, z });
}
function flyToPoint(x, y, z = Math.max(view.z, 30)) {
  const pw = panelWidth();
  flyTo({ cx: x + pw / 2 / z, cy: y, z });
}
function changed() { requestRender(); saveView(); }
let viewTimer = 0;
function saveView() { clearTimeout(viewTimer); viewTimer = setTimeout(save, 400); }

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = stage.clientWidth; H = stage.clientHeight;
  for (const cv of [artCv, lineCv, stepsCv]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  minZ = fitView(primaries, 20).z * 0.5;
  requestRender();
}

// ---------------------------------------------------------------- images
const cache = new Map();
let tileCount = 0;
function getImg(src, isTile) {
  let e = cache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ok: false, used: 0, tile: isTile };
    img.decoding = 'async';
    img.onload = () => { e.ok = true; requestRender(); };
    img.onerror = () => { e.failed = true; };
    img.src = src;
    cache.set(src, e);
    if (isTile && ++tileCount > TILE_CACHE_LIMIT) evictTiles();
  }
  e.used = frame;
  return e;
}
function evictTiles() {
  const tiles = [...cache.entries()].filter(([, e]) => e.tile && e.used < frame).sort((a, b) => a[1].used - b[1].used);
  for (const [src, e] of tiles.slice(0, Math.max(0, tileCount - TILE_CACHE_LIMIT * 0.75))) {
    e.img.onload = null; e.img.src = ''; cache.delete(src); tileCount--;
  }
}
const thumbSrc = r => `img/rooms/${r.img}_thumb.webp`;
const maskSrc = r => `img/rooms/${r.img}_mask.webp`;
const tileSrc = (r, tx, ty) => `img/rooms/${r.img}/${tx}_${ty}.webp`;

// ---------------------------------------------------------------- visibility (fog of war)
const isVisited = pid => !!state.visited[pid];
function visibility(pid) {
  if (!state.settings.fog) return 'full';
  if (isVisited(pid)) return 'full';
  for (const n of neighbours.get(pid)) if (isVisited(n)) return 'hint';
  return 'none';
}

// ---------------------------------------------------------------- rendering
let raf = 0, frame = 1, hoverId = null, selectedId = null, selectedMarker = null;
let editing = false, editSel = new Set(), hoverLink = null, hoverBend = null, hoverEnd = null;
function requestRender() { if (!raf) raf = requestAnimationFrame(render); }
function render() {
  raf = 0; frame++;
  drawArt();
  drawLines();
  placeLabels();
  placeMarkers();
  if (!popover.hidden && selectedMarker) positionPopover();
}

function drawArt() {
  const c = art;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  const useTiles = view.z > THUMB_PPU * 1.15;
  for (const r of primaries) {
    const vis = visibility(r.id);
    if (vis === 'none') continue;
    const [sx, sy] = toScreen(r.x, r.y), sw = r.w * view.z, sh = r.h * view.z;
    if (sx > W || sy > H || sx + sw < 0 || sy + sh < 0) continue;
    c.globalAlpha = vis === 'hint' ? 0.13 : 1;
    const th = getImg(thumbSrc(r), false);
    if (th.ok) c.drawImage(th.img, sx, sy, sw, sh);
    if (!useTiles || vis !== 'full' || !r.tiles) continue;
    const k = view.z / r.ppu;          // screen px per source px
    for (const [tx, ty] of r.tiles) {
      const px = tx * TILE, py = ty * TILE;
      const tw = Math.min(TILE, r.size[0] - px), tht = Math.min(TILE, r.size[1] - py);
      const x0 = Math.floor((sx + px * k) * dpr) / dpr, y0 = Math.floor((sy + py * k) * dpr) / dpr;
      const x1 = Math.ceil((sx + (px + tw) * k) * dpr) / dpr, y1 = Math.ceil((sy + (py + tht) * k) * dpr) / dpr;
      if (x0 > W || y0 > H || x1 < 0 || y1 < 0) continue;
      const t = getImg(tileSrc(r, tx, ty), true);
      if (t.ok) c.drawImage(t.img, x0, y0, x1 - x0, y1 - y0);
    }
  }
  c.globalAlpha = 1;
}

function linkVisible(l) {
  if (state.settings.pathways <= 0) return false;
  if (state.settings.fog) {
    const va = visibility(l.ga), vb = visibility(l.gb);
    if (va === 'none' || vb === 'none' || (va === 'hint' && vb === 'hint')) return false;
  }
  return true;
}
// Screen-space polyline of a connection: a Catmull-Rom curve through its endpoints and bends.
// seg[i] tells which control segment sample i belongs to (used to insert new bends in order).
function curveOf(l) {
  const cp = controlPoints(l).map(([x, y]) => toScreen(x, y));
  if (cp.length === 2) return { pts: cp, seg: [0, 0] };
  const pts = [cp[0]], seg = [0];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const n = Math.max(3, Math.min(48, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 9)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
                u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
      seg.push(i);
    }
  }
  return { pts, seg };
}
// Bare footprints (the Shade walks barefoot) along a screen-space polyline that is already ordered in the
// walking direction, alternating left and right feet.
const SMALL_TOES = [[0.395, 0.0, 0.047], [0.365, -0.09, 0.043], [0.32, -0.165, 0.039], [0.26, -0.228, 0.034]];
function bareFoot(c, L) {   // left foot: heel at -x, toes at +x, big toe on the inner (+y) side
  c.beginPath();
  c.moveTo(-0.36 * L, 0.135 * L);
  c.bezierCurveTo(-0.55 * L, 0.13 * L, -0.55 * L, -0.13 * L, -0.36 * L, -0.135 * L);   // round heel
  c.bezierCurveTo(-0.15 * L, -0.14 * L, -0.02 * L, -0.21 * L, 0.12 * L, -0.195 * L);   // outer edge out to the ball
  c.bezierCurveTo(0.26 * L, -0.18 * L, 0.27 * L, 0.12 * L, 0.15 * L, 0.165 * L);       // ball of the foot
  c.bezierCurveTo(0.06 * L, 0.20 * L, -0.04 * L, 0.045 * L, -0.14 * L, 0.05 * L);      // inner edge into the arch
  c.bezierCurveTo(-0.22 * L, 0.055 * L, -0.27 * L, 0.135 * L, -0.36 * L, 0.135 * L);   // arch back out to the heel
  c.fill();
  c.beginPath(); c.ellipse(0.375 * L, 0.115 * L, 0.09 * L, 0.068 * L, 0.15, 0, Math.PI * 2); c.fill();   // big toe
  for (const [x, y, r] of SMALL_TOES) { c.beginPath(); c.arc(x * L, y * L, r * L, 0, Math.PI * 2); c.fill(); }
}
// The rooms show their floors from a low angle, so footsteps are laid out on that floor: distances and the
// footprints themselves are measured in floor space, where screen height is stretched by 1 / FLOOR_TILT, and
// squashed back when drawn. Steps going "into" the screen therefore come closer together and look flatter.
const FLOOR_TILT = 0.42;
function footsteps(c, pts, foot, alpha) {
  const fl = pts.map(([x, y]) => [x, y / FLOOR_TILT]);
  const L = [0];
  for (let i = 1; i < fl.length; i++) L.push(L[i - 1] + Math.hypot(fl[i][0] - fl[i - 1][0], fl[i][1] - fl[i - 1][1]));
  const total = L[L.length - 1], stride = foot * 1.5, side = foot * 0.3;
  if (total < foot) return;
  const n = Math.max(1, Math.floor((total - foot * 0.5) / stride) + 1);
  let s = (total - (n - 1) * stride) / 2, seg = 1;
  c.fillStyle = `rgba(${LABEL_RGB},${alpha})`;
  for (let k = 0; k < n; k++, s += stride) {
    while (seg < fl.length - 1 && L[seg] < s) seg++;
    const a = fl[seg - 1], b = fl[seg], t = (s - L[seg - 1]) / ((L[seg] - L[seg - 1]) || 1);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), sgn = k % 2 ? 1 : -1;   // -1: left foot, +1: right foot
    const x = a[0] + (b[0] - a[0]) * t - Math.sin(ang) * side * sgn;
    const y = (a[1] + (b[1] - a[1]) * t + Math.cos(ang) * side * sgn) * FLOOR_TILT;
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    c.save(); c.translate(x, y); c.scale(1, FLOOR_TILT); c.rotate(ang); if (sgn > 0) c.scale(1, -1); c.rotate(-0.12);   // toes point slightly outwards
    bareFoot(c, foot);
    c.restore();
  }
}
// Opacity of a whole trail; fading over bright art happens per pixel in fadeStepsOverArt().
function trailAlpha(hot, dim, special) {
  let a = Math.min(1, (hot ? 1 : 0.92) * state.settings.pathways);
  if (special && !hot) a *= 0.5;
  if (dim) a *= 0.45;
  return a;
}
// Each room's mask is opaque wherever the room has art (anything but black). Drawn with 'destination-out',
// it removes that share of every footstep pixel on top of art, so footsteps only read on the black background.
function fadeStepsOverArt() {
  const strength = state.settings.stepFade;
  if (strength <= 0) return;
  sc.save();
  sc.globalCompositeOperation = 'destination-out';
  for (const r of primaries) {
    const vis = visibility(r.id);
    if (vis === 'none') continue;
    const [sx, sy] = toScreen(r.x, r.y), sw = r.w * view.z, sh = r.h * view.z;
    if (sx > W || sy > H || sx + sw < 0 || sy + sh < 0) continue;
    const m = getImg(maskSrc(r), false);
    if (!m.ok) continue;
    sc.globalAlpha = strength * (vis === 'hint' ? 0.13 : 1);
    sc.drawImage(m.img, sx, sy, sw, sh);
  }
  sc.restore();
}

// Connections are footsteps on their own canvas; outlines and edit handles go on the canvas above.
function drawLines() {
  for (const cx of [sc, lc]) { cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); }
  const c = lc;
  const focus = editing ? null : (selectedId ?? hoverId);
  const focusGroup = focus != null ? new Set(groupOf.get(focus).map(r => r.id)) : null;

  if (editing) {
    for (const r of primaries) {
      if (visibility(r.id) === 'none') continue;
      const sel = editSel.has(r.id), hov = r.id === hoverId;
      const [sx, sy] = toScreen(r.x, r.y);
      c.strokeStyle = sel ? 'rgba(255,255,0,0.95)' : hov ? 'rgba(255,255,0,0.6)' : 'rgba(255,255,0,0.16)';
      c.lineWidth = sel ? 2 : 1; c.setLineDash(sel ? [7, 4] : []);
      roundRect(c, sx - 2, sy - 2, r.w * view.z + 4, r.h * view.z + 4, 5);
      c.stroke();
    }
  } else {
    for (const [id, alpha] of [[hoverId, 0.35], [selectedId, 0.85]]) {
      if (id == null || (id === selectedId && alpha < 0.5 && hoverId === selectedId)) continue;
      const r = roomById.get(id);
      const [sx, sy] = toScreen(r.x, r.y);
      c.strokeStyle = `rgba(255,255,0,${alpha})`;
      c.lineWidth = 1.5; c.setLineDash([]);
      roundRect(c, sx - 3, sy - 3, r.w * view.z + 6, r.h * view.z + 6, 6);
      c.stroke();
    }
  }
  c.setLineDash([]);

  const activeLink = gesture?.l || hoverEnd?.l || hoverBend?.l || hoverLink?.l || null;
  const foot = Math.max(9, Math.min(26, 6 + view.z * 0.62));
  const dotR = Math.max(1.6, Math.min(3.6, view.z * 0.09));
  for (const l of links) {
    if (!linkVisible(l)) continue;
    const hot = editing ? l === activeLink : !!(focusGroup && (focusGroup.has(l.a) || focusGroup.has(l.b)));
    const dim = !editing && focusGroup && !hot;
    const special = SPECIAL.has(l.kind);
    const { pts } = curveOf(l);
    const alpha = trailAlpha(hot, dim, special);
    if (editing && hot) {   // faint guide under the footsteps of the connection being edited
      c.strokeStyle = `rgba(${LABEL_RGB},0.35)`; c.lineWidth = 1; c.beginPath();
      pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    }
    footsteps(sc, l.fwd ? pts : pts.slice().reverse(), hot ? foot * 1.15 : foot, alpha);
    const ends = [pts[0], pts[pts.length - 1]];
    if (view.z > 3 && !editing) {
      for (const [x, y] of ends) {
        sc.fillStyle = `rgba(${LABEL_RGB},${alpha})`;
        sc.beginPath(); sc.arc(x, y, dotR, 0, Math.PI * 2); sc.fill();
      }
    }
    if (!editing) continue;
    linkBends(l).forEach(([x, y], i) => {
      const [sx, sy] = toScreen(x, y);
      const on = hoverBend && hoverBend.l === l && hoverBend.idx === i;
      c.beginPath(); c.arc(sx, sy, on ? 6.5 : 5, 0, Math.PI * 2);
      c.fillStyle = `rgb(${LABEL_RGB})`; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(10,8,6,0.9)'; c.stroke();
    });
    ['a', 'b'].forEach((side, i) => {
      const [x, y] = ends[i];
      const on = hoverEnd && hoverEnd.l === l && hoverEnd.end === side;
      const moved = !!layout.ends[l.key]?.[side];
      c.beginPath(); c.arc(x, y, on ? 7 : 5.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(10,8,6,0.85)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = moved ? 'rgba(255,255,0,0.95)' : `rgba(${LABEL_RGB},0.9)`; c.stroke();
    });
  }
  fadeStepsOverArt();
  // ghost bend point under the cursor when hovering a connection in edit mode
  if (editing && hoverLink && !gesture) {
    c.beginPath(); c.arc(hoverLink.px, hoverLink.py, 5, 0, Math.PI * 2);
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,0,0.9)'; c.stroke();
  }
  if (gesture?.type === 'marquee' && gesture.moved) {
    const x = Math.min(gesture.x0, gesture.x1), y = Math.min(gesture.y0, gesture.y1);
    c.setLineDash([5, 4]); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,0,0.85)'; c.fillStyle = 'rgba(255,255,0,0.06)';
    c.fillRect(x, y, Math.abs(gesture.x1 - gesture.x0), Math.abs(gesture.y1 - gesture.y0));
    c.strokeRect(x, y, Math.abs(gesture.x1 - gesture.x0), Math.abs(gesture.y1 - gesture.y0));
  }
  c.setLineDash([]);
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------------------------------------------------------------- labels
const labelEls = new Map();
for (const r of primaries) {
  const el = document.createElement('div');
  el.className = 'room-label';
  labelsEl.appendChild(el);
  labelEls.set(r.id, el);
}
function placeLabels() {
  const on = state.settings.labels;
  const cands = [];
  for (const r of primaries) {
    const el = labelEls.get(r.id);
    const vis = visibility(r.id);
    const sw = r.w * view.z;
    const show = on && vis !== 'none' && (sw >= 56 || r.id === selectedId || r.id === hoverId || editSel.has(r.id));
    if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
    const [sx, sy] = toScreen(r.x + r.w / 2, r.y);
    if (sx < -200 || sx > W + 200 || sy < -40 || sy > H + 60) { el.style.display = 'none'; continue; }
    const text = vis === 'hint' ? 'Unexplored' : r.name;
    const dot = vis === 'full' && !state.settings.fog && isVisited(r.id);
    const html = (dot ? '<i class="vis"></i>' : '') + esc(text);
    const sel = r.id === selectedId || editSel.has(r.id);
    const cls = 'room-label' + (sw < 110 ? ' small' : '') + (vis === 'hint' ? ' hint' : '') + (sel ? ' sel' : '');
    if (el._html !== html) { el.innerHTML = html; el._html = html; el._w = null; }
    if (el.className !== cls) { el.className = cls; el._w = null; }
    el.style.display = '';
    const top = Math.max(18, sy);
    el.style.left = sx + 'px';
    el.style.top = top + 'px';
    if (el._w == null) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
    const pri = sel ? 1e12 : r.id === hoverId ? 1e11 : r.area;
    cands.push({ el, x: sx, y: top, pri });
  }
  // greedy collision culling: bigger (and focused) rooms keep their labels
  cands.sort((a, b) => b.pri - a.pri);
  const placed = [];
  for (const c of cands) {
    const box = { x0: c.x - c.el._w / 2 - 4, x1: c.x + c.el._w / 2 + 4, y0: c.y - c.el._h, y1: c.y };
    const hit = placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
    c.el.style.visibility = hit ? 'hidden' : '';
    if (!hit) placed.push(box);
  }
}

// ---------------------------------------------------------------- markers
// Marker x/y are stored in the generated (unmoved) frame of their room, so they travel with the room
// when the layout changes.
const markerEls = new Map();
function roomAtAny(wx, wy) {
  let best = null;
  for (const r of primaries) {
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h && (!best || r.area < best.area)) best = r;
  }
  return best ? best.id : null;
}
function markerWorld(m) {
  const [dx, dy] = m.room != null ? roomOff(primaryId(m.room)) : [0, 0];
  return [m.x + dx, m.y + dy];
}
function setMarkerWorld(m, wx, wy) {
  m.room = roomAtAny(wx, wy);
  const [dx, dy] = m.room != null ? roomOff(m.room) : [0, 0];
  m.x = +(wx - dx).toFixed(3); m.y = +(wy - dy).toFixed(3);
}
function syncMarkerEls() {
  const ids = new Set(state.markers.map(m => m.id));
  for (const [id, el] of markerEls) if (!ids.has(id)) { el.remove(); markerEls.delete(id); }
  for (const m of state.markers) {
    let el = markerEls.get(m.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'marker';
      el.dataset.id = m.id;
      el.addEventListener('pointerdown', onMarkerDown);
      markersEl.appendChild(el);
      markerEls.set(m.id, el);
    }
    const t = TYPE[m.type] || TYPE.note;
    const html = icon(m.type) + (m.title ? `<span class="mlabel">${esc(m.title)}</span>` : '');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.style.setProperty('--c', t.color);
    el.title = (m.title || t.name) + (m.note ? '\n' + m.note : '');
  }
  $('#marker-count').textContent = state.markers.length ? `(${state.markers.length})` : '';
  requestRender();
}
function placeMarkers() {
  markersEl.style.setProperty('--ms', Math.max(16, Math.min(30, 12 + view.z * 0.45)).toFixed(2) + 'px');
  const showLabels = state.settings.markerLabels && view.z >= 9;
  for (const m of state.markers) {
    const el = markerEls.get(m.id);
    if (!el) continue;
    const [sx, sy] = toScreen(...markerWorld(m));
    const off = sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40;
    el.style.display = off ? 'none' : '';
    if (off) continue;
    el.style.translate = `${sx}px ${sy}px`;
    el.classList.toggle('sel', m.id === selectedMarker);
    const lab = el.querySelector('.mlabel');
    if (lab) lab.style.display = showLabels ? '' : 'none';
  }
}
function addMarker(type, wx, wy) {
  const m = { id: uid(), type, x: 0, y: 0, title: '', note: '', created: Date.now() };
  setMarkerWorld(m, wx, wy);
  state.markers.push(m);
  save(); syncMarkerEls(); refreshLists();
  openPopover(m.id, true);
  return m;
}
function deleteMarker(id) {
  state.markers = state.markers.filter(m => m.id !== id);
  if (selectedMarker === id) closePopover();
  save(); syncMarkerEls(); refreshLists();
}

let mdrag = null;
function onMarkerDown(e) {
  if (e.button !== 0 || editing) return;
  e.stopPropagation(); e.preventDefault();
  const id = e.currentTarget.dataset.id;
  const m = state.markers.find(x => x.id === id);
  mdrag = { id, el: e.currentTarget, sx: e.clientX, sy: e.clientY, moved: false, m };
  e.currentTarget.setPointerCapture(e.pointerId);
  e.currentTarget.addEventListener('pointermove', onMarkerMove);
  e.currentTarget.addEventListener('pointerup', onMarkerUp, { once: true });
  e.currentTarget.addEventListener('pointercancel', onMarkerUp, { once: true });
}
function onMarkerMove(e) {
  if (!mdrag) return;
  if (!mdrag.moved && Math.hypot(e.clientX - mdrag.sx, e.clientY - mdrag.sy) < 4) return;
  mdrag.moved = true;
  mdrag.el.classList.add('dragging');
  const rect = stage.getBoundingClientRect();
  setMarkerWorld(mdrag.m, ...toWorld(e.clientX - rect.left, e.clientY - rect.top));
  requestRender();
}
function onMarkerUp() {
  const d = mdrag; mdrag = null;
  if (!d) return;
  d.el.removeEventListener('pointermove', onMarkerMove);
  d.el.classList.remove('dragging');
  if (d.moved) { save(); refreshLists(); if (selectedMarker === d.id) positionPopover(); }
  else openPopover(d.id);
}

// ---------------------------------------------------------------- popover (marker editor)
const popover = $('#popover');
const popTypes = popover.querySelector('.pop-types');
popTypes.innerHTML = TYPES.map(t => `<button data-type="${t.id}" title="${t.name}" style="--c:${t.color}">${icon(t.id)}</button>`).join('');
function openPopover(id, focusTitle) {
  const m = state.markers.find(x => x.id === id);
  if (!m) return;
  closeCtx();
  selectedMarker = id;
  popover.hidden = false;
  $('#pop-title').value = m.title || '';
  $('#pop-note').value = m.note || '';
  const r = m.room != null ? roomById.get(m.room) : null;
  $('#pop-room').textContent = r ? r.name : 'Outside any room';
  popTypes.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.type === m.type));
  positionPopover();
  requestRender();
  if (focusTitle) setTimeout(() => $('#pop-title').focus(), 0);
}
function positionPopover() {
  const m = state.markers.find(x => x.id === selectedMarker);
  if (!m) return closePopover();
  const [sx, sy] = toScreen(...markerWorld(m));
  const pw = popover.offsetWidth, ph = popover.offsetHeight;
  let left = sx + 24, top = sy - 24;
  const maxX = W - panelWidth() - 10;
  if (left + pw > maxX) left = sx - pw - 24;
  left = Math.max(10, Math.min(left, maxX - pw));
  top = Math.max(10, Math.min(top, H - ph - 10));
  popover.style.left = left + 'px'; popover.style.top = top + 'px';
}
function closePopover() {
  popover.hidden = true;
  selectedMarker = null;
  requestRender();
}
popTypes.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const m = state.markers.find(x => x.id === selectedMarker); if (!m) return;
  m.type = b.dataset.type;
  popTypes.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  save(); syncMarkerEls(); refreshLists();
});
$('#pop-title').addEventListener('input', e => editMarker('title', e.target.value));
$('#pop-note').addEventListener('input', e => editMarker('note', e.target.value));
$('#pop-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
function editMarker(field, value) {
  const m = state.markers.find(x => x.id === selectedMarker); if (!m) return;
  m[field] = value; save(); syncMarkerEls(); refreshListsSoon();
}
$('#pop-delete').addEventListener('click', () => selectedMarker && deleteMarker(selectedMarker));
$('#pop-done').addEventListener('click', closePopover);

// ---------------------------------------------------------------- context menu
const ctx = $('#ctxmenu');
const typeButtons = TYPES.map(t => `<button data-type="${t.id}" title="${t.name}" style="--c:${t.color}">${icon(t.id)}</button>`).join('');
let ctxPoint = null, ctxActions = [];
function showMenu(clientX, clientY, html, point, actions) {
  closePopover();
  ctxPoint = point; ctxActions = actions;
  ctx.innerHTML = html;
  ctx.hidden = false;
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(clientX, innerWidth - w - 10) + 'px';
  ctx.style.top = Math.min(clientY, innerHeight - h - 10) + 'px';
}
function openCtx(clientX, clientY, wx, wy) {
  const rid = roomAt(wx, wy);
  const actions = [];
  let roomHtml = '';
  if (rid != null) {
    const r = roomById.get(rid);
    actions.push(() => toggleVisited(rid), () => { selectRoom(rid); showTab('room'); openPanel(); });
    roomHtml = `<div class="ctx-room"><button data-act="0">Mark <b>${esc(r.name)}</b> as ${isVisited(rid) ? 'not visited' : 'visited'}</button>
      <button data-act="1">Show room details</button></div>`;
  }
  showMenu(clientX, clientY, `<div class="ctx-title">Drop a marker</div><div class="ctx-types">${typeButtons}</div>${roomHtml}`, { x: wx, y: wy }, actions);
}
function openEditCtx(clientX, clientY, sx, sy) {
  const en = hitEnd(sx, sy), b = en ? null : hitBend(sx, sy), lk = en || b ? null : hitLink(sx, sy);
  const [wx, wy] = toWorld(sx, sy);
  const rid = en || b || lk ? null : roomAt(wx, wy);
  const acts = [];
  const l = en?.l || b?.l || lk?.l;
  if (en && layout.ends[en.l.key]?.[en.end]) acts.push(['Move this end back to the doorway', () => resetEnd(en.l, en.end)]);
  if (b) acts.push(['Remove this bend', () => removeBend(b.l, b.idx)]);
  if (l) {
    if (linkBends(l).length) acts.push(['Straighten connection', () => setBends(l, l.defaultBends ? [] : undefined)]);
    if (l.defaultBends && layout.bends[l.key]) acts.push(['Restore the original route', () => setBends(l, undefined)]);
  }
  if (rid != null) {
    if (!editSel.has(rid)) { editSel = new Set([rid]); updateEditInfo(); requestRender(); }
    const ids = [...editSel];
    const moved = ids.filter(id => layout.rooms[id]);
    if (moved.length) acts.push([ids.length > 1 ? `Move ${ids.length} rooms back to their original places` : `Move ${roomById.get(rid).name} back to its original place`, () => resetRooms(ids)]);
  }
  if (!acts.length) return;
  showMenu(clientX, clientY, `<div class="ctx-title">Layout</div><div class="ctx-actions">${acts.map((a, i) => `<button data-act="${i}">${esc(a[0])}</button>`).join('')}</div>`, null, acts.map(a => a[1]));
}
function closeCtx() { ctx.hidden = true; ctxPoint = null; ctxActions = []; }
ctx.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.type && ctxPoint) { const p = ctxPoint; closeCtx(); addMarker(b.dataset.type, p.x, p.y); return; }
  const f = ctxActions[+b.dataset.act];
  closeCtx();
  if (f) f();
});

// ---------------------------------------------------------------- tools & edit mode
let tool = 'pan';
const toolsBox = $('#marker-tools');
toolsBox.innerHTML = TYPES.map((t, i) => `<button class="tool" data-tool="${t.id}" title="${t.name}${i < 9 ? ' (' + (i + 1) + ')' : ''}" style="--c:${t.color}">${icon(t.id)}${i < 9 ? `<span class="key">${i + 1}</span>` : ''}</button>`).join('');
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('.tool'); if (!b) return;
  if (b.id === 'edit-toggle') return setEditing(!editing);
  setTool(b.dataset.tool === tool && b.dataset.tool !== 'pan' ? 'pan' : b.dataset.tool);
});
function refreshToolButtons() {
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.classList.toggle('active', !editing && b.dataset.tool === tool));
  $('#edit-toggle').classList.toggle('active', editing);
}
function setTool(t) {
  if (t !== 'pan' && editing) setEditing(false);
  tool = t;
  refreshToolButtons();
  stage.classList.toggle('placing', t !== 'pan');
  const hint = $('#hint');
  if (t === 'pan') hint.hidden = true;
  else { hint.hidden = false; hint.innerHTML = `Click the map to place a <b style="color:${TYPE[t].color}">${TYPE[t].name}</b> marker &nbsp;·&nbsp; <span class="muted">Esc to stop</span>`; }
}
function setEditing(on) {
  editing = on;
  if (on) { setTool('pan'); closePopover(); closeCtx(); }
  else { editSel = new Set(); hoverLink = hoverBend = hoverEnd = null; }
  document.body.classList.toggle('editing', on);
  stage.classList.toggle('editing', on);
  stage.classList.remove('over-room', 'over-link', 'over-handle');
  $('#editbar').hidden = !on;
  refreshToolButtons(); updateEditInfo(); updateUndoButtons(); setLayoutStatus();
  requestRender();
}
function updateEditInfo() {
  const n = editSel.size;
  $('#edit-info').textContent = n
    ? `${n} room${n > 1 ? 's' : ''} selected — drag to move, arrow keys to nudge (Shift for bigger steps)`
    : 'Drag rooms · Shift-drag to select several · Pull a path to bend it · Drag its rings to move the ends · Right-click for more';
}
function setBends(l, arr) {
  const before = snap();
  if (arr === undefined) delete layout.bends[l.key]; else layout.bends[l.key] = arr;
  commit(before); requestRender();
}
function removeBend(l, idx) {
  const arr = linkBends(l).map(p => [p[0], p[1]]);
  arr.splice(idx, 1);
  setBends(l, arr.length || l.defaultBends ? arr : undefined);
}
function resetEnd(l, end) {
  const before = snap();
  const e = { ...layout.ends[l.key] };
  delete e[end];
  if (e.a || e.b) layout.ends[l.key] = e; else delete layout.ends[l.key];
  applyLayout(); commit(before);
}
function resetRooms(ids) {
  const before = snap();
  for (const id of ids) delete layout.rooms[id];
  applyLayout(); commit(before);
}
function nudge(dx, dy) {
  const before = snap();
  for (const id of editSel) { const [ox, oy] = roomOff(id); setOff(id, ox + dx, oy + dy); }
  for (const l of links) {
    if (editSel.has(l.ga) && editSel.has(l.gb) && layout.bends[l.key]) layout.bends[l.key] = layout.bends[l.key].map(([x, y]) => [round2(x + dx), round2(y + dy)]);
  }
  applyLayout(); commit(before);
}

// ---------------------------------------------------------------- picking
function roomAt(wx, wy) {
  let best = null;
  for (const r of primaries) {
    if (wx < r.x || wx > r.x + r.w || wy < r.y || wy > r.y + r.h) continue;
    if (visibility(r.id) === 'none') continue;
    if (!best || r.area < best.area) best = r;
  }
  return best ? best.id : null;
}
function hitEnd(sx, sy) {
  let best = null, bd = 9;
  for (const l of links) {
    if (!linkVisible(l)) continue;
    for (const [end, p] of [['a', l.pa], ['b', l.pb]]) {
      const [px, py] = toScreen(p.x, p.y), d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = { l, end }; }
    }
  }
  return best;
}
function hitBend(sx, sy) {
  let best = null, bd = 9;
  for (const l of links) {
    if (!linkVisible(l)) continue;
    linkBends(l).forEach(([x, y], idx) => {
      const [px, py] = toScreen(x, y), d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = { l, idx }; }
    });
  }
  return best;
}
function hitLink(sx, sy) {
  let best = null, bd = 7;
  for (const l of links) {
    if (!linkVisible(l)) continue;
    const { pts, seg } = curveOf(l);
    for (let i = 1; i < pts.length; i++) {
      const [d, px, py] = segDist([sx, sy], pts[i - 1], pts[i]);
      if (d < bd) { bd = d; best = { l, seg: seg[i], px, py }; }
    }
  }
  return best;
}
function selectRoom(id) {
  selectedId = id;
  renderRoomPanel();
  requestRender();
}

// ---------------------------------------------------------------- pointer handling on the stage
const pointers = new Map();
let gesture = null;
const localXY = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function editPointerDown(e, sx, sy) {
  const base = { sx: e.clientX, sy: e.clientY, moved: false, before: snap() };
  const en = hitEnd(sx, sy);
  if (en) return { ...base, type: 'end', l: en.l, end: en.end };
  const b = hitBend(sx, sy);
  if (b) return { ...base, type: 'bend', l: b.l, idx: b.idx };
  const lk = hitLink(sx, sy);
  if (lk) return { ...base, type: 'linkpress', l: lk.l, seg: lk.seg };
  const [wx, wy] = toWorld(sx, sy);
  const rid = roomAt(wx, wy);
  if (rid != null) {
    if (e.shiftKey) {
      editSel.has(rid) ? editSel.delete(rid) : editSel.add(rid);
      updateEditInfo(); requestRender();
      return { ...base, type: 'none' };
    }
    if (!editSel.has(rid)) editSel = new Set([rid]);
    updateEditInfo();
    const ids = [...editSel];
    const orig = Object.fromEntries(ids.map(id => [id, [...roomOff(id)]]));
    // bends of connections between two moving rooms travel with them
    const inner = links.filter(l => editSel.has(l.ga) && editSel.has(l.gb) && layout.bends[l.key]).map(l => [l.key, layout.bends[l.key].map(p => [p[0], p[1]])]);
    return { ...base, type: 'rooms', ids, orig, inner, wx, wy, rid };
  }
  if (e.shiftKey) return { ...base, type: 'marquee', x0: sx, y0: sy, x1: sx, y1: sy, keep: new Set(editSel) };
  return null;
}
function editPointerMove(e, sx, sy) {
  const g = gesture;
  const far = Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 3;
  if (g.type === 'none') return;
  if (!g.moved && !far) return;
  const [wx, wy] = toWorld(sx, sy);
  if (g.type === 'linkpress') {
    const arr = linkBends(g.l).map(p => [p[0], p[1]]);
    arr.splice(g.seg, 0, [round2(wx), round2(wy)]);
    layout.bends[g.l.key] = arr;
    gesture = { ...g, type: 'bend', idx: g.seg, moved: true };
  } else if (g.type === 'end') {
    // a connection end stays inside its own room
    const gid = g.end === 'a' ? g.l.ga : g.l.gb, r = roomById.get(gid), [ox, oy] = roomOff(gid);
    const x = Math.max(r.x, Math.min(r.x + r.w, wx)), y = Math.max(r.y, Math.min(r.y + r.h, wy));
    layout.ends[g.l.key] = { ...layout.ends[g.l.key], [g.end]: [round2(x - ox), round2(y - oy)] };
    g.moved = true;
    applyLayout();
  } else if (g.type === 'bend') {
    if (!layout.bends[g.l.key]) layout.bends[g.l.key] = linkBends(g.l).map(p => [p[0], p[1]]);
    layout.bends[g.l.key][g.idx] = [round2(wx), round2(wy)];
    g.moved = true;
  } else if (g.type === 'rooms') {
    g.moved = true;
    let dx = wx - g.wx, dy = wy - g.wy;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    for (const id of g.ids) setOff(id, g.orig[id][0] + dx, g.orig[id][1] + dy);
    for (const [k, pts] of g.inner) layout.bends[k] = pts.map(([x, y]) => [round2(x + dx), round2(y + dy)]);
    applyLayout();
    stage.classList.add('dragging');
  } else if (g.type === 'marquee') {
    g.moved = true; g.x1 = sx; g.y1 = sy;
    const [ax, ay] = toWorld(Math.min(g.x0, sx), Math.min(g.y0, sy)), [bx, by] = toWorld(Math.max(g.x0, sx), Math.max(g.y0, sy));
    editSel = new Set(g.keep);
    for (const r of primaries) if (visibility(r.id) !== 'none' && r.x < bx && r.x + r.w > ax && r.y < by && r.y + r.h > ay) editSel.add(r.id);
    updateEditInfo();
  }
  requestRender();
}
function editPointerUp(g) {
  if (g.type === 'bend' || g.type === 'rooms' || g.type === 'end') { if (g.moved) commit(g.before); }
  if (g.type === 'rooms' && !g.moved) { selectRoom(g.rid); }
  requestRender();
}

stage.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  closeCtx();
  cancelAnimationFrame(anim);
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (gesture && editing && gesture.type !== 'pan' && gesture.type !== 'pinch') editPointerUp(gesture);
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z, moved: true };
    return;
  }
  if (pointers.size > 2) return;
  const [sx, sy] = localXY(e);
  if (editing && e.button === 0) { const g = editPointerDown(e, sx, sy); if (g) { gesture = g; requestRender(); return; } }
  gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, moved: false, cx: view.cx, cy: view.cy };
});
stage.addEventListener('pointermove', e => {
  const [sx, sy] = localXY(e);
  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture?.type === 'pan') {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (!gesture.moved && Math.hypot(dx, dy) > 4) { gesture.moved = true; stage.classList.add('dragging'); }
      if (gesture.moved) { view.cx = gesture.cx - dx / view.z; view.cy = gesture.cy - dy / view.z; changed(); }
    } else if (gesture?.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = stage.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (gesture.z * d / gesture.d) / view.z);
    } else if (gesture && editing) editPointerMove(e, sx, sy);
    return;
  }
  if (editing) {
    const he = hitEnd(sx, sy), hb = he ? null : hitBend(sx, sy), hl = he || hb ? null : hitLink(sx, sy);
    const id = he || hb || hl ? null : roomAt(...toWorld(sx, sy));
    hoverEnd = he; hoverBend = hb; hoverLink = hl; hoverId = id;
    stage.classList.toggle('over-handle', !!(hb || he));
    stage.classList.toggle('over-link', !!hl);
    stage.classList.toggle('over-room', id != null);
    requestRender();
    return;
  }
  const id = roomAt(...toWorld(sx, sy));
  if (id !== hoverId) { hoverId = id; stage.classList.toggle('over-room', id != null && tool === 'pan'); requestRender(); }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  const g = gesture;
  if (pointers.size === 0) {
    gesture = null;
    stage.classList.remove('dragging');
    if (g?.type === 'pan' && !g.moved && e.type === 'pointerup') onClick(e);
    else if (g && editing && g.type !== 'pan' && g.type !== 'pinch') editPointerUp(g);
  } else if (pointers.size === 1) {
    const [p] = [...pointers.values()];
    gesture = { type: 'pan', sx: p.x, sy: p.y, moved: true, cx: view.cx, cy: view.cy };
  }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', () => {
  if (pointers.size) return;
  if (hoverId != null || hoverLink || hoverBend || hoverEnd) { hoverId = null; hoverLink = hoverBend = hoverEnd = null; requestRender(); }
});
function onClick(e) {
  const [wx, wy] = toWorld(...localXY(e));
  if (editing) { if (editSel.size) { editSel = new Set(); updateEditInfo(); requestRender(); } return; }
  if (tool !== 'pan') { addMarker(tool, wx, wy); return; }
  if (!popover.hidden) { closePopover(); return; }
  const id = roomAt(wx, wy);
  selectRoom(id);
  if (id != null) { showTab('room'); openPanel(); }
}
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [sx, sy] = localXY(e);
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
  zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
}, { passive: false });
stage.addEventListener('dblclick', e => {
  const [sx, sy] = localXY(e);
  if (editing) {
    const en = hitEnd(sx, sy);
    if (en) { if (layout.ends[en.l.key]?.[en.end]) resetEnd(en.l, en.end); return; }
    const b = hitBend(sx, sy);
    if (b) { removeBend(b.l, b.idx); return; }
  } else if (tool !== 'pan') return;
  const [wx, wy] = toWorld(sx, sy);
  const z = clampZ(view.z * 2.2);
  flyTo({ cx: wx - (sx - W / 2) / z, cy: wy - (sy - H / 2) / z, z }, 350);
});
stage.addEventListener('contextmenu', e => {
  e.preventDefault();
  const [sx, sy] = localXY(e);
  if (editing) openEditCtx(e.clientX, e.clientY, sx, sy);
  else openCtx(e.clientX, e.clientY, ...toWorld(sx, sy));
});
document.addEventListener('pointerdown', e => {
  if (!ctx.hidden && !ctx.contains(e.target)) closeCtx();
}, true);

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (typing) document.activeElement.blur();
    if (!ctx.hidden) closeCtx();
    else if (!popover.hidden) closePopover();
    else if (tool !== 'pan') setTool('pan');
    else if (editing && editSel.size) { editSel = new Set(); updateEditInfo(); requestRender(); }
    else if (editing) setEditing(false);
    else selectRoom(null);
    return;
  }
  if (typing) return;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && /^[zZyY]$/.test(e.key)) {
    e.preventDefault();
    (e.key.toLowerCase() === 'y' || e.shiftKey) ? redo() : undo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = 90;
  if (editing && editSel.size && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const d = e.shiftKey ? 5 : 0.5;
    const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    nudge(dx, dy);
    return;
  }
  if (e.key === 'e' || e.key === 'E') setEditing(!editing);
  else if (/^[1-9]$/.test(e.key) && TYPES[+e.key - 1]) { const t = TYPES[+e.key - 1].id; setTool(tool === t ? 'pan' : t); }
  else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.4);
  else if (e.key === '-' || e.key === '_') zoomAt(W / 2, H / 2, 1 / 1.4);
  else if (e.key === 'f' || e.key === 'F') fitAll();
  else if (e.key === 'p' || e.key === 'P') togglePanel();
  else if ((e.key === 'v' || e.key === 'V') && (selectedId ?? hoverId) != null) toggleVisited(selectedId ?? hoverId);
  else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  else if (e.key === 'ArrowLeft' || e.key === 'a') { view.cx -= step / view.z; changed(); }
  else if (e.key === 'ArrowRight' || e.key === 'd') { view.cx += step / view.z; changed(); }
  else if (e.key === 'ArrowUp' || e.key === 'w') { view.cy -= step / view.z; changed(); }
  else if (e.key === 'ArrowDown' || e.key === 's') { view.cy += step / view.z; changed(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarker) deleteMarker(selectedMarker);
});

// ---------------------------------------------------------------- panel
const panel = $('#panel');
function openPanel() { if (panel.classList.contains('collapsed')) togglePanel(); }
function togglePanel() { panel.classList.toggle('collapsed'); requestRender(); }
$('#panel-toggle').addEventListener('click', togglePanel);
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

function linkTag(l, fromGroup) {
  let tag = KIND_LABEL[l.kind] || 'passage';
  if (l.oneway) tag += fromGroup.has(l.a) ? ' · one-way out' : ' · one-way in';
  return tag;
}
function renderRoomPanel() {
  renderRoomIndex();
  const id = selectedId;
  $('#room-empty').hidden = id != null;
  $('#room-info').hidden = id == null;
  if (id == null) return;
  const group = groupOf.get(id);
  const gids = new Set(group.map(r => r.id));
  const r = group[0];
  $('#room-name').textContent = r.name;
  $('#room-visited').checked = isVisited(id);

  const seen = new Map();
  for (const l of links) {
    if (!gids.has(l.a) && !gids.has(l.b)) continue;
    const other = gids.has(l.a) ? l.b : l.a;
    const key = primaryId(other) + ':' + l.kind;
    if (seen.has(key) && l.kind !== 'mystery') continue;
    seen.set(key, l);
  }
  const items = [...seen.values()].map(l => {
    const other = gids.has(l.a) ? l.b : l.a;
    const o = roomById.get(other);
    const via = group.length > 1 ? group.find(g => g.id === (gids.has(l.a) ? l.a : l.b)) : null;
    const hidden = state.settings.fog && visibility(primaryId(other)) === 'none';
    return { l, o, via, hidden, sort: (SPECIAL.has(l.kind) ? 1 : 0) };
  }).sort((a, b) => a.sort - b.sort || a.o.name.localeCompare(b.o.name));
  $('#room-links').innerHTML = items.map(({ l, o, via, hidden }) => `
    <li data-room="${o.id}" title="${esc(l.note || '')}">
      <span class="name">${hidden ? '<i class="muted">Unexplored</i>' : esc(o.name)}${via && via.id !== r.id ? ` <small class="muted">from ${esc(via.name)}</small>` : ''}</span>
      ${isVisited(primaryId(o.id)) ? '<span class="vis" title="Visited"></span>' : ''}
      <span class="tag">${esc(linkTag(l, gids))}</span>
    </li>`).join('') || '<li class="muted">No known exits.</li>';

  $('#room-variants').innerHTML = group.length > 1 ? `<div class="variant"><p class="muted">In the game this place is split into ${group.length} scenes that share the same art:</p>
    ${group.map(g => `<p>• ${esc(g.name)} <small class="muted">(${esc(g.scene)})</small></p>`).join('')}</div>` : '';

  $('#room-markers').innerHTML = state.markers.filter(m => m.room === id).map(markerLi).join('');
  $('#room-notes').value = state.notes[id] || '';
}
$('#room-links').addEventListener('click', e => {
  const li = e.target.closest('li[data-room]'); if (!li) return;
  const id = primaryId(+li.dataset.room);
  selectRoom(id); flyToRoom(id);
});
// The About tab lists every room in plain HTML (tools/room_index.py) so search engines can read the names.
// "Hide unvisited" hides the unexplored ones there too.
function renderRoomIndex() {
  for (const li of document.querySelectorAll('.roomindex li')) {
    const r = roomById.get(+li.dataset.room);
    li.hidden = !r || visibility(primaryId(r.id)) === 'none';
  }
  for (const g of document.querySelectorAll('#tab-about .region')) g.hidden = !g.querySelector('li:not([hidden])');
}
$('#tab-about').addEventListener('click', e => {
  const li = e.target.closest('.roomindex li'); if (!li) return;
  const id = primaryId(+li.dataset.room);
  selectRoom(id); showTab('room'); flyToRoom(id);
});
$('#room-visited').addEventListener('change', e => { if (selectedId != null) setVisited(selectedId, e.target.checked); });
$('#room-notes').addEventListener('input', e => {
  if (selectedId == null) return;
  if (e.target.value) state.notes[selectedId] = e.target.value; else delete state.notes[selectedId];
  save();
});
function setVisited(id, v) {
  const pid = primaryId(id);
  if (v) state.visited[pid] = true; else delete state.visited[pid];
  save(); renderRoomPanel(); requestRender();
}
function toggleVisited(id) {
  const pid = primaryId(id);
  setVisited(pid, !isVisited(pid));
  toast(`${roomById.get(pid).name}: ${isVisited(pid) ? 'visited' : 'not visited'}`);
}

// marker lists
const typeFilter = new Set(TYPES.map(t => t.id));
$('#type-filter').innerHTML = TYPES.map(t => `<button class="chip on" data-type="${t.id}" title="${t.name}" style="--c:${t.color}">${icon(t.id)}</button>`).join('');
$('#type-filter').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const t = b.dataset.type;
  if (e.altKey || e.shiftKey) { typeFilter.clear(); typeFilter.add(t); }
  else typeFilter.has(t) ? typeFilter.delete(t) : typeFilter.add(t);
  document.querySelectorAll('#type-filter .chip').forEach(c => c.classList.toggle('on', typeFilter.has(c.dataset.type)));
  refreshLists();
});
$('#marker-filter').addEventListener('input', refreshLists);
function markerLi(m) {
  const t = TYPE[m.type] || TYPE.note;
  const r = m.room != null ? roomById.get(m.room) : null;
  return `<li data-marker="${m.id}"><span class="mi" style="--c:${t.color}">${icon(m.type)}</span>
    <span class="mt"><b>${esc(m.title || t.name)}</b><small>${esc(r ? r.name : 'Outside any room')}${m.note ? ' — ' + esc(m.note) : ''}</small></span></li>`;
}
function refreshLists() {
  const q = $('#marker-filter').value.trim().toLowerCase();
  const list = state.markers.filter(m => typeFilter.has(m.type)).filter(m => {
    if (!q) return true;
    const r = m.room != null ? roomById.get(m.room).name : '';
    return [m.title, m.note, r, TYPE[m.type]?.name].join(' ').toLowerCase().includes(q);
  }).sort((a, b) => {
    const ra = a.room != null ? roomById.get(a.room).name : '~', rb = b.room != null ? roomById.get(b.room).name : '~';
    return ra.localeCompare(rb) || (a.title || '').localeCompare(b.title || '');
  });
  $('#marker-list').innerHTML = list.map(markerLi).join('');
  $('#markers-empty').hidden = state.markers.length > 0;
  if (selectedId != null) $('#room-markers').innerHTML = state.markers.filter(m => m.room === selectedId).map(markerLi).join('');
}
let listTimer = 0;
function refreshListsSoon() { clearTimeout(listTimer); listTimer = setTimeout(refreshLists, 200); }
for (const sel of ['#marker-list', '#room-markers']) {
  $(sel).addEventListener('click', e => {
    const li = e.target.closest('li[data-marker]'); if (!li) return;
    const m = state.markers.find(x => x.id === li.dataset.marker); if (!m) return;
    flyToPoint(...markerWorld(m));
    setTimeout(() => openPopover(m.id), 560);
  });
}

// ---------------------------------------------------------------- search
const searchEl = $('#search'), resultsEl = $('#search-results');
let results = [], activeResult = 0;
searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { resultsEl.hidden = true; return; }
  const rs = rooms.filter(r => r.name.toLowerCase().includes(q) || r.scene.toLowerCase().includes(q))
    .filter(r => !state.settings.fog || visibility(primaryId(r.id)) !== 'none')
    .map(r => ({ kind: 'room', id: r.id, label: r.name, sub: r.scene }));
  const ms = state.markers.filter(m => (m.title + ' ' + m.note).toLowerCase().includes(q))
    .map(m => ({ kind: 'marker', id: m.id, label: m.title || TYPE[m.type].name, sub: 'marker' }));
  results = [...rs, ...ms].slice(0, 14);
  activeResult = 0;
  drawResults();
});
function drawResults() {
  resultsEl.hidden = results.length === 0;
  resultsEl.innerHTML = results.map((r, i) => `<li data-i="${i}" class="${i === activeResult ? 'active' : ''}">${esc(r.label)}<small>${esc(r.sub)}</small></li>`).join('');
}
function pickResult(i) {
  const r = results[i]; if (!r) return;
  resultsEl.hidden = true; searchEl.blur();
  if (r.kind === 'room') { const id = primaryId(r.id); selectRoom(id); showTab('room'); openPanel(); flyToRoom(id); }
  else { const m = state.markers.find(x => x.id === r.id); flyToPoint(...markerWorld(m)); setTimeout(() => openPopover(m.id), 560); }
}
searchEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { activeResult = Math.min(results.length - 1, activeResult + 1); drawResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { activeResult = Math.max(0, activeResult - 1); drawResults(); e.preventDefault(); }
  else if (e.key === 'Enter') pickResult(activeResult);
});
resultsEl.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pickResult(+li.dataset.i); } });
searchEl.addEventListener('blur', () => setTimeout(() => { resultsEl.hidden = true; }, 150));

// ---------------------------------------------------------------- settings
function applySettings() {
  const s = state.settings;
  document.documentElement.style.setProperty('--bright', s.brightness);
  $('#brightness').value = s.brightness;
  $('#brightness-out').textContent = (+s.brightness).toFixed(2);
  $('#step-fade').value = s.stepFade;
  $('#step-fade-out').textContent = Math.round(s.stepFade * 100) + '%';
  $('#pathways').value = s.pathways;
  $('#pathways-out').textContent = Math.round(s.pathways * 100) + '%';
  $('#opt-labels').checked = s.labels;
  $('#opt-marker-labels').checked = s.markerLabels;
  $('#opt-fog').checked = s.fog;
  $('#fog-note').hidden = !s.fog;
  requestRender();
}
$('#brightness').addEventListener('input', e => { state.settings.brightness = +e.target.value; applySettings(); save(); });
$('#step-fade').addEventListener('input', e => { state.settings.stepFade = +e.target.value; applySettings(); save(); });
$('#pathways').addEventListener('input', e => { state.settings.pathways = +e.target.value; applySettings(); save(); });
for (const [id, key] of [['#opt-labels', 'labels'], ['#opt-marker-labels', 'markerLabels'], ['#opt-fog', 'fog']]) {
  $(id).addEventListener('change', e => {
    state.settings[key] = e.target.checked; applySettings(); save();
    if (key === 'fog') { renderRoomPanel(); if (e.target.checked && !Object.keys(state.visited).length) toast('Mark rooms as visited (V or right-click) to reveal them.'); }
  });
}
$('#zoom-in').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.5));
$('#zoom-out').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.5));
$('#zoom-fit').addEventListener('click', () => fitAll());

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// export / import of markers, visited rooms and notes
$('#export').addEventListener('click', () => {
  const data = { app: 'the-longing-map', version: 1, exported: new Date().toISOString(), markersBase: LAYOUT_BASE, markers: state.markers, visited: state.visited, notes: state.notes };
  download(`longing-map-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.markers)) throw new Error('No markers in file');
    const hasData = state.markers.length || Object.keys(state.notes).length;
    if (hasData && !confirm(`Merge ${d.markers.length} markers from “${f.name}” into your current map?\n\nMarkers with the same id are replaced; visited rooms and notes are combined.`)) return;
    const incoming = d.markers.filter(validMarker);
    shiftToBase(incoming, d.markersBase || null);
    const byId = new Map(state.markers.map(m => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    state.markers = [...byId.values()];
    Object.assign(state.visited, d.visited || {});
    for (const [k, v] of Object.entries(d.notes || {})) if (v) state.notes[k] = v;
    save(); syncMarkerEls(); refreshLists(); renderRoomPanel();
    toast(`Imported ${d.markers.length} markers.`);
  } catch (err) { alert('Could not import that file: ' + err.message); }
});
$('#reset').addEventListener('click', () => {
  if (!confirm('Delete all markers, visited rooms and notes? This cannot be undone (export a backup first if unsure).')) return;
  state.markers = []; state.visited = {}; state.notes = {};
  closePopover(); save(); syncMarkerEls(); refreshLists(); renderRoomPanel();
});

// layout export / import / reset
$('#edit-open').addEventListener('click', () => setEditing(true));
$('#edit-done').addEventListener('click', () => setEditing(false));
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#layout-reset').addEventListener('click', () => {
  if (isDefaultLayout()) return toast('The layout is already the original one.');
  if (!confirm('Return every room and connection to the default layout?\n\nYou can undo this in edit mode.')) return;
  const before = snap();
  layout.rooms = {}; layout.bends = {}; layout.ends = {};
  applyLayout(); commit(before);
});
// same format tools/serve.py writes, so the file can replace data/layout.js
document.querySelectorAll('.layout-export').forEach(b => b.addEventListener('click', () => {
  if (isDefaultLayout()) return toast('The layout is still the default one.');
  const head = "// Room layout made in the map's edit mode. Written by tools/serve.py, or replace it with an exported layout.js.\n";
  download('layout.js', head + 'window.LONGING_LAYOUT = ' + JSON.stringify(layout, null, 1) + ';\n', 'text/javascript');
}));

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------------------------------------------------------------- boot
load();
migrateMarkers();
loadLayout();
window.addEventListener('resize', resize);
resize();
if (state.view && isFinite(state.view.z)) view = { ...state.view };
else {
  // first visit: frame what can be seen (with "Hide unvisited" on, that is Home and the King's room)
  const shown = primaries.filter(r => !OUTLIERS.has(r.id) && visibility(r.id) !== 'none');
  view = fitView(shown.length ? shown : primaries.filter(r => !OUTLIERS.has(r.id)), 120);
}
view.z = clampZ(view.z);
applySettings();
syncMarkerEls();
refreshLists();
renderRoomPanel();
updateUndoButtons();
setLayoutStatus();
probeLayoutServer();
if (innerWidth <= 760) panel.classList.add('collapsed');
for (const r of primaries) { getImg(thumbSrc(r), false); getImg(maskSrc(r), false); }
requestRender();
})();
