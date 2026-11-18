// 봉인 쪽 점수 표 배치 시험 — sealExport.js의 stampTableLayout.  실행:  node tests/seal.test.mjs
// 그림 그리기(renderStampPng)는 브라우저 전용이라 여기서는 배치 계산만 본다.

import assert from 'node:assert/strict';
import { stampTableLayout } from '../web/modules/sealExport.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const pagesOf = (n, failAt = []) => Array.from({ length: n }, (_, i) => ({ pageId: i + 1, displayScore: 80 + (i % 21), passed: !failAt.includes(i + 1) }));
const MAX_H = 290;   // pt. 이보다 길면 표가 서명란을 덮는다

test('쪽 수가 몇이든 표 높이가 290pt를 넘지 않는다 (예전: 약 168쪽부터 서명란을 덮었다)', () => {
  for (const n of [1, 12, 16, 17, 64, 65, 160, 161, 168, 200, 320, 321, 500, 1000, 5000]) {
    const t = stampTableLayout(pagesOf(n));
    assert.ok(t.heightPt <= MAX_H + 1e-9, `${n}쪽: 표 높이 ${t.heightPt.toFixed(1)}pt`);
    assert.ok(t.rowH >= 7, `${n}쪽: 줄 높이 ${t.rowH}`);
    assert.ok(t.rows.length <= t.cols * t.rowsPerCol, `${n}쪽: 줄이 단에 다 안 들어간다`);
  }
});

test('160쪽까지는 예전 배치 그대로다 (최대 4단, 쪽마다 한 줄)', () => {
  for (const n of [1, 16, 17, 48, 64, 100, 160]) {
    const t = stampTableLayout(pagesOf(n));
    const cols = Math.max(1, Math.min(4, Math.ceil(n / 16))), rowsPerCol = Math.ceil(n / cols);
    assert.equal(t.cols, cols); assert.equal(t.rowsPerCol, rowsPerCol); assert.equal(t.groupSize, 1);
    assert.equal(t.rowH, Math.max(7, Math.min(17, 290 / (rowsPerCol + 1))));
    assert.equal(t.rows.length, n);
  }
});

test('161~320쪽은 단을 늘려 쪽마다 한 줄을 지킨다', () => {
  const a = stampTableLayout(pagesOf(200));
  assert.equal(a.cols, 5); assert.equal(a.rows.length, 200); assert.equal(a.groupSize, 1);
  const b = stampTableLayout(pagesOf(320));
  assert.equal(b.cols, 8); assert.equal(b.rows.length, 320); assert.equal(b.rows[319].label, '320');
});

test('320쪽을 넘으면 묶어서 가장 낮은 점수와 미달 쪽 수를 적는다', () => {
  const t = stampTableLayout(pagesOf(1000, [7, 8]));
  assert.equal(t.groupSize, 5); assert.equal(t.cols, 6); assert.equal(t.rows.length, 200);
  assert.equal(t.rows[0].label, '1–5'); assert.equal(t.rows[0].score, 80); assert.equal(t.rows[0].verdict, '통과');
  assert.equal(t.rows[1].label, '6–10'); assert.equal(t.rows[1].passed, false); assert.equal(t.rows[1].verdict, '미달 2');
  assert.equal(t.rows[199].label, '996–1000');
  // 빠진 쪽이 없다: 묶음을 이으면 1..n
  const last = stampTableLayout(pagesOf(323)).rows.at(-1);
  assert.equal(last.label, '323');   // 2쪽씩 묶으면 마지막은 혼자 남는다
});

test('점수가 없는 쪽(null)이 섞여도 터지지 않는다', () => {
  const pages = pagesOf(400).map((p, i) => (i < 4 ? { ...p, displayScore: null } : p));
  const t = stampTableLayout(pages);
  assert.equal(t.rows[0].score, null);
  assert.ok(Number.isFinite(t.rows[2].score));
  assert.equal(stampTableLayout([]).rows.length, 0);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
