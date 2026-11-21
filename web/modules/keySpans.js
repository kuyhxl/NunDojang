// 중요 표시 응시 확인 — C 소유. 개발용 시험(?marks=1), 팀 합의 전. docs/feedback.md 6절.
//
// 무엇: PDF에서 밑줄·형광펜으로 표시된 구간(reflow.js가 줄마다 가로 자리로 옮겨 준다)을
//       **천천히 지나갔는가**를 구간마다 본다. 줄 단위 판정(lineProgress.js)과 따로 돈다.
//
// 왜: 줄 단위 판정은 눈이 줄을 따라가기만 해도 통과한다 (기록 20261121-205559: 읽지 않고 따라가기만 한 43줄이 전부 읽음).
//     표시된 구간에 "분당 1,200자보다 느리게"를 걸면 같은 기록이 10%만 통과하고 정독은 81%가 통과한다.
//     줄 전체에 이 기준을 걸면 성실한 독자가 떨어지지만, 표시된 몇 군데에만 걸면 부담이 작다.
//
// 판정: **줄 추적기가 그 줄에 있는 동안**, 시선 x가 구간(좌우 여유 포함) 안에 머문 시간이
//       "구간의 글자 수 ÷ 최대 속도" 이상이면 인정. 그 줄을 떠나면 머문 시간은 0으로 돌아간다 —
//       빠르게 여러 번 지나가서 채우는 것을 막는다. 다시 읽으려면 그 줄로 돌아와 한 번에 채워야 한다.
//
// 못 하는 것 (재서 확인한 한계):
//   - **어느 줄인지는 시선으로 확인하지 못한다.** 세로 오차가 줄 간격보다 크다. 줄 번호는 줄 추적기를 믿는다.
//     줄 추적기가 한두 줄 밀리면 엉뚱한 줄에서 인정될 수 있다.
//   - 한두 단어짜리 표시는 못 짚는다 (줄 안에서 가로 오차 3.5~5.7자). minChars보다 짧으면 그만큼으로 넓힌다.
//   - 표시된 곳에서만 멈춰도 통과한다. "중요한 부분은 봤다"까지가 이 기능이 말하는 바다. 이해했다는 뜻이 아니다.
//
// 소리 내어 읽기 (voice: true, ?marks=voice): 위 조건에 더해, 그 구간에 시선이 있는 동안 **마이크로 들린 음절 수**가
//   구간의 음절 수(한글 한 글자 = 한 음절)의 절반 이상이고 말소리 시간이 음절당 90ms 이상이어야 한다 (voiceMeter.js).
//   시선은 "어느 표시를 읽는 중인가"를, 소리는 "정말 읽고 있는가"를 맡는다. 멈춰 서서 보기만 해서는 채워지지 않는다.
//   소리의 내용은 확인하지 않는다 — 아무 말이나 그 길이만큼 하면 통과한다.
//
// 문턱은 **가상의 표시**를 기록 세 개에 놓고 고른 잠정값이다. 실제 표시를 보고 읽은 기록으로 다시 골라야 한다.
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

import { countSyllables } from './voiceMeter.js';

export const KEY_SPAN_POLICY = Object.freeze({
  version: 'key-span/0.1.0-dev',
  /** 이 속도(자/분)보다 느리게 지나가야 인정한다 */
  maxCharsPerMin: 1200,
  /** 구간 좌우로 받아 주는 여유 (글자 수). 20px판이면 40px */
  marginChars: 2,
  /** 이보다 짧은 표시는 이 글자 수만큼으로 넓혀서 본다 (가운데를 맞춘다) */
  minChars: 6,
  /** 아무리 짧아도 이만큼(ms)은 머물러야 한다 */
  minMs: 300,
  /** 표본이 이보다 오래 끊기면 그 사이는 머문 시간으로 세지 않는다 */
  maxGapMs: 250,
  /** 소리 내어 읽기: 들린 음절 수가 구간 음절 수의 이 비율 이상이어야 한다.
   *  크기 변화로 세는 음절은 덜 세어진다(모음이 이어지면 골이 얕다). 그래서 절반만 요구한다 */
  minSyllableRatio: 0.5,
  /** 소리 내어 읽기: 말소리 시간이 음절당 이만큼(ms) 이상이어야 한다 (초당 11음절보다 빠른 낭독은 없다) */
  minVoicedMsPerSyllable: 90,
  source: '2026-11-21 기록 3개에 가상의 표시를 놓고 고른 잠정값 (docs/feedback.md 6-2절). 한 사람'
});

/**
 * 한 쪽의 중요 표시를 지켜본다. 쪽마다 새로 만든다.
 *
 * @param {object} o
 * @param {Array<Array<{left:number, width:number, chars:number, type:string, cont?:boolean}>>} o.lineMarks
 *   줄마다의 표시 (reflow.drawPage가 돌려준 lineBoxes[k].marks). left는 캔버스 왼쪽 끝에서 잰 CSS px
 * @param {{fontPx:number}} o.layout
 */
