// 읽기 속도·가로 폭 경고 시험 — pace.js.  실행:  node tests/pace.test.mjs
// 관문은 한 사람의 기록에서 고른 잠정값이다 (16절). 여기서는 수식이 의도대로 도는지만 본다.

import assert from 'node:assert/strict';
import { createPaceWatch, PACE_POLICY } from '../web/modules/pace.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const LAYOUT = { columnPx: 800, lineHeightPx: 40 };
const P1 = [573, 138, 404, 530, 755, 423, 666, 791, 764, 154, 776, 538];
const LEFT = 600;

/** durMs 동안 from~to를 오가며 표본을 넣고, lines를 읽음으로 인정한다 */
function feed(W, { durMs, from = LEFT, to = LEFT + 560, lines = [] }) {
  for (let t = 0; t <= durMs; t += 40) {
    const u = (t % 2000) / 2000;
    W.push({ tMs: t, xPx: from + (to - from) * (u < 0.5 ? u * 2 : 2 - u * 2), valid: true });
  }
  W.credit(lines);
  return W.status;
}
const allLines = [...P1.keys()];

test('조건을 다 넘기 전에는 ready=false, 경고도 없다', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  assert.equal(feed(W, { durMs: 2000, lines: allLines }).ready, false, '6초 미만');
  const W2 = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  assert.equal(feed(W2, { durMs: 10000, lines: [] }).ready, false, '읽은 줄이 없으면 속도를 못 낸다');
  assert.equal(W2.status.warn, false);
  assert.equal(W2.message(), null);
});

test('보통 속도로 읽으면 경고가 없다', () => {
  // 12줄 약 780자를 90초에 → 분당 520자, 폭 560/800 = 0.70
  const st = feed(createPaceWatch({ layout: LAYOUT, lineWidths: P1 }), { durMs: 90000, lines: allLines });
  assert.equal(st.ready, true);
  assert.ok(st.charsPerMin < PACE_POLICY.maxCharsPerMin, `${st.charsPerMin}자/분`);
  assert.ok(st.spanRatio < PACE_POLICY.maxSpanRatio, `폭비 ${st.spanRatio}`);
  assert.equal(st.warn, false);
});

test('너무 빠르면 too_fast', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  const st = feed(W, { durMs: 20000, lines: allLines });        // 같은 글자 수를 20초에
  assert.ok(st.charsPerMin > PACE_POLICY.maxCharsPerMin, `${st.charsPerMin}자/분`);
  assert.deepEqual(st.reasons, ['too_fast']);
  assert.match(W.message(), /빠르게 훑은 것으로 보입니다/);
  assert.match(W.message(), /분당 약 \d+자/);
});

test('글 밖까지 움직이면 too_wide', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  const st = feed(W, { durMs: 90000, to: LEFT + 1200, lines: allLines });   // 폭비 1.5
  assert.ok(st.spanRatio > PACE_POLICY.maxSpanRatio, `폭비 ${st.spanRatio}`);
  assert.deepEqual(st.reasons, ['too_wide']);
  assert.match(W.message(), /시선이 글 밖까지 움직임/);
});

test('둘 다면 이유가 둘 다 들어간다', () => {
  const st = feed(createPaceWatch({ layout: LAYOUT, lineWidths: P1 }), { durMs: 20000, to: LEFT + 1200, lines: allLines });
  assert.deepEqual(st.reasons, ['too_fast', 'too_wide']);
  assert.equal(st.warn, true);
});

test('같은 줄을 두 번 인정해도 글자 수가 두 배가 되지 않는다', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  feed(W, { durMs: 90000, lines: allLines });
  const once = W.status.charsRead;
  W.credit(allLines); W.credit([0, 1, 2]);
  assert.equal(W.status.charsRead, once);
});

test('무효 표본은 폭비에 들어가지 않는다', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  for (let t = 0; t <= 90000; t += 40) W.push({ tMs: t, xPx: LEFT + (t % 560), valid: true });
  W.push({ tMs: 45000, xPx: 99999, valid: false });
  W.push(null);
  W.credit(allLines);
  assert.ok(W.status.spanRatio < 1, `폭비 ${W.status.spanRatio}`);
});

test('글자 수는 단 폭 40자 기준으로 환산한다', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: [800, 400] });   // 40자 + 20자
  feed(W, { durMs: 10000, lines: [0, 1] });
  assert.ok(Math.abs(W.status.charsRead - 60) < 1e-6, `${W.status.charsRead}자`);
});

test('snapshot이 관문 값과 이유를 함께 준다 (기록용)', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: P1 });
  feed(W, { durMs: 20000, lines: allLines });
  const sn = W.snapshot();
  assert.equal(sn.version, PACE_POLICY.version);
  assert.equal(sn.limits.maxCharsPerMin, PACE_POLICY.maxCharsPerMin);
  assert.equal(sn.limits.maxSpanRatio, PACE_POLICY.maxSpanRatio);
  assert.ok(Number.isInteger(sn.charsPerMin));
  assert.deepEqual(sn.reasons, ['too_fast']);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
