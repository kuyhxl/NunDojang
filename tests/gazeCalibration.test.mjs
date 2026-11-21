// 보정 점 배치 시험 — gazeCalibration.js의 calibrationPoints·usableRegion.  실행:  node tests/gazeCalibration.test.mjs
// 배치의 근거(글 영역 9점)는 docs/comprehension_evidence.md 20-10절. 여기서는 점이 의도한 자리에 놓이는지만 본다.

import assert from 'node:assert/strict';
import { calibrationPoints, usableRegion, REGION_GRID, REGION_MIN } from '../web/modules/gazeCalibration.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const VW = 1512, VH = 828;
// 읽기 모드 20px판의 글 영역: 단 356~1156, 첫 줄 가운데 194 ~ 열두째 줄 가운데 634
const PAGE = { left: 356, top: 194, width: 800, height: 440 };

test('글 영역을 주면 그 위에 3×3 = 9점만 찍는다. 고개 돌리기·검정 화면 점은 없다', () => {
  const pts = calibrationPoints(VW, VH, { region: PAGE });
  assert.equal(pts.length, REGION_GRID.cols * REGION_GRID.rows);
  assert.equal(pts.length, 9);
  assert.ok(pts.every((p) => p.theme === 'light' && !p.turn));
  assert.deepEqual(pts.map((p) => p.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('점은 글의 네 귀와 가운데를 덮는다 — 맞춘 영역 밖은 믿을 수 없으므로 끝까지 가야 한다', () => {
  const pts = calibrationPoints(VW, VH, { region: PAGE });
  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(pts.map((p) => p.y))].sort((a, b) => a - b);
  assert.deepEqual(xs, [356, 756, 1156]);
  assert.deepEqual(ys, [194, 414, 634]);
  assert.ok(pts.some((p) => p.x === 756 && p.y === 414), '가운데 점');
});

test('ㄹ자로 돈다 — 다음 점이 멀리 뛰지 않는다', () => {
  const pts = calibrationPoints(VW, VH, { region: PAGE });
  assert.deepEqual(pts.map((p) => [p.x, p.y]), [
    [356, 194], [756, 194], [1156, 194],
    [1156, 414], [756, 414], [356, 414],
    [356, 634], [756, 634], [1156, 634]]);
});

test('영역이 없으면 예전 배치 그대로: 격자 20 + 고개 돌리기 3 + 검정 화면 4 = 27점', () => {
  const pts = calibrationPoints(VW, VH);
  assert.equal(pts.length, 27);
  assert.equal(pts.filter((p) => p.turn).length, 3);
  assert.equal(pts.filter((p) => p.theme === 'dark').length, 4);
  assert.ok(Math.abs(pts[0].x - 0.08 * VW) < 1e-9 && Math.abs(pts[0].y - 0.08 * VH) < 1e-9);
  assert.ok(Math.abs(pts[4].x - 0.92 * VW) < 1e-9);
  assert.deepEqual(calibrationPoints(VW, VH, { region: null }).map((p) => [p.x, p.y]), pts.map((p) => [p.x, p.y]));
});

test('영역이 화면 밖으로 나가면 화면 안으로 들인다 (가장자리에서 24px)', () => {
  // 읽기 모드가 아닐 때: 지면이 화면 아래로 넘친다
  const pts = calibrationPoints(VW, VH, { region: { left: 756, top: 300, width: 800, height: 700 } });
  assert.equal(pts.length, 9);
  assert.ok(pts.every((p) => p.x >= 24 && p.x <= VW - 24 && p.y >= 24 && p.y <= VH - 24));
  assert.equal(Math.max(...pts.map((p) => p.x)), VW - 24);
  assert.equal(Math.max(...pts.map((p) => p.y)), VH - 24);
});

test('너무 작거나 쓸 수 없는 영역이면 화면 전체 배치로 돌아간다', () => {
  assert.equal(calibrationPoints(VW, VH, { region: { left: 700, top: 400, width: REGION_MIN.width - 1, height: 300 } }).length, 27);
  assert.equal(calibrationPoints(VW, VH, { region: { left: 700, top: 400, width: 600, height: REGION_MIN.height - 1 } }).length, 27);
  assert.equal(calibrationPoints(VW, VH, { region: { left: NaN, top: 0, width: 600, height: 300 } }).length, 27);
  assert.equal(calibrationPoints(VW, VH, { region: { left: 5000, top: 0, width: 600, height: 300 } }).length, 27, '화면 밖');
});

test('usableRegion: 다듬은 영역을 돌려주고, 못 쓰면 null', () => {
  assert.deepEqual(usableRegion(PAGE, VW, VH), PAGE);
  assert.equal(usableRegion(null, VW, VH), null);
  assert.equal(usableRegion({ left: 0, top: 0, width: 100, height: 100 }, VW, VH), null);
  assert.deepEqual(usableRegion({ left: -50, top: 100, width: 600, height: 300 }, VW, VH), { left: 24, top: 100, width: 526, height: 300 });
});

test('격자 크기를 따로 줄 수 있다 (예: 2×2)', () => {
  const pts = calibrationPoints(VW, VH, { region: PAGE, cols: 2, rows: 2 });
  assert.deepEqual(pts.map((p) => [p.x, p.y]), [[356, 194], [1156, 194], [1156, 634], [356, 634]]);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
