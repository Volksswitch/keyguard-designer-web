// stl-stats.mjs — STL geometric stats computation (mirrors
// keyguard-designer-web's upstream .scad project's scripts/compute_stl_stats.py
// so that both pipelines produce directly comparable numbers).
//
// Used by the golden-STL regression gate (tests/geometry.spec.mjs) to detect
// cases where Manifold silently produces broken geometry that has the right
// volume/bbox but wrong surface area / part count — the TC57 membrane class
// of failure that pure admesh "disconnected==0" gating misses.
//
// Volume:        sum of (1/6) v1 . (v2 x v3) over all triangles.
// Surface area:  sum of 0.5 * |cross(v2-v1, v3-v1)|.
// Parts:         union-find over triangles joined by shared edges (vertex
//                positions quantised to 1e-4 mm so float noise doesn't break
//                adjacency).
// Bbox:          per-axis min/max of all vertices.
// Facets:        triangle count from the STL header.

const QUANT = 10000;

function quantKey(x, y, z) {
  return `${Math.round(x * QUANT)},${Math.round(y * QUANT)},${Math.round(z * QUANT)}`;
}

// Yields triangles from an STL Buffer/Uint8Array. Handles both binary
// (84-byte header + 50 bytes/triangle) and ASCII formats. Binary detection
// is by length match (84 + 50*n == total), not the "solid" prefix —
// some binary writers also start with "solid ".
function* readTriangles(bytes) {
  const len = bytes.length;
  let isAscii = false;
  if (len >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === 'solid') {
    if (len >= 84) {
      const dv0 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const n = dv0.getUint32(80, true);
      isAscii = (84 + 50 * n !== len);
    } else {
      isAscii = true;
    }
  }

  if (isAscii) {
    const text = new TextDecoder().decode(bytes);
    let v = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('vertex')) {
        const p = line.split(/\s+/);
        v.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
        if (v.length === 3) { yield v; v = []; }
      }
    }
    return;
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  let off = 84;
  for (let i = 0; i < n; i++) {
    // Skip normal (12 bytes), read 9 floats for v1..v3, skip 2-byte attr.
    const o = off + 12;
    yield [
      [dv.getFloat32(o,       true), dv.getFloat32(o + 4,  true), dv.getFloat32(o + 8,  true)],
      [dv.getFloat32(o + 12,  true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true)],
      [dv.getFloat32(o + 24,  true), dv.getFloat32(o + 28, true), dv.getFloat32(o + 32, true)],
    ];
    off += 50;
  }
}

export function computeStlStats(bytes) {
  let volume = 0, area = 0;
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity;
  let bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  let facets = 0;

  // Union-find over triangle indices for connected-components ("parts").
  const parent = [];
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const edgeOwner = new Map();

  for (const [v1, v2, v3] of readTriangles(bytes)) {
    const idx = facets++;
    parent.push(idx);

    volume += (v1[0] * (v2[1] * v3[2] - v2[2] * v3[1])
             + v1[1] * (v2[2] * v3[0] - v2[0] * v3[2])
             + v1[2] * (v2[0] * v3[1] - v2[1] * v3[0])) / 6;

    const a1 = v2[0] - v1[0], a2 = v2[1] - v1[1], a3 = v2[2] - v1[2];
    const b1 = v3[0] - v1[0], b2 = v3[1] - v1[1], b3 = v3[2] - v1[2];
    const c1 = a2 * b3 - a3 * b2;
    const c2 = a3 * b1 - a1 * b3;
    const c3 = a1 * b2 - a2 * b1;
    area += 0.5 * Math.sqrt(c1 * c1 + c2 * c2 + c3 * c3);

    for (const v of [v1, v2, v3]) {
      if (v[0] < bx0) bx0 = v[0];  if (v[1] < by0) by0 = v[1];  if (v[2] < bz0) bz0 = v[2];
      if (v[0] > bx1) bx1 = v[0];  if (v[1] > by1) by1 = v[1];  if (v[2] > bz1) bz1 = v[2];
    }

    const k1 = quantKey(v1[0], v1[1], v1[2]);
    const k2 = quantKey(v2[0], v2[1], v2[2]);
    const k3 = quantKey(v3[0], v3[1], v3[2]);
    for (const [ea, eb] of [[k1, k2], [k2, k3], [k3, k1]]) {
      const edge = ea < eb ? `${ea}|${eb}` : `${eb}|${ea}`;
      const other = edgeOwner.get(edge);
      if (other === undefined) edgeOwner.set(edge, idx);
      else union(idx, other);
    }
  }

  if (facets === 0) {
    return { volume_mm3: 0, surface_area_mm2: 0,
             bbox: [0, 0, 0, 0, 0, 0], parts: 0, facets: 0 };
  }
  const roots = new Set();
  for (let i = 0; i < facets; i++) roots.add(find(i));

  const r4 = (x) => Math.round(x * 10000) / 10000;
  return {
    volume_mm3:       r4(Math.abs(volume)),
    surface_area_mm2: r4(area),
    bbox:             [r4(bx0), r4(by0), r4(bz0), r4(bx1), r4(by1), r4(bz1)],
    parts:            roots.size,
    facets,
  };
}

