// gazeMath.js 시험 — 브라우저·카메라 없이 돈다.  실행:  node tests/gazeMath.test.mjs
// 합성 landmark로 기하·부호·회귀를 확인한다. 실제 사람 눈으로 검증한 값이 아니라,
// "수식이 의도한 대로 동작하는가"만 본다.

import assert from 'node:assert/strict';
import {
  LM, extractGazeFeatures, decodeHeadPose, createGazeModel, createOneEuroFilter,
  createFixationSnap, createNeutralCollector, fitRidge, applyRidge, solveLinearSystem,
  BASIS, BASIS_ORDERS, basisLength, trimOutliers, createBlinkGuard, createDriftMonitor, createOpennessBaseline
} from '../web/modules/gazeMath.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const W = 1280, H = 720;

/**
 * 정면을 본 얼굴의 합성 landmark.
 * @param gazeH 홍채 가로 이동(정규 x 단위, +면 영상 오른쪽 = 사용자의 왼쪽)
 * @param gazeV 홍채 세로 이동(+면 영상 아래)
 * @param roll  얼굴 기울기(도)
 */
function makeFace({ gazeH = 0, gazeV = 0, roll = 0, open = 0.012, scale = 1, cx = 0.5, cy = 0.5,
  noseDx = 0, noseDy = 0.05 } = {}) {
  const pts = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  const half = 0.06 * scale;                       // 두 눈 바깥 눈꼬리 사이 반거리(정규 x)
  const eyeHalf = 0.022 * scale;                   // 한쪽 눈 반너비
  const th = (roll * Math.PI) / 180;
  const rot = (dx, dy) => ({
    x: cx + (dx * Math.cos(th) - dy * Math.sin(th)),
    y: cy + (dx * Math.sin(th) + dy * Math.cos(th)) * (W / H)   // 픽셀 등방성을 맞춘다
  });
  const put = (idx, dx, dy) => { pts[idx] = { ...rot(dx, dy), z: 0 }; };

  // 오른쪽 눈(영상 왼쪽, x 작은 쪽)
  put(LM.right.outer, -half, 0);
  put(LM.right.inner, -half + 2 * eyeHalf, 0);
  put(LM.right.upper, -half + eyeHalf, -open / 2);
  put(LM.right.lower, -half + eyeHalf, open / 2);
  put(LM.right.iris, -half + eyeHalf + gazeH, gazeV);
  // 왼쪽 눈(영상 오른쪽)
  put(LM.left.outer, half, 0);
  put(LM.left.inner, half - 2 * eyeHalf, 0);
  put(LM.left.upper, half - eyeHalf, -open / 2);
  put(LM.left.lower, half - eyeHalf, open / 2);
  put(LM.left.iris, half - eyeHalf + gazeH, gazeV);
  // 코끝 — 머리 자세 대용값의 기준점
  put(LM.nose, noseDx * scale, noseDy * scale);
  return pts;
}

/** 좌우 반전된 카메라 영상을 흉내 낸다 (landmark 의미는 그대로, 위치만 뒤집힘). */
const mirror = (pts) => pts.map((p) => (p ? { ...p, x: 1 - p.x } : p));

console.log('gazeMath');

test('정면·중앙 응시는 특징이 0에 가깝다', () => {
  const f = extractGazeFeatures(makeFace(), W, H);
  assert.ok(f, '특징이 null');
  assert.ok(Math.abs(f.eyeH) < 1e-9, `eyeH=${f.eyeH}`);
  assert.ok(Math.abs(f.eyeV) < 1e-9, `eyeV=${f.eyeV}`);
  assert.equal(f.eyesUsed, 2);
  assert.equal(f.monocular, false);
});

test('사용자가 오른쪽을 보면 eyeH가 +가 된다', () => {
  // 사용자의 오른쪽 = 영상에서 x가 작아지는 쪽
  const f = extractGazeFeatures(makeFace({ gazeH: -0.01 }), W, H);
  assert.ok(f.eyeH > 0, `eyeH=${f.eyeH}`);
  const g = extractGazeFeatures(makeFace({ gazeH: +0.01 }), W, H);
  assert.ok(g.eyeH < 0, `eyeH=${g.eyeH}`);
});

test('아래를 보면 eyeV가 +가 된다', () => {
  const f = extractGazeFeatures(makeFace({ gazeV: 0.008 }), W, H);
  assert.ok(f.eyeV > 0, `eyeV=${f.eyeV}`);
});

test('머리를 기울여도(roll) 같은 시선이면 특징이 거의 같다', () => {
  // 기울기는 두 눈 축으로 흡수해야 한다 — 기존 구현이 놓치던 부분
  const flat = extractGazeFeatures(makeFace({ gazeH: -0.012 }), W, H);
  for (const roll of [-18, -8, 8, 18]) {
    const tilted = extractGazeFeatures(makeFace({ gazeH: -0.012, roll }), W, H);
    assert.ok(Math.abs(tilted.eyeH - flat.eyeH) < 0.02,
      `roll=${roll}: ${tilted.eyeH} vs ${flat.eyeH}`);
  }
});

test('얼굴이 멀어져도(크기 변화) 특징이 거의 같다', () => {
  const near = extractGazeFeatures(makeFace({ gazeH: -0.012, scale: 1 }), W, H);
  const far = extractGazeFeatures(makeFace({ gazeH: -0.006, scale: 0.5 }), W, H);
  // 거리가 절반이면 화면상 이동도 절반 → 무차원 특징은 같아야 한다
  assert.ok(Math.abs(near.eyeH - far.eyeH) < 1e-6, `${near.eyeH} vs ${far.eyeH}`);
  assert.ok(far.faceScale < near.faceScale);
});

test('얼굴이 화면 안에서 움직여도 시선 특징은 변하지 않는다', () => {
  const a = extractGazeFeatures(makeFace({ gazeH: -0.01, cx: 0.5, cy: 0.5 }), W, H);
  const b = extractGazeFeatures(makeFace({ gazeH: -0.01, cx: 0.3, cy: 0.62 }), W, H);
  assert.ok(Math.abs(a.eyeH - b.eyeH) < 1e-9);
  assert.ok(Math.abs(a.eyeV - b.eyeV) < 1e-9);
  assert.ok(b.faceCx > a.faceCx, '얼굴이 영상 왼쪽으로 가면 faceCx는 커진다(사용자 오른쪽)');
});

