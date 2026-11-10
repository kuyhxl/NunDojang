// 시선 추정 수학 — 순수 함수만. DOM·카메라·MediaPipe에 의존하지 않는다.
// 그래서 브라우저 없이 바로 시험할 수 있다:  node tests/gazeMath.test.mjs
//
// 좌표 약속
//  - 입력 landmark: MediaPipe FaceLandmarker 정규 좌표 (x,y ∈ [0,1]).
//  - 영상 좌표계: x는 오른쪽, y는 아래쪽이 +.
//  - 출력 특징은 전부 "사용자 기준"으로 부호를 맞춘다:
//      eyeH > 0 = 사용자의 오른쪽(= 화면 x가 큰 쪽),  eyeV > 0 = 아래쪽.
//  - 출력 시선 좌표는 화면 비율(0~1).
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

export const GAZE_MATH_VERSION = 'gaze-math/2.0.0';

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

/** 보정 회귀의 기저. 교차검증으로 이 중 하나를 고른다. */
export const BASIS = Object.freeze({
  // 화면 속 얼굴 위치(faceCx/faceCy)는 넣지 않는다. 보정 중에는 거의 움직이지 않아 계수가
  // 우연한 값으로 커지고, 읽는 동안 몸이 조금만 기울어도 시선이 크게 밀린다.
  // 실측(2026-11-10 기록): 넣으면 세로가 2~5줄 아래로 밀렸고, 빼면 실제 줄 범위에 들어왔다.
  // 보정 점끼리의 교차검증은 이 문제를 못 잡는다(보정 뒤에 생기는 자세 변화라서).
  linear: (f) => [1, f.eyeH, f.eyeV, f.headYaw, f.headPitch],
  // 눈꺼풀 틈(openness)을 넣은 변종. 눈꺼풀이 홍채를 덮으면 홍채 중심이 아래로 치우쳐
  // 읽히므로, 눈이 처지면 세로가 아래로 밀린다. 그 몫을 모형이 설명할 수 있게 한다.
  // 기존 linear를 바꾸지 않고 **후보로만** 넣는다 — 도움이 될 때만 교차검증이 뽑는다.
  linearLid: (f) => [1, f.eyeH, f.eyeV, f.headYaw, f.headPitch, f.openness],
  binocular: (f) => [
    1, f.eyeHL, f.eyeHR, f.eyeVL, f.eyeVR,
    f.headYaw, f.headPitch, f.faceCx, f.faceCy, f.faceScale
  ],
  quadratic: (f) => [
    1, f.eyeH, f.eyeV, f.headYaw, f.headPitch, f.faceCx, f.faceCy,
    f.eyeH * f.eyeH, f.eyeV * f.eyeV, f.eyeH * f.eyeV,
    f.eyeH * f.headYaw, f.eyeV * f.headPitch, f.faceScale
  ]
});
// 단순한 것부터. 교차검증이 비슷하면 앞엣것을 고른다.
export const BASIS_ORDERS = Object.freeze(['linear', 'linearLid', 'binocular', 'quadratic']);

/** 기저가 읽는 모든 키를 가진 더미. 기저 길이를 세는 데 쓴다. */
const ZERO_FEATURES = Object.freeze({
  eyeH: 0, eyeV: 0, eyeHL: 0, eyeHR: 0, eyeVL: 0, eyeVR: 0,
  headYaw: 0, headPitch: 0, faceCx: 0, faceCy: 0, faceScale: 0, openness: 0
});
export const basisLength = (order) => BASIS[order](ZERO_FEATURES).length;

// 보정 중에는 머리가 거의 고정이라 머리·얼굴 위치 특징의 분산이 프레임 잡음과 비슷하다.
// 그대로 표준화하면 잡음이 큰 가중치로 바뀌어, 읽는 동안 자세가 조금만 달라져도 좌표가 크게 빗나간다.
// 눈 특징(분산 약 0.03)은 이 하한에 걸리지 않는다. 합성 시험으로 고른 값이며 실측 검증 전이다.
const MIN_FEATURE_STD = 0.02;

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
 * 능형회귀. 첫 열은 절편(=1)으로 보고 규제하지 않는다. 열마다 크기가 달라 표준화한 뒤 푼다.
 * @param minStd 표준화에 쓸 표준편차의 하한. 분산이 이보다 작은 열은 그만큼 규제가 세진다.
 */
