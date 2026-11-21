// 시선 x로 줄바꿈 세기 — C 소유. 보조 점수(기록 전용) 실험용이며 공식 점수에는 쓰지 않는다.
// 줄 끝에서 다음 줄 처음으로 돌아갈 때 시선 x가 짧은 시간에 왼쪽으로 크게 이동하는 것을 센다.
// 실측(2026-11-10, 20px판 consent.pdf 4쪽 + 시간표 PDF 2쪽, 한 사람 기록 2회):
//  - 짧은 흔들림은 6~10px라 큰 이동과 쉽게 구분된다.
//  - 이동만 보면 줄 중간으로 되돌아가 다시 읽는 순간(예: 1181→1014px)과
//    쪽 끝에서 버튼·다른 곳을 보는 순간까지 세어 31번(기대 약 25번)이 됐다.
//    → "줄 처음 근처에 착지" + "세로로 한 줄 넘게 위로 튀지 않음"을 더해 27번.
//  - 세로는 절대 위치가 수십 px 밀려도 0.4초 안의 상대 변화는 3~5px로 정확해서 이 판단에 쓸 수 있다.
//    (이것은 옛 엔진의 사정이다. 2026-11-21에 바꾼 엔진은 줄바꿈 순간 세로가 최대 200px 튄다 → SWEEP_UP_JUMP_PX)
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

/** 표본이 이보다 오래 끊기면 그 사이를 이어서 보지 않는다 (CSS px가 아니라 ms).
 *  A(민서)의 측정 시제품이 같은 자리에 둔 maxGapMs 250과 같은 값이다 — 방법만 가져왔고 코드는 옮기지 않았다.
 *  (출처: PR #14 HorizontalDetector. 전에는 "그 구현은 GPL-3.0이라"고 적었는데 그 파일에는 라이선스 표기가 없다
 *   — web/vendor/NOTICE.md 2026-11-21 정정) */
export const SWEEP_MAX_GAP_MS = 250;

import { createXObserver } from './xObserve.js';

/**
 * @param {object} o
 * @param {number} o.minDropPx  이만큼 넘게 왼쪽으로 가야 줄바꿈으로 본다 (CSS px)
 * @param {number|null} [o.landingMaxX=null]  착지 x가 이 값 이하여야 한다 (줄 처음 근처). null이면 보지 않는다
 * @param {number|null} [o.minDyPx=null]  착지 y − 출발 y가 이 값 이상이어야 한다 (예: −줄 간격). null이면 보지 않는다
 * @param {number} [o.windowMs=400]  이 시간 안에 일어난 이동만 본다
 * @param {number} [o.refractoryMs=700]  줄바꿈 하나를 두 번 세지 않도록 쉬는 시간
 * @param {number|null} [o.maxGapMs=null]  표본이 이보다 오래 끊기면 창을 비운다. null이면 보지 않는다 (지금 기본값)
 *   왜: 추적이 3초 끊긴 사이를 가로질러도 "x가 왼쪽으로 크게 갔다"가 성립해 줄바꿈이 된다.
 *   끊김 전 최고점과 끊김 후 착지는 이어진 눈 움직임이 아니므로, 창을 비워 다음 표본부터 다시 본다.
 */
