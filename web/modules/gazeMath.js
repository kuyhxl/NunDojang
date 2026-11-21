// 시선 신호 수학 — 순수 함수만. DOM·카메라·MediaPipe에 의존하지 않는다.
// 그래서 브라우저 없이 바로 시험할 수 있다:  node tests/gazeMath.test.mjs
//
// 2026-11-21부터 **화면 좌표는 여기서 만들지 않는다.** 좌표는 WebEyeTrack의 BlazeGaze 모형이 낸다
// (webEyeTrackMath.js → blazeGaze.js → gazeModel.js). 능형회귀·기저·초기 이득·중립 수집기는 지웠다.
// 여기 남은 것은 그 좌표 앞뒤를 받치는 신호 처리다:
//   - extractGazeFeatures : 깜빡임·품질 판정, 자세 안내, 기록 열(eye_h … roll_deg)에 쓰는 landmark 특징
//   - One Euro 필터 · 고정 보정 · 깜빡임 가드 · 눈 뜸 기준 · 드리프트 감시기
//   - solveLinearSystem   : 어파인·호모그래피 풀이가 가져다 쓴다
//
// 좌표 약속
//  - 입력 landmark: MediaPipe FaceLandmarker 정규 좌표 (x,y ∈ [0,1]).
//  - 영상 좌표계: x는 오른쪽, y는 아래쪽이 +.
//  - 출력 특징은 전부 "사용자 기준"으로 부호를 맞춘다:
//      eyeH > 0 = 사용자의 오른쪽(= 화면 x가 큰 쪽),  eyeV > 0 = 아래쪽.
//
// ■ 거울상(mirror)에 대하여 — 1차 구현에서 틀렸던 부분
//   카메라 영상이 좌우 반전되어 들어오는 경우가 있다(드라이버·가상 카메라·설정).
//   eyeH는 반전에 영향을 받지 않는다: 반전되면 홍채 변위 rx와 두 눈 축 ux가 함께 뒤집혀
//   둘의 내적은 그대로다. 하지만 수직축 v̂ = (-uy, ux)는 함께 뒤집히지 않아
//   "영상 아래쪽"을 가리키던 것이 위쪽을 가리키게 된다 → 상하가 뒤집힌다.
//   그래서 v̂는 항상 아래쪽을 향하도록 강제한다.
//
// ■ 머리 자세 — 1차 구현에서 좌우 반전을 일으킨 부분
//   facialTransformationMatrixes의 메모리 배치(열 우선/행 우선)는 문서로 확정하기 어렵고,
//   순수 yaw 회전에서 두 배치는 정확히 n.x의 부호만 다르다 → yaw 부호가 뒤집힌다.
//   게다가 영상이 반전되어 있으면 행렬이 본 얼굴 자체가 뒤집혀 yaw가 또 뒤집힌다.
//   그래서 머리 자세는 행렬이 아니라 landmark에서 직접 뽑는다(아래 두 대용값). 둘 다 반전에 둔감하다.
//   행렬 값은 진단용으로만 남긴다.

export const GAZE_MATH_VERSION = 'gaze-math/3.0.0';

/** MediaPipe FaceLandmarker(478점) 지표. iris는 468·473(중심), 1은 코끝. */
export const LM = Object.freeze({
  interocularOuter: [33, 263],
  nose: 1,
  right: Object.freeze({ outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 }),
  left: Object.freeze({ outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 })
});

const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const toPx = (p, w, h) => ({ x: p.x * w, y: p.y * h });

/**
 * facialTransformationMatrixes[0].data에서 머리 자세를 꺼낸다. **진단 전용.**
 * 메모리 배치를 확정할 수 없어 시선 특징에는 쓰지 않는다 (위 설명 참고).
 */
export function decodeHeadPose(data) {
  if (!data || data.length < 16) return null;
  const d = Array.from(data, Number);
  if (d.some((v) => !Number.isFinite(v))) return null;
  const len = Math.hypot(d[8], d[9], d[10]);
  if (!(len > 1e-6)) return null;
  const normal = { x: d[8] / len, y: d[9] / len, z: d[10] / len };
  return {
    yaw: -Math.atan2(normal.x, normal.z),
    pitch: Math.asin(clamp(-normal.y, -1, 1)),
    roll: Math.atan2(d[4], d[5]),
    translation: { x: d[12], y: d[13], z: d[14] },
    normal,
    diagnosticOnly: true
  };
}

