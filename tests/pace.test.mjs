// 읽기 속도 경고 시험 — pace.js (0.2.0).  실행:  node tests/pace.test.mjs
// 문턱은 한 사람의 기록에서 고른 잠정값이다 (16절·20-8절). 여기서는 수식이 의도대로 도는지만 본다.

import assert from 'node:assert/strict';
import { createPaceWatch, PACE_POLICY } from '../web/modules/pace.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const LAYOUT = { columnPx: 800, lineHeightPx: 40 };
const LONG = Array(30).fill(760);          // 한 줄 38자
const LEFT = 600;
const mk = (opts = {}) => createPaceWatch({ layout: LAYOUT, lineWidths: LONG, ...opts });

/** t0부터 lines줄을 줄마다 lineMs에 읽는다: 표본을 넣고, 줄 끝마다 줄바꿈 걸음을 알린다. 끝난 시각을 돌려준다 */
function read(W, { t0 = 0, from = 0, lines, lineMs, width = 560 }) {
  let t = t0;
  for (let k = from; k < from + lines; k++) {
    for (let u = 0; u < lineMs; u += 40) W.push({ tMs: t + u, xPx: LEFT + width * (u / lineMs), valid: true });
    t += lineMs;
    W.push({ tMs: t, xPx: LEFT, valid: true });
    W.step({ from: k, to: k + 1, cause: 'sweep' }, t);
  }
  return t;
}
/** 한 자리에 머문다 (줄바꿈 없음) */
function linger(W, t0, ms) { for (let t = t0; t <= t0 + ms; t += 40) W.push({ tMs: t, xPx: LEFT + 100, valid: true }); return t0 + ms; }

test('줄바꿈 구간이 3개·8초 모이기 전에는 판정하지 않는다', () => {
  const W = mk();
  read(W, { lines: 2, lineMs: 1500 });
  assert.equal(W.status.ready, false);
  assert.equal(W.fast, false);
  assert.equal(W.message(), null);
  const W2 = mk();
  read(W2, { lines: 4, lineMs: 1500 });          // 6초: 구간은 넷이지만 8초가 안 됐다
  assert.equal(W2.status.ready, false, '줄바꿈이 몰린 몇 초만으로는 판정하지 않는다');
  assert.equal(linger(mk(), 0, 20000) > 0 && mk().status.ready, false, '줄바꿈이 없으면 속도를 못 낸다');
});

test('보통 속도(한 줄 38자를 4초에 = 570자/분)로 읽으면 경고가 없다', () => {
  const W = mk();
  read(W, { lines: 10, lineMs: 4000 });
  const st = W.status;
  assert.equal(st.ready, true);
  assert.ok(Math.abs(st.recentCharsPerMin - 570) < 5, `${st.recentCharsPerMin}자/분`);
  assert.equal(st.warn, false);
  assert.deepEqual(st.reasons, []);
});

test('빠르게 지나가면(한 줄을 1.5초에 = 1520자/분) too_fast', () => {
  const W = mk();
  read(W, { lines: 8, lineMs: 1500 });
  const st = W.status;
  assert.ok(st.recentCharsPerMin > PACE_POLICY.maxCharsPerMin, `${st.recentCharsPerMin}자/분`);
  assert.deepEqual(st.reasons, ['too_fast']);
  assert.equal(W.fast, true);
  assert.match(W.message(), /빠르게 지나가고 있습니다/);
  assert.match(W.message(), /분당 약 \d+자/);
});

test('빨랐다가 느려지면 꺼진다 — 한 번 뜨면 쪽 끝까지 남던 0.1.0과 다르다', () => {
  const W = mk();
  let t = read(W, { lines: 8, lineMs: 1500 });
  assert.equal(W.fast, true);
  t = read(W, { t0: t, from: 8, lines: 4, lineMs: 4500 });   // 그 뒤 네 줄은 천천히
  assert.equal(W.fast, false, `${W.status.recentCharsPerMin}자/분`);
});

test('마지막 줄바꿈 뒤로 흐른 시간도 분모에 든다 — 한 줄에 머물면 값이 내려가고 옛 값이 남지 않는다', () => {
  const W = mk();
  let t = read(W, { lines: 8, lineMs: 1500 });
  const before = W.status.recentCharsPerMin;
  linger(W, t, 12000);
  const after = W.status.recentCharsPerMin;
  assert.ok(after < before * 0.6, `${before} → ${after}`);
  assert.equal(W.fast, false);
});

test('켜질 때는 문턱을 넘어야 하고, 꺼질 때는 그 85% 밑으로 내려와야 한다 (깜빡이지 않게)', () => {
  // 문턱 900·꺼짐 765. 한 줄 38자를 2.4초에 = 950자/분으로 켜고, 2.7초(844자/분)로 늦춰도 아직 켜져 있다
  const W = mk();
  let t = read(W, { lines: 8, lineMs: 2400 });
  assert.equal(W.fast, true);
  t = read(W, { t0: t, from: 8, lines: 6, lineMs: 2700 });
  const cpm = W.status.recentCharsPerMin;
  assert.ok(cpm < PACE_POLICY.maxCharsPerMin && cpm > PACE_POLICY.maxCharsPerMin * PACE_POLICY.clearRatio, `${cpm}자/분`);
  assert.equal(W.fast, true, '문턱 바로 아래에서는 유지');
  const fresh = mk();
  read(fresh, { lines: 8, lineMs: 2700 });
  assert.equal(fresh.fast, false, '처음부터 그 속도였다면 켜지지 않는다');
});