test('한쪽 눈만 보이면 외눈으로 계속 간다', () => {
  const pts = makeFace({ gazeH: -0.01 });
  pts[LM.left.iris] = null;
  const f = extractGazeFeatures(pts, W, H);
  assert.ok(f, '외눈에서 null이 나왔다');
  assert.equal(f.eyesUsed, 1);
  assert.equal(f.monocular, true);
  assert.ok(f.eyeH > 0);
});

test('쓸 수 없는 입력은 null', () => {
  assert.equal(extractGazeFeatures(null, W, H), null);
  assert.equal(extractGazeFeatures(makeFace(), 0, H), null);
  assert.equal(extractGazeFeatures(makeFace({ scale: 0.02 }), W, H), null, '얼굴이 너무 작으면 거절');
  const noCorners = makeFace();
  noCorners[33] = null;
  assert.equal(extractGazeFeatures(noCorners, W, H), null);
});

test('눈 뜸 정도는 눈 높이에 따라 커진다', () => {
  const narrow = extractGazeFeatures(makeFace({ open: 0.004 }), W, H);
  const wide = extractGazeFeatures(makeFace({ open: 0.02 }), W, H);
  assert.ok(wide.openness > narrow.openness);
});

/* ── 머리 자세 ── */

// 열 우선 4x4: 세 번째 열이 얼굴 정면 방향
function poseMatrix(normal, up = { x: 0, y: 1, z: 0 }) {
  return [
    1, 0, 0, 0,
    up.x, up.y, up.z, 0,
    normal.x, normal.y, normal.z, 0,
    0, 0, 0, 1
  ];
}

test('정면을 보면 yaw·pitch가 0', () => {
  const h = decodeHeadPose(poseMatrix({ x: 0, y: 0, z: 1 }));
  assert.ok(h);
  assert.ok(Math.abs(h.yaw) < 1e-9, `yaw=${h.yaw}`);
  assert.ok(Math.abs(h.pitch) < 1e-9, `pitch=${h.pitch}`);
});

test('고개를 사용자 오른쪽으로 돌리면 yaw가 +', () => {
  // 사용자 오른쪽으로 돌면 코는 카메라 공간 -X를 향한다
  const h = decodeHeadPose(poseMatrix({ x: -0.34, y: 0, z: 0.94 }));
  assert.ok(h.yaw > 0, `yaw=${h.yaw}`);
  const l = decodeHeadPose(poseMatrix({ x: 0.34, y: 0, z: 0.94 }));
  assert.ok(l.yaw < 0, `yaw=${l.yaw}`);
});

test('고개를 숙이면 pitch가 +', () => {
  const h = decodeHeadPose(poseMatrix({ x: 0, y: -0.34, z: 0.94 }));
  assert.ok(h.pitch > 0, `pitch=${h.pitch}`);
});

test('망가진 자세 행렬은 null', () => {
  assert.equal(decodeHeadPose(null), null);
  assert.equal(decodeHeadPose([1, 2, 3]), null);
  assert.equal(decodeHeadPose(new Array(16).fill(NaN)), null);
  assert.equal(decodeHeadPose(poseMatrix({ x: 0, y: 0, z: 0 })), null, '길이 0 법선은 거절');
});

test('자세 행렬이 없어도 머리 자세가 나온다(landmark 대용값)', () => {
  const f = extractGazeFeatures(makeFace({ gazeH: -0.01 }), W, H, null);
  assert.equal(f.hasHeadProxy, true);
  assert.equal(f.matrix, null, '행렬이 없으면 진단 칸은 null');
  assert.ok(Number.isFinite(f.headYaw) && Number.isFinite(f.headPitch));
  assert.ok(Math.abs(f.headYaw) < 1e-9, `정면인데 yaw=${f.headYaw}`);
});

test('고개를 사용자 오른쪽으로 돌리면 headYaw 대용값이 +', () => {
  // 사용자 오른쪽으로 돌면 코는 영상 왼쪽(x 작은 쪽, 오른눈 33 쪽)으로 간다
  const right = extractGazeFeatures(makeFace({ noseDx: -0.02 }), W, H);
  assert.ok(right.headYaw > 0, `headYaw=${right.headYaw}`);
  const left = extractGazeFeatures(makeFace({ noseDx: +0.02 }), W, H);
  assert.ok(left.headYaw < 0, `headYaw=${left.headYaw}`);
});

test('고개를 숙이면 headPitch 대용값이 커진다', () => {
  // 숙이면 눈–코 세로 거리가 눌린다
  const level = extractGazeFeatures(makeFace({ noseDy: 0.05 }), W, H);
  const down = extractGazeFeatures(makeFace({ noseDy: 0.035 }), W, H);
  assert.ok(down.headPitch > level.headPitch, `${down.headPitch} vs ${level.headPitch}`);
});

test('행렬 머리 자세는 진단용으로만 들어간다', () => {
  const f = extractGazeFeatures(makeFace(), W, H, poseMatrix({ x: -0.34, y: 0, z: 0.94 }));
  assert.ok(f.matrix, '행렬 진단이 비었다');
  assert.equal(f.matrix.diagnosticOnly, true);
  // 행렬이 yaw를 크게 보고해도 시선 특징의 headYaw는 landmark만 따른다
  assert.ok(Math.abs(f.matrix.yaw) > 0.3);
  assert.ok(Math.abs(f.headYaw) < 1e-9, `행렬이 특징에 샜다: ${f.headYaw}`);
});

/* ── 좌우 반전된 카메라 (1차 구현이 틀렸던 부분) ── */

test('영상이 좌우 반전되어도 eyeH·eyeV·headYaw가 그대로다', () => {
  for (const opts of [{ gazeH: -0.012 }, { gazeV: 0.008 }, { gazeH: 0.01, gazeV: -0.006 }, { noseDx: -0.02 }]) {
    const plain = extractGazeFeatures(makeFace(opts), W, H);
    const flipped = extractGazeFeatures(mirror(makeFace(opts)), W, H);
    for (const k of ['eyeH', 'eyeV', 'headYaw', 'headPitch']) {
      assert.ok(Math.abs(plain[k] - flipped[k]) < 1e-9,
        `${JSON.stringify(opts)} ${k}: ${plain[k]} vs ${flipped[k]}`);
    }
  }
});