/**
 * 한 프레임의 landmark에서 시선 특징을 뽑는다.
 * @param points MediaPipe faceLandmarks[0]
 * @param w,h    영상 픽셀 크기
 * @param poseMatrixData facialTransformationMatrixes[0].data (진단용, 없어도 된다)
 */
export function extractGazeFeatures(points, w, h, poseMatrixData = null) {
  if (!points || typeof points.length !== 'number') return null;
  if (![w, h].every((v) => Number.isFinite(v) && v > 0)) return null;

  const A = points[LM.interocularOuter[0]];
  const B = points[LM.interocularOuter[1]];
  if (!finitePoint(A) || !finitePoint(B)) return null;

  const a = toPx(A, w, h);
  const b = toPx(B, w, h);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const D = Math.hypot(dx, dy);          // 두 눈 바깥 눈꼬리 거리 = 길이 기준
  if (!(D >= 8)) return null;            // 얼굴이 너무 작으면 홍채 좌표를 믿을 수 없다

  const ux = dx / D, uy = dy / D;        // 두 눈을 잇는 축 (머리 기울기를 여기서 흡수)
  // 수직축은 **언제나 영상 아래쪽**을 향하게 한다. 영상이 반전되어도 상하가 뒤집히지 않는다.
  let vx = -uy, vy = ux;
  if (vy < 0) { vx = -vx; vy = -vy; }

  const eyes = { left: null, right: null };
  for (const name of ['left', 'right']) {
    const m = LM[name];
    const raw = [points[m.outer], points[m.inner], points[m.iris], points[m.upper], points[m.lower]];
    if (!raw.every(finitePoint)) continue;
    const [outer, inner, iris, upper, lower] = raw.map((p) => toPx(p, w, h));
    const cx = (outer.x + inner.x) / 2;  // 눈꼬리 중심 — 눈꺼풀과 달리 깜빡임에 움직이지 않는다
    const cy = (outer.y + inner.y) / 2;
    const rx = iris.x - cx, ry = iris.y - cy;
    const widthPx = Math.hypot(inner.x - outer.x, inner.y - outer.y);
    if (!(widthPx >= 3)) continue;
    eyes[name] = {
      // 사용자 기준 부호로 바로 저장한다 (오른쪽 +, 아래 +)
      h: -(rx * ux + ry * uy) / D,
      v: (rx * vx + ry * vy) / D,
      openness: Math.hypot(lower.x - upper.x, lower.y - upper.y) / D,
      widthPx
    };
  }

  const used = ['left', 'right'].filter((n) => eyes[n]);
  if (!used.length) return null;
  const mean = (k) => used.reduce((s, n) => s + eyes[n][k], 0) / used.length;

  // ── 머리 자세 대용값 (landmark에서 직접. 거울상·행렬 배치와 무관) ──
  const nose = points[LM.nose];
  let headYaw = 0, headPitch = 0, hasHeadProxy = false;
  if (finitePoint(nose)) {
    const n = toPx(nose, w, h);
    // yaw: 고개를 사용자 오른쪽으로 돌리면 오른쪽 얼굴이 눌려 코–오른눈 거리가 짧아진다.
    const dRight = Math.hypot(n.x - a.x, n.y - a.y);   // a = 33 = 사용자의 오른눈 바깥
    const dLeft = Math.hypot(n.x - b.x, n.y - b.y);    // b = 263 = 사용자의 왼눈 바깥
    const sum = dRight + dLeft;
    if (sum > 1e-6) headYaw = (dLeft - dRight) / sum;  // + = 사용자 오른쪽으로 돌림
    // pitch: 고개를 들면 코끝이 눈 쪽으로 올라와 눈–코 세로 거리가 짧아진다. 부호를 뒤집어 '듦 = +'로 둔다.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    headPitch = -(((n.x - mx) * vx + (n.y - my) * vy) / D);
    hasHeadProxy = true;
  }

  const matrix = decodeHeadPose(poseMatrixData);
  return {
    // 시선 특징 (사용자 기준)
    eyeH: mean('h'),
    eyeV: mean('v'),
    eyeHL: eyes.left ? eyes.left.h : mean('h'),
    eyeHR: eyes.right ? eyes.right.h : mean('h'),
    eyeVL: eyes.left ? eyes.left.v : mean('v'),
    eyeVR: eyes.right ? eyes.right.v : mean('v'),
    headYaw,
    headPitch,
    hasHeadProxy,
    // 품질·보조 변수
    openness: mean('openness'),
    eyesUsed: used.length,
    monocular: used.length === 1,
    faceCx: 0.5 - (a.x + b.x) / 2 / w,   // 화면 안 얼굴 위치 (사용자 오른쪽이 +)
    faceCy: (a.y + b.y) / 2 / h - 0.5,
    faceScale: D / w,                    // 거리 대용값 (크면 가까움)
    interocularPx: D,
    rollDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    eyes,
    matrix                               // 진단 전용. 시선 계산에 쓰지 않는다.
  };
}