export function createGazeSweepCounter(options) {
  let { minDropPx, landingMaxX = null, minDyPx = null } = options;
  const { windowMs = 400, refractoryMs = 700, maxGapMs = null } = options;
  if (!(minDropPx > 0)) throw new Error('createGazeSweepCounter: minDropPx must be > 0');
  // setThresholds로 갈아 끼울 수 있어야 하므로 let으로 받는다 (기본값은 그대로).
  let recent = [];          // 최근 windowMs 안의 유효 표본 {tMs, xPx, yPx}
  let lastSweepMs = -Infinity;
  let lastSampleMs = null;  // 마지막 유효 표본 시각 (끊김 판정용)
  let count = 0;
  let dropped = 0;          // 끊김 때문에 창을 비운 횟수 (진단·기록용)
  let last = null;          // 마지막 줄바꿈의 시각·위치 (진단·기록용)

  /**
   * 표본 하나를 넣는다. 줄바꿈이면 true.
   * @param {{tMs:number, xPx:number|null, yPx?:number|null, valid:boolean}} s
   */
  function push({ tMs, xPx, yPx = null, valid }) {
    if (!valid || !Number.isFinite(xPx) || !Number.isFinite(tMs)) return false;
    const y = Number.isFinite(yPx) ? yPx : null;
    if (maxGapMs !== null && lastSampleMs !== null && tMs - lastSampleMs > maxGapMs) { recent = []; dropped++; }
    lastSampleMs = tMs;
    recent.push({ tMs, xPx, yPx: y });
    while (recent.length && tMs - recent[0].tMs > windowMs) recent.shift();
    if (tMs - lastSweepMs < refractoryMs) return false;
    let peak = recent[0];
    for (const r of recent) if (r.xPx > peak.xPx) peak = r;
    if (peak.xPx - xPx <= minDropPx) return false;
    if (landingMaxX !== null && xPx > landingMaxX) return false;                       // 줄 중간으로 되돌아감
    if (minDyPx !== null && y !== null && peak.yPx !== null && y - peak.yPx < minDyPx) return false;  // 위로 크게 튐 (버튼·다른 곳)
    count++; lastSweepMs = tMs;
    // peak은 "줄 끝을 떠난 순간", landed는 "다음 줄에 앉은 것을 검출한 순간".
    // 그 사이가 줄바꿈 비행 + 검출 지연이다 (실측 중앙 0.23초). 판정에는 쓰지 않고 기록만 한다.
    last = { peakMs: peak.tMs, peakX: peak.xPx, landedMs: tMs, landedX: xPx };
    recent = [{ tMs, xPx, yPx: y }];   // 돌아온 자리부터 다시 본다
    return true;
  }

  function reset() { recent = []; lastSweepMs = -Infinity; lastSampleMs = null; count = 0; dropped = 0; last = null; }

  /**
   * 지금부터 refractoryMs 동안 줄바꿈을 세지 않고, 창도 비운다.
   * 줄을 손으로 골라 옮긴 직후에 쓴다 — 그 줄 처음으로 눈을 옮기는 이동이 줄바꿈으로 세어지면 곧바로 다음 줄로 넘어가 버린다.
   */
  function hold(tMs) { if (Number.isFinite(tMs)) { recent = []; lastSweepMs = tMs; } }

  /**
   * 문턱을 갈아 끼운다. 쪽의 관측 가로 범위가 정해진 뒤 한 번 부른다 (xObserve.js).
   * 이미 센 줄바꿈과 지금 창은 건드리지 않는다 — 바뀐 문턱은 **다음 표본부터** 적용된다.
   */
  function setThresholds(next = {}) {
    if (Number.isFinite(next.minDropPx) && next.minDropPx > 0) minDropPx = next.minDropPx;
    if (next.landingMaxX === null || Number.isFinite(next.landingMaxX)) landingMaxX = next.landingMaxX;
    if (next.minDyPx === null || Number.isFinite(next.minDyPx)) minDyPx = next.minDyPx;
  }

  return { push, reset, hold, setThresholds, get count() { return count; }, get droppedWindows() { return dropped; },
    get thresholds() { return { minDropPx, landingMaxX, minDyPx, windowMs, refractoryMs, maxGapMs }; },
    get lastSweep() { return last ? { ...last } : null; } };
}

/** 줄바꿈으로 볼 최소 이동 폭: 단 폭의 19% (800px 단 → 152px, 520px 단 → 99px) */
export const SWEEP_DROP_RATIO = 0.19;
/** 11절 제안의 넓힌 창 길이 (기본 400ms → 600ms).
 *  왜: 줄바꿈 비행 + 검출 지연이 실측 중앙 0.23초인데, 느린 되돌림은 400ms 창을 벗어나 놓친다.
 *  재생에서 800·1000ms는 잘 읽던 쪽을 깎았고 600ms에서만 손해 없이 늘었다 (11절). */
