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