test('반전 + 머리 기울기를 같이 줘도 그대로다', () => {
  const opts = { gazeH: -0.012, gazeV: 0.006, roll: 12 };
  const plain = extractGazeFeatures(makeFace(opts), W, H);
  const flipped = extractGazeFeatures(mirror(makeFace(opts)), W, H);
  assert.ok(Math.abs(plain.eyeH - flipped.eyeH) < 1e-9, `eyeH ${plain.eyeH} vs ${flipped.eyeH}`);
  assert.ok(Math.abs(plain.eyeV - flipped.eyeV) < 1e-9, `eyeV ${plain.eyeV} vs ${flipped.eyeV}`);
});

test('수직축은 언제나 영상 아래쪽을 향한다', () => {
  // 반전되면 예전 구현은 v̂가 위를 향해 상하가 뒤집혔다
  const down = extractGazeFeatures(mirror(makeFace({ gazeV: 0.008 })), W, H);
  assert.ok(down.eyeV > 0, `반전 영상에서 아래를 봤는데 eyeV=${down.eyeV}`);
});

test('좌우 눈 값이 따로 나온다', () => {
  const f = extractGazeFeatures(makeFace({ gazeH: -0.012 }), W, H);
  for (const k of ['eyeHL', 'eyeHR', 'eyeVL', 'eyeVR']) assert.ok(Number.isFinite(f[k]), k);
  assert.ok(f.eyeHL > 0 && f.eyeHR > 0);
});

/* ── 선형대수·회귀 ── */

test('연립방정식을 푼다', () => {
  const x = solveLinearSystem([[2, 1], [1, 3]], [5, 10]);
  assert.ok(Math.abs(x[0] - 1) < 1e-9 && Math.abs(x[1] - 3) < 1e-9, JSON.stringify(x));
  assert.equal(solveLinearSystem([[1, 2], [2, 4]], [1, 2]), null, '특이행렬은 null');
});

test('능형회귀가 선형 관계를 되찾는다', () => {
  const rows = [], y = [];
  for (let i = 0; i < 60; i++) {
    const a = (i % 10) / 10, b = Math.floor(i / 10) / 6;
    rows.push([1, a, b]);
    y.push(0.3 + 2 * a - 1.5 * b);
  }
  const fit = fitRidge(rows, y, 1e-9);
  assert.ok(fit);
  for (let i = 0; i < rows.length; i++) {
    assert.ok(Math.abs(applyRidge(fit, rows[i]) - y[i]) < 1e-6);
  }
});

test('상수 열이 있어도 터지지 않는다', () => {
  const rows = Array.from({ length: 20 }, (_, i) => [1, i / 20, 7]);
  const fit = fitRidge(rows, rows.map((r) => r[1] * 2), 1e-6);
  assert.ok(fit, '표준편차 0인 열에서 null');
  assert.ok(fit.weights.every(Number.isFinite));
});

/* ── 모형 ── */

/**
 * 화면 좌표와 선형으로 이어진 가짜 특징 (보정이 되찾아야 하는 관계).
 * @param sign -1이면 좌우가 뒤집힌 장비를 흉내 낸다
 */
const featuresFor = (nx, ny, sign = 1) => {
  const eyeH = sign * (nx - 0.5) * 0.11;
  const eyeV = (ny - 0.5) * 0.055;
  return {
    eyeH, eyeV,
    eyeHL: eyeH, eyeHR: eyeH, eyeVL: eyeV, eyeVR: eyeV,
    headYaw: sign * (nx - 0.5) * 0.06,
    headPitch: (ny - 0.5) * 0.04,
    faceCx: 0, faceCy: 0, faceScale: 0.1
  };
};

test('보정 전에도 중립 기준 대비로 화면 전체를 움직인다', () => {
  const m = createGazeModel();
  m.setNeutral({ eyeH: 0, eyeV: 0, headYaw: 0, headPitch: 0 });
  const center = m.predictNorm(featuresFor(0.5, 0.5));
  assert.ok(Math.abs(center.x - 0.5) < 1e-9 && Math.abs(center.y - 0.5) < 1e-9);
  assert.equal(center.calibrated, false);
  const right = m.predictNorm(featuresFor(1, 0.5));
  assert.ok(right.x > center.x, '오른쪽을 보면 x가 커져야 한다');
  const down = m.predictNorm(featuresFor(0.5, 1));
  assert.ok(down.y > center.y, '아래를 보면 y가 커져야 한다');
  // 기본 이득으로 화면 폭의 상당 부분을 덮는지 — 포인터가 한 구석에 갇히지 않아야 한다
  assert.ok(right.x - m.predictNorm(featuresFor(0, 0.5)).x > 0.6,
    '좌우 전체 이동폭이 화면의 60%도 안 된다');
});

test('중립 기준을 옮기면 중심이 따라 옮겨진다', () => {
  const m = createGazeModel();
  const off = featuresFor(0.75, 0.25);
  m.setNeutral({ eyeH: off.eyeH, eyeV: off.eyeV, headYaw: off.headYaw, headPitch: off.headPitch });
  const p = m.predictNorm(off);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9);
});

function calSamples(points, noise = 0) {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const out = [];
  points.forEach((p, i) => {
    for (let k = 0; k < 30; k++) {
      const f = featuresFor(p.nx, p.ny);
      out.push({
        features: {
          ...f,
          eyeH: f.eyeH + rnd() * noise,
          eyeV: f.eyeV + rnd() * noise
        },
        nx: p.nx, ny: p.ny, point: i
      });
    }
  });
  return out;
}

const grid9 = [0.1, 0.5, 0.9].flatMap((ny) => [0.1, 0.5, 0.9].map((nx) => ({ nx, ny })));