// Verdict against a manifest entry. Tolerances calibrated against a small
// known-clean corpus (TC1, TC2, TC6, TC17, TC50, TC57 with fudge=0.05
// alignment) to absorb expected CGAL-vs-Manifold triangulation noise.
//
// Observed worst-case clean deltas: ~1.3% surface_area (TC1 — chamfered
// raised-tab geometry tessellates differently), ~0.4% volume (TC50 —
// rounded edges), <0.01 mm bbox. Tolerances set comfortably above those
// numbers but below what a TC57-class membrane failure produces: a
// membrane in a cavity adds ~5%+ surface area, often splits the solid
// into multiple parts, and shifts the bbox by more than tessellation
// noise ever does. Parts is exact-match — the strongest single signal,
// since a clean STL can never accidentally split a solid.
export const DEFAULT_TOLERANCES = Object.freeze({
  volumeFrac:    0.01,    // 1%   — volume is largely tessellation-invariant
  areaFrac:      0.025,   // 2.5% — covers chamfer/slope tessellation noise
  bboxAbsMm:     0.05,
  partsExact:    true,    // primary TC57-class membrane signal
});

export function compareStats(observed, expected, tol = DEFAULT_TOLERANCES) {
  const failures = [];
  const safe = (x, fallback) => (typeof x === 'number' && isFinite(x) ? x : fallback);

  const ev = safe(expected.volume_mm3, 0);
  if (ev > 0) {
    const dv = Math.abs(observed.volume_mm3 - ev) / ev;
    if (dv > tol.volumeFrac) {
      failures.push(`volume Δ ${(dv * 100).toFixed(3)}% > ${(tol.volumeFrac * 100).toFixed(2)}% ` +
                    `(observed=${observed.volume_mm3}, expected=${ev})`);
    }
  }

  const ea = safe(expected.surface_area_mm2, 0);
  if (ea > 0) {
    const da = Math.abs(observed.surface_area_mm2 - ea) / ea;
    if (da > tol.areaFrac) {
      failures.push(`surface_area Δ ${(da * 100).toFixed(3)}% > ${(tol.areaFrac * 100).toFixed(2)}% ` +
                    `(observed=${observed.surface_area_mm2}, expected=${ea})`);
    }
  }

  for (let i = 0; i < 6; i++) {
    const eb = safe(expected.bbox?.[i], 0);
    const db = Math.abs(observed.bbox[i] - eb);
    if (db > tol.bboxAbsMm) {
      failures.push(`bbox[${i}] Δ ${db.toFixed(4)}mm > ${tol.bboxAbsMm}mm ` +
                    `(observed=${observed.bbox[i]}, expected=${eb})`);
    }
  }

  if (tol.partsExact && observed.parts !== expected.parts) {
    failures.push(`parts ${observed.parts} ≠ expected ${expected.parts}`);
  }

  return { ok: failures.length === 0, failures };
}
