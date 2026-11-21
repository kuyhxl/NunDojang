// 소리 내어 읽기 시험 — voiceMeter.js의 음절 세기와 keySpans.js의 소리 조건.  실행:  node tests/voiceMeter.test.mjs
// 신호는 합성한 것이다 (음절마다 솟았다 꺼지는 크기). 실제 목소리로 검증한 것이 아니다.

import assert from 'node:assert/strict';
import { createSyllableCounter, countSyllables, VOICE_POLICY } from '../web/modules/voiceMeter.js';
import { createKeySpanWatch, KEY_SPAN_POLICY } from '../web/modules/keySpans.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const quiet = (frames, level = 0.001) => Array.from({ length: frames }, () => level * (0.8 + 0.4 * rnd()));
/** n음절을 초당 rate로 말하는 크기 흐름 (10ms마다 하나). dip: 음절 사이 골의 깊이(봉우리 대비 비율) */
function speech({ n, rate = 5.5, dip = 0.3, noise = 0.001, peak = 0.1 }) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const T = Math.round((100 / rate) * (0.85 + 0.3 * rnd())), p = peak * (0.6 + 0.8 * rnd());
    for (let i = 0; i < T; i++) out.push(noise + p * (dip + (1 - dip) * Math.sin(Math.PI * (i + 0.5) / T) ** 2));
  }
  return out;
}
const count = (sig) => { const c = createSyllableCounter(); for (const v of sig) c.push(v); return c.take(); };

test('조용하면 음절도 말소리 시간도 0', () => {
  const r = count(quiet(800));
  assert.equal(r.syllables, 0); assert.equal(r.voicedMs, 0);
});

test('또박또박 30음절을 말하면 거의 30으로 센다 (초당 4~7음절)', () => {
  for (const rate of [4, 5.5, 7]) {
    const r = count([...quiet(80), ...speech({ n: 30, rate }), ...quiet(60)]);
    assert.ok(r.syllables >= 27 && r.syllables <= 32, `초당 ${rate}: ${r.syllables}음절`);
    assert.ok(r.voicedMs >= 30 * 90, `말소리 ${r.voicedMs}ms`);
  }
});

test('골이 얕아도(−6dB) 대부분 센다. 아주 얕으면(−3dB) 덜 센다 — 그래서 판정은 절반만 요구한다', () => {
  const mid = count([...quiet(80), ...speech({ n: 30, dip: 0.5 }), ...quiet(60)]);
  assert.ok(mid.syllables >= 24, `−6dB: ${mid.syllables}`);
  const shallow = count([...quiet(80), ...speech({ n: 30, dip: 0.7 }), ...quiet(60)]);
  assert.ok(shallow.syllables < 30, `−3dB: ${shallow.syllables}`);
});

test('길게 "음—" 하고만 있으면 말소리 시간은 차지만 음절은 한둘이다', () => {
  const hum = count([...quiet(80), ...Array.from({ length: 600 }, () => 0.08 * (0.97 + 0.06 * rnd())), ...quiet(60)]);
  assert.ok(hum.voicedMs > 5000);
  assert.ok(hum.syllables <= 2, `${hum.syllables}음절`);
});

test('시끄럽기만 하고 말이 없으면 세지 않는다 (바닥 소리를 따라 올라간다)', () => {
  const r = count(quiet(1000, 0.02));
  assert.ok(r.syllables <= 1 && r.voicedMs < 300, `${r.syllables}음절 ${r.voicedMs}ms`);
});

test('take()는 가져간 뒤 비운다', () => {
  const c = createSyllableCounter();
  for (const v of [...quiet(80), ...speech({ n: 10 }), ...quiet(60)]) c.push(v);
  assert.ok(c.take().syllables >= 8);
  assert.deepEqual(c.take(), { syllables: 0, voicedMs: 0, frames: 0 });
  assert.ok(c.state.totalSyllables >= 8, '합계는 남는다');
});

test('keepLevels: 켰을 때만 10ms마다의 크기 숫자(dB)를 함께 내주고, 가져가면 비운다', () => {
  const off = createSyllableCounter();
  for (const v of quiet(50)) off.push(v);
  assert.equal('levels' in off.take(), false, '기본은 숫자를 남기지 않는다');
  const on = createSyllableCounter(VOICE_POLICY, { keepLevels: true });
  for (const v of [...quiet(30), ...speech({ n: 3 })]) on.push(v);
  const r = on.take();
  assert.equal(r.levels.length, r.frames);
  assert.ok(r.levels.every((d) => Number.isFinite(d) && d <= 0 && Math.round(d * 10) === d * 10 || Math.abs(d * 10 - Math.round(d * 10)) < 1e-6), 'dB, 소수 한 자리');
  assert.ok(Math.max(...r.levels) > -30 && Math.min(...r.levels) < -55, `범위 ${Math.min(...r.levels)}~${Math.max(...r.levels)}`);
  assert.deepEqual(on.take().levels, []);
});

