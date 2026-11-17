// 쪽의 관측 가로 범위 — C 소유. 개발용 시험(?xwindow=1), 팀 합의 전. docs/decisions.md 열린 제안 2.
//
// 무엇: 한 쪽을 읽기 시작한 뒤 **처음 몇 초** 동안 시선 x를 모아, 그 쪽에서 이 사람의 x가
//       실제로 어디서 어디까지 찍히는지(하위 5% ~ 상위 95%)를 정한다. 그 뒤로는 받지 않는다.
//
// 왜: 줄바꿈 판정의 착지권이 지금은 글의 절대 기하에서 나온다 — `글 왼쪽 + 단 폭의 25%`.
//     그런데 읽는 동안 시선 x는 단 폭의 46~127%로 찍히고 쪽마다 다르다(13-4절).
//     그래서 착지권 안에 드는 표본 비율이 정상 쪽 40~65%인데 나쁜 쪽은 5.6%·12.5%까지 떨어지고,
//     같은 사람이 같은 글을 더 오래 읽고도 97%와 69%를 받는다(10절).
//
// 왜 기준점이 아니라 이것인가: 읽기 직전에 점을 보게 해서 범위를 재는 안은 **측정해 보고 폐기했다**.
//     점을 볼 때의 범위(글 폭의 1.05)는 읽을 때의 범위(0.76)와 무관했다 — r = +0.17 (13절).
//     "점 보기"와 "읽기"는 다른 체제라서, 범위는 **읽는 동안** 재는 수밖에 없다.
//
// 순환에 대하여: 판정하려는 자료로 기준을 만드는 것은 순환이다. 그래서
//   (1) 기준을 만드는 구간(앞 observeMs)과 그 뒤를 나누고,
//   (2) 창이 닫히기 전에는 지금의 절대 기준을 그대로 쓰고,
//   (3) 닫힌 뒤에도 **절대 기준보다 느슨해질 때만** 바꾼다 (sweepOptionsFor의 max).
//   그래도 순환이 완전히 없어지지는 않는다. 훑는 사람도 자기 범위에 맞춰진다.
//   **일부러 훑은 기록 2~3개로 확인하기 전에는 합의하지 말 것.**
//
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

export const X_OBSERVE_POLICY = Object.freeze({
  version: 'page-x-window/0.1.0',
  /** 쪽의 첫 표본부터 이 시간 동안만 모은다 */
  observeMs: 8000,
  /** 이만큼은 모여야 범위를 믿는다 */
  minSamples: 60,
  /** 아래·위 이 비율을 잘라 낸다 (튀는 표본 제거) */
  loPct: 0.05,
  hiPct: 0.95,
  /** 관측 폭이 단 폭의 이 비율보다 좁으면 쓰지 않는다 (한 점만 보고 있던 경우) */
  minSpanRatio: 0.3,
  /** 넓어도 쓰지 않는다. 실측에서 폭비가 3.37까지 나온 쪽이 있었는데, 그런 쪽은 시선이 글 밖을
   *  휘젓고 있었다는 뜻이다. 그대로 쓰면 착지권이 글 폭의 84%까지 벌어져 아무것이나 줄바꿈이 된다.
   *  읽는 사람의 폭비는 0.46~1.27이므로(13-4절) 1.5를 넘으면 읽는 모양이 아니다. */
  maxSpanRatio: 1.5,
  source: '그 쪽의 앞 observeMs 구간만 사용. 창이 닫힌 뒤의 표본은 받지 않는다'
});

/**
 * 쪽 하나의 관측 가로 범위를 모은다. 쪽마다 새로 만든다.
 *
 * @param {object} o
 * @param {{columnPx:number}} o.layout
 * @param {number} [o.observeMs]
 * @returns {{push:Function, get ready():boolean, get observedX():{min:number,max:number}|null,
 *            get closed():boolean, get sampleCount():number, snapshot:Function}}
 *   `push`는 창이 막 닫히며 범위가 정해진 **그 한 번만** 범위를 돌려준다. 그 외에는 null.
 */
export function createXObserver({ layout, observeMs = X_OBSERVE_POLICY.observeMs,
  minSamples = X_OBSERVE_POLICY.minSamples, policy = X_OBSERVE_POLICY } = {}) {
  const xs = [];
  let firstMs = null, closed = false, observed = null, reason = null;

  function close() {
    closed = true;
    if (xs.length < minSamples) { reason = 'not_enough_samples'; return null; }
    const s = [...xs].sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
    const min = at(policy.loPct), max = at(policy.hiPct);
    if (!(max > min) || max - min < policy.minSpanRatio * layout.columnPx) { reason = 'span_too_narrow'; return null; }
    if (max - min > policy.maxSpanRatio * layout.columnPx) { reason = 'span_too_wide'; return null; }
    observed = { min, max };
    return observed;
  }

  return {
    /**
     * 표본 하나. 창이 이번에 닫히면서 범위가 정해졌으면 그 범위를, 아니면 null을 돌려준다.
     * @param {{tMs:number, xPx:number|null, valid:boolean}} s
     */
    push(s) {
      if (closed || !s?.valid || !Number.isFinite(s.tMs) || !Number.isFinite(s.xPx)) return null;
      if (firstMs === null) firstMs = s.tMs;
      if (s.tMs - firstMs >= observeMs) return close();   // 경계 표본은 넣지 않는다
      xs.push(s.xPx);
      return null;
    },
    /** 더 받지 않고 지금까지 모인 것으로 정한다 (쪽을 일찍 넘길 때) */
    finish() { return closed ? observed : close(); },
    get closed() { return closed; },
    get ready() { return observed !== null; },
    get observedX() { return observed ? { ...observed } : null; },
    get sampleCount() { return xs.length; },
    /** 기록·진단용 */
    snapshot() {
      return { version: policy.version, closed, ready: observed !== null, samples: xs.length,
        observedX: observed ? { ...observed } : null, spanPx: observed ? observed.max - observed.min : null,
        spanRatio: observed ? (observed.max - observed.min) / layout.columnPx : null, reason };
    }
  };
}
