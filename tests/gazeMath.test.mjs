// gazeMath.js 시험 — 브라우저·카메라 없이 돈다.  실행:  node tests/gazeMath.test.mjs
// 합성 landmark로 기하·부호·필터·깜빡임을 확인한다. 실제 사람 눈으로 검증한 값이 아니라,
// "수식이 의도한 대로 동작하는가"만 본다.
// 화면 좌표를 만드는 쪽(모형·보정·치우침)의 시험은 gazeModel.test.mjs · webEyeTrackMath.test.mjs 로 옮겼다 (2026-11-21).

import assert from 'node:assert/strict';
import {
  LM, extractGazeFeatures, decodeHeadPose, createOneEuroFilter,
  createFixationSnap, solveLinearSystem, createBlinkGuard, createDriftMonitor, createOpennessBaseline
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

/* ── 선형대수 ── */

test('연립방정식을 푼다', () => {
  const x = solveLinearSystem([[2, 1], [1, 3]], [5, 10]);
  assert.ok(Math.abs(x[0] - 1) < 1e-9 && Math.abs(x[1] - 3) < 1e-9, JSON.stringify(x));
  assert.equal(solveLinearSystem([[1, 2], [2, 4]], [1, 2]), null, '특이행렬은 null');
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

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
