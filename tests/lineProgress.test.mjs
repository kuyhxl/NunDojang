// 줄 단위 진행 점수 시험 — lineProgress.js와 pageScoring의 line-progress 분기.  실행:  node tests/lineProgress.test.mjs
// 합성 시선으로 "수식이 의도한 대로 동작하는가"만 본다. 실제 사람 눈으로 검증한 값이 아니다.

import assert from 'node:assert/strict';
import { createLineProgress, lineProgressScore, passLineIndex, LINE_PROGRESS_POLICY } from '../web/modules/lineProgress.js';
import { evaluatePage } from '../web/modules/pageScoring.js';
import { DEFAULT_CONFIG } from '../web/modules/config.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const LAYOUT = { columnPx: 800, lineHeightPx: 40 };
const LEFT = 600;
// consent.pdf 20px판 1쪽 실제 줄 폭 (짧은 줄 138·154px 포함)
const P1 = [573, 138, 404, 530, 755, 423, 666, 791, 764, 154, 776, 538];

/** 사람처럼 읽기: 줄마다 왼쪽→오른쪽 계단식(시선 x는 실제의 80%로 눌려 찍힘), 끝나면 다음 줄 처음으로. 속도 px/s */
function readLines(widths, { speed = 250, gain = 0.8, startMs = 0, from = 0, to = widths.length } = {}) {
  const out = []; let t = startMs; let y = 500;
  for (let k = from; k < to; k++) {
    const dur = Math.max(500, (widths[k] / speed) * 1000);
    for (let u = 0; u <= dur; u += 40) {
      const step = Math.floor((u / dur) * 6) / 6;
      out.push({ tMs: t + u, xPx: LEFT + widths[k] * gain * step, yPx: y, valid: true });
    }
    t += dur + 40; y += 40;
  }
  return { samples: out, endMs: t };
}
function run(widths, samples, opts) {
  const P = createLineProgress({ lineWidths: widths, layout: LAYOUT, textLeftPx: LEFT, ...opts });
  for (const s of samples) P.push(s);
  return P;
}

test('끝까지 읽으면 짧은 줄을 포함해 모든 줄이 읽음 (100%)', () => {
  const { samples } = readLines(P1);
  const P = run(P1, samples);
  assert.equal(P.readLines.length, P1.length, `읽음 ${P.readLines.join(',')}`);
});

test('천천히 읽어도(120px/s) 모두 읽음, 빠르게 읽어도(500px/s) 모두 읽음', () => {
  assert.equal(run(P1, readLines(P1, { speed: 120 }).samples).readLines.length, 12);
  assert.equal(run(P1, readLines(P1, { speed: 500 }).samples).readLines.length, 12);
});

test('한 점만 바라보고 있으면 거의 0', () => {
  const s = []; for (let t = 0; t < 30000; t += 40) s.push({ tMs: t, xPx: 900, yPx: 500, valid: true });
  assert.ok(run(P1, s).readLines.length <= 1);
});

test('절반만 읽고 멈추면 절반 근처', () => {
  const { samples, endMs } = readLines(P1, { to: 6 });
  for (let t = endMs; t < endMs + 15000; t += 40) samples.push({ tMs: t, xPx: 700, yPx: 740, valid: true });
  const n = run(P1, samples).readLines.length;
  assert.ok(n >= 5 && n <= 7, `읽음 ${n}`);
});

test('왼쪽→오른쪽을 0.3초마다 휙휙 오가면 긴 줄은 읽음이 되지 않는다 (최대 속도 800px/s)', () => {
  const s = []; let t = 0;
  for (let k = 0; k < 40; k++) { s.push({ tMs: t, xPx: LEFT, yPx: 500, valid: true }); s.push({ tMs: t + 150, xPx: LEFT + 620, yPx: 500, valid: true }); t += 300; }
  const W = [780, 780, 780, 780, 780, 780];
  assert.ok(run(W, s).readLines.length <= 1);
});

test('측정 구간 밖(credit:false)에서는 줄만 따라가고 읽음은 매기지 않는다', () => {
  const P = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT });
  for (const s of readLines(P1, { to: 4 }).samples) P.push(s, { credit: false });
  assert.equal(P.readLines.length, 0);
  assert.ok(P.line >= 3);
});

test('무효 표본은 무시', () => {
  const P = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT });
  assert.deepEqual(P.push({ tMs: 0, xPx: 700, valid: false }), { step: null, newly: [] });
  assert.deepEqual(P.push(null).newly, []);
});

