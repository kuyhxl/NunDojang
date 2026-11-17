// 줄 단위 진행 점수 — C 소유. 개발용 시험 정책(?score=lines), 팀 합의 전.
// 점수 = 읽은 줄 수 ÷ 전체 줄 수 × 100.
// 왜: 줄바꿈 횟수 ÷ (줄 수 − 1)은 짧은 줄 뒤 줄바꿈이 원리상 잘 안 잡혀, 끝까지 성실히 읽어도 27~67%에 그쳤다
//     (2026-11-10 20:49 consent 기록). 줄마다 "읽어 나갔는가"를 보면 짧은 줄도 시간으로 인정할 수 있다.
// 어느 줄에 있는지는 줄 추적기(gazeSweep.js createLineLocker: 시선 x 줄바꿈 + 짧은 줄 머묾)가 정한다.
// 한 줄(또는 추적기가 한 번에 건너뛴 줄 묶음)은 아래 둘을 모두 만족하면 읽음:
//   - 가로 진행: 그 줄에 있는 동안 시선 x 범위가 (묶음에서 가장 긴) 줄 폭의 LP_X_RATIO 이상
//                (단 폭 19% 미만의 짧은 줄은 시선 x로 가리기 어려워 면제)
//   - 시간: 줄 폭 합 ÷ 최대 읽기 속도 이상 머묾 (휙 훑기만 한 것을 거른다. 성실한 사람이 떨어지지 않게 넉넉히)
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.
import { createLineLocker, SWEEP_DROP_RATIO } from './gazeSweep.js';

export const LINE_PROGRESS_POLICY = 'line-progress/0.1.0-dev';
/** 가로 진행 기준: 줄 폭의 40% (시선 x가 실제보다 20~30% 눌려 찍히는 것을 감안) */
export const LP_X_RATIO = 0.4;
/** 최대 읽기 속도: 초당 단 폭 1개 (800px 단 → 800px/s, 실측 평균 190~350px/s의 2~4배) */
export const LP_MAX_SPEED_RATIO = 1.0;
/** 표본이 이보다 오래 끊기면 그 사이는 읽은 시간으로 세지 않는다 (ms).
 *  A(민서)의 측정 시제품이 쓰는 maxGapMs 250과 같은 값이다 — 방법만 가져왔고 코드는 옮기지 않았다.
 *  (출처: PR #14 HorizontalDetector의 유효 시간 회계. 그 구현은 GPL-3.0이라 제품에 넣지 않는다) */
export const LP_MAX_GAP_MS = 250;

/**
 * @param {object} o
 * @param {number[]} o.lineWidths 글줄 폭 (위에서부터)
 * @param {{columnPx:number, lineHeightPx:number}} o.layout
 * @param {number} o.textLeftPx 글 왼쪽 끝의 화면 x
 * @param {null|((k:number)=>number)} [o.lineCenterY=null] 줄 k 중심의 화면 y. 주면 `yLineOf`로 비교·기록할 수 있다 (그것만으로는 동작이 바뀌지 않는다).
 * @param {boolean} [o.yFix=false] true일 때만 y로 줄 번호를 바로잡는다 (?yfix=1).
 *   **켜지 말 것** — 세로 이득 0.53·오차 ±2.1줄로 측정되어 폐기한 안이다 (docs/comprehension_evidence.md 9-6).
 * @param {number|null} [o.maxGapMs=null] 주면 시간 조건을 **벽시계가 아니라 유효 시간**으로 센다 (?validtime=1).
 *   왜: 지금은 `tMs - 구간 시작`이라, 추적이 5초 끊겨도 그 5초가 읽은 시간으로 계산돼 시간 조건이 공짜로 통과한다.
 *   주면 표본 사이 간격이 maxGapMs 이하일 때만 그 간격을 더한다. 끊긴 동안은 0초로 친다.
 *   기본 null = 지금 동작 그대로. 점수가 바뀌는 변경이라 합의 전에는 주소 플래그로만 켠다.
 */