test('보정은 깨끗한 자료에서 관계를 거의 정확히 되찾는다', () => {
  const m = createGazeModel();
  const r = m.fit(calSamples(grid9), { width: 1600, height: 1000 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(m.calibrated);
  assert.ok(r.looRmsPx < 5, `교차검증 오차가 크다: ${r.looRmsPx}px`);
  for (const p of grid9) {
    const q = m.predictNorm(featuresFor(p.nx, p.ny));
    assert.ok(Math.hypot(q.x - p.nx, q.y - p.ny) < 0.01,
      `(${p.nx},${p.ny}) → (${q.x.toFixed(3)},${q.y.toFixed(3)})`);
    assert.equal(q.calibrated, true);
  }
});

test('잡음이 있어도 교차검증 오차가 화면 대각의 몇 % 안에 든다', () => {
  const m = createGazeModel();
  const W2 = 1600, H2 = 1000;
  const r = m.fit(calSamples(grid9, 0.012), { width: W2, height: H2 });
  assert.ok(r.ok, JSON.stringify(r));
  const diag = Math.hypot(W2, H2);
  assert.ok(r.looRmsPx / diag < 0.12, `${r.looRmsPx.toFixed(0)}px / ${diag.toFixed(0)}px`);
  assert.ok(Array.isArray(r.perPoint) && r.perPoint.length === 9);
});

test('보정은 점이 4곳보다 적으면 거절한다', () => {
  const m = createGazeModel();
  const r = m.fit(calSamples(grid9.slice(0, 3)), { width: 1600, height: 1000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'need_at_least_4_points');
  assert.equal(m.calibrated, false);
});

test('표본이 모수보다 적으면 거절한다', () => {
  const m = createGazeModel();
  const thin = grid9.map((p, i) => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i }));
  const r = m.fit(thin, { width: 1600, height: 1000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_enough_samples');
});

test('보정을 지우면 초기 이득으로 돌아간다', () => {
  const m = createGazeModel();
  m.fit(calSamples(grid9), { width: 1600, height: 1000 });
  assert.equal(m.calibrated, true);
  m.clearFit();
  assert.equal(m.calibrated, false);
  assert.equal(m.predictNorm(featuresFor(0.5, 0.5)).calibrated, false);
});

test('교차검증으로 차수를 고르고 후보를 함께 보고한다', () => {
  const m = createGazeModel();
  const r = m.fit(calSamples(grid9, 0.004), { width: 1600, height: 1000 });
  assert.ok(BASIS_ORDERS.includes(r.order), `모르는 차수: ${r.order}`);
  assert.ok(r.considered.length >= 1);
  assert.ok(r.considered.every((c) => Number.isFinite(c.looRmsPx)));
  // 고른 차수는 후보 가운데 교차검증 오차가 가장 작은 것이어야 한다
  const best = Math.min(...r.considered.map((c) => c.looRmsPx));
  assert.ok(Math.abs(r.looRmsPx - best) < 1e-9, `${r.order}를 골랐는데 최소는 ${best}`);
  assert.ok(r.considered.find((c) => c.order === r.order));
  assert.ok(Number.isFinite(r.trainRmsPx) && r.trainRmsPx >= 0);
});

test('기저 차수는 고정되어 있다', () => {
  const f = featuresFor(0.5, 0.5);
  assert.equal(BASIS.linear(f).length, 5);
  assert.equal(BASIS.binocular(f).length, 10);
  assert.equal(BASIS.quadratic(f).length, 13);
  assert.equal(BASIS.linear(f)[0], 1, '첫 항은 절편');
  for (const o of BASIS_ORDERS) assert.equal(basisLength(o), BASIS[o](f).length, o);
});

/* ── 좌우가 뒤집힌 장비에서도 스스로 바로잡는가 (이번 수정의 핵심) ── */

test('빠른 보정은 좌우 기울기의 부호와 크기를 재서 정한다', () => {
  const m = createGazeModel();
  const pairs = [
    { features: featuresFor(0.08, 0.5), nx: 0.08, ny: 0.5 },
    { features: featuresFor(0.92, 0.5), nx: 0.92, ny: 0.5 },
    { features: featuresFor(0.5, 0.07), nx: 0.5, ny: 0.07 },
    { features: featuresFor(0.5, 0.93), nx: 0.5, ny: 0.93 }
  ];
  const r = m.fitGainsFromSpan(pairs);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.gains.eyeH > 0, `eyeH 이득이 음수다: ${r.gains.eyeH}`);
  assert.ok(r.gains.eyeV > 0, `eyeV 이득이 음수다: ${r.gains.eyeV}`);
  // 머리 항은 눈과 같은 방향이어야 서로 싸우지 않는다
  assert.equal(Math.sign(r.gains.headYaw), Math.sign(r.gains.eyeH));
  assert.equal(Math.sign(r.gains.headPitch), Math.sign(r.gains.eyeV));
});

test('좌우가 반대인 장비도 빠른 보정이 바로잡는다', () => {
  const m = createGazeModel();
  const pairs = [0.08, 0.92].map((nx) => ({ features: featuresFor(nx, 0.5, -1), nx, ny: 0.5 }))
    .concat([0.07, 0.93].map((ny) => ({ features: featuresFor(0.5, ny, -1), nx: 0.5, ny })));
  const r = m.fitGainsFromSpan(pairs);
  assert.ok(r.ok);
  assert.ok(r.gains.eyeH < 0, '뒤집힌 장비인데 이득 부호가 안 바뀌었다');
  // 바로잡은 뒤에는 오른쪽을 보면 오른쪽으로 가야 한다
  const right = m.predictNorm(featuresFor(0.92, 0.5, -1));
  const left = m.predictNorm(featuresFor(0.08, 0.5, -1));
  assert.ok(right.x > left.x, `오른쪽 ${right.x} vs 왼쪽 ${left.x}`);
});

test('빠른 보정은 움직임이 너무 작으면 거절한다', () => {
  const m = createGazeModel();
  const flat = [0.08, 0.92].map((nx) => ({ features: featuresFor(0.5, 0.5), nx, ny: 0.5 }));
  const r = m.fitGainsFromSpan(flat);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_usable_span');
});

test('뒤집기는 눈과 머리 항을 함께 뒤집는다', () => {
  const m = createGazeModel();
  const before = m.getGains();
  const after = m.flip('x');
  assert.equal(after.eyeH, -before.eyeH);
  assert.equal(after.headYaw, -before.headYaw);
  assert.equal(after.eyeV, before.eyeV, '세로는 건드리지 않아야 한다');
  const y = m.flip('y');
  assert.equal(y.eyeV, -before.eyeV);
  assert.equal(y.headPitch, -before.headPitch);
});

test('전체 보정을 하면 그 뒤 보정 전 모드도 측정된 부호를 쓴다', () => {
  const m = createGazeModel();
  const reversed = grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny, -1), nx: p.nx, ny: p.ny, point: i })));
  const r = m.fit(reversed, { width: 1600, height: 1000 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.learnedGains.eyeH < 0, `측정된 이득이 안 뒤집혔다: ${r.learnedGains.eyeH}`);
  m.clearFit();
  // 회귀를 지워도 방향은 유지된다 — 짐작값으로 되돌아가지 않는다
  const right = m.predictNorm(featuresFor(0.9, 0.5, -1));
  const left = m.predictNorm(featuresFor(0.1, 0.5, -1));
  assert.ok(right.x > left.x, `보정 뒤에도 뒤집힘: ${right.x} vs ${left.x}`);
});