export const SWEEP_WINDOW_MS_WIDE = 600;
/** 착지 구역: 글 왼쪽 끝에서 단 폭의 25% 안 (시선 x가 실제보다 왼쪽으로 70px 안팎 밀린 경우도 받는다) */
export const SWEEP_LANDING_RATIO = 0.25;
/** 줄바꿈으로 돌아올 때 세로가 위로 이만큼(CSS px)까지 튀어도 받는다. 더 크게 튀면 버튼·다른 곳을 본 것으로 본다.
 *  전에는 한 줄(줄 간격)이었다 — "0.4초 안의 세로 상대 변화는 3~5px로 정확"하던 옛 엔진(홍채 회귀) 기준이다.
 *  2026-11-21에 바꾼 엔진(BlazeGaze)은 가로로 크게 움직이는 순간 세로가 함께 튄다.
 *  실측(기록 20261121-182650, 한 사람): 단 폭 절반 넘게 돌아온 줄바꿈 31개의 세로 변화가 +105 ~ −199px,
 *  옆 패널을 보러 간 이동은 −253px부터였다(182427 포함). 한 줄 기준으로는 그 31개 중 14개가 첫 표본에서 버려졌다.
 *  고친 뒤 정독 기록(20261121-192755)에서는 받아들인 줄바꿈 31개가 +96 ~ −203px, 버린 것은 쪽 끝에서 눈을 뗀 두 번(−290px 이하)뿐이었다.
 *  잠정값이다 — 아직 한 사람이다. 사람이 늘면 다시 볼 것 (docs/comprehension_evidence.md 20-6·20-7). */
export const SWEEP_UP_JUMP_PX = 240;

/**
 * 단 배치로 계수기 설정을 만든다.
 * @param {{columnPx:number, lineHeightPx:number}} layout
 * @param {number} textLeftPx 글 왼쪽 끝의 화면 x (CSS px, 시선 좌표와 같은 기준)
 */
export function sweepOptionsFor(layout, textLeftPx, { observedX = null, maxGapMs = null } = {}) {
  // observedX를 주면 두 문턱을 **그 쪽에서 실제로 찍히는 범위**에서 잡는다 (xObserve.js).
  // 읽기 전 기준점(xAnchor.js)에서 가져오는 안은 측정해 보고 폐기했다 — 점 볼 때와 읽을 때는 다른 체제다 (13절).
  // 글 폭이 아니라 시선 폭이 기준이 되므로, 시선 x가 눌려 찍히는 정도가 달라도 같은 뜻이 된다.
  const span = observedX ? observedX.max - observedX.min : layout.columnPx;
  const absCut = Number.isFinite(textLeftPx) ? textLeftPx + SWEEP_LANDING_RATIO * layout.columnPx : null;
  const perCut = observedX ? observedX.min + SWEEP_LANDING_RATIO * span : null;
  return {
    minDropPx: Math.round(SWEEP_DROP_RATIO * span),
    // 둘 중 **넓은 쪽**을 쓴다. 개인 기준이 지금보다 더 깐깐해져서 잘 읽던 쪽이 떨어지는 일은 막는다
    // (실측: 상대 기준만 쓰면 마지막 짧은 쪽이 5→2·8→6으로 줄었다. docs/comprehension_evidence.md 11절)
    landingMaxX: perCut === null ? absCut : (absCut === null ? perCut : Math.max(absCut, perCut)),
    minDyPx: -Math.max(layout.lineHeightPx, SWEEP_UP_JUMP_PX),
    maxGapMs
  };
}

// ---------------------------------------------------------------- 세로 고정 표시(?ylock=1)용 줄 추적
/** 줄바꿈을 "만들 만한" 줄의 최소 폭: 단 폭의 31.5% (가중 분모 19~44%의 가운데). 800px 단 → 252px */
export const LOCK_LONG_LINE_RATIO = 0.315;

