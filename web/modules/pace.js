// 읽기 속도·가로 폭 경고 — C 소유. 개발용 시험(?pace=1), 팀 합의 전. docs/decisions.md 열린 제안 3.
//
// 무엇: 쪽마다 두 가지를 보고 "읽은 모양이 아니다"를 **경고만** 한다. 점수는 건드리지 않는다.
//   ① 속도  — 최근 줄바꿈 구간들(약 8초)의 글자 수 ÷ 걸린 시간. 빨라진 동안만 켜지고, 느려지면 꺼진다 (0.2.0)
//   ② 폭비  — 시선 x 범위(5~95%) ÷ 단 폭. **0.2.0부터 기록만 하고 경고하지 않는다** (엔진을 바꿔 문턱이 무효, 아래 정책 주석)
//
// 왜 경고만인가: 두 문턱이 **한 사람의 기록 28쪽**에서 나왔다. 성실한 독자의 진짜 상한을 모른다.
//   떨어뜨리면 두 번째 사람이 억울하게 걸린다. "성실한 독자는 떨어지면 안 된다"가 먼저다.
//
// 왜 둘을 묶는가: 혼자서는 약하고 합치면 강하다 (2026-11-17 밤 훑기 대조군, 15절):
//   속도만  훑기 ②③ 7쪽 중 3쪽
//   폭비만  7쪽 중 6쪽
//   **둘 다  7쪽 중 6쪽** — 성실한 쪽 47개 중 2쪽만 걸리고, 그 둘은 6초 만에 넘긴 쪽과
//   추적이 흔들린 쪽이라 걸리는 게 맞다
//   서로를 메운다. 훑기② 1쪽은 빨랐지만 폭비가 0.80이라 폭비로는 못 잡고,
//   3쪽은 느렸지만 폭비 1.14라 속도로는 못 잡는다.
//
// 못 잡는 것: **제목·문단 첫 줄만 읽는 훑기는 못 잡는다.** 387~528자/분으로 성실한 쪽의
//   중앙값(483)보다 느리고, 폭비도 0.72~0.79로 성실한 범위 한가운데다. 그 사람의 눈 움직임은
//   진짜 읽기 움직임이라 눈만 봐서는 가를 수 없다 (15-3절). 이 경고가 그 문제를 고치지 않는다.
//
// 문구의 근거: Rayner 외 (2016) — 묵독은 분당 200~400단어이고, 훑기는 그 2~4배이며 이해도가 떨어진다.
//   기네스 속독 기록(1990년 Howard Berg, 분당 25,000단어)은 쓰지 않는다. 널리 반박됐고,
//   그 수치로는 어떤 경고도 뜨지 않는다.
//
// DOM을 쓰지 않는 순수 모듈이라 node에서 시험할 수 있다.

export const PACE_POLICY = Object.freeze({
  version: 'reading-pace-warning/0.2.0-dev',
  /** 이 속도를 넘으면 경고 (자/분). 최근 줄바꿈 구간들로 잰 속도에 건다 (아래 windowMs).
   *  0.1.0은 "읽음이 된 줄의 글자 수 ÷ 쪽에 머문 시간"이었는데, 줄은 폭의 40%만 지나도 읽음이 되므로
   *  쪽 앞머리에서 속도가 부풀었다 (기록 20261121-192755 1쪽: 실제 847자/분인데 7.7초에 936으로 찍혀 경고). */
  maxCharsPerMin: 900,
  /** 경고가 켜진 뒤에는 이 비율 밑으로 내려와야 꺼진다 (문턱에서 깜빡이지 않게) */
  clearRatio: 0.85,
  /** 속도를 재는 창: 지금부터 거슬러 이만큼(ms)을 덮을 때까지 줄바꿈 구간을 모은다 */
  windowMs: 8000,
  /** 창에 줄바꿈 구간이 이만큼은 있어야 판정한다 (한두 줄로는 판단하지 않는다) */
  minGroups: 3,
  /** 창이 이만큼(ms)은 차야 판정한다. 창 길이와 같게 둔다 — 4초로 두면 줄바꿈 세 번이 몰린 순간에 헛 경고가 났다
   *  (옛 기록 50쪽 재생: 4초 6쪽 → 8초 4쪽, 좌우로 훑은 4쪽은 어느 쪽이든 전부 잡힌다. 대신 8초는 지나야 뜬다) */
  minWindowMs: 8000,
  /** 시선 x 범위 ÷ 단 폭이 이보다 크면 경고. **null = 폭비로는 경고하지 않는다 (기록만 한다).**
   *  0.1.0의 1.05는 가로가 0.76배로 눌려 찍히던 옛 엔진의 분포에서 고른 값이다. 2026-11-21에 바꾼 엔진은
   *  가로가 1.0~1.15배로 찍혀, 정독한 4쪽 중 3쪽이 폭비 1.07~1.13으로 걸렸다 (20261121-192755).
   *  새 엔진으로 찍은 훑기 대조군이 생기기 전에는 문턱을 고를 근거가 없다. 그때까지 끈다. */
  maxSpanRatio: null,
  /** 폭비를 믿을 최소 표본 수 */
  minSamples: 60,
  /** 단 폭 하나에 들어가는 글자 수 (재배치 규격: 13·20·24px판 모두 40자) */
  charsPerColumn: 40,
  loPct: 0.05,
  hiPct: 0.95,
  source: '속도 문턱 900은 2026-11-17 훑기 대조군 11쪽 + 성실 47쪽(한 사람)에서 왔고, 0.2.0에서 재는 방법을 바꿔 같은 기록으로 다시 확인했다. 잠정값'
});