export function createKeySpanWatch({ lineMarks = [], layout, voice = false, policy = KEY_SPAN_POLICY }) {
  const em = layout?.fontPx > 0 ? layout.fontPx : 13;
  const margin = policy.marginChars * em;
  const spans = [];
  lineMarks.forEach((marks, line) => {
    (marks ?? []).forEach((m, i) => {
      if (!(m.width > 0) || !(m.chars > 0)) return;
      // 앞줄에서 넘어온 짧은 꼬리("…해야 / 합니다.")는 따로 요구하지 않는다. 앞줄의 본체가 그 표시를 대표한다
      if (m.cont && m.chars < policy.minChars) return;
      let left = m.left, right = m.left + m.width, chars = m.chars;
      if (chars < policy.minChars) {            // 짧은 표시는 넓혀서 본다
        const mid = (left + right) / 2, half = (policy.minChars * em) / 2;
        left = mid - half; right = mid + half; chars = policy.minChars;
      }
      const syllables = typeof m.text === 'string' ? countSyllables(m.text) : m.chars;   // 글이 없으면 글자 수로 어림
      spans.push({
        id: `${line}:${i}`, line, type: m.type, chars: m.chars,
        syllables,
        needSyllables: voice ? Math.max(1, Math.ceil(syllables * policy.minSyllableRatio)) : 0,
        needVoicedMs: voice ? syllables * policy.minVoicedMsPerSyllable : 0,
        heard: 0, voicedMs: 0, bestHeard: 0,                // 이번에 그 줄에 있는 동안 들린 음절 수·말소리 시간
        left: m.left, width: m.width,                       // 화면에 그릴 자리 (넓히기 전)
        x0: left - margin, x1: right + margin,              // 판정에 쓰는 자리
        needMs: Math.max(policy.minMs, (chars / (policy.maxCharsPerMin / 60)) * 1000),
        dwellMs: 0, bestMs: 0, done: false, doneAtMs: null
      });
    });
  });

  let lastMs = null, lastLine = null;

  /**
   * 시선 표본 하나.
   * @param {{tMs:number, x:number, line:number, valid?:boolean}} s  x는 캔버스 왼쪽 끝에서 잰 CSS px, line은 줄 추적기의 지금 줄
   * @returns {string[]} 이번에 새로 인정된 표시의 id
   */
  function push(s) {
    const newly = [];
    if (!s || s.valid === false || !Number.isFinite(s.tMs) || !Number.isInteger(s.line)) { lastMs = null; return newly; }
    // 줄을 떠났으면 그 줄 표시들의 머문 시간을 지운다 (한 번에 채워야 한다)
    if (lastLine !== null && s.line !== lastLine) for (const sp of spans) if (sp.line === lastLine && !sp.done) { sp.dwellMs = 0; sp.heard = 0; sp.voicedMs = 0; }
    const dt = lastMs === null ? 0 : s.tMs - lastMs;
    const counted = dt > 0 && dt <= policy.maxGapMs && s.line === lastLine;
    if (counted && Number.isFinite(s.x)) {
      for (const sp of spans) {
        if (sp.done || sp.line !== s.line || s.x < sp.x0 || s.x > sp.x1) continue;
        sp.dwellMs += dt;
        if (sp.dwellMs > sp.bestMs) sp.bestMs = sp.dwellMs;
        if (voice) {     // 이 표본 사이에 들린 소리. 시선이 구간 안에 있을 때의 것만 그 구간의 것으로 친다
          sp.heard += Number.isFinite(s.syllables) ? s.syllables : 0;
          sp.voicedMs += Number.isFinite(s.voicedMs) ? s.voicedMs : 0;
          if (sp.heard > sp.bestHeard) sp.bestHeard = sp.heard;
        }
        const spoken = !voice || (sp.heard >= sp.needSyllables && sp.voicedMs >= sp.needVoicedMs);
        if (sp.dwellMs >= sp.needMs && spoken) { sp.done = true; sp.doneAtMs = s.tMs; newly.push(sp.id); }
      }
    }
    lastMs = s.tMs; lastLine = s.line;
    return newly;
  }

  // 채워진 정도: 시선·음절 수·말소리 시간 가운데 가장 덜 찬 것 (셋 다 차야 채워진다)
  const progress = (sp) => (sp.done ? 1 : Math.min(1, sp.dwellMs / sp.needMs,
    ...(voice ? [sp.heard / sp.needSyllables, sp.needVoicedMs ? sp.voicedMs / sp.needVoicedMs : 1] : [])));
  const view = (sp) => ({ id: sp.id, line: sp.line, type: sp.type, chars: sp.chars, left: sp.left, width: sp.width,
    needMs: Math.round(sp.needMs), dwellMs: Math.round(sp.dwellMs), bestMs: Math.round(sp.bestMs), done: sp.done, doneAtMs: sp.doneAtMs,
    ...(voice ? { syllables: sp.syllables, needSyllables: sp.needSyllables, heard: sp.heard, bestHeard: sp.bestHeard,
      needVoicedMs: Math.round(sp.needVoicedMs), voicedMs: Math.round(sp.voicedMs) } : {}),
    progress: progress(sp) });

  return {
    push,
    /** 앞서 인정된 표시를 되살린다 (쪽을 다시 그리면 감시를 새로 만들기 때문). ids: 인정된 id 목록 */
    restore(ids) { for (const sp of spans) if (ids?.includes?.(sp.id) || ids?.has?.(sp.id)) { sp.done = true; sp.dwellMs = sp.needMs; } },
    /** 소리 내어 읽기를 요구하는가 */
    get voice() { return voice; },
    get spans() { return spans.map(view); },
    get total() { return spans.length; },
    get done() { return spans.filter((sp) => sp.done).length; },
    get allDone() { return spans.every((sp) => sp.done); },
    /** 줄 k에 아직 안 채워진 표시가 있는가 */
    pendingOnLine(k) { return spans.some((sp) => sp.line === k && !sp.done); },
    /** 기록·진단용 */
    snapshot() { return { version: policy.version, voice, total: spans.length, done: spans.filter((sp) => sp.done).length,
      limits: { maxCharsPerMin: policy.maxCharsPerMin, marginChars: policy.marginChars, minChars: policy.minChars,
        ...(voice ? { minSyllableRatio: policy.minSyllableRatio, minVoicedMsPerSyllable: policy.minVoicedMsPerSyllable } : {}) }, spans: spans.map(view) }; }
  };
}
