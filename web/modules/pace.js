// 읽기 속도·가로 폭 경고 — C 소유. 개발용 시험(?pace=1), 팀 합의 전. docs/decisions.md 열린 제안 3.
//
// 무엇: 쪽마다 두 가지를 보고 "읽은 모양이 아니다"를 **경고만** 한다. 점수는 건드리지 않는다.
//   ① 속도  — 읽음으로 인정된 줄의 글자 수 ÷ 그 쪽에 머문 시간
//   ② 폭비  — 시선 x 범위(5~95%) ÷ 단 폭
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
  version: 'reading-pace-warning/0.1.0-dev',
  /** 이 속도를 넘으면 경고 (자/분).
   *  11/17 성실한 쪽 28개의 최대가 696이었지만, 11/10~11 예전 기록까지 넣은 47쪽에서는 848까지 나온다.
   *  900이면 예전 기록에서도 6초 만에 넘긴 쪽 하나만 걸린다 — 그건 실제로 안 읽은 쪽이다. */
  maxCharsPerMin: 900,
  /** 시선 x 범위 ÷ 단 폭이 이보다 크면 경고.
   *  11/17 기록 최대 0.87, 예전 기록까지 넣으면 1.01까지 올라간다. 1.05에서 걸리는 예전 쪽은
   *  폭비 3.40짜리 하나뿐이고 그건 추적이 흔들린 쪽이다. */
  maxSpanRatio: 1.05,
  /** 이만큼 지나야 판정한다 (쪽을 막 연 순간의 헛 경고를 막는다) */
  minSeconds: 6,
  /** 폭비를 믿을 최소 표본 수 */
  minSamples: 60,
  /** 단 폭 하나에 들어가는 글자 수 (재배치 규격: 13·20·24px판 모두 40자) */
  charsPerColumn: 40,
  loPct: 0.05,
  hiPct: 0.95,
  source: '2026-11-17 훑기 대조군 11쪽 + 성실 47쪽(11/10~11/17), 한 사람. 잠정값이며 사람이 늘면 다시 잰다'
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

  function spanRatio() {
    if (xs.length < policy.minSamples || !(layout.columnPx > 0)) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
    return (at(policy.hiPct) - at(policy.loPct)) / layout.columnPx;
  }

  return {
    /** 시선 표본 하나 */
    push(s) {
      if (!s?.valid || !Number.isFinite(s.tMs)) return;
      if (firstMs === null) firstMs = s.tMs;
      lastMs = s.tMs;
      if (Number.isFinite(s.xPx)) xs.push(s.xPx);
    },
    /** 읽음으로 인정된 줄 번호들. 같은 줄을 두 번 세지 않는다 */
    credit(lines) {
      for (const k of lines ?? []) if (!credited.has(k)) { credited.add(k); chars += charsOf(k); }
    },
    /**
     * @returns {{ready:boolean, seconds:number, charsRead:number, charsPerMin:number|null,
     *            spanRatio:number|null, fast:boolean, wide:boolean, warn:boolean, reasons:string[]}}
     */
    get status() {
      const seconds = firstMs === null ? 0 : (lastMs - firstMs) / 1000;
      const cpm = seconds > 0 && chars > 0 ? (chars / seconds) * 60 : null;
      const sr = spanRatio();
      const ready = seconds >= policy.minSeconds && xs.length >= policy.minSamples && chars > 0;
      const fast = ready && cpm !== null && cpm > policy.maxCharsPerMin;
      const wide = ready && sr !== null && sr > policy.maxSpanRatio;
      const reasons = [];
      if (fast) reasons.push('too_fast');
      if (wide) reasons.push('too_wide');
      return { ready, seconds, charsRead: chars, charsPerMin: cpm, spanRatio: sr,
        fast, wide, warn: fast || wide, reasons };
    },

    /** 사용자에게 보일 한 문장. 경고가 아니면 null */
    message() {
      const st = this.status;
      if (!st.warn) return null;
      const bits = [];
      if (st.fast) bits.push(`분당 약 ${Math.round(st.charsPerMin)}자`);
      if (st.wide) bits.push('시선이 글 밖까지 움직임');
      return `빠르게 훑은 것으로 보입니다 (${bits.join(', ')}). `
        + '읽기 연구에서 보고된 묵독 속도(분당 200~400단어)를 벗어납니다. 점수는 그대로 두고 기록에만 남깁니다.';
    },

    /** 기록·진단용 */
    snapshot() {
      const st = this.status;
      return { version: policy.version, seconds: Math.round(st.seconds * 10) / 10,
        charsRead: Math.round(st.charsRead), charsPerMin: st.charsPerMin === null ? null : Math.round(st.charsPerMin),
        spanRatio: st.spanRatio === null ? null : Math.round(st.spanRatio * 100) / 100,
        ready: st.ready, warn: st.warn, reasons: st.reasons,
        limits: { maxCharsPerMin: policy.maxCharsPerMin, maxSpanRatio: policy.maxSpanRatio } };
    }
  };
}