export function fitRidge(rows, targets, lambda = 1e-2, minStd = 0) {
  const n = rows.length;
  if (!n || n !== targets.length) return null;
  const p = rows[0].length;
  if (p < 2 || rows.some((r) => r.length !== p)) return null;

  const mean = new Array(p).fill(0);
  const std = new Array(p).fill(1);
  for (let j = 1; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rows[i][j];
    mean[j] = s / n;
    let q = 0;
    for (let i = 0; i < n; i++) { const d = rows[i][j] - mean[j]; q += d * d; }
    const sd = Math.sqrt(q / n);
    std[j] = sd > 1e-9 ? Math.max(sd, minStd) : 1;
  }
  const Z = rows.map((r) => r.map((v, j) => (j === 0 ? 1 : (v - mean[j]) / std[j])));

  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const r = Z[i], t = targets[i];
    for (let j = 0; j < p; j++) {
      Xty[j] += r[j] * t;
      for (let k = j; k < p; k++) XtX[j][k] += r[j] * r[k];
    }
  }
  for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) XtX[j][k] = XtX[k][j];
  for (let j = 1; j < p; j++) XtX[j][j] += lambda * n;

  const w = solveLinearSystem(XtX, Xty);
  return w ? { weights: w, mean, std } : null;
}

/** fitRidge 결과로 한 행을 예측한다. */
export function applyRidge(fit, row) {
  const { weights, mean, std } = fit;
  let s = weights[0];
  for (let j = 1; j < weights.length; j++) s += weights[j] * ((row[j] - mean[j]) / std[j]);
  return s;
}

/**
 * 보정점 하나에서 모은 표본 중 튀는 것을 버린다.
 * 눈이 아직 옮겨 가는 중이거나, 딴 데를 본 프레임이 섞이면 회귀가 통째로 끌려간다.
 * 중앙값에서 먼 순서로 keep 비율만 남긴다.
 */
