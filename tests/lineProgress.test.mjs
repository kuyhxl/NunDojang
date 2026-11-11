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
