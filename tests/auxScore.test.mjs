// 보조 점수(기록 전용) 시험 — 시선 x 줄바꿈 계수기와 "긴 줄 뒤 줄바꿈" 분모.  실행:  node tests/auxScore.test.mjs
// 합성 시선으로 "수식이 의도한 대로 동작하는가"만 본다. 실제 사람 눈으로 검증한 값이 아니다.

import assert from 'node:assert/strict';
import { createGazeSweepCounter, sweepOptionsFor, nextLineAfterSweep, createLineLocker } from '../web/modules/gazeSweep.js';
import { expectedDetectableSweeps, auxScore, expectedReturnSweeps, AUX_WEIGHT_RAMP } from '../web/modules/pageScoring.js';

const LAYOUT = { columnPx: 800, lineHeightPx: 40 };
const OPTS = sweepOptionsFor(LAYOUT, 600);   // 글 왼쪽 끝 x=600

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/** 한 줄 읽기: left에서 left+width까지 durMs 동안 계단식(고정 + 도약)으로, 표본 간격 40ms, 흔들림 ±jitter */
function readLine(t0, left, width, durMs, jitter = 8, seed = 1) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
  const out = [];
  for (let t = 0; t <= durMs; t += 40) {
    const step = Math.floor((t / durMs) * 6) / 6;          // 6번 고정
    out.push({ tMs: t0 + t, xPx: left + width * step + rnd() * jitter, valid: true });
  }
  return out;
}
/** 줄 폭 목록을 차례로 읽은 시선. 줄 사이에 바로 왼쪽으로 돌아간다 */
function readPage(widths, { left = 600, msPerPx = 6, jitter = 8 } = {}) {
  const out = []; let t = 0;
  widths.forEach((w, i) => { const d = Math.max(400, w * msPerPx); out.push(...readLine(t, left, w, d, jitter, i + 3)); t += d + 40; });
  return out;
}
function countAll(samples, opts = OPTS) {
  const c = createGazeSweepCounter(typeof opts === 'number' ? { minDropPx: opts } : opts);
  for (const s of samples) c.push(s);
  return c.count;
}

test('sweepOptionsFor: 이동 152px, 착지 ≤ 글 왼쪽+200px, 위로 40px 넘게 튀면 제외 (800px 단)', () => {
  assert.deepEqual(OPTS, { minDropPx: 152, landingMaxX: 800, minDyPx: -40, maxGapMs: null });
  assert.equal(sweepOptionsFor({ columnPx: 520, lineHeightPx: 26 }, 0).minDropPx, 99);
  assert.equal(sweepOptionsFor(LAYOUT, NaN).landingMaxX, null);
  assert.equal(sweepOptionsFor(LAYOUT, 600, { maxGapMs: 250 }).maxGapMs, 250);   // 줄 때만 끊김을 본다
});

test('긴 줄만 있는 쪽: 줄바꿈 L−1번을 모두 센다', () => {
  const widths = [760, 740, 780, 700, 790, 720];
  assert.equal(countAll(readPage(widths)), widths.length - 1);
});

test('짧은 줄 뒤 줄바꿈은 세지 않는다 (눈이 그만큼만 돌아가므로)', () => {
  const widths = [760, 120, 780, 90, 770];   // 120·90px 줄 뒤는 이동이 152px보다 작다
  assert.equal(countAll(readPage(widths)), 2);
});

test('제자리 흔들림(±10px)만 있으면 0번', () => {
  const s = []; for (let t = 0; t < 10000; t += 40) s.push({ tMs: t, xPx: 900 + Math.sin(t / 37) * 10, valid: true });
  assert.equal(countAll(s, 152), 0);
});

test('느리게 왼쪽으로 훑으면(0.4초 안 이동이 작으면) 세지 않는다', () => {
  const s = []; for (let t = 0; t <= 4000; t += 40) s.push({ tMs: t, xPx: 1400 - t * 0.2, valid: true });  // 0.4초에 80px
  assert.equal(countAll(s, 152), 0);
});

test('한 번 돌아간 뒤 0.7초 안의 두 번째 하강은 같은 줄바꿈으로 본다', () => {
  const s = [{ tMs: 0, xPx: 1300, valid: true }, { tMs: 40, xPx: 1300, valid: true },
             { tMs: 80, xPx: 900, valid: true }, { tMs: 120, xPx: 1100, valid: true }, { tMs: 160, xPx: 620, valid: true }];
  assert.equal(countAll(s, 152), 1);
});

test('무효 표본·숫자 아닌 x는 건너뛴다', () => {
  const c = createGazeSweepCounter({ minDropPx: 152 });
  c.push({ tMs: 0, xPx: 1300, valid: true });
  assert.equal(c.push({ tMs: 40, xPx: 600, valid: false }), false);
  assert.equal(c.push({ tMs: 80, xPx: NaN, valid: true }), false);
  assert.equal(c.push({ tMs: 120, xPx: 600, valid: true }), true);
  assert.equal(c.count, 1);
  c.reset(); assert.equal(c.count, 0);
});