/* ── 보정점을 늘렸을 때 오히려 나빠지지 않게 ── */

test('교차검증이 비슷하면 더 단순한 기저를 고른다', () => {
  // 복잡한 기저가 아주 조금 이겨도 뽑히면, 점을 늘릴수록 '운으로' 이겨 실제로는 나빠진다
  const m = createGazeModel();
  const samples = grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i })));
  const r = m.fit(samples, { width: 1600, height: 1000, selectionMargin: 10 });
  assert.ok(r.ok);
  assert.equal(r.order, 'linear', `여유를 크게 줬는데 ${r.order}를 골랐다`);
  assert.ok(r.looRmsPx >= r.bestLooRmsPx - 1e-9);
  assert.equal(r.selectionMargin, 10);
});

test('절대 여유(px)도 함께 적용된다', () => {
  // 비율 여유만 쓰면 최저 오차가 0에 가까울 때 여유가 사라진다(0 × 1.15 = 0).
  const clean = grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i })));
  const tight = createGazeModel().fit(clean, { width: 1600, height: 1000, selectionMargin: 0, selectionMarginPx: 0 });
  const loose = createGazeModel().fit(clean, { width: 1600, height: 1000, selectionMargin: 0, selectionMarginPx: 50 });
  assert.ok(tight.ok && loose.ok);
  assert.equal(loose.selectionMarginPx, 50);
  // px 여유를 주면 더 단순한(또는 같은) 기저가 뽑혀야 한다
  assert.ok(BASIS_ORDERS.indexOf(loose.order) <= BASIS_ORDERS.indexOf(tight.order),
    `px 여유를 줬는데 더 복잡해졌다: ${tight.order} → ${loose.order}`);
  assert.equal(loose.order, 'linear', `px 여유 아래에서 ${loose.order}를 골랐다`);
});

test('여유를 0으로 두면 최저 오차를 그대로 고른다', () => {
  const m = createGazeModel();
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const samples = grid9.flatMap((p, i) => Array.from({ length: 30 }, () => {
    const f = featuresFor(p.nx, p.ny);
    return { features: { ...f, eyeH: f.eyeH + rnd() * 0.004 }, nx: p.nx, ny: p.ny, point: i };
  }));
  const r = m.fit(samples, { width: 1600, height: 1000, selectionMargin: 0 });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.looRmsPx - r.bestLooRmsPx) < 1e-9);
});

test('12점에서도 보정이 되고 단순한 기저를 선호한다', () => {
  const m = createGazeModel();
  const grid12 = [0.1, 0.5, 0.9].flatMap((ny) => [0.1, 0.37, 0.63, 0.9].map((nx) => ({ nx, ny })));
  let seed = 5;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const samples = grid12.flatMap((p, i) => Array.from({ length: 28 }, () => {
    const f = featuresFor(p.nx, p.ny);
    return { features: { ...f, eyeH: f.eyeH + rnd() * 0.006, eyeV: f.eyeV + rnd() * 0.006 },
      nx: p.nx, ny: p.ny, point: i };
  }));
  const r = m.fit(samples, { width: 1600, height: 1000 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.points, 12);
  assert.ok(r.looRmsPx <= r.bestLooRmsPx * 1.15 + 1e-9, '고른 기저가 여유 밖이다');
});

test('더 나쁜 보정은 직전 것으로 되돌릴 수 있다', () => {
  const m = createGazeModel();
  const mk = (sign) => grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny, sign), nx: p.nx, ny: p.ny, point: i })));
  m.fit(mk(1), { width: 1600, height: 1000 });
  const first = m.getFit().stats.looRmsPx;
  m.fit(mk(-1), { width: 1600, height: 1000 });
  assert.ok(m.hasPrevious);
  const back = m.restorePrevious();
  assert.ok(back.ok);
  assert.ok(Math.abs(m.getFit().stats.looRmsPx - first) < 1e-9, '되돌린 보정이 처음 것과 다르다');
  // 한 번 더 부르면 다시 앞으로 간다 (맞바꾸기)
  assert.equal(m.restorePrevious().ok, true);
});

test('튀는 표본을 버린다', () => {
  const good = Array.from({ length: 20 }, () => ({ features: featuresFor(0.5, 0.5) }));
  const bad = Array.from({ length: 6 }, () => ({ features: featuresFor(0.95, 0.05) }));
  const kept = trimOutliers([...good, ...bad], 0.75);
  assert.ok(kept.length < good.length + bad.length, '아무것도 안 버렸다');
  assert.ok(kept.every((s) => Math.abs(s.features.eyeH) < 0.01), '튀는 표본이 남았다');
  // 표본이 적으면 손대지 않는다
  const few = good.slice(0, 5);
  assert.equal(trimOutliers(few, 0.75).length, 5);
});