test('머묾 넘김은 구간을 끊지 않는다 — 짧은 줄을 기다린 시간은 다음 줄바꿈까지 한 묶음', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: [760, 120, 760, 760, 760, 760] });
  let t = read(W, { lines: 1, lineMs: 4000 });                       // 줄 0
  for (let u = 0; u < 2000; u += 40) W.push({ tMs: t + u, xPx: LEFT + 60, valid: true });
  W.step({ from: 1, to: 2, cause: 'dwell' }, t + 2000);              // 짧은 줄 1은 머묾으로 넘어간다
  t = read(W, { t0: t + 2000, from: 2, lines: 4, lineMs: 4000 });    // 줄 2~5
  // 두 번째 구간 = 줄 1(6자) + 줄 2(38자)를 6초에. 머묾 때 구간을 끊었다면 줄 1의 2초가 빠져 더 빠르게 나온다
  const sn = W.snapshot();
  assert.equal(sn.groups, 5);
  assert.ok(W.status.recentCharsPerMin < 600, `${W.status.recentCharsPerMin}자/분`);
});

test('줄을 손으로 옮긴 것(manual)은 읽은 구간이 아니다 — 구간을 그 자리부터 새로 잡는다', () => {
  const W = mk();
  let t = read(W, { lines: 4, lineMs: 4000 });
  const before = W.snapshot().groups;
  W.step({ from: 4, to: 1, cause: 'manual' }, t + 500);
  assert.equal(W.snapshot().groups, before, '옮긴 걸음으로 구간이 닫히지 않는다');
  // 줄 1을 4초에 다시 읽고 줄바꿈: 구간은 줄 1 하나(38자)·3.5초다. 줄 1~4를 한꺼번에 센 것이 아니다
  for (let u = 500; u < 4000; u += 40) W.push({ tMs: t + u, xPx: LEFT + 400, valid: true });
  W.step({ from: 1, to: 2, cause: 'sweep' }, t + 4000);
  assert.equal(W.snapshot().groups, before + 1);
  assert.equal(W.fast, false);
});

test('줄이 일찍 읽음 처리돼도 속도가 부풀지 않는다 (0.1.0은 읽음 글자 수 ÷ 경과 시간이었다)', () => {
  // 기록 20261121-192755 1쪽: 줄은 폭의 40%만 지나도 읽음이 되어, 쪽 앞머리에서 847자/분이 936으로 찍혔다
  const W = mk();
  W.credit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);        // 열 줄이 한꺼번에 읽음 처리됐다고 해도
  read(W, { lines: 6, lineMs: 4000 });             // 실제 줄바꿈은 4초마다다
  assert.equal(W.fast, false);
  assert.ok(W.status.recentCharsPerMin < 600);
  assert.ok(W.status.charsPerMin > 900, '쪽 전체 평균(기록용)은 옛 방식 그대로 부푼다');
});

test('폭비로는 경고하지 않는다 (기록만). 문턱을 주면 예전처럼 too_wide', () => {
  assert.equal(PACE_POLICY.maxSpanRatio, null);
  const W = mk();
  read(W, { lines: 10, lineMs: 4000, width: 1200 });   // 폭비 약 1.35
  assert.ok(W.status.spanRatio > 1.2, `폭비 ${W.status.spanRatio}`);
  assert.equal(W.status.wide, false);
  assert.equal(W.status.warn, false);
  assert.ok(W.snapshot().spanRatio > 1.2, '기록에는 남는다');
  const old = mk({ policy: { ...PACE_POLICY, maxSpanRatio: 1.05 } });
  read(old, { lines: 10, lineMs: 4000, width: 1200 });
  assert.deepEqual(old.status.reasons, ['too_wide']);
  assert.match(old.message(), /시선이 글 밖까지 움직임/);
});

test('같은 줄을 두 번 인정해도 글자 수가 두 배가 되지 않는다', () => {
  const W = mk();
  read(W, { lines: 5, lineMs: 4000 });
  W.credit([0, 1, 2]);
  const once = W.status.charsRead;
  W.credit([0, 1, 2]); W.credit([1]);
  assert.equal(W.status.charsRead, once);
});

test('무효 표본·빈 걸음은 무시한다', () => {
  const W = mk();
  read(W, { lines: 5, lineMs: 4000 });
  const before = W.snapshot();
  W.push({ tMs: 999999, xPx: 99999, valid: false });
  W.push(null);
  W.step(null, 30000); W.step({ from: 5, to: 6, cause: 'sweep' }, NaN);
  assert.deepEqual(W.snapshot(), before);
});

test('글자 수는 단 폭 40자 기준으로 환산한다', () => {
  const W = createPaceWatch({ layout: LAYOUT, lineWidths: [800, 400] });   // 40자 + 20자
  W.push({ tMs: 0, xPx: LEFT, valid: true });
  W.credit([0, 1]);
  assert.ok(Math.abs(W.status.charsRead - 60) < 1e-6, `${W.status.charsRead}자`);
});

test('snapshot이 문턱·최근 속도·이유를 함께 준다 (기록용)', () => {
  const W = mk();
  read(W, { lines: 8, lineMs: 1500 });
  const sn = W.snapshot();
  assert.equal(sn.version, PACE_POLICY.version);
  assert.equal(sn.version, 'reading-pace-warning/0.2.0-dev');
  assert.equal(sn.limits.maxCharsPerMin, PACE_POLICY.maxCharsPerMin);
  assert.equal(sn.limits.maxSpanRatio, null);
  assert.ok(Number.isInteger(sn.recentCharsPerMin));
  assert.equal(sn.groups, 8);
  assert.deepEqual(sn.reasons, ['too_fast']);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
