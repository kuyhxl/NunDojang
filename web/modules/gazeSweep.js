// 시선 x로 줄바꿈 세기 — C 소유. 보조 점수(기록 전용) 실험용이며 공식 점수에는 쓰지 않는다.
// 줄 끝에서 다음 줄 처음으로 돌아갈 때 시선 x가 짧은 시간에 왼쪽으로 크게 이동하는 것을 센다.
// 실측(2026-11-10, 20px판 consent.pdf 4쪽 + 시간표 PDF 2쪽, 한 사람 기록 2회):
//  - 짧은 흔들림은 6~10px라 큰 이동과 쉽게 구분된다.
//  - 이동만 보면 줄 중간으로 되돌아가 다시 읽는 순간(예: 1181→1014px)과
//    쪽 끝에서 버튼·다른 곳을 보는 순간까지 세어 31번(기대 약 25번)이 됐다.
//    → "줄 처음 근처에 착지" + "세로로 한 줄 넘게 위로 튀지 않음"을 더해 27번.
//  - 세로는 절대 위치가 수십 px 밀려도 0.4초 안의 상대 변화는 3~5px로 정확해서 이 판단에 쓸 수 있다.
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

/**
 * @param {object} o
 * @param {number} o.minDropPx  이만큼 넘게 왼쪽으로 가야 줄바꿈으로 본다 (CSS px)
 * @param {number|null} [o.landingMaxX=null]  착지 x가 이 값 이하여야 한다 (줄 처음 근처). null이면 보지 않는다
 * @param {number|null} [o.minDyPx=null]  착지 y − 출발 y가 이 값 이상이어야 한다 (예: −줄 간격). null이면 보지 않는다
 * @param {number} [o.windowMs=400]  이 시간 안에 일어난 이동만 본다
 * @param {number} [o.refractoryMs=700]  줄바꿈 하나를 두 번 세지 않도록 쉬는 시간
 */
export function createGazeSweepCounter({ minDropPx, landingMaxX = null, minDyPx = null, windowMs = 400, refractoryMs = 700 }) {
  if (!(minDropPx > 0)) throw new Error('createGazeSweepCounter: minDropPx must be > 0');
  let recent = [];          // 최근 windowMs 안의 유효 표본 {tMs, xPx, yPx}
  let lastSweepMs = -Infinity;
  let count = 0;

  /**
   * 표본 하나를 넣는다. 줄바꿈이면 true.
   * @param {{tMs:number, xPx:number|null, yPx?:number|null, valid:boolean}} s
   */
  function push({ tMs, xPx, yPx = null, valid }) {
    if (!valid || !Number.isFinite(xPx) || !Number.isFinite(tMs)) return false;
    const y = Number.isFinite(yPx) ? yPx : null;
    recent.push({ tMs, xPx, yPx: y });
    while (recent.length && tMs - recent[0].tMs > windowMs) recent.shift();
    if (tMs - lastSweepMs < refractoryMs) return false;
    let peak = recent[0];
    for (const r of recent) if (r.xPx > peak.xPx) peak = r;
    if (peak.xPx - xPx <= minDropPx) return false;
    if (landingMaxX !== null && xPx > landingMaxX) return false;                       // 줄 중간으로 되돌아감
    if (minDyPx !== null && y !== null && peak.yPx !== null && y - peak.yPx < minDyPx) return false;  // 위로 크게 튐 (버튼·다른 곳)
    count++; lastSweepMs = tMs;
    recent = [{ tMs, xPx, yPx: y }];   // 돌아온 자리부터 다시 본다
    return true;
  }

  function reset() { recent = []; lastSweepMs = -Infinity; count = 0; }

  return { push, reset, get count() { return count; } };
}

/** 줄바꿈으로 볼 최소 이동 폭: 단 폭의 19% (800px 단 → 152px, 520px 단 → 99px) */
export const SWEEP_DROP_RATIO = 0.19;
/** 착지 구역: 글 왼쪽 끝에서 단 폭의 25% 안 (시선 x가 실제보다 왼쪽으로 70px 안팎 밀린 경우도 받는다) */
export const SWEEP_LANDING_RATIO = 0.25;

/**
 * 단 배치로 계수기 설정을 만든다.
 * @param {{columnPx:number, lineHeightPx:number}} layout
 * @param {number} textLeftPx 글 왼쪽 끝의 화면 x (CSS px, 시선 좌표와 같은 기준)
 */
export function sweepOptionsFor(layout, textLeftPx) {
  return {
    minDropPx: Math.round(SWEEP_DROP_RATIO * layout.columnPx),
    landingMaxX: Number.isFinite(textLeftPx) ? textLeftPx + SWEEP_LANDING_RATIO * layout.columnPx : null,
    minDyPx: -layout.lineHeightPx
  };
}

// ---------------------------------------------------------------- 세로 고정 표시(?ylock=1)용 줄 추적
/** 줄바꿈을 "만들 만한" 줄의 최소 폭: 단 폭의 31.5% (가중 분모 19~44%의 가운데). 800px 단 → 252px */
export const LOCK_LONG_LINE_RATIO = 0.315;