export function trimOutliers(samples, keep = 0.75) {
  if (samples.length < 6) return samples;
  const med = (arr) => { const s = [...arr].sort((p, q) => p - q); return s[s.length >> 1]; };
  const mh = med(samples.map((s) => s.features.eyeH));
  const mv = med(samples.map((s) => s.features.eyeV));
  const sh = med(samples.map((s) => Math.abs(s.features.eyeH - mh))) || 1e-6;
  const sv = med(samples.map((s) => Math.abs(s.features.eyeV - mv))) || 1e-6;
  const scored = samples.map((s) => ({
    s, d: Math.hypot((s.features.eyeH - mh) / sh, (s.features.eyeV - mv) / sv)
  })).sort((p, q) => p.d - q.d);
  return scored.slice(0, Math.max(4, Math.round(samples.length * keep))).map((x) => x.s);
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

/** 중립(화면 중앙을 볼 때) 기준값 수집기. 중앙값을 쓰므로 튀는 프레임에 끌리지 않는다. */
export function createNeutralCollector(minSamples = 24) {
  const keys = ['eyeH', 'eyeV', 'headYaw', 'headPitch'];
  let rows = [];
  return {
    push(f) { rows.push(keys.map((k) => f[k])); return rows.length; },
    get count() { return rows.length; },
    get ready() { return rows.length >= minSamples; },
    result() {
      if (!rows.length) return null;
      const out = {};
      keys.forEach((k, j) => {
        const col = rows.map((r) => r[j]).sort((p, q) => p - q);
        out[k] = col[col.length >> 1];
      });
      return out;
    },
    reset() { rows = []; }
  };
}

// 보정 전에 쓰는 초기 기울기. **사람·화면·거리마다 다른 짐작값이다.**
// 부호까지 짐작이므로, 빠른 보정(4점)이나 전체 보정(9점)으로 반드시 덮어써야 한다.
export const DEFAULT_GAINS = Object.freeze({
  eyeH: 11.0, eyeV: 20.0, headYaw: 1.2, headPitch: 1.2
});

/** eyeH/eyeV를 흔들면 좌우 눈 값도 함께 흔들리도록 특징을 만든다(기울기 추정용). */
function perturb(base, key, delta) {
  const f = { ...base };
  if (key === 'eyeH') { f.eyeH += delta; f.eyeHL += delta; f.eyeHR += delta; }
  else if (key === 'eyeV') { f.eyeV += delta; f.eyeVL += delta; f.eyeVR += delta; }
  else f[key] += delta;
  return f;
}

/**
 * 특징 → 화면 비율 좌표 모형.
 * 보정 전: 중립 기준 대비 기울기(초기 이득). 방향만 맞추는 임시 모드다.
 * 보정 후: 능형회귀 가중치. 차수는 교차검증으로 고른다.
 */
export function createGazeModel({ gains = {} } = {}) {
  let g = { ...DEFAULT_GAINS, ...gains };
  let neutral = null;
  let fitted = null;
  let previous = null;     // 직전 보정. 새 보정이 더 나쁘면 되돌린다.
  // 치우침 보정. 보정 뒤 자세가 바뀌거나 눈꺼풀이 처지면 좌표가 통째로 밀린다.
  // 회귀 모형은 그걸 못 고치므로(보정 당시 자세만 안다) 예측 위에 더하는 상수로 바로잡는다.
  let offset = { x: 0, y: 0 };

  function predictNorm(f) {
    if (!f) return null;
    if (fitted) {
      const row = BASIS[fitted.order](f);
      return {
        x: applyRidge(fitted.x, row) + offset.x,
        y: applyRidge(fitted.y, row) + offset.y,
        calibrated: true
      };
    }
    const n = neutral ?? { eyeH: 0, eyeV: 0, headYaw: 0, headPitch: 0 };
    return {
      x: 0.5 + g.eyeH * (f.eyeH - n.eyeH) + g.headYaw * (f.headYaw - n.headYaw) + offset.x,
      y: 0.5 + g.eyeV * (f.eyeV - n.eyeV) + g.headPitch * (f.headPitch - n.headPitch) + offset.y,
      calibrated: false
    };
  }

  function fitOrder(order, samples, lambda) {
    const rows = samples.map((s) => BASIS[order](s.features));
    const fx = fitRidge(rows, samples.map((s) => s.nx), lambda, MIN_FEATURE_STD);
    const fy = fitRidge(rows, samples.map((s) => s.ny), lambda, MIN_FEATURE_STD);
    return fx && fy ? { order, x: fx, y: fy } : null;
  }

  /** 보정점 단위 leave-one-out. 한 점을 빼고 맞춘 뒤 그 점을 얼마나 틀리는지 본다. */
  function looError(order, samples, lambda, width, height) {
    const ids = [...new Set(samples.map((s) => s.point))];
    if (ids.length < 4) return null;
    const errs = [];
    for (const id of ids) {
      const train = samples.filter((s) => s.point !== id);
      const test = samples.filter((s) => s.point === id);
      const m = fitOrder(order, train, lambda);
      if (!m) return null;
      let sx = 0, sy = 0;
      for (const s of test) {
        const row = BASIS[order](s.features);
        sx += applyRidge(m.x, row);
        sy += applyRidge(m.y, row);
      }
      const px = (sx / test.length - test[0].nx) * width;
      const py = (sy / test.length - test[0].ny) * height;
      errs.push({ point: id, errPx: Math.hypot(px, py), dxPx: px, dyPx: py });
    }
    return {
      rmsPx: Math.sqrt(errs.reduce((s, e) => s + e.errPx * e.errPx, 0) / errs.length),
      perPoint: errs
    };
  }

  /**
   * 맞춘 모형에서 "보정 전 모드"가 쓸 기울기와 중립을 되뽑는다.
   * 보정을 한 번 하면 그 뒤로는 초기 짐작값 대신 실제로 측정된 부호·크기를 쓰게 된다.
   */
  function learnGainsFrom(model, samples) {
    const keys = ['eyeH', 'eyeV', 'headYaw', 'headPitch'];
    const avg = {};
    for (const k of [...keys, 'eyeHL', 'eyeHR', 'eyeVL', 'eyeVR', 'faceCx', 'faceCy', 'faceScale']) {
      avg[k] = samples.reduce((s, x) => s + (x.features[k] ?? 0), 0) / samples.length;
    }
    const at = (f) => {
      const row = BASIS[model.order](f);
      return { x: applyRidge(model.x, row), y: applyRidge(model.y, row) };
    };
    const spread = (k) => {
      const vals = samples.map((s) => s.features[k]);
      return Math.max(1e-4, (Math.max(...vals) - Math.min(...vals)) / 4);
    };
    const slope = {};
    for (const k of keys) {
      const d = spread(k);
      const hi = at(perturb(avg, k, d)), lo = at(perturb(avg, k, -d));
      slope[k] = { x: (hi.x - lo.x) / (2 * d), y: (hi.y - lo.y) / (2 * d) };
    }
    const next = {
      eyeH: slope.eyeH.x, eyeV: slope.eyeV.y,
      headYaw: slope.headYaw.x, headPitch: slope.headPitch.y
    };
    if (Object.values(next).every(Number.isFinite)) {
      g = { ...g, ...next };
      neutral = { eyeH: avg.eyeH, eyeV: avg.eyeV, headYaw: avg.headYaw, headPitch: avg.headPitch };
    }
    return { ...next };
  }

  return {
    setNeutral(n) { neutral = n ? { ...n } : null; },
    getNeutral() { return neutral ? { ...neutral } : null; },

    // ── 치우침 보정 (드리프트) ──
    getOffset() { return { ...offset }; },
    clearOffset() { offset = { x: 0, y: 0 }; },
    /** 예측이 (nx,ny)를 가리키도록 치우침을 더한다. maxOffset을 넘지 않게 묶는다. */
    anchorTo({ predictedX, predictedY, nx, ny, maxOffset = 0.35 }) {
      if (![predictedX, predictedY, nx, ny].every(Number.isFinite)) {
        return { ok: false, reason: 'bad_input' };
      }
      const next = {
        x: clamp(offset.x + (nx - predictedX), -maxOffset, maxOffset),
        y: clamp(offset.y + (ny - predictedY), -maxOffset, maxOffset)
      };
      const want = { x: offset.x + (nx - predictedX), y: offset.y + (ny - predictedY) };
      const clamped = Math.abs(want.x) > maxOffset + 1e-9 || Math.abs(want.y) > maxOffset + 1e-9;
      const moved = { x: next.x - offset.x, y: next.y - offset.y };
      offset = next;
      return { ok: true, offset: { ...offset }, moved, clamped };
    },
    /** 자동 드리프트 보정이 조금씩 미는 용도. 한 번에 step 이상 움직이지 않는다. */
    nudgeOffset(dx, dy, { step = 0.01, maxOffset = 0.35 } = {}) {
      const lim = (v) => clamp(v, -step, step);
      offset = {
        x: clamp(offset.x + lim(dx), -maxOffset, maxOffset),
        y: clamp(offset.y + lim(dy), -maxOffset, maxOffset)
      };
      return { ...offset };
    },

    setGains(next) { g = { ...g, ...next }; },
    getGains() { return { ...g }; },
    flip(axis) {
      if (axis === 'x') { g.eyeH = -g.eyeH; g.headYaw = -g.headYaw; }
      else { g.eyeV = -g.eyeV; g.headPitch = -g.headPitch; }
      return { ...g };
    },
    get calibrated() { return !!fitted; },
    getFit() { return fitted ? { order: fitted.order, stats: { ...fitted.stats } } : null; },
    get hasPrevious() { return !!previous; },
    /** 방금 한 보정이 더 나쁘면 직전 보정으로 되돌린다. */
    restorePrevious() {
      if (!previous) return { ok: false, reason: 'no_previous' };
      const swap = fitted;
      fitted = previous;
      previous = swap;
      return { ok: true, order: fitted.order, stats: { ...fitted.stats } };
    },
    clearFit() { previous = fitted; fitted = null; },
    predictNorm,

    /**
     * 두 점(또는 네 점)만으로 부호와 크기를 직접 재서 초기 이득을 정한다.
     * 회귀가 아니라 기울기 측정이다. 짐작값을 실제 측정으로 바꾸는 게 목적.
     * @param pairs [{ features, nx, ny }] — 각 목표점의 대표 특징(중앙값)
     */
    fitGainsFromSpan(pairs) {
      if (!Array.isArray(pairs) || pairs.length < 2) return { ok: false, reason: 'need_2_points' };
      const pick = (sel) => pairs.map(sel);
      const spanX = Math.max(...pick((p) => p.nx)) - Math.min(...pick((p) => p.nx));
      const spanY = Math.max(...pick((p) => p.ny)) - Math.min(...pick((p) => p.ny));
      const slope = (fk, tk, span) => {
        if (span < 0.2) return null;
        const xs = pairs.map((p) => p.features[fk]);
        const ts = pairs.map((p) => p[tk]);
        const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
        const mt = ts.reduce((s, v) => s + v, 0) / ts.length;
        let num = 0, den = 0;
        for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ts[i] - mt); den += (xs[i] - mx) ** 2; }
        return den > 1e-12 ? num / den : null;
      };
      const gx = slope('eyeH', 'nx', spanX);
      const gy = slope('eyeV', 'ny', spanY);
      const out = {};
      // 머리는 눈과 같은 방향으로 거들게만 둔다. 부호가 어긋나 서로 싸우는 걸 막는다.
      if (Number.isFinite(gx) && Math.abs(gx) > 0.5) { out.eyeH = gx; out.headYaw = Math.sign(gx) * 1.2; }
      if (Number.isFinite(gy) && Math.abs(gy) > 0.5) { out.eyeV = gy; out.headPitch = Math.sign(gy) * 1.2; }
      if (!Object.keys(out).length) return { ok: false, reason: 'no_usable_span' };
      g = { ...g, ...out };
      const mean = (k) => pairs.reduce((s, p) => s + p.features[k], 0) / pairs.length;
      neutral = {
        eyeH: mean('eyeH') - (0.5 - pairs.reduce((s, p) => s + p.nx, 0) / pairs.length) / (out.eyeH ?? 1),
        eyeV: mean('eyeV') - (0.5 - pairs.reduce((s, p) => s + p.ny, 0) / pairs.length) / (out.eyeV ?? 1),
        headYaw: mean('headYaw'),
        headPitch: mean('headPitch')
      };
      return { ok: true, gains: { ...g }, measured: { eyeHSlope: gx, eyeVSlope: gy } };
    },

    /**
     * 보정 표본으로 모형을 맞춘다.
     * @param samples [{features, nx, ny, point}] — nx,ny는 화면 비율(0~1) 목표
     */
    fit(samples, {
      width = 1, height = 1, lambda = 1e-2, trim = 0.75,
      selectionMargin = 0.15, selectionMarginPx = 1, orders = BASIS_ORDERS
    } = {}) {
      const clean = (samples ?? []).filter((s) => s && s.features &&
        [s.nx, s.ny].every((v) => Number.isFinite(v)) && Number.isFinite(s.point));
      const points = [...new Set(clean.map((s) => s.point))];
      if (points.length < 4) return { ok: false, reason: 'need_at_least_4_points', points: points.length };

      // 점마다 튀는 표본을 버린다 (눈이 옮겨 가는 중이거나 딴 데를 본 프레임)
      const usable = points.flatMap((id) => trimOutliers(clean.filter((s) => s.point === id), trim));

      const candidates = [];
      for (const order of orders) {
        if (usable.length < basisLength(order) * 3) continue;
        const loo = looError(order, usable, lambda, width, height);
        const model = fitOrder(order, usable, lambda);
        if (loo && model) candidates.push({ order, loo, model });
      }
      if (!candidates.length) return { ok: false, reason: 'not_enough_samples', samples: usable.length };

      // 교차검증 오차가 가장 작은 것을 그냥 집으면, 보정점이 많아질수록
      // 복잡한 기저가 '운으로' 이겨 실제로는 더 나빠진다(선택 자체의 과적합).
      // 그래서 최저값에서 margin 안에 드는 것 중 **가장 단순한** 기저를 고른다.
      candidates.sort((a, b) => a.loo.rmsPx - b.loo.rmsPx);
      // 비율만 쓰면 최저 오차가 0에 가까울 때 여유가 사라진다(0 × 1.15 = 0).
      // 1px 아래 차이는 뜻이 없으므로 절대 여유도 함께 둔다.
      const floor = candidates[0].loo.rmsPx;
      const threshold = floor * (1 + selectionMargin) + selectionMarginPx;
      const within = candidates.filter((c) => c.loo.rmsPx <= threshold);
      within.sort((a, b) => BASIS_ORDERS.indexOf(a.order) - BASIS_ORDERS.indexOf(b.order));
      const best = within[0];

      let se = 0;
      for (const s of usable) {
        const row = BASIS[best.order](s.features);
        const ex = (applyRidge(best.model.x, row) - s.nx) * width;
        const ey = (applyRidge(best.model.y, row) - s.ny) * height;
        se += ex * ex + ey * ey;
      }
      const learnedGains = learnGainsFrom(best.model, usable);
      const stats = {
        order: best.order,
        samples: usable.length,
        dropped: clean.length - usable.length,
        points: points.length,
        trainRmsPx: Math.sqrt(se / usable.length),
        looRmsPx: best.loo.rmsPx,
        perPoint: best.loo.perPoint,
        considered: candidates.map((c) => ({ order: c.order, looRmsPx: c.loo.rmsPx })),
        bestLooRmsPx: floor,
        selectionMargin,
        selectionMarginPx,
        learnedGains,
        fittedAt: Date.now()
      };
      previous = fitted;                 // 더 나빠졌으면 되돌릴 수 있게 한 벌 남긴다
      fitted = { order: best.order, x: best.model.x, y: best.model.y, stats };
      return { ok: true, ...stats };
    }
  };
}