test('minDropPx가 0 이하면 바로 오류', () => {
  assert.throws(() => createGazeSweepCounter({ minDropPx: 0 }));
});

test('줄 중간으로 되돌아가 다시 읽는 이동은 세지 않는다 (착지가 줄 처음 근처가 아님)', () => {
  const s = [{ tMs: 0, xPx: 1180, yPx: 500, valid: true }, { tMs: 40, xPx: 1180, yPx: 500, valid: true }, { tMs: 80, xPx: 1010, yPx: 500, valid: true }];
  assert.equal(countAll(s), 0);
});

test('위로 크게 튀며 왼쪽으로 가면(버튼·다른 곳) 세지 않고, 한 줄 내려가며 돌아오면 센다', () => {
  const up = [{ tMs: 0, xPx: 1300, yPx: 700, valid: true }, { tMs: 80, xPx: 650, yPx: 300, valid: true }];
  assert.equal(countAll(up), 0);
  const down = [{ tMs: 0, xPx: 1300, yPx: 500, valid: true }, { tMs: 80, xPx: 650, yPx: 540, valid: true }];
  assert.equal(countAll(down), 1);
  const noY = [{ tMs: 0, xPx: 1300, valid: true }, { tMs: 80, xPx: 650, valid: true }];   // y가 없으면 세로 조건은 보지 않는다
  assert.equal(countAll(noY), 1);
});

test('expectedDetectableSweeps: 앞줄 폭으로 가중 (152px 미만 0, 352px 이상 1), 마지막 줄 제외', () => {
  assert.deepEqual([...AUX_WEIGHT_RAMP], [0.19, 0.44]);
  assert.equal(expectedDetectableSweeps([800, 800, 800], 800), 2);
  assert.equal(expectedDetectableSweeps([100, 140, 800], 800), 0);          // 짧은 줄 뒤는 0
  assert.ok(Math.abs(expectedDetectableSweeps([252, 0], 800) - 0.5) < 1e-9); // 152~352의 가운데 → 0.5
  assert.equal(expectedDetectableSweeps([799], 800), 0);                     // 한 줄짜리 쪽
  assert.equal(expectedDetectableSweeps([], 800), 0);
  assert.equal(expectedDetectableSweeps(null, 800), 0);
  // 경계 근처 줄(319px)이 많아도 분모가 갑자기 무너지지 않는다
  const booth = [216, 202, 177, 382, 228, 261, 156, 293, 319, 319, 319, 319];
  assert.ok(expectedDetectableSweeps(booth, 800) > 5);
  assert.equal(expectedReturnSweeps(booth.length), 11);
});

test('auxScore: 개수 ÷ 기대 × 100, 넘쳐도 자르지 않음, 기대 0이면 null', () => {
  assert.equal(auxScore(9, 9), 100);
  assert.equal(auxScore(6, 8), 75);
  assert.equal(auxScore(11, 9), (11 / 9) * 100);
  assert.equal(auxScore(3, 0), null);
  assert.equal(auxScore(5, 4.5), (5 / 4.5) * 100);   // 가중 분모는 소수일 수 있다
  assert.equal(auxScore(-1, 5), null);
  assert.equal(auxScore(1.5, 5), null);
});

test('nextLineAfterSweep: 긴 줄 뒤에서는 한 줄씩', () => {
  const w = [700, 700, 700, 700];
  assert.equal(nextLineAfterSweep(0, w, 800), 1);
  assert.equal(nextLineAfterSweep(2, w, 800), 3);
  assert.equal(nextLineAfterSweep(3, w, 800), 3);   // 마지막 줄을 넘지 않는다
});

test('nextLineAfterSweep: 짧은 줄에 있다가 잡히면 다음 긴 줄을 끝낸 것으로 보고 그 다음 줄로', () => {
  const w = [700, 120, 700, 90, 150, 700, 600];   // 252px 미만이 짧은 줄
  assert.equal(nextLineAfterSweep(0, w, 800), 1);
  assert.equal(nextLineAfterSweep(1, w, 800), 3);   // 1(짧음) 건너뛰고 2를 끝냄 → 3
  assert.equal(nextLineAfterSweep(3, w, 800), 6);   // 3·4(짧음) 건너뛰고 5를 끝냄 → 6
});

test('nextLineAfterSweep: 남은 줄이 모두 짧으면 한 줄만, 빈 쪽은 0', () => {
  assert.equal(nextLineAfterSweep(1, [700, 100, 100, 100], 800), 2);
  assert.equal(nextLineAfterSweep(0, [], 800), 0);
  assert.equal(nextLineAfterSweep(9, [700, 700], 800), 1);
});