export function createLineProgress({ lineWidths, layout, textLeftPx, xRatio = LP_X_RATIO, maxSpeedRatio = LP_MAX_SPEED_RATIO, lineCenterY = null, yFix = false, maxGapMs = null }) {
  const widths = Array.isArray(lineWidths) ? lineWidths.map((w) => (Number.isFinite(w) ? w : 0)) : [];
  const locker = createLineLocker({ lineWidths: widths, layout, textLeftPx, lineCenterY, yFix });
  const maxSpeed = maxSpeedRatio * layout.columnPx;          // px/s
  const shortMin = SWEEP_DROP_RATIO * layout.columnPx;        // 이보다 짧으면 가로 진행 면제
  const read = new Set();
  // 두 가지 구간을 따로 잰다.
  //  - 줄바꿈 구간: 직전 줄바꿈(또는 쪽 시작)부터. 줄바꿈이 잡히면 그 사이 줄 묶음을 이 구간으로 판정한다.
  //    머묾 넘김은 짧은 줄에서 늦게 일어날 수 있어, 그 뒤 줄의 시간을 짧게 잡지 않도록 이 구간을 끊지 않는다.
  //  - 줄 구간: 지금 줄에 들어온 때부터. 지금 줄(마지막 줄 포함)을 그 자리에서 판정할 때 쓴다.
  const span = () => ({ startMs: null, startLine: 0, minX: Infinity, maxX: -Infinity, validMs: 0 });
  let sweepSpan = span(), lineSpan = span();
  let lastValidMs = null, prevValid = false, lastGroup = null;
  const restart = (sp, t, x, line) => { sp.startMs = t; sp.startLine = line; sp.validMs = 0; sp.minX = sp.maxX = Number.isFinite(x) ? x : NaN; if (!Number.isFinite(sp.minX)) { sp.minX = Infinity; sp.maxX = -Infinity; } };
  const widen = (sp, x) => { if (Number.isFinite(x)) { sp.minX = Math.min(sp.minX, x); sp.maxX = Math.max(sp.maxX, x); } };

  /** from..toExcl−1 줄 묶음이 sp 구간 동안 읽은 것으로 볼 만한가 */
  function groupOk(sp, from, toExcl, tMs) {
    let sum = 0, longest = 0;
    for (let k = from; k < toExcl; k++) { sum += widths[k]; longest = Math.max(longest, widths[k]); }
    const wallMs = tMs - sp.startMs;
    const elapsedMs = maxGapMs === null ? wallMs : sp.validMs;   // 끊긴 시간은 읽은 시간이 아니다
    const timeOk = elapsedMs / 1000 >= sum / maxSpeed;
    const xOk = longest < shortMin || sp.maxX - sp.minX >= xRatio * longest;
    lastGroup = { from, to: toExcl, sumPx: sum, longestPx: longest, wallMs, elapsedMs,
      coverage: wallMs > 0 ? sp.validMs / wallMs : null, rangePx: sp.maxX - sp.minX, timeOk, xOk };
    return timeOk && xOk;
  }
  function credit(from, toExcl, out) {
    for (let k = from; k < toExcl; k++) if (!read.has(k)) { read.add(k); out.push(k); }
  }

  /**
   * 시선 표본 하나. credit=false면 줄 위치만 따라가고 읽음은 매기지 않는다 (측정 구간 밖).
   * @returns {{step: null|{from,to,cause}, newly: number[]}} 줄 이동과 새로 읽음이 된 줄 번호
   */
  function push(sample, { credit: canCredit = true } = {}) {
    const newly = [];
    if (!sample?.valid || !Number.isFinite(sample.tMs)) { prevValid = false; return { step: null, newly }; }
    const t = sample.tMs, x = sample.xPx;
    if (sweepSpan.startMs === null) { restart(sweepSpan, t, x, 0); restart(lineSpan, t, x, 0); }
    // 바로 앞 표본도 유효했고 그 사이가 너무 벌어지지 않았을 때만 그 간격을 읽은 시간으로 더한다.
    const dt = lastValidMs === null ? 0 : t - lastValidMs;
    if (prevValid && dt > 0 && (maxGapMs === null || dt <= maxGapMs)) { sweepSpan.validMs += dt; lineSpan.validMs += dt; }
    lastValidMs = t; prevValid = true;
    widen(sweepSpan, x); widen(lineSpan, x);
    const step = locker.push(sample);
    if (step?.cause === 'sweep') {
      // 직전 줄바꿈 뒤 첫 줄부터 방금 끝낸 줄까지 (이미 읽음이 된 줄은 그대로)
      if (canCredit && groupOk(sweepSpan, sweepSpan.startLine, step.to, t)) credit(sweepSpan.startLine, step.to, newly);
      restart(sweepSpan, t, x, step.to); restart(lineSpan, t, x, step.to);
    } else if (step?.cause === 'dwell') {
      // 짧은 줄에 충분히 머물렀다 (머묾 넘김 자체가 시간 조건보다 길다)
      if (canCredit) credit(step.from, step.to, newly);
      restart(lineSpan, t, x, step.to);
    } else if (step?.cause === 'yfix') {
      // y가 크게 어긋나 자리를 옮긴 것이다. 읽은 증거가 아니므로 아무 줄도 인정하지 않고 구간만 다시 잡는다.
      restart(sweepSpan, t, x, step.to); restart(lineSpan, t, x, step.to);
    } else if (canCredit) {
      const cur = locker.line;
      if (!read.has(cur) && groupOk(lineSpan, cur, cur + 1, t)) credit(cur, cur + 1, newly);   // 지금 줄 (마지막 줄 포함)
    }
    return { step, newly };
  }

  return {
    push,
    get line() { return locker.line; },
    get speed() { return locker.speed; },
    get readLines() { return [...read].sort((a, b) => a - b); },
    get lineCount() { return widths.length; },
    /** 마지막 줄바꿈의 시각·위치 (기록·분석용) */
    get lastSweep() { return locker.lastSweep; },
    /** 마지막 묶음 판정의 속사정 (기록·분석용). 벽시계·유효 시간·유효 비율을 함께 준다 */
    get lastGroup() { return lastGroup ? { ...lastGroup } : null; },
    /** 지금 y로 보면 몇 번째 줄인가 (기록·비교용) */
    yLineOf: (sample) => locker.yLineOf(sample)
  };
}

/** 쪽 점수 (%). 줄이 없으면 null. */
export function lineProgressScore(readCount, lineCount) {
  if (!Number.isInteger(readCount) || readCount < 0 || !Number.isInteger(lineCount) || lineCount <= 0) return null;
  return (Math.min(readCount, lineCount) / lineCount) * 100;
}

/** "여기까지 읽으면 통과" 표시를 둘 줄 번호 (0부터). 위에서부터 차례로 읽는다고 볼 때 기준 점수에 처음 닿는 줄. */
export function passLineIndex(lineCount, passThreshold) {
  if (!Number.isInteger(lineCount) || lineCount <= 0) return null;
  return Math.min(lineCount, Math.max(1, Math.ceil((passThreshold / 100) * lineCount - 1e-9))) - 1;
}