test('보정은 섞여 들어온 나쁜 프레임을 견딘다', () => {
  const m = createGazeModel();
  const samples = grid9.flatMap((p, i) => [
    ...Array.from({ length: 26 }, () => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i })),
    // 눈이 아직 옮겨 가는 중이라 딴 곳을 본 프레임 6개
    ...Array.from({ length: 6 }, () => ({ features: featuresFor(0.5, 0.5), nx: p.nx, ny: p.ny, point: i }))
  ]);
  const r = m.fit(samples, { width: 1600, height: 1000 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.dropped > 0, '버린 표본이 없다');
  assert.ok(r.looRmsPx < 60, `나쁜 프레임에 끌려갔다: ${r.looRmsPx}px`);
});

/* ── 필터·고정 ── */

test('One Euro 필터는 가만히 있으면 잡음을 줄인다', () => {
  const f = createOneEuroFilter({ minCutoff: 1, beta: 0.5 });
  let t = 0, last = 0;
  const noisy = [];
  for (let i = 0; i < 90; i++) {
    t += 33;
    const n = 0.5 + (i % 2 ? 0.05 : -0.05);
    noisy.push(n);
    last = f.filter(n, t);
  }
  assert.ok(Math.abs(last - 0.5) < 0.02, `떨림이 남았다: ${last}`);
  const rawSpread = Math.max(...noisy) - Math.min(...noisy);
  assert.ok(rawSpread > 0.09, '시험 입력이 떨리지 않는다');
});

test('One Euro 필터는 큰 이동을 빠르게 따라간다', () => {
  const f = createOneEuroFilter({ minCutoff: 1, beta: 0.5 });
  let t = 0;
  for (let i = 0; i < 30; i++) { t += 33; f.filter(0.2, t); }
  let v = 0;
  for (let i = 0; i < 9; i++) { t += 33; v = f.filter(0.8, t); }
  assert.ok(v > 0.68, `0.3초 안에 못 따라갔다: ${v}`);
});

test('필터는 망가진 입력·거꾸로 가는 시각을 버틴다', () => {
  const f = createOneEuroFilter();
  assert.equal(f.filter(NaN, 10), null);
  assert.equal(f.filter(0.4, 100), 0.4);
  assert.equal(f.filter(0.9, 50), 0.9, '시각이 되돌아가면 다시 시작');
  f.reset();
  assert.equal(f.value, null);
});

test('고정 판정: 한 점을 보면 무게중심으로 모은다', () => {
  const s = createFixationSnap({ windowMs: 200, dispersion: 0.02 });
  let t = 0, out;
  for (let i = 0; i < 10; i++) {
    t += 20;
    out = s.push(0.4 + (i % 2 ? 0.002 : -0.002), 0.6, t);
  }
  assert.equal(out.fixating, true);
  assert.ok(Math.abs(out.x - 0.4) < 0.002, `${out.x}`);
});

test('고정 판정: 크게 움직이면 그대로 통과시킨다', () => {
  const s = createFixationSnap({ windowMs: 200, dispersion: 0.02 });
  let t = 0, out;
  for (let i = 0; i < 10; i++) { t += 20; out = s.push(0.1 + i * 0.07, 0.5, t); }
  assert.equal(out.fixating, false);
  assert.ok(Math.abs(out.x - (0.1 + 9 * 0.07)) < 1e-9, '이동 중에는 원래 값을 내야 한다');
});

/* ── 치우침 보정 (세로로 흘러내리는 문제) ── */

test('보정한 뒤에도 치우침을 바로잡을 수 있다', () => {
  // 1차 구현의 구멍: 보정하고 나면 recenter가 아무 일도 하지 않았다
  const m = createGazeModel();
  const samples = grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i })));
  assert.ok(m.fit(samples, { width: 1600, height: 1000 }).ok);

  // 눈꺼풀이 처져 세로가 흘러내린 상황 (어느 기저가 뽑히든 통하도록 세로 값을 다 민다)
  const base = featuresFor(0.5, 0.5);
  const drifted = {
    ...base,
    eyeV: base.eyeV + 0.011, eyeVL: base.eyeVL + 0.011, eyeVR: base.eyeVR + 0.011
  };
  const before = m.predictNorm(drifted);
  assert.ok(before.y > 0.55, `흘러내림이 재현되지 않았다: ${before.y}`);

  const r = m.anchorTo({ predictedX: before.x, predictedY: before.y, nx: 0.5, ny: 0.5 });
  assert.ok(r.ok);
  const after = m.predictNorm(drifted);
  assert.ok(Math.abs(after.y - 0.5) < 1e-9, `되밀기 실패: ${after.y}`);
  assert.equal(after.calibrated, true, '보정은 그대로여야 한다');
});

test('치우침은 기울기를 건드리지 않는다', () => {
  const m = createGazeModel();
  const samples = grid9.flatMap((p, i) =>
    Array.from({ length: 30 }, () => ({ features: featuresFor(p.nx, p.ny), nx: p.nx, ny: p.ny, point: i })));
  m.fit(samples, { width: 1600, height: 1000 });
  const spanBefore = m.predictNorm(featuresFor(0.9, 0.5)).x - m.predictNorm(featuresFor(0.1, 0.5)).x;
  m.anchorTo({ predictedX: 0.3, predictedY: 0.3, nx: 0.5, ny: 0.5 });
  const spanAfter = m.predictNorm(featuresFor(0.9, 0.5)).x - m.predictNorm(featuresFor(0.1, 0.5)).x;
  assert.ok(Math.abs(spanBefore - spanAfter) < 1e-9, '되밀면서 기울기가 바뀌었다');
});

test('치우침은 묶여 있고 지울 수 있다', () => {
  const m = createGazeModel();
  m.anchorTo({ predictedX: 0, predictedY: 0, nx: 5, ny: 5, maxOffset: 0.35 });
  const o = m.getOffset();
  assert.ok(Math.abs(o.x) <= 0.35 + 1e-9 && Math.abs(o.y) <= 0.35 + 1e-9, JSON.stringify(o));
  m.clearOffset();
  assert.deepEqual(m.getOffset(), { x: 0, y: 0 });
});

test('조금씩 미는 보정은 한 번에 step 이상 못 간다', () => {
  const m = createGazeModel();
  m.nudgeOffset(0.9, -0.9, { step: 0.01 });
  const o = m.getOffset();
  assert.ok(Math.abs(o.x - 0.01) < 1e-9 && Math.abs(o.y + 0.01) < 1e-9, JSON.stringify(o));
});