/** 부분 피벗 가우스 소거. 특이행렬이면 null. */
export function solveLinearSystem(A, b) {
  const n = b.length;
  if (!n || A.length !== n || A.some((r) => r.length !== n)) return null;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (!(Math.abs(M[piv][c]) > 1e-12)) return null;
    if (piv !== c) { const t = M[c]; M[c] = M[piv]; M[piv] = t; }
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * One Euro 필터. 멈춰 있을 때는 세게 눌러 떨림을 없애고, 빠르게 움직이면 바로 따라간다.
 */
export function createOneEuroFilter({ minCutoff = 1.0, beta = 0.6, dCutoff = 1.0 } = {}) {
  let xPrev = null, dxPrev = 0, tPrev = null;
  const alpha = (cutoff, dt) => {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };
  return {
    filter(x, tMs) {
      if (!Number.isFinite(x)) return xPrev;
      if (xPrev === null || tPrev === null || !(tMs > tPrev)) {
        xPrev = x; tPrev = tMs; dxPrev = 0; return x;
      }
      const dt = Math.min(0.2, (tMs - tPrev) / 1000);
      tPrev = tMs;
      const dx = (x - xPrev) / dt;
      dxPrev += alpha(dCutoff, dt) * (dx - dxPrev);
      const cutoff = minCutoff + beta * Math.abs(dxPrev);
      xPrev += alpha(cutoff, dt) * (x - xPrev);
      return xPrev;
    },
    reset() { xPrev = null; dxPrev = 0; tPrev = null; },
    get value() { return xPrev; },
    get speed() { return dxPrev; }
  };
}

/** I-DT 고정(fixation) 판정. 최근 windowMs 동안 흩어짐이 기준 아래면 그 무게중심을 내보낸다. */
export function createFixationSnap({ windowMs = 180, dispersion = 0.022 } = {}) {
  let buf = [];
  return {
    push(x, y, tMs) {
      buf.push({ x, y, t: tMs });
      while (buf.length > 1 && tMs - buf[0].t > windowMs) buf.shift();
      if (buf.length < 4) return { x, y, fixating: false };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sx = 0, sy = 0;
      for (const p of buf) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        sx += p.x; sy += p.y;
      }
      const spread = (maxX - minX) + (maxY - minY);
      if (spread > dispersion) return { x, y, fixating: false };
      return { x: sx / buf.length, y: sy / buf.length, fixating: true };
    },
    reset() { buf = []; }
  };
}

/**
 * 깜빡임 가드.
 *
 * 눈꺼풀이 내려오는 동안 홍채 지표가 눈꺼풀을 따라 끌려간다. "감았다"고 판정할 즈음에는
 * 이미 어긋난 좌표를 두어 프레임 내보낸 뒤라, 포인터가 아래로 튀었다가 멈춘다.
 * 그래서 두 가지를 한다:
 *   ① 두 기준값(enter/exit)으로 걸러 경계에서 깜빡거리지 않게 한다.
 *   ② 감기 시작 preBlinkMs 전의 좌표를 붙든다 — 끌려간 프레임을 쓰지 않는다.
 *   ③ 다시 뜬 뒤 settleMs 동안도 붙든다(settling). exit 기준을 넘었어도 눈꺼풀이 다 올라가기 전이라
 *      홍채가 아래로 읽힌다. 실측(2026-11-10): 뜬 직후 0~0.1초 +106px, 0.1~0.2초 +44px,
 *      0.2~0.3초 +19px 아래로 튀었다. 줄 간격이 26px이라 0.25초면 한 줄 안으로 들어온다.
 */