/**
 * 줄바꿈이 검출됐을 때 넘어갈 줄 번호.
 * 짧은 줄 뒤 줄바꿈은 잘 안 잡히므로, 검출된 줄바꿈은 "지금 줄부터 처음 나오는 긴 줄을 방금 끝냈다"는 뜻으로 본다.
 * 예) 긴 줄 0 → 짧은 줄 1 → 긴 줄 2: 1에 있다가 줄바꿈이 잡히면 2를 끝낸 것으로 보고 3으로 간다.
 *
 * 단, **시선이 어디까지 갔다가 돌아왔는지(reachPx)** 를 주면 그것으로 먼저 가린다.
 * 돌아오기 전 최고점이 긴 줄 끝이 아니라 짧은 줄 끝 근처였다면, 그 줄바꿈은 짧은 줄 자신의 것이다 → 한 줄만 넘긴다.
 * 왜: "짧은 줄 뒤 줄바꿈은 안 잡힌다"는 시선 x가 0.72배로 눌려 찍히던 때의 사정이다. 눌리지 않으면 잡히고,
 *     그때 두 줄을 넘기면 **아직 읽지 않은 긴 줄을 건너뛴다.** 추적기는 뒤로 돌아가지 않으므로 그 줄은 끝까지 안 읽음으로 남는다
 *     (기록 20261121-182650 3쪽: 177px 줄에서 최고점 523 → 착지 370이 잡혀 768px 줄을 건너뜀, 10/12).
 * @param {number} current 지금 줄 번호 (0부터)
 * @param {number[]} lineWidths 글줄 폭
 * @param {number} columnPx 단 폭
 * @param {number} [ratio] 긴 줄로 볼 최소 폭 비율
 * @param {number|null} [reachPx=null] 돌아오기 전 최고점 x − 글 왼쪽 끝. null이면 보지 않는다 (옛 동작)
 * @returns {number} 새 줄 번호 (마지막 줄을 넘지 않는다)
 */
export function nextLineAfterSweep(current, lineWidths, columnPx, ratio = LOCK_LONG_LINE_RATIO, reachPx = null) {
  const n = Array.isArray(lineWidths) ? lineWidths.length : 0;
  if (n === 0) return 0;
  const last = n - 1;
  const cur = Math.min(Math.max(0, current | 0), last);
  const min = ratio * columnPx;
  for (let j = cur; j < last; j++) {
    if (lineWidths[j] < min) continue;
    if (j > cur && Number.isFinite(reachPx)) {
      // 지금 줄부터 j 앞까지는 모두 짧다. 그 가운데 가장 긴 줄과 긴 줄 j 중 어느 쪽 끝에 더 가까이 갔었는지로 가린다.
      // 경계는 두 폭의 **기하평균**이다. 시선 x는 회차에 따라 0.7~1.2배로 눌리거나 늘어 찍히는데(배율을 모른다),
      // 배율이 곱으로 걸리므로 산술평균이 아니라 기하평균이 두 가설의 한가운데다.
      let longestShort = 0;
      for (let k = cur; k < j; k++) longestShort = Math.max(longestShort, lineWidths[k]);
      if (reachPx < Math.sqrt(longestShort * lineWidths[j])) return cur + 1;
    }
    return j + 1;
  }
  return Math.min(cur + 1, last);   // 남은 줄이 모두 짧으면 한 줄만
}

/** 짧은 줄 머묾 넘김의 여유 시간: 줄 폭 ÷ 읽기 속도 + 이만큼 지나면 다음 줄로 */
export const LOCK_DWELL_MARGIN_MS = 1500;
/** 읽기 속도를 아직 못 잰 동안 쓰는 값: 초당 단 폭의 31.25% (800px 단 → 250px/s, 실측 190~350px/s) */
export const LOCK_DEFAULT_SPEED_RATIO = 0.3125;