test('새 보정은 치우침 없이 시작한다', () => {
  const m = createGazeModel();
  m.anchorTo({ predictedX: 0.3, predictedY: 0.3, nx: 0.5, ny: 0.5 });
  assert.ok(m.getOffset().y !== 0);
  // tracker가 fit 성공 시 clearOffset을 부른다. 모형 쪽에서도 지울 수 있어야 한다.
  m.clearOffset();
  assert.deepEqual(m.getOffset(), { x: 0, y: 0 });
});

test('드리프트 감시기는 기준점 대비 밀린 양을 낸다', () => {
  const mon = createDriftMonitor({ keys: ['eyeV', 'openness'], windowMs: 1000 });
  let t = 0;
  for (let i = 0; i < 10; i++) { t += 50; mon.push({ eyeV: 0.01, openness: 0.1 }, t); }
  assert.equal(mon.delta(), null, '기준점 없이 델타가 나왔다');
  mon.anchorNow();
  assert.equal(mon.anchored, true);
  // 눈꺼풀이 처지며 세로가 밀린다
  for (let i = 0; i < 20; i++) { t += 50; mon.push({ eyeV: 0.02, openness: 0.07 }, t); }
  const d = mon.delta();
  assert.ok(Math.abs(d.eyeV - 0.01) < 1e-9, `ΔeyeV=${d.eyeV}`);
  assert.ok(Math.abs(d.openness + 0.03) < 1e-9, `Δopenness=${d.openness}`);
  mon.reset();
  assert.equal(mon.anchored, false);
});

test('눈꺼풀 기저가 후보에 들어 있고 단순한 것부터 정렬돼 있다', () => {
  const f = { ...featuresFor(0.5, 0.5), openness: 0.1 };
  assert.ok(BASIS_ORDERS.includes('linearLid'));
  assert.equal(BASIS.linearLid(f).length, 6);
  const lens = BASIS_ORDERS.map((o) => basisLength(o));
  for (let i = 1; i < lens.length; i++) {
    assert.ok(lens[i] >= lens[i - 1], `후보 정렬이 단순→복잡이 아니다: ${lens}`);
  }
});

/* ── 깜빡임 가드 (물방울이 튀는 문제) ── */

/** 눈을 뜬 채 한곳을 보다가, 눈꺼풀이 홍채를 끌고 내려가며 감겼다 떠지는 과정 */
function blinkRun(guard, { frameMs = 33, holdMs = 300 } = {}) {
  let t = 0;
  const out = [];
  const step = (closure, pos) => {
    t += frameMs;
    const r = guard.update(closure, t);
    if (!r.blinking) guard.push({ ...pos, tMs: t });
    out.push({ t, closure, ...r, pos });
    return r;
  };
  for (let i = 0; i < Math.round(holdMs / frameMs); i++) step(0, { xNorm: 0.4, yNorm: 0.4 });
  // 눈꺼풀이 내려오며 홍채를 아래로 끌고 간다 → 좌표가 아래로 끌린다
  for (const [c, y] of [[0.12, 0.46], [0.28, 0.58], [0.55, 0.78], [0.9, 0.95], [1, 0.99]]) {
    step(c, { xNorm: 0.4, yNorm: y });
  }
  for (const [c, y] of [[0.9, 0.95], [0.5, 0.75], [0.25, 0.55], [0.1, 0.44], [0, 0.4]]) {
    step(c, { xNorm: 0.4, yNorm: y });
  }
  return out;
}

test('깜빡임 가드는 감기 직전의 좌표를 붙든다', () => {
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18, preBlinkMs: 140 });
  const run = blinkRun(guard);
  const held = run.filter((r) => r.blinking);
  assert.ok(held.length >= 3, `깜빡임을 못 잡았다: ${held.length}프레임`);
  // 붙든 좌표는 눈꺼풀에 끌려 내려가기 전 값이어야 한다
  for (const r of held) {
    assert.ok(r.hold, '붙들 좌표가 없다');
    assert.ok(r.hold.yNorm <= 0.46,
      `끌려간 좌표를 붙들었다: y=${r.hold.yNorm} (closure=${r.closure})`);
  }
});

test('깜빡임 가드는 두 기준값으로 경계에서 떨지 않는다', () => {
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18 });
  let t = 0;
  const flips = [];
  let was = false;
  // enter와 exit 사이를 오가는 값 — 한 기준값만 쓰면 여기서 깜빡거린다
  for (const c of [0.2, 0.3, 0.25, 0.32, 0.22, 0.3, 0.26]) {
    t += 33;
    const r = guard.update(c, t);
    if (r.blinking !== was) flips.push(c);
    was = r.blinking;
  }
  assert.equal(flips.length, 0, `경계에서 ${flips.length}번 뒤집혔다`);
});

test('오래 가늘게 뜨고 있으면 깜빡임으로 붙들지 않는다', () => {
  // 눈을 가늘게 뜬 채 머무는 걸 깜빡임으로 보면 포인터가 몇 초씩 얼어붙는다
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18, maxBlinkMs: 600 });
  let t = 0, last = null;
  for (let i = 0; i < 40; i++) {       // 40프레임 × 33ms ≈ 1.3초 동안 0.5로 감긴 상태 유지
    t += 33;
    last = guard.update(0.5, t);
    if (!last.blinking) guard.push({ xNorm: 0.5, yNorm: 0.5, tMs: t });
  }
  assert.equal(last.blinking, false, '가늘게 뜬 상태에서 계속 붙들고 있다');
  assert.equal(guard.blinking, false);
});

test('maxBlinkMs 안에 끝나는 보통 깜빡임은 그대로 붙든다', () => {
  const guard = createBlinkGuard({ maxBlinkMs: 600 });
  const run = blinkRun(guard);          // 약 330ms 짜리 깜빡임
  assert.ok(run.some((r) => r.blinking), '깜빡임을 놓쳤다');
  assert.ok(!run.some((r) => r.timedOut), '보통 깜빡임인데 시간 초과로 끊겼다');
});

test('깜빡임이 끝나면 ended가 한 번만 뜬다', () => {
  const guard = createBlinkGuard();
  const run = blinkRun(guard);
  assert.equal(run.filter((r) => r.ended).length, 1);
  assert.equal(run.at(-1).blinking, false);
});