// ---- y로 줄 번호 바로잡기 (?yfix=1). 줄 k 중심 y = 500 + 40k (readLines가 쓰는 자리와 같다)
const CENTER_Y = (k) => 500 + 40 * k;

test('lineCenterY만 주면 동작이 바뀌지 않는다 (yFix 꺼짐이 기본)', () => {
  const { samples } = readLines(P1);
  const a = run(P1, samples).readLines;
  const b = run(P1, samples, { lineCenterY: CENTER_Y }).readLines;
  assert.deepEqual(b, a);
});

test('yFix: y가 2줄 이상 어긋난 채 0.6초 넘게 이어지면 y 쪽으로 옮기고, 그 걸음으로는 아무 줄도 인정하지 않는다', () => {
  const P = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT, lineCenterY: CENTER_Y, yFix: true });
  let t = 0, steps = [], newlyAll = [];
  const feed = (yPx, untilMs) => {
    for (; t <= untilMs; t += 40) {
      const r = P.push({ tMs: t, xPx: LEFT + 300, yPx, valid: true });
      if (r.step) steps.push(r.step);
      newlyAll.push(...r.newly);
    }
  };
  feed(CENTER_Y(0), 400);                       // 0번 줄에 있다 (긴 줄이라 머묾 넘김은 없다)
  assert.equal(P.line, 0, `줄 ${P.line}`);
  feed(CENTER_Y(5), 1800);                      // y로는 5번 줄. 0.6초 넘게 이어진다
  const fix = steps.find((s) => s.cause === 'yfix');
  assert.ok(fix, `yfix 걸음이 없다: ${JSON.stringify(steps)}`);
  assert.deepEqual([fix.from, fix.to], [0, 5]);
  assert.equal(P.line, 5);
  assert.equal(newlyAll.length, 0, `읽음으로 인정된 줄 ${newlyAll.join(',')}`);
});

test('yFix: 2줄 미만 어긋남이나 짧게 튀는 것으로는 옮기지 않는다', () => {
  const near = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT, lineCenterY: CENTER_Y, yFix: true });
  for (let t = 0; t <= 3000; t += 40) near.push({ tMs: t, xPx: LEFT + 300, yPx: CENTER_Y(1), valid: true });
  assert.equal(near.line, 0, '1줄 차이로는 안 옮긴다');

  const blip = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT, lineCenterY: CENTER_Y, yFix: true });
  for (let t = 0; t <= 3000; t += 40) {
    const far = t % 800 < 400;                  // 0.4초마다 멀리 튀었다 돌아온다 (유지 시간 0.6초 미달)
    blip.push({ tMs: t, xPx: LEFT + 300, yPx: CENTER_Y(far ? 6 : 0), valid: true });
  }
  assert.equal(blip.line, 0, '짧게 튀는 것으로는 안 옮긴다');
});

test('줄바꿈 걸음의 atMs는 검출 시각이 아니라 줄 끝 최고점 시각이다', () => {
  const P = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT });
  let step = null;
  const push = (tMs, xPx) => { const r = P.push({ tMs, xPx, yPx: 500, valid: true }); if (r.step) step = r.step; };
  for (let i = 0; i <= 10; i++) push(i * 100, LEFT + i * 60);   // 0→1000ms 동안 오른쪽으로
  push(1100, LEFT + 20);                                        // 줄 처음으로 돌아왔다
  assert.equal(step?.cause, 'sweep');
  assert.equal(step.atMs, 1000, `atMs ${step.atMs}`);           // 최고 x였던 1000ms
  assert.ok(step.atMs < 1100, '검출 시각보다 앞선다');
  assert.equal(P.lastSweep.landedMs, 1100);
  assert.equal(P.lastSweep.peakX, LEFT + 600);
});

test('yLineOf: lineCenterY가 없으면 null, 있으면 화면 y로 본 줄 번호 (범위 밖은 끝 줄로)', () => {
  const off = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT });
  assert.equal(off.yLineOf({ tMs: 0, xPx: LEFT, yPx: 580, valid: true }), null);
  const on = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT, lineCenterY: CENTER_Y });
  assert.equal(on.yLineOf({ tMs: 0, xPx: LEFT, yPx: 580, valid: true }), 2);
  assert.equal(on.yLineOf({ tMs: 0, xPx: LEFT, yPx: 100, valid: true }), 0);     // 위로 벗어나면 첫 줄
  assert.equal(on.yLineOf({ tMs: 0, xPx: LEFT, yPx: 9999, valid: true }), 11);   // 아래로 벗어나면 끝 줄
  assert.equal(on.yLineOf({ tMs: 0, xPx: LEFT, yPx: null, valid: true }), null);
});