// ---- y로 줄 번호 바로잡기 (?yfix=1, 개발용 시험)
// 켜지 말 것. 측정해 보고 폐기한 안이다 (docs/comprehension_evidence.md 9-6).
//   기록 20261117-122220에서 줄 걸음 시각의 시선 y를 그 줄의 실제 y에 회귀하면
//     시선y = 0.53 × 참y + 122 (r = +0.64, n = 60)
//   세로 이득이 0.53이고, 배율·치우침을 다 보정한 뒤에도 흩어짐이 σ = 86px = 2.1줄 남는다.
//   줄 간격(40px)의 두 배가 넘으므로 y로는 몇 번째 줄인지 원리상 알 수 없다. 더 나쁜 추정으로
//   더 나은 추정(x 줄바꿈)을 덮어쓰는 셈이어서, 켜면 읽은 줄이 7% 줄어든다.
// 남겨 두는 이유: 이 판정을 만든 기록 항목(yLineOf·atMs)이 같은 코드 경로에 있고, 같은 안이 다시
//   나왔을 때 "재 봤고 안 된다"를 가리킬 자리가 필요하다. 세로 이득은 보정 단계(A)에서 다룰 문제다.
/** 이 줄 수 이상 어긋나야 끌어다 맞춘다 */
export const Y_FIX_MIN_LINES = 2;
/** 그만큼 어긋난 상태가 이 시간 넘게 이어져야 맞춘다 (한 표본 튐으로 움직이지 않게) */
export const Y_FIX_HOLD_MS = 600;

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
 * @param {null|((k:number)=>number)} [o.lineCenterY=null] 줄 k 중심의 화면 y. 주면 `yLineOf`로 y 쪽 줄 번호를 알려 준다.
 *        스크롤·읽기 모드로 자리가 바뀌므로 값이 아니라 그때그때 재는 함수로 받는다. 이것만으로는 줄 번호를 바꾸지 않는다.
 * @param {boolean} [o.yFix=false] true일 때만 y로 줄 번호를 실제로 바로잡는다 (?yfix=1).
 * @param {number|null} [o.observeMs=null] 주면 쪽의 앞 이 시간 동안 시선 x를 모아, 창이 닫힐 때
 *   착지권과 이동 문턱을 **그 쪽의 관측 범위** 기준으로 갈아 끼운다 (?xwindow=1, xObserve.js).
 *   절대 기준보다 느슨해질 때만 바뀐다. null이면 지금 동작 그대로.
 * @param {number} [o.sweepWindowMs=400] 줄바꿈 계수기의 창 길이. 11절 제안은 600.
 * @param {number|null} [o.maxGapMs=null] 계수기의 끊김 게이트 (?validtime=1).
 * @param {null|((obs:{min:number,max:number})=>void)} [o.onObserved=null] 관측 범위가 정해진 순간 한 번 불린다.
 */
