// 쪽의 관측 가로 범위 시험 — xObserve.js (11절 제안, ?xwindow=1).  실행:  node tests/xObserve.test.mjs
// 합성 시선으로 "수식이 의도한 대로 동작하는가"만 본다.

import assert from 'node:assert/strict';
import { createXObserver, X_OBSERVE_POLICY } from '../web/modules/xObserve.js';
import { sweepOptionsFor, SWEEP_LANDING_RATIO } from '../web/modules/gazeSweep.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const LAYOUT = { columnPx: 800, lineHeightPx: 40 };
/** from~to를 왔다갔다하는 표본을 durMs 동안 40ms 간격으로 */
function sweepXs(obs, from, to, durMs, t0 = 0) {
  let out = null;
  for (let t = t0; t < t0 + durMs; t += 40) {
    const u = ((t - t0) % 2000) / 2000;
    const r = obs.push({ tMs: t, xPx: from + (to - from) * (u < 0.5 ? u * 2 : 2 - u * 2), valid: true });
    if (r) out = r;
  }
  return out;
}

test('창이 닫히기 전에는 null, 닫히는 표본에서 범위를 한 번 돌려준다', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 4000 });   // 40ms 간격 → 표본 100개 (minSamples 60 이상)
  assert.equal(sweepXs(o, 600, 1200, 3960), null, '4초 전에는 아직 안 닫힌다');
  assert.equal(o.closed, false);
  assert.ok(o.sampleCount >= X_OBSERVE_POLICY.minSamples, `표본 ${o.sampleCount}개`);
  const got = o.push({ tMs: 4000, xPx: 900, valid: true });
  assert.ok(got, `4초가 되면 닫히며 범위를 준다: ${JSON.stringify(o.snapshot())}`);
  assert.equal(o.closed, true);
  assert.equal(o.push({ tMs: 4040, xPx: 900, valid: true }), null, '닫힌 뒤에는 다시 주지 않는다');
});

test('표본이 모자란 채 창이 닫히면 범위를 주지 않는다 (시간만으로는 안 된다)', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 4000 });
  for (let t = 0; t < 3960; t += 200) o.push({ tMs: t, xPx: 600 + t / 10, valid: true });   // 20개뿐
  assert.equal(o.push({ tMs: 4000, xPx: 900, valid: true }), null);
  assert.equal(o.snapshot().reason, 'not_enough_samples');
});

test('범위는 하위 5% ~ 상위 95%다 (튀는 표본에 끌려가지 않는다)', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 4000 });
  for (let t = 0; t < 3960; t += 40) o.push({ tMs: t, xPx: 600 + ((t / 40) % 100) * 6, valid: true });   // 600~1194
  o.push({ tMs: 10, xPx: -5000, valid: true });     // 멀리 튀는 표본
  const got = o.finish();
  assert.ok(got && got.min > 500 && got.max < 1300, `튀는 값이 들어갔다: ${JSON.stringify(got)}`);
});

test('표본이 모자라면 쓰지 않는다 (not_enough_samples)', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 2000 });
  for (let t = 0; t < 400; t += 40) o.push({ tMs: t, xPx: 600 + t, valid: true });   // 10개
  assert.equal(o.finish(), null);
  assert.equal(o.snapshot().reason, 'not_enough_samples');
});

test('한 점만 보고 있으면 쓰지 않는다 (span_too_narrow)', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 8000 });
  for (let t = 0; t < 7960; t += 40) o.push({ tMs: t, xPx: 900 + (t % 80) / 8, valid: true });
  assert.equal(o.finish(), null);
  assert.equal(o.snapshot().reason, 'span_too_narrow');
});

test('글 밖을 휘저으면 쓰지 않는다 (span_too_wide) — 문턱이 벌어지는 것을 막는다', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 8000 });
  sweepXs(o, 0, 2400, 7960);                       // 폭비 3.0
  assert.equal(o.finish(), null);
  assert.equal(o.snapshot().reason, 'span_too_wide');
  assert.ok(X_OBSERVE_POLICY.maxSpanRatio < 2);
});

test('무효 표본은 세지 않는다', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 2000 });
  for (let t = 0; t < 1960; t += 40) o.push({ tMs: t, xPx: 600 + t / 4, valid: t % 80 === 0 });
  const before = o.sampleCount;
  o.push({ tMs: 1000, xPx: 999, valid: false });
  o.push(null);
  assert.equal(o.sampleCount, before);
});

test('관측 범위를 넣으면 착지권이 넓어진다 (좁아지지는 않는다)', () => {
  const abs = sweepOptionsFor(LAYOUT, 600);
  assert.equal(abs.landingMaxX, 600 + SWEEP_LANDING_RATIO * 800);
  // 눌려 찍힌 쪽: 관측 폭 560px, 왼쪽 끝 520 → 개인 착지권 520+140 = 660 < 절대 800
  const tight = sweepOptionsFor(LAYOUT, 600, { observedX: { min: 520, max: 1080 } });
  assert.equal(tight.landingMaxX, abs.landingMaxX, '개인 기준이 더 깐깐하면 절대 기준을 쓴다');
  assert.equal(tight.minDropPx, Math.round(0.19 * 560), '이동 문턱은 관측 폭으로 줄어든다');
  // 오른쪽으로 밀려 찍힌 쪽: 왼쪽 끝 900 → 개인 착지권 900+200 = 1100 > 절대 800
  const shifted = sweepOptionsFor(LAYOUT, 600, { observedX: { min: 900, max: 1700 } });
  assert.equal(shifted.landingMaxX, 1100, '밀린 쪽에서는 착지권이 따라 움직인다');
  assert.ok(shifted.landingMaxX > abs.landingMaxX);
});

test('snapshot이 폭비와 이유를 준다', () => {
  const o = createXObserver({ layout: LAYOUT, observeMs: 8000 });
  sweepXs(o, 600, 1160, 7960);                     // 폭비 0.7 근처
  o.finish();
  const sn = o.snapshot();
  assert.equal(sn.ready, true, JSON.stringify(sn));
  assert.ok(sn.spanRatio > 0.5 && sn.spanRatio < 0.9, `폭비 ${sn.spanRatio}`);
  assert.equal(sn.reason, null);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