test('countSyllables: 한글 한 글자가 한 음절. 공백·문장부호는 세지 않는다', () => {
  assert.equal(countSyllables('검사 전날 밤 9시 이후에는'), 11);     // 한글 10 + 숫자 1
  assert.equal(countSyllables('안 됩니다.'), 4);
  assert.equal(countSyllables(' , . ! '), 0);
  assert.equal(countSyllables(null), 0);
});

// ---- keySpans.js: 소리 조건
const LAYOUT = { fontPx: 20, columnPx: 800, lineHeightPx: 40 };
const TEXT = '호흡이 느려지거나 혈압이 떨어질 수 있으며';       // 한글 18자 = 18음절
const MARKS = [[], [{ left: 200, width: 400, chars: TEXT.length, type: 'Highlight', text: TEXT }], []];
const mkv = (voice) => createKeySpanWatch({ lineMarks: MARKS, layout: LAYOUT, voice });
/** 줄 1의 표시 위에 ms 동안 머물며, 그동안 초당 rate 음절을 고르게 소리 낸다 (0이면 조용히 본다) */
function dwell(W, { t0 = 0, ms, rate = 0, line = 1, x = 400 }) {
  const out = []; let acc = 0;
  for (let u = 0; u <= ms; u += 33) {
    acc += (rate * 33) / 1000; const syl = Math.floor(acc); acc -= syl;
    out.push(...W.push({ tMs: t0 + u, x, line, syllables: syl, voicedMs: rate > 0 ? 25 : 0 }));
  }
  return out;
}

test('소리 조건: 음절 수의 절반, 음절당 90ms의 말소리', () => {
  const sp = mkv(true).spans[0];
  assert.equal(sp.syllables, 18);
  assert.equal(sp.needSyllables, 9);
  assert.equal(sp.needVoicedMs, 18 * 90);
  assert.equal(KEY_SPAN_POLICY.minSyllableRatio, 0.5);
});

test('소리 조건이 켜져 있으면 보기만 해서는 채워지지 않는다', () => {
  const W = mkv(true);
  dwell(W, { ms: 6000 });
  assert.equal(W.done, 0);
  assert.equal(W.spans[0].progress, 0, '시선은 찼지만 소리가 0이다');
  const G = mkv(false);
  dwell(G, { ms: 6000 });
  assert.equal(G.done, 1, '소리 조건이 없으면(?marks=1) 시선만으로 채워진다');
});

test('그 줄을 보면서 소리 내어 읽으면 채워진다', () => {
  const W = mkv(true);
  const newly = dwell(W, { ms: 4000, rate: 5.5 });     // 4초 동안 22음절
  assert.deepEqual(newly, ['1:0']);
  assert.equal(W.done, 1);
});

test('소리를 내도 다른 줄을 보고 있으면 그 표시의 것이 아니다', () => {
  const W = mkv(true);
  dwell(W, { ms: 4000, rate: 5.5, line: 0 });
  dwell(W, { t0: 5000, ms: 4000, rate: 5.5, line: 2 });
  assert.equal(W.done, 0);
  assert.equal(W.spans[0].bestHeard, 0);
});

test('줄을 떠나면 들은 것도 0으로 돌아간다 — 조금씩 나눠 읽어 채울 수 없다', () => {
  const W = mkv(true);
  for (let k = 0; k < 4; k++) {
    dwell(W, { t0: k * 3000, ms: 800, rate: 5.5 });                   // 0.8초씩만 읽고 (4음절쯤)
    dwell(W, { t0: k * 3000 + 900, ms: 800, rate: 0, line: 2 });      // 다른 줄로 갔다 온다
  }
  assert.equal(W.done, 0);
  assert.ok(W.spans[0].bestHeard <= 5);
});

test('"음—" 하고 버티면 말소리 시간은 차도 음절이 모자라 채워지지 않는다', () => {
  const W = mkv(true);
  for (let u = 0; u <= 6000; u += 33) W.push({ tMs: u, x: 400, line: 1, syllables: u === 0 ? 1 : 0, voicedMs: 33 });
  assert.equal(W.done, 0);
  assert.ok(W.spans[0].voicedMs >= W.spans[0].needVoicedMs);
});

test('snapshot에 소리 조건과 들은 음절 수가 들어간다 (기록용)', () => {
  const W = mkv(true);
  dwell(W, { ms: 4000, rate: 5.5 });
  const sn = W.snapshot();
  assert.equal(sn.voice, true);
  assert.equal(sn.limits.minSyllableRatio, 0.5);
  assert.ok(sn.spans[0].heard >= 9 && sn.spans[0].needSyllables === 9);
  assert.equal('heard' in mkv(false).snapshot().spans[0], false, '소리 조건이 없으면 소리 항목도 없다');
  assert.equal(VOICE_POLICY.version, 'voice-syllable/0.1.0-dev');
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
