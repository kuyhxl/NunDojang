// 개인 가로 기준점 — C 소유.
//
// ⚠ 쓰지 말 것. 만들어 놓고 **측정해 보고 폐기한 안**이다 (docs/comprehension_evidence.md 13절).
//   기록 21개에서, 점을 볼 때의 가로 범위는 읽을 때의 가로 범위를 대신하지 못했다.
//     점 볼 때  글 폭의 1.05 (범위 0.92~1.16)   ← 점을 보라고 하면 사람은 정확히 본다
//     읽을 때   글 폭의 0.76 (범위 0.46~1.27)   ← 줄 양 끝은 주변시로 처리하고 응시하지 않는다
//     둘의 상관 r = +0.17 (폭), r = +0.14 (왼쪽 끝)
//   두 상황은 **다른 체제**라서 한쪽으로 다른 쪽을 대신할 수 없다. 앞 쪽으로 뒤 쪽을 맞히는
//   것도 안 된다 (r = 0.35, 한 회차 안에서도 쪽마다 0.20씩 흔들린다).
//   이 모듈을 쓰면 폭이 1.05로 잡혀 가로 진행 조건이 **지금보다 깐깐해진다** — 반대 방향이다.
//
// 남겨 두는 이유: `sweepOptionsFor(.., {observedX})`·`createLineProgress({observedX})`의 배선은
//   그대로 쓸 수 있다. 다만 observedX를 **읽기 체제 안에서** 가져와야 한다 (11절 제안: 그 쪽의
//   첫 몇 초 관측 x). 같은 안이 다시 나왔을 때 "재 봤고 안 된다"를 가리킬 자리도 필요하다.
//
//
// 무엇: 읽기 직전에 글줄 위의 점 세 개(글 왼쪽 끝·가운데·오른쪽 끝)를 차례로 보게 하고,
//       그때 **실제로 찍힌 시선 x**를 모아 "이 사람의 가로 범위"를 구한다.
//
// 왜: 줄바꿈 판정의 두 문턱이 지금은 글의 절대 기하에서 나온다.
//       minDropPx   = 단 폭의 19%
//       landingMaxX = 글 왼쪽 + 단 폭의 25%
//     그런데 읽는 동안 시선 x는 단 폭의 70~80%로 눌려 찍히고, 그 비율이 사람·회차마다 다르다
//     (실측: 착지권 안 표본 비율이 정상 쪽 40~65%인데 나쁜 쪽은 5.6%·12.5%였다.
//      docs/comprehension_evidence.md 10절). 그래서 같은 사람이 같은 글을 더 오래 읽고도
//     97%와 69%를 받는다. 문턱을 사람의 실제 범위로 옮기면 이 흔들림이 사라진다.
//
// 순환을 막는 규칙 (A 시제품 anchors.mjs의 "never train on reading samples or outcomes"에서 가져옴):
//   기준점은 **읽기 전 점 보기 구간의 표본으로만** 만든다. 읽는 동안의 표본이나 점수 결과를
//   절대 쓰지 않는다. 찾으려는 것으로 기준을 만들면 아무것도 증명하지 못한다.
//   (출처: PR #14. 코드는 옮기지 않고 방법만 가져왔다. 전에는 "그 구현은 GPL-3.0이라"고 적었는데
//    anchors.mjs에는 라이선스 표기가 없다 — web/vendor/NOTICE.md 2026-11-21 정정)
//
// 수식 자체는 맞게 돌아가므로 시험은 남겨 둔다. 쓰지 않을 뿐이다.
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

export const X_ANCHOR_POLICY = Object.freeze({
  version: 'personal-x-anchor/0.1.0',
  /** 점 하나에서 이만큼은 모여야 쓴다 */
  minSamples: 8,
  /** 점 하나의 유효 표본 비율이 이 밑이면 버린다 */
  minCoverage: 0.7,
  /** 이웃한 두 점의 중앙값이 최소 이만큼은 떨어져야 한다 (CSS px) */
  minStepPx: 24,
  /** 잡음(MAD)의 이 배보다는 떨어져야 한다 */
  noiseFactor: 2,
  source: '읽기 직전 점 세 개의 구간만 사용. 읽는 동안의 표본·결과는 쓰지 않는다'
});