/**
 * 쪽 하나의 읽기 속도·가로 폭을 지켜본다. 쪽마다 새로 만든다.
 *
 * @param {object} o
 * @param {{columnPx:number}} o.layout
 * @param {number[]} o.lineWidths 글줄 폭 (글자 수 환산에 쓴다)
 */
export function createPaceWatch({ layout, lineWidths = [], policy = PACE_POLICY }) {
  const perPx = layout.columnPx > 0 ? policy.charsPerColumn / layout.columnPx : 0;
  const charsOf = (k) => (Number.isFinite(lineWidths[k]) ? lineWidths[k] : 0) * perPx;
  const xs = [];
  const credited = new Set();
  let firstMs = null, lastMs = null, chars = 0;
  // 줄바꿈 구간: 직전 줄바꿈(또는 쪽 시작)부터 이번 줄바꿈까지 지난 줄들의 글자 수와 걸린 시간.
  // 머묾 넘김은 구간을 끊지 않는다 — 짧은 줄을 기다린 시간은 그 뒤 긴 줄과 한 묶음이다.
  const groups = [];
  let spanStartMs = null, spanStartLine = 0;
  let fastOn = false;

  function spanRatio() {
    if (xs.length < policy.minSamples || !(layout.columnPx > 0)) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
    return (at(policy.hiPct) - at(policy.loPct)) / layout.columnPx;
  }

  /**
   * 최근 줄바꿈 구간들로 잰 속도 (자/분). 아직 판정할 만큼 모이지 않았으면 null.
   * 분모는 "가장 오래된 구간의 시작부터 **지금까지**"다 — 마지막 줄바꿈 뒤로 흐른 시간도 들어간다.
   * 그래서 한 줄에 오래 머물면 값이 저절로 내려가고, 줄바꿈이 끊겨도 옛 값이 남지 않는다.
   */
  function recentCharsPerMin() {
    if (lastMs === null) return null;
    let c = 0, n = 0, startMs = null;
    for (let i = groups.length - 1; i >= 0; i--) {
      c += groups[i].chars; n++; startMs = groups[i].startMs;
      if (lastMs - startMs >= policy.windowMs && n >= policy.minGroups) break;   // 창을 덮고 구간 수도 채웠으면 그만
    }
    if (n < policy.minGroups || startMs === null || lastMs - startMs < policy.minWindowMs) return null;
    return (c / (lastMs - startMs)) * 60000;
  }

  return {
    /** 시선 표본 하나 */
    push(s) {
      if (!s?.valid || !Number.isFinite(s.tMs)) return;
      if (firstMs === null) firstMs = s.tMs;
      if (spanStartMs === null) spanStartMs = s.tMs;
      lastMs = s.tMs;
      if (Number.isFinite(s.xPx)) xs.push(s.xPx);
    },
    /** 읽음으로 인정된 줄 번호들. 같은 줄을 두 번 세지 않는다 (쪽 전체 평균 속도의 기록용) */
    credit(lines) {
      for (const k of lines ?? []) if (!credited.has(k)) { credited.add(k); chars += charsOf(k); }
    },
    /**
     * 줄 추적기의 걸음 하나 (lineProgress.push가 돌려준 step). 줄바꿈이면 구간 하나를 닫는다.
     * @param {{from:number, to:number, cause:string}|null} step
     * @param {number} tMs
     */
    step(step, tMs) {
      if (!step || !Number.isFinite(tMs)) return;
      if (step.cause === 'sweep' && spanStartMs !== null) {
        let c = 0;
        for (let k = spanStartLine; k < step.to; k++) c += charsOf(k);
        const ms = tMs - spanStartMs;
        if (ms > 0 && c > 0) groups.push({ chars: c, ms, startMs: spanStartMs });
        spanStartMs = tMs; spanStartLine = step.to;
      } else if (step.cause === 'yfix' || step.cause === 'manual') {
        spanStartMs = tMs; spanStartLine = step.to;   // 자리를 옮긴 것이다. 읽은 구간이 아니다
      }
    },
    /** 지금 빠르게 지나가는 중인가. 프레임마다 불러도 되게 가볍다 (폭비를 계산하지 않는다). */
    get fast() {
      const recent = recentCharsPerMin();
      // 켜질 때는 문턱을 넘어야 하고, 꺼질 때는 clearRatio 밑으로 내려와야 한다
      if (recent === null) fastOn = false;
      else if (!fastOn) fastOn = recent > policy.maxCharsPerMin;
      else fastOn = recent > policy.maxCharsPerMin * policy.clearRatio;
      return fastOn;
    },
    /**
     * @returns {{ready:boolean, seconds:number, charsRead:number, charsPerMin:number|null, recentCharsPerMin:number|null,
     *            spanRatio:number|null, fast:boolean, wide:boolean, warn:boolean, reasons:string[]}}
     */
    get status() {
      const seconds = firstMs === null ? 0 : (lastMs - firstMs) / 1000;
      const cpm = seconds > 0 && chars > 0 ? (chars / seconds) * 60 : null;   // 쪽 전체 평균 (기록용)
      const recent = recentCharsPerMin();
      const sr = spanRatio();
      const fastNow = this.fast;
      const wide = policy.maxSpanRatio !== null && xs.length >= policy.minSamples && sr !== null && sr > policy.maxSpanRatio;
      const reasons = [];
      if (fastNow) reasons.push('too_fast');
      if (wide) reasons.push('too_wide');
      return { ready: recent !== null, seconds, charsRead: chars, charsPerMin: cpm, recentCharsPerMin: recent, spanRatio: sr,
        fast: fastNow, wide, warn: fastNow || wide, reasons };
    },

    /** 사용자에게 보일 한 문장. 경고가 아니면 null */
    message() {
      const st = this.status;
      if (!st.warn) return null;
      const bits = [];
      if (st.fast) bits.push(`분당 약 ${Math.round(st.recentCharsPerMin / 10) * 10}자`);
      if (st.wide) bits.push('시선이 글 밖까지 움직임');
      return `빠르게 지나가고 있습니다 (${bits.join(', ')}). `
        + '읽기 연구에서 보고된 묵독 속도(분당 200~400단어)를 벗어납니다. 점수는 그대로 두고 기록에만 남깁니다.';
    },

    /** 기록·진단용 */
    snapshot() {
      const st = this.status;
      const r0 = (v) => (v === null ? null : Math.round(v));
      return { version: policy.version, seconds: Math.round(st.seconds * 10) / 10,
        charsRead: Math.round(st.charsRead), charsPerMin: r0(st.charsPerMin), recentCharsPerMin: r0(st.recentCharsPerMin),
        groups: groups.length,
        spanRatio: st.spanRatio === null ? null : Math.round(st.spanRatio * 100) / 100,
        ready: st.ready, warn: st.warn, reasons: st.reasons,
        limits: { maxCharsPerMin: policy.maxCharsPerMin, maxSpanRatio: policy.maxSpanRatio } };
    }
  };
}
