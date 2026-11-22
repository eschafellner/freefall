import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKER_GAP, MARKER_PRIORITY, MARKER_RELAX_FRAMES, MarkerLayout, markerSize } from '../src/rendering/mission/MarkerLayout.ts';
import type { MarkerPlacement, MarkerRequest } from '../src/rendering/mission/MarkerLayout.ts';

const W = 800;
const H = 450;
const marker = (key: string, kind: keyof typeof MARKER_PRIORITY, x: number, y: number, label = key + ' · 120 m',
  compactLabel = '120 m', meter = false): MarkerRequest => ({ key, priority: MARKER_PRIORITY[kind], x, y, label, compactLabel, meter });

function boxes(requests: MarkerRequest[], out: MarkerPlacement[]) {
  return requests.map((request, i) => {
    const size = markerSize(out[i].compact ? request.compactLabel : request.label, request.meter);
    const left = Math.max(6, Math.min(request.x - size.width / 2, W - 6 - size.width));
    const top = request.y + out[i].offset - size.height / 2;
    return { left, top, right: left + size.width, bottom: top + size.height };
  });
}

function assertNoOverlap(requests: MarkerRequest[], out: MarkerPlacement[]) {
  const all = boxes(requests, out);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i];
    const b = all[j];
    const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    assert.equal(overlap, false, `${requests[i].key} overlaps ${requests[j].key}`);
  }
}

test('separate markers keep their anchors', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  const requests = [marker('alpha', 'objective', 200, 200), marker('nest', 'nest', 600, 200, 'Schwarmnest', '', true)];
  layout.layout(requests, W, H, out);
  assert.deepEqual(out, [{ offset: 0, compact: false }, { offset: 0, compact: false }]);
});

test('optional nest moves away from the primary objective (FF79E-5)', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  // Nest submitted first must still yield to the objective.
  const requests = [marker('nest', 'nest', 404, 210, 'Schwarmnest', '', true), marker('alpha', 'objective', 400, 214, 'Relais Alpha · 86 m')];
  layout.layout(requests, W, H, out);
  assert.deepEqual(out[1], { offset: 0, compact: false });
  assert.notEqual(out[0].offset, 0);
  assert.ok(out[0].offset < 0, 'moves upwards first');
  assertNoOverlap(requests, out);
});

test('three and four stacked markers are all separated by priority', () => {
  for (const count of [3, 4]) {
    const layout = new MarkerLayout();
    const out: MarkerPlacement[] = [];
    const kinds = ['nest', 'alarm', 'extraction', 'objective'] as const;
    const requests = kinds.slice(0, count).map((kind, i) => marker(kind + i, kind, 400 + i, 225 + i));
    layout.layout(requests, W, H, out);
    const top = requests.findIndex((r) => r.priority === Math.min(...requests.map((q) => q.priority)));
    assert.deepEqual(out[top], { offset: 0, compact: false });
    assertNoOverlap(requests, out);
  }
});

test('markers near the top edge move downwards and stay inside the viewport', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  const requests = [marker('alpha', 'objective', 400, 30), marker('extraction', 'extraction', 400, 30)];
  layout.layout(requests, W, H, out);
  assert.ok(out[1].offset > 0);
  const [, moved] = boxes(requests, out);
  assert.ok(moved.top >= 6 && moved.bottom <= H - 6);
  assertNoOverlap(requests, out);
});

test('edge-clamped markers resolve with the CSS horizontal clamp', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  // Both anchors sit at the right edge; their clamped boxes overlap although the anchors are 40 px apart.
  const requests = [marker('alpha', 'objective', 790, 200, 'Relais Bravo · 412 m'), marker('pickup', 'pickup', 750, 205, 'Ballon · Lichtung · 380 m')];
  layout.layout(requests, W, H, out);
  assert.notEqual(out[1].offset, 0);
  assertNoOverlap(requests, out);
});

test('crowded column falls back to compact captions', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  const requests = Array.from({ length: 9 }, (_, i) => marker('m' + i, i === 0 ? 'objective' : 'alarm', 400, 225));
  layout.layout(requests, W, H, out);
  assert.deepEqual(out[0], { offset: 0, compact: false });
  assert.ok(out.some((p) => p.compact), 'some markers switch to the short caption');
  const full = markerSize('m1 · 120 m', false).height + MARKER_GAP;
  for (const p of out) if (!p.compact) assert.ok(Math.abs(p.offset) <= 3 * full);
});

test('displaced marker holds its slot until its anchor stays free', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  const objective = marker('alpha', 'objective', 400, 220);
  const nest = marker('nest', 'nest', 400, 224, 'Schwarmnest', '', true);
  layout.layout([objective, nest], W, H, out);
  const moved = out[1].offset;
  assert.notEqual(moved, 0);
  // The objective leaves; the nest must not jump back immediately.
  for (let frame = 1; frame < MARKER_RELAX_FRAMES; frame++) {
    layout.layout([nest], W, H, out);
    assert.equal(out[0].offset, moved, `frame ${frame}`);
  }
  layout.layout([nest], W, H, out);
  assert.deepEqual(out[0], { offset: 0, compact: false });
  // Brief returns of the conflict reset the wait instead of flickering.
  layout.layout([objective, nest], W, H, out);
  assert.notEqual(out[1].offset, 0);
});

test('a marker that disappears starts fresh when it returns', () => {
  const layout = new MarkerLayout();
  const out: MarkerPlacement[] = [];
  layout.layout([marker('alpha', 'objective', 400, 220), marker('nest', 'nest', 400, 224)], W, H, out);
  layout.layout([], W, H, out);
  layout.layout([marker('nest', 'nest', 400, 224)], W, H, out);
  assert.deepEqual(out[0], { offset: 0, compact: false });
});