const sorted = (xs) => [...xs].sort((a, b) => a - b);

/** 중앙값. 빈 배열이면 null */
export function median(xs) {
  const a = sorted(xs.filter(Number.isFinite));
  if (!a.length) return null;
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** 중앙값 절대편차. 흩어짐을 재되 튀는 값에 끌려가지 않는다 */
export function mad(xs) {
  const m = median(xs);
  return m === null ? null : median(xs.filter(Number.isFinite).map((x) => Math.abs(x - m)));
}

/**
 * 점 하나를 보는 동안 모은 것을 요약한다.
 * @param {{targetX:number, xs:number[], frames?:number}} p
 *   xs = 유효한 예측 x들, frames = 그동안 들어온 전체 프레임 수 (없으면 xs.length로 본다)
 */
export function summarizePoint({ targetX, xs = [], frames = null }, policy = X_ANCHOR_POLICY) {
  const good = xs.filter(Number.isFinite);
  const total = Number.isFinite(frames) && frames > 0 ? frames : good.length;
  const coverage = total > 0 ? good.length / total : 0;
  return {
    targetX,
    medianX: median(good),
    madX: mad(good),
    validFrames: good.length,
    frames: total,
    coverage,
    usable: good.length >= policy.minSamples && coverage >= policy.minCoverage && median(good) !== null
  };
}

/**
 * 글줄 위의 점들에서 개인 가로 범위를 구한다.
 *
 * @param {Array<{targetX:number, xs:number[], frames?:number}>} points
 *   점 두세 개. targetX는 그 점이 화면에 있던 x (글 왼쪽 끝·가운데·오른쪽 끝).
 * @returns {{ready:boolean, minX:number|null, maxX:number|null, spanPx:number|null,
 *            points:object[], separationPx:number|null, requiredPx:number|null,
 *            noisePx:number|null, policy:object, reason:string|null}}
 *   ready=false면 **쓰지 않는다**. 부르는 쪽이 절대 기하로 되돌아가야 한다.
 */
export function fitXAnchors(points, policy = X_ANCHOR_POLICY) {
  const base = { ready: false, minX: null, maxX: null, spanPx: null, separationPx: null,
    requiredPx: null, noisePx: null, policy, points: [] };
  if (!Array.isArray(points) || points.length < 2) return { ...base, reason: 'need_two_or_three_points' };

  const p = points.map((x) => summarizePoint(x, policy)).sort((a, b) => a.targetX - b.targetX);
  const out = { ...base, points: p };
  if (p.some((x) => !x.usable)) return { ...out, reason: 'point_quality' };

  // 잡음은 가장 흔들린 점으로 잡는다. 한 점만 나빠도 기준을 믿지 않는다.
  const noise = Math.max(...p.map((x) => (Number.isFinite(x.madX) ? x.madX : Infinity)));
  const required = Math.max(policy.minStepPx, policy.noiseFactor * noise);
  // 이웃한 점끼리 가장 좁은 간격. 점 순서가 뒤집히면 음수가 되어 자동으로 걸린다.
  let separation = Infinity;
  for (let i = 1; i < p.length; i++) separation = Math.min(separation, p[i].medianX - p[i - 1].medianX);

  const minX = p[0].medianX, maxX = p[p.length - 1].medianX;
  const ready = Number.isFinite(separation) && separation > required && maxX > minX;
  return {
    ...out, ready, separationPx: separation, requiredPx: required, noisePx: noise,
    minX: ready ? minX : null, maxX: ready ? maxX : null, spanPx: ready ? maxX - minX : null,
    reason: ready ? null : 'separation_or_order'
  };
}

/**
 * 기준점 결과를 `sweepOptionsFor`가 받는 모양으로 바꾼다.
 * ready가 아니면 null을 주어 부르는 쪽이 절대 기하를 쓰게 한다.
 */
export function observedXFrom(fit) {
  return fit?.ready && Number.isFinite(fit.minX) && Number.isFinite(fit.maxX)
    ? { min: fit.minX, max: fit.maxX } : null;
}