export function createBlinkGuard({ enter = 0.34, exit = 0.18, preBlinkMs = 140, maxBlinkMs = 600, settleMs = 0 } = {}) {
  let blinking = false, hold = null, history = [], startedAt = null, settleUntil = -Infinity;
  const before = (tMs) => {
    const want = tMs - preBlinkMs;
    for (let i = history.length - 1; i >= 0; i--) if (history[i].tMs <= want) return history[i];
    return history[0] ?? null;
  };
  return {
    get blinking() { return blinking; },
    get hold() { return hold; },
    get historyLength() { return history.length; },
    /** 성한 좌표를 기록한다. 깜빡임 중에는 부르지 않는다. */
    push(pos) {
      if (!pos || !Number.isFinite(pos.tMs)) return;
      history.push(pos);
      while (history.length > 1 && pos.tMs - history[0].tMs > preBlinkMs * 3) history.shift();
    },
    /** @returns {{blinking:boolean, settling:boolean, hold:object|null, ended:boolean, timedOut:boolean}} */
    update(closure, tMs) {
      let ended = false, timedOut = false;
      if (!blinking && closure >= enter) {
        blinking = true;
        startedAt = tMs;
        settleUntil = -Infinity;
        hold = before(tMs);
      } else if (blinking && (closure <= exit || tMs - startedAt > maxBlinkMs)) {
        // maxBlinkMs를 넘겼다면 깜빡임이 아니라 눈을 가늘게 뜬 채 머무는 것이다.
        // 계속 붙들고 있으면 포인터가 몇 초씩 얼어붙는다. 놓아주고 다시 따라간다.
        timedOut = closure > exit;
        blinking = false;
        ended = true;
        startedAt = null;
        settleUntil = timedOut ? -Infinity : tMs + settleMs;   // 가늘게 뜬 상태는 '다시 뜬' 게 아니다
        history = [];          // 깜빡임을 가로질러 되감지 않는다
      }
      return { blinking, settling: !blinking && tMs < settleUntil, hold, ended, timedOut };
    },
    reset() { blinking = false; hold = null; history = []; startedAt = null; settleUntil = -Infinity; }
  };
}

/**
 * 눈 뜸 정도의 기준값. 최근 windowMs의 중앙값을 기준으로 지금 얼마나 감겼는지(0~1)를 낸다.
 * 깜빡임은 짧아서 중앙값을 못 움직이고, 아래를 보느라 눈꺼풀이 내려온 상태는 금방 새 기준이 된다.
 * 최댓값을 기준으로 삼으면 눈을 크게 떴던 순간이 오래 남아, 읽는 동안의 눈을 '감음'으로 잘못 본다.
 */
export function createOpennessBaseline({ windowMs = 2000 } = {}) {
  let buf = [];
  return {
    closure(tMs, openness) {
      if (!Number.isFinite(openness)) return 1;
      buf.push({ tMs, openness });
      while (buf.length > 1 && tMs - buf[0].tMs > windowMs) buf.shift();
      const sorted = buf.map((b) => b.openness).sort((a, b) => a - b);
      const base = sorted[sorted.length >> 1];
      return base > 0 ? clamp(1 - openness / base, 0, 1) : 0;
    },
    reset() { buf = []; }
  };
}

/**
 * 드리프트 감시기. 보정했을 때의 값을 기준점으로 잡아 두고, 지금 값이 얼마나 밀렸는지 본다.
 * 세로가 흘러내릴 때 원인이 **눈꺼풀 처짐(openness)** 인지 **자세 무너짐(headPitch)** 인지
 * 둘 다인지 눈으로 가린다. 짐작하지 않으려고 둔 장치다.
 */
export function createDriftMonitor({ keys = ['eyeV', 'eyeH', 'headPitch', 'headYaw', 'openness', 'faceScale'],
  windowMs = 4000 } = {}) {
  let anchor = null;
  let buf = [];
  const med = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[s.length >> 1]; };
  const snapshot = () => {
    if (!buf.length) return null;
    const out = {};
    for (const k of keys) out[k] = med(buf.map((r) => r[k]));
    return out;
  };
  return {
    push(f, tMs) {
      if (!f) return;
      const row = { tMs };
      for (const k of keys) row[k] = Number.isFinite(f[k]) ? f[k] : 0;
      buf.push(row);
      while (buf.length > 1 && tMs - buf[0].tMs > windowMs) buf.shift();
    },
    /** 지금 값을 기준점으로 삼는다 (보정 직후에 부른다). */
    anchorNow() { anchor = snapshot(); return anchor ? { ...anchor } : null; },
    get anchored() { return !!anchor; },
    /** 기준점 대비 밀린 양. 기준점이 없으면 null. */
    delta() {
      const now = snapshot();
      if (!anchor || !now) return null;
      const out = {};
      for (const k of keys) out[k] = now[k] - anchor[k];
      return out;
    },
    reset() { anchor = null; buf = []; }
  };
}