/** 시선 표본 넣기 도우미: [시각ms, x] 목록 → 줄이 바뀐 기록 */
function feed(locker, pts) { const out = []; for (const [t, x] of pts) { const r = locker.push({ tMs: t, xPx: x, yPx: 500, valid: true }); if (r) out.push(r); } return out; }
const still = (t0, t1, x) => { const a = []; for (let t = t0; t <= t1; t += 40) a.push([t, x]); return a; };

test('줄 추적기: 긴 줄 줄바꿈으로 한 줄씩 넘기고 읽기 속도를 잰다', () => {
  const L = createLineLocker({ lineWidths: [700, 700, 700], layout: LAYOUT, textLeftPx: 600 });
  const steps = feed(L, [...still(0, 2000, 1250), [2040, 620], ...still(2080, 4000, 1250), [4040, 620]]);
  assert.deepEqual(steps.map((s) => [s.from, s.to, s.cause]), [[0, 1, 'sweep'], [1, 2, 'sweep']]);
  assert.equal(L.line, 2);
  assert.ok(L.speed > 300 && L.speed < 400);   // 700px를 약 2초에
});

test('줄 추적기: 짧은 줄에 오래 머물면 다음 줄로 (끝에서 두 번째 줄이 짧아도 마지막 줄에 도착)', () => {
  const L = createLineLocker({ lineWidths: [700, 177, 749], layout: LAYOUT, textLeftPx: 600 });
  const steps = feed(L, [...still(0, 2000, 1250), [2040, 620], ...still(2080, 5000, 700)]);
  // 177px ÷ 기본 250px/s(아직 잰 속도가 2초 → 350px/s) + 1.5초 ≈ 2초 뒤 머묾 넘김
  assert.deepEqual(steps.map((s) => [s.from, s.to, s.cause]), [[0, 1, 'sweep'], [1, 2, 'dwell']]);
  assert.equal(L.line, 2);
});

test('줄 추적기: 긴 줄에서는 머물러도 넘기지 않고, 마지막 줄을 넘지 않는다', () => {
  const L = createLineLocker({ lineWidths: [700, 700], layout: LAYOUT, textLeftPx: 600 });
  assert.deepEqual(feed(L, still(0, 20000, 900)), []);
  const M = createLineLocker({ lineWidths: [120, 130], layout: LAYOUT, textLeftPx: 600 });
  const steps = feed(M, still(0, 20000, 700));
  assert.deepEqual(steps.map((s) => s.to), [1]);
  assert.equal(M.line, 1);
});

test('줄 추적기: 무효 표본은 무시', () => {
  const L = createLineLocker({ lineWidths: [120, 700], layout: LAYOUT, textLeftPx: 600 });
  assert.equal(L.push({ tMs: 0, xPx: 700, valid: false }), null);
  assert.equal(L.push(null), null);
  assert.equal(L.line, 0);
});

// ---- 끊김을 가로지른 이동은 줄바꿈이 아니다 (maxGapMs)
test('줄바꿈 계수기: 추적이 끊긴 사이를 가로지른 x 이동은 세지 않는다', () => {
  const opts = { minDropPx: 152, landingMaxX: 800, minDyPx: -40 };
  const feedGap = (counter) => {
    counter.push({ tMs: 0, xPx: 1350, yPx: 500, valid: true });     // 줄 끝
    return counter.push({ tMs: 3000, xPx: 620, yPx: 500, valid: true });   // 3초 뒤, 줄 처음
  };
  // windowMs를 넓혀 "창 안"이라는 조건만으로는 걸러지지 않게 해 둔다
  assert.equal(feedGap(createGazeSweepCounter({ ...opts, windowMs: 5000 })), true, '지금 기본값은 센다');
  assert.equal(feedGap(createGazeSweepCounter({ ...opts, windowMs: 5000, maxGapMs: 250 })), false, 'maxGapMs를 주면 안 센다');
});

test('줄바꿈 계수기: 끊김이 없으면 maxGapMs를 줘도 똑같이 센다', () => {
  const opts = { minDropPx: 152, landingMaxX: 800, minDyPx: -40 };
  const feed = (counter) => {
    let n = 0;
    for (let t = 0; t <= 360; t += 40) if (counter.push({ tMs: t, xPx: 1350 - t * 2, yPx: 500, valid: true })) n++;
    return n;
  };
  assert.equal(feed(createGazeSweepCounter({ ...opts, maxGapMs: 250 })), feed(createGazeSweepCounter(opts)));
});

test('줄바꿈 계수기: droppedWindows가 끊김 횟수를 센다', () => {
  const c = createGazeSweepCounter({ minDropPx: 152, maxGapMs: 250 });
  c.push({ tMs: 0, xPx: 900, valid: true });
  c.push({ tMs: 100, xPx: 900, valid: true });
  assert.equal(c.droppedWindows, 0);
  c.push({ tMs: 2000, xPx: 900, valid: true });
  assert.equal(c.droppedWindows, 1);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