/**
 * 줄바꿈이 검출됐을 때 넘어갈 줄 번호.
 * 짧은 줄 뒤 줄바꿈은 잘 안 잡히므로, 검출된 줄바꿈은 "지금 줄부터 처음 나오는 긴 줄을 방금 끝냈다"는 뜻으로 본다.
 * 예) 긴 줄 0 → 짧은 줄 1 → 긴 줄 2: 1에 있다가 줄바꿈이 잡히면 2를 끝낸 것으로 보고 3으로 간다.
 * @param {number} current 지금 줄 번호 (0부터)
 * @param {number[]} lineWidths 글줄 폭
 * @param {number} columnPx 단 폭
 * @returns {number} 새 줄 번호 (마지막 줄을 넘지 않는다)
 */
export function nextLineAfterSweep(current, lineWidths, columnPx, ratio = LOCK_LONG_LINE_RATIO) {
  const n = Array.isArray(lineWidths) ? lineWidths.length : 0;
  if (n === 0) return 0;
  const last = n - 1;
  const cur = Math.min(Math.max(0, current | 0), last);
  const min = ratio * columnPx;
  for (let j = cur; j < last; j++) if (lineWidths[j] >= min) return j + 1;
  return Math.min(cur + 1, last);   // 남은 줄이 모두 짧으면 한 줄만
}

/** 짧은 줄 머묾 넘김의 여유 시간: 줄 폭 ÷ 읽기 속도 + 이만큼 지나면 다음 줄로 */
export const LOCK_DWELL_MARGIN_MS = 1500;
/** 읽기 속도를 아직 못 잰 동안 쓰는 값: 초당 단 폭의 31.25% (800px 단 → 250px/s, 실측 190~350px/s) */
export const LOCK_DEFAULT_SPEED_RATIO = 0.3125;

/**
 * 세로 고정 표시(?ylock=1)의 줄 추적기. 쪽마다 새로 만든다.
 * - 줄바꿈이 잡히면 nextLineAfterSweep으로 넘긴다 (짧은 줄 뒤 놓친 줄바꿈 보완)
 * - 짧은 줄에 "줄 폭 ÷ 읽기 속도 + 1.5초" 넘게 머물면 다음 줄로 넘긴다
 *   (짧은 줄 뒤 줄바꿈은 안 잡히므로, 끝에서 두 번째 줄이 짧으면 마지막 줄로 갈 방법이 없었다)
 * - 읽기 속도는 긴 줄 하나를 끝내고 한 줄 넘어간 시간으로 잰다 (중간값)
 * 실측(2026-11-10 20:49 consent 4쪽): 도착 줄 10·11·12·7 → 11·12·12·7. 짧은 줄을 천천히 읽으면 최대 한 줄 앞설 수 있다.
 * @param {object} o
 * @param {number[]} o.lineWidths 글줄 폭
 * @param {{columnPx:number, lineHeightPx:number}} o.layout
 * @param {number} o.textLeftPx 글 왼쪽 끝의 화면 x
 */
export function createLineLocker({ lineWidths, layout, textLeftPx, dwellMarginMs = LOCK_DWELL_MARGIN_MS }) {
  const widths = Array.isArray(lineWidths) ? lineWidths : [];
  const last = Math.max(widths.length - 1, 0);
  const longMin = LOCK_LONG_LINE_RATIO * layout.columnPx;
  const defaultSpeed = LOCK_DEFAULT_SPEED_RATIO * layout.columnPx;   // px/s
  const counter = createGazeSweepCounter(sweepOptionsFor(layout, textLeftPx));
  const speeds = [];
  let line = 0;
  let enterMs = null;   // 지금 줄에 들어온 시각 (첫 표본에서 정한다)

  function speed() {
    if (!speeds.length) return defaultSpeed;
    const s = [...speeds].sort((a, b) => a - b);
    return s[s.length >> 1];
  }

  /** @returns {null | {from:number, to:number, cause:'sweep'|'dwell'}} 줄이 바뀌면 그 내용 */
  function push(sample) {
    if (!sample?.valid || !Number.isFinite(sample.tMs)) return null;
    const t = sample.tMs;
    if (enterMs === null) enterMs = t;
    if (counter.push(sample)) {
      const from = line, to = nextLineAfterSweep(line, widths, layout.columnPx);
      const dt = (t - enterMs) / 1000;
      if (to === from + 1 && widths[from] >= longMin && dt > 0.5) speeds.push(widths[from] / dt);
      line = to; enterMs = t;
      return to !== from ? { from, to, cause: 'sweep' } : null;
    }
    if (line < last && widths[line] < longMin && t - enterMs > (widths[line] / speed()) * 1000 + dwellMarginMs) {
      const from = line; line += 1; enterMs = t;
      return { from, to: line, cause: 'dwell' };
    }
    return null;
  }

  return { push, get line() { return line; }, get speed() { return speed(); } };
}