export function createLineLocker({ lineWidths, layout, textLeftPx, dwellMarginMs = LOCK_DWELL_MARGIN_MS,
  lineCenterY = null, yFix = false, yFixMinLines = Y_FIX_MIN_LINES, yFixHoldMs = Y_FIX_HOLD_MS,
  observeMs = null, sweepWindowMs = 400, maxGapMs = null, onObserved = null }) {
  const widths = Array.isArray(lineWidths) ? lineWidths : [];
  const last = Math.max(widths.length - 1, 0);
  const longMin = LOCK_LONG_LINE_RATIO * layout.columnPx;
  const defaultSpeed = LOCK_DEFAULT_SPEED_RATIO * layout.columnPx;   // px/s
  const counter = createGazeSweepCounter({ ...sweepOptionsFor(layout, textLeftPx, { maxGapMs }), windowMs: sweepWindowMs });
  // 쪽의 관측 가로 범위를 모은다. observeMs를 주지 않으면 만들지 않는다 (지금 동작 그대로).
  const observer = observeMs ? createXObserver({ layout, observeMs }) : null;
  const speeds = [];
  let textLeft = textLeftPx;   // 글 왼쪽 끝. 창 크기·가로 스크롤로 옮겨질 수 있어 setTextLeft로 갈아 끼운다
  let lastObs = null;          // 관측 범위 (창이 닫힌 뒤). 착지권을 다시 잡을 때 함께 쓴다
  let line = 0;
  let enterMs = null;   // 지금 줄에 들어온 시각 (첫 표본에서 정한다)
  let yGapSince = null; // y가 크게 어긋난 상태가 시작된 시각
  let holdNext = false; // 줄을 손으로 옮긴 직후: 다음 표본에서 계수기를 잠깐 쉬게 한다

  /** y로 본 줄 번호. 쓸 수 없으면 null. */
  function yLineOf(sample) {
    if (typeof lineCenterY !== 'function' || !Number.isFinite(sample?.yPx)) return null;
    const c0 = lineCenterY(0);
    if (!Number.isFinite(c0) || !(layout.lineHeightPx > 0)) return null;
    const k = Math.round((sample.yPx - c0) / layout.lineHeightPx);
    return Math.min(Math.max(k, 0), last);
  }

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
    if (holdNext) { counter.hold(t); holdNext = false; }
    // 관측 창이 이번에 닫히면 문턱을 갈아 끼운다. 이미 센 줄바꿈은 건드리지 않는다.
    if (observer) {
      const obs = observer.push(sample);
      if (obs) { lastObs = obs; counter.setThresholds(sweepOptionsFor(layout, textLeft, { observedX: obs, maxGapMs })); onObserved?.(obs); }
    }
    if (counter.push(sample)) {
      // 돌아오기 전 어디까지 갔었는지로 "짧은 줄 자신의 줄바꿈"과 "그 뒤 긴 줄의 줄바꿈"을 가린다
      const peakX = counter.lastSweep?.peakX;
      const reach = Number.isFinite(peakX) && Number.isFinite(textLeft) ? peakX - textLeft : null;
      const from = line, to = nextLineAfterSweep(line, widths, layout.columnPx, LOCK_LONG_LINE_RATIO, reach);
      const dt = (t - enterMs) / 1000;
      if (to === from + 1 && widths[from] >= longMin && dt > 0.5) speeds.push(widths[from] / dt);
      line = to; enterMs = t; yGapSince = null;
      // atMs: 줄을 실제로 끝낸 시각(줄 끝 최고점). 검출 시각(t)보다 앞선다. 기록·분석용이며 판정에는 안 쓴다.
      return to !== from ? { from, to, cause: 'sweep', atMs: counter.lastSweep?.peakMs ?? t } : null;
    }
    if (line < last && widths[line] < longMin && t - enterMs > (widths[line] / speed()) * 1000 + dwellMarginMs) {
      const from = line; line += 1; enterMs = t; yGapSince = null;
      return { from, to: line, cause: 'dwell', atMs: t };
    }
    // y가 yFixMinLines 이상 어긋난 채 yFixHoldMs 넘게 이어지면 y 쪽으로 옮긴다 (yFix를 켠 경우만)
    const yk = yFix ? yLineOf(sample) : null;
    if (yk !== null && Math.abs(yk - line) >= yFixMinLines) {
      if (yGapSince === null) yGapSince = t;
      else if (t - yGapSince > yFixHoldMs) {
        const from = line; line = yk; enterMs = t; yGapSince = null;
        return { from, to: line, cause: 'yfix', atMs: t };
      }
    } else {
      yGapSince = null;
    }
    return null;
  }

  /**
   * 글 왼쪽 끝이 옮겨졌을 때 착지권만 새 자리로 맞춘다. 줄 번호·읽기 속도·이미 센 줄바꿈은 그대로 둔다.
   * 왜: 착지권(글 왼쪽 + 단 폭 25%)을 쪽을 그릴 때 한 번만 재서, 창 크기를 바꾸면 옛 화면 좌표로 판정했다.
   */
  function setTextLeft(px) {
    if (!Number.isFinite(px) || px === textLeft) return;
    textLeft = px;
    counter.setThresholds(sweepOptionsFor(layout, textLeft, { observedX: lastObs, maxGapMs }));
  }

  /**
   * 줄을 손으로 골라 옮긴다 (읽는 사람이 그 줄을 눌렀다). 읽은 증거가 아니라 **자리만** 옮기는 것이다.
   * 왜: 추적기는 앞으로만 간다. 너무 빨리 지나가 읽음이 안 된 줄을 다시 읽어도, 추적기가 이미 아래에 있으면 채워지지 않는다.
   *     세로 시선으로 그 줄을 알아내는 것은 안 된다 — 오차가 줄 간격보다 크다 (docs/comprehension_evidence.md 9-6·20-7).
   * @returns {{from:number, to:number, cause:'manual'}}
   */
  function jumpTo(k) {
    const from = line;
    line = Math.min(Math.max(0, k | 0), last);
    enterMs = null; yGapSince = null; holdNext = true;
    return { from, to: line, cause: 'manual' };
  }

  return {
    push,
    jumpTo,
    setTextLeft,
    get line() { return line; },
    get speed() { return speed(); },
    get lastSweep() { return counter.lastSweep; },
    /** 쪽의 관측 가로 범위. 창이 아직 안 닫혔거나 품질 미달이면 null */
    get observedX() { return observer?.observedX ?? null; },
    /** 지금 쓰고 있는 줄바꿈 문턱 (기록·진단용) */
    get thresholds() { return counter.thresholds; },
    /** 관측 창의 속사정 (기록·진단용) */
    observeSnapshot() { return observer ? observer.snapshot() : null; },
    /** 지금 y로 보면 몇 번째 줄인가 (기록·비교용). lineCenterY가 없으면 null. */
    yLineOf
  };
}