test('두 번째 깜빡임이 첫 깜빡임을 가로질러 되감지 않는다', () => {
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18, preBlinkMs: 140 });
  blinkRun(guard);                       // 첫 깜빡임 — 이때 좌표는 0.4 근처였다
  // 눈을 뜨고 다른 곳(0.8)을 본 뒤 곧바로 다시 감는다
  let t = 1000;
  for (let i = 0; i < 3; i++) { t += 33; guard.update(0, t); guard.push({ xNorm: 0.8, yNorm: 0.8, tMs: t }); }
  t += 33;
  const r = guard.update(0.9, t);
  assert.ok(r.blinking);
  assert.ok(r.hold, '붙들 좌표가 없다');
  assert.ok(Math.abs(r.hold.xNorm - 0.8) < 1e-9,
    `깜빡임을 건너뛰어 옛 좌표를 집었다: x=${r.hold.xNorm}`);
});

test('다시 뜬 뒤 settleMs 동안은 붙들고, 그 뒤에는 놓는다', () => {
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18, settleMs: 250 });
  const run = blinkRun(guard);
  const endAt = run.find((r) => r.ended).t;
  let t = run.at(-1).t;
  const after = [];
  for (let i = 0; i < 12; i++) { t += 33; after.push({ t, ...guard.update(0, t) }); }
  const all = [...run.filter((r) => r.t >= endAt), ...after];
  for (const r of all) {
    assert.equal(r.settling, r.t - endAt < 250, `뜬 뒤 ${r.t - endAt}ms: settling=${r.settling}`);
    if (r.settling) assert.ok(r.hold && r.hold.yNorm <= 0.46, '다시 뜬 직후에도 감기 전 좌표를 붙들어야 한다');
  }
});

test('settleMs를 주지 않으면 다시 뜬 즉시 놓는다', () => {
  const run = blinkRun(createBlinkGuard());
  assert.ok(!run.some((r) => r.settling));
});

test('가늘게 뜬 상태로 시간 초과되면 settling 없이 바로 따라간다', () => {
  const guard = createBlinkGuard({ maxBlinkMs: 600, settleMs: 250 });
  let t = 0, out = null;
  for (let i = 0; i < 25 && !out; i++) { t += 33; const r = guard.update(0.5, t); if (r.timedOut) out = r; }
  assert.ok(out, '시간 초과가 나지 않았다');
  assert.equal(out.blinking, false);
  assert.equal(out.settling, false);
});

test('settling 중에 다시 감으면 새 깜빡임으로 잡는다', () => {
  const guard = createBlinkGuard({ enter: 0.34, exit: 0.18, settleMs: 250 });
  const run = blinkRun(guard, { holdMs: 0 });
  const t = run.find((r) => r.ended).t + 33;
  const r = guard.update(0.9, t);
  assert.equal(r.blinking, true);
  assert.equal(r.settling, false);
});

test('reset하면 상태가 비워진다', () => {
  const guard = createBlinkGuard();
  blinkRun(guard);
  guard.reset();
  assert.equal(guard.blinking, false);
  assert.equal(guard.hold, null);
  assert.equal(guard.historyLength, 0);
});

test('이력이 없으면 붙들 좌표는 null이고 터지지 않는다', () => {
  const guard = createBlinkGuard();
  const r = guard.update(0.9, 100);
  assert.equal(r.blinking, true);
  assert.equal(r.hold, null);
});

test('중립 수집기는 중앙값을 쓴다', () => {
  const c = createNeutralCollector(5);
  const base = { eyeH: 0.01, eyeV: 0.02, headYaw: 0.03, headPitch: 0.04 };
  for (let i = 0; i < 4; i++) c.push(base);
  assert.equal(c.ready, false);
  c.push({ eyeH: 9, eyeV: 9, headYaw: 9, headPitch: 9 });     // 튀는 프레임 하나
  assert.equal(c.ready, true);
  const r = c.result();
  assert.ok(Math.abs(r.eyeH - 0.01) < 1e-9, `중앙값이 끌려갔다: ${r.eyeH}`);
  c.reset();
  assert.equal(c.count, 0);
  assert.equal(c.result(), null);
});

test('눈 뜸 기준은 짧은 깜빡임에 끌리지 않고 진짜 감김을 잡는다', () => {
  const b = createOpennessBaseline({ windowMs: 2000 });
  for (let t = 0; t < 1500; t += 33) b.closure(t, 0.08);
  assert.ok(b.closure(1533, 0.01) > 0.8);
  assert.ok(b.closure(1566, 0.08) < 0.01);
});

test('눈꺼풀이 내려온 상태가 이어지면 눈 뜸 기준이 따라가 감김으로 보지 않는다', () => {
  const b = createOpennessBaseline({ windowMs: 2000 });
  for (let t = 0; t < 3000; t += 33) b.closure(t, 0.09);
  assert.ok(b.closure(3000, 0.054) >= 0.34);          // 막 내려온 순간은 감김처럼 보인다
  let last = 1;
  for (let t = 3033; t < 5000; t += 33) last = b.closure(t, 0.054);
  assert.ok(last < 0.05, `closure=${last}`);
});

test('모형 후보를 제한하면 그 안에서만 고른다', () => {
  const samples = [];
  for (let point = 0; point < 9; point++) {
    const nx = 0.1 + (point % 3) * 0.4, ny = 0.1 + Math.floor(point / 3) * 0.4;
    for (let i = 0; i < 12; i++) {
      const j = i * 1e-4;
      samples.push({ point, nx, ny, features: { eyeH: nx * 0.1 + j, eyeV: ny * 0.05 - j, eyeHL: nx * 0.1, eyeHR: nx * 0.1 + j, eyeVL: ny * 0.05, eyeVR: ny * 0.05 + j, headYaw: j, headPitch: -j, faceCx: j, faceCy: j, faceScale: 0.2 + j, openness: 0.07 + j } });
    }
  }
  const r = createGazeModel().fit(samples, { width: 1000, height: 800, orders: ['linear'] });
  assert.equal(r.ok, true);
  assert.equal(r.order, 'linear');
  assert.deepEqual(r.considered.map((c) => c.order), ['linear']);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