// ---- 끊긴 시간은 읽은 시간이 아니다 (?validtime=1)
test('maxGapMs를 주면 추적이 끊긴 사이는 읽은 시간으로 세지 않는다', () => {
  // 한 줄(780px)을 x만 끝까지 훑되, 가운데에서 6초 끊긴다. 벽시계로는 시간 조건을 넘고 유효 시간으로는 못 넘는다.
  const W = [780, 780];
  const half = (from, to, t0) => {
    const out = [];
    for (let u = 0; u <= 400; u += 40) out.push({ tMs: t0 + u, xPx: LEFT + from + (to - from) * (u / 400), yPx: 500, valid: true });
    return out;
  };
  const samples = [...half(0, 300, 0), ...half(320, 640, 6400)];   // 400ms + 6초 공백 + 400ms
  const wall = run(W, samples).readLines;                          // 지금 기본값: 벽시계
  const valid = run(W, samples, { maxGapMs: 250 }).readLines;      // 유효 시간
  assert.ok(wall.length >= 1, `벽시계로는 읽음이 생겨야 한다: ${wall.join(',')}`);
  assert.equal(valid.length, 0, `유효 시간으로는 0줄이어야 한다: ${valid.join(',')}`);
});

test('끊김이 없으면 maxGapMs를 줘도 결과가 같다', () => {
  const { samples } = readLines(P1);                               // 40ms 간격으로 끊김 없음
  assert.deepEqual(run(P1, samples, { maxGapMs: 250 }).readLines, run(P1, samples).readLines);
});

test('lastGroup이 벽시계·유효 시간·유효 비율을 함께 준다', () => {
  const P = createLineProgress({ lineWidths: P1, layout: LAYOUT, textLeftPx: LEFT, maxGapMs: 250 });
  for (const s of readLines(P1, { to: 3 }).samples) P.push(s);
  const g = P.lastGroup;
  assert.ok(g && g.wallMs > 0, `lastGroup이 없다: ${JSON.stringify(g)}`);
  assert.ok(g.elapsedMs <= g.wallMs, '유효 시간은 벽시계를 넘을 수 없다');
  assert.ok(g.coverage > 0.9, `끊김이 없으면 유효 비율이 1에 가까워야 한다: ${g.coverage}`);
});

test('lineProgressScore / passLineIndex', () => {
  assert.equal(lineProgressScore(12, 12), 100);
  assert.equal(lineProgressScore(9, 12), 75);
  assert.equal(lineProgressScore(13, 12), 100);   // 넘치지 않는다
  assert.equal(lineProgressScore(0, 0), null);
  assert.equal(passLineIndex(12, 80), 9);          // 10번째 줄까지 읽으면 83% ≥ 80
  assert.equal(passLineIndex(7, 80), 5);           // 6/7 = 86%
  assert.equal(passLineIndex(5, 80), 3);           // 4/5 = 80%
  assert.equal(passLineIndex(1, 80), 0);
  assert.equal(passLineIndex(0, 80), null);
});

test('evaluatePage: line-progress 정책이면 점수 = 읽은 줄 ÷ 전체 줄, 품질 조건은 그대로', () => {
  const cfg = { ...DEFAULT_CONFIG, scorePolicyVersion: LINE_PROGRESS_POLICY };
  const base = { pageId: 1, lineCount: 12, supported: true, acceptedEventCount: 2, activeMs: 30000, validMs: 28000 };
  const a = evaluatePage({ ...base, readLines: 10 }, cfg);
  assert.ok(Math.abs(a.rawScore - 83.333) < 0.01); assert.equal(a.passed, true);
  const b = evaluatePage({ ...base, readLines: 9 }, cfg);
  assert.equal(b.rawScore, 75); assert.equal(b.passed, false);
  const c = evaluatePage({ ...base, readLines: 12, validMs: 10000 }, cfg);   // 유효 비율 33% → 품질 부족
  assert.equal(c.passed, false); assert.equal(c.status, 'insufficient_quality');
  const d = evaluatePage({ ...base, readLines: 0 }, cfg);
  assert.ok(d.reasonCodes.includes('no_reading_events'));
  // 기본 정책은 그대로 (줄바꿈 2 ÷ 11)
  const e = evaluatePage({ ...base, readLines: 12 }, DEFAULT_CONFIG);
  assert.ok(Math.abs(e.rawScore - (2 / 11) * 100) < 1e-9);
  assert.throws(() => evaluatePage({ ...base, readLines: -1 }, cfg));   // 계약 밖 값은 조용히 고치지 않는다
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
