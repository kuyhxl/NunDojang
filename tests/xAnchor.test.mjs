// 개인 가로 기준점 시험 — xAnchor.js.  실행:  node tests/xAnchor.test.mjs
// 주의: 이 모듈은 측정해 보고 폐기한 안이다 (docs/comprehension_evidence.md 13절).
// 수식이 의도대로 도는지만 본다. "써도 된다"는 뜻이 아니다.

import assert from 'node:assert/strict';
import { fitXAnchors, observedXFrom, summarizePoint, median, mad, X_ANCHOR_POLICY } from '../web/modules/xAnchor.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/** 목표 x 둘레에 잡음 ±spread로 n개 흩뿌린다 (결정적) */
const around = (x, n = 20, spread = 4) =>
  Array.from({ length: n }, (_, i) => x + ((i % 5) - 2) * (spread / 2));

test('median / mad: 빈 배열은 null, 튀는 값에 끌려가지 않는다', () => {
  assert.equal(median([]), null);
  assert.equal(mad([]), null);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([10, 10, 10, 10, 9999]), 10);   // 하나 크게 튀어도 중앙값은 그대로
});

test('summarizePoint: 표본이 모자라거나 유효 비율이 낮으면 usable=false', () => {
  assert.equal(summarizePoint({ targetX: 600, xs: around(600, 20) }).usable, true);
  assert.equal(summarizePoint({ targetX: 600, xs: around(600, 5) }).usable, false, '표본 5개는 부족');
  const low = summarizePoint({ targetX: 600, xs: around(600, 20), frames: 100 });
  assert.equal(low.usable, false, '20/100 = 유효 비율 0.2');
  assert.ok(Math.abs(low.coverage - 0.2) < 1e-9);
});

test('세 점이 충분히 떨어져 있으면 ready, minX/maxX는 양 끝 중앙값', () => {
  const fit = fitXAnchors([
    { targetX: 600, xs: around(610) },
    { targetX: 1000, xs: around(1005) },
    { targetX: 1400, xs: around(1390) }
  ]);
  assert.equal(fit.ready, true, `ready가 아니다: ${fit.reason}`);
  assert.equal(fit.minX, 610);
  assert.equal(fit.maxX, 1390);
  assert.equal(fit.spanPx, 780);
  assert.deepEqual(observedXFrom(fit), { min: 610, max: 1390 });
});

test('점 순서가 뒤집히면 ready=false (간격이 음수가 되어 걸린다)', () => {
  const fit = fitXAnchors([
    { targetX: 600, xs: around(1000) },
    { targetX: 1000, xs: around(700) },     // 가운데가 왼쪽보다 왼쪽
    { targetX: 1400, xs: around(1390) }
  ]);
  assert.equal(fit.ready, false);
  assert.equal(fit.reason, 'separation_or_order');
  assert.equal(observedXFrom(fit), null);
});

test('잡음이 크면 ready=false — 간격이 MAD의 2배를 넘어야 한다', () => {
  const noisy = (x) => Array.from({ length: 20 }, (_, i) => x + ((i % 5) - 2) * 60);   // MAD ≈ 60
  const fit = fitXAnchors([
    { targetX: 600, xs: noisy(600) },
    { targetX: 700, xs: noisy(700) },       // 간격 100 < 2 × 60
    { targetX: 800, xs: noisy(800) }
  ]);
  assert.equal(fit.ready, false, `간격 100px은 잡음 대비 부족해야 한다 (required ${fit.requiredPx})`);
  assert.ok(fit.requiredPx > 100);
});

test('간격이 24px보다 좁으면 잡음이 0이어도 ready=false', () => {
  const exact = (x) => Array(20).fill(x);   // MAD = 0
  const fit = fitXAnchors([
    { targetX: 600, xs: exact(600) },
    { targetX: 615, xs: exact(615) },       // 간격 15 < minStepPx 24
    { targetX: 630, xs: exact(630) }
  ]);
  assert.equal(fit.ready, false);
  assert.equal(fit.requiredPx, X_ANCHOR_POLICY.minStepPx);
});

test('점 하나라도 품질 미달이면 통째로 ready=false (point_quality)', () => {
  const fit = fitXAnchors([
    { targetX: 600, xs: around(610) },
    { targetX: 1000, xs: around(1005, 3) },   // 표본 3개
    { targetX: 1400, xs: around(1390) }
  ]);
  assert.equal(fit.ready, false);
  assert.equal(fit.reason, 'point_quality');
});

test('점 두 개로도 동작한다. 하나면 거부', () => {
  assert.equal(fitXAnchors([{ targetX: 600, xs: around(610) }, { targetX: 1400, xs: around(1390) }]).ready, true);
  assert.equal(fitXAnchors([{ targetX: 600, xs: around(610) }]).reason, 'need_two_or_three_points');
  assert.equal(fitXAnchors(null).reason, 'need_two_or_three_points');
});

test('입력 순서가 뒤섞여 있어도 targetX로 정렬해 처리한다', () => {
  const a = fitXAnchors([
    { targetX: 1400, xs: around(1390) },
    { targetX: 600, xs: around(610) },
    { targetX: 1000, xs: around(1005) }
  ]);
  assert.equal(a.ready, true);
  assert.equal(a.minX, 610);
  assert.equal(a.maxX, 1390);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
