// webEyeTrackMath.js 시험 — 브라우저·카메라 없이 돈다.  실행:  node tests/webEyeTrackMath.test.mjs
//
// 이 모듈은 WebEyeTrack의 전처리를 옮겨 적은 것이라, 가장 중요한 시험은 "원본과 숫자가 같은가"다.
// 기준값(tests/fixtures/webEyeTrackReference.json)은 상류 mathUtils.ts(@75fbd2f)를 ml-matrix 6.12.1로
// 직접 돌려 뽑았다. landmark는 합성이며 실제 얼굴이 아니다 — 식이 같은지만 보고, 정확도는 말하지 않는다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  invertMatrix, solveAffine, applyAffine, computeHomography, applyHomography, toPixelLandmarks,
  planEyePatch, renderEyePatch, createPerspectiveMatrix, createIntrinsicsMatrix, estimateFaceWidthCm,
  matrixToEuler, eulerToMatrix, readFaceMatrix, getHeadVector, faceReconstruction, computeFaceOrigin3D,
  computeEAR, createFacePreprocessor, EYE_PATCH
} from '../web/modules/webEyeTrackMath.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≠ ${b} (허용 ${tol})`);

const reference = JSON.parse(readFileSync(new URL('./fixtures/webEyeTrackReference.json', import.meta.url), 'utf8'));
const asLandmarks = (c) => c.landmarks.map(([x, y]) => ({ x, y, z: 0 }));

/** 기준값을 만들 때 쓴 것과 같은 그라데이션 영상. */
function gradientFrame(W, H) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    data[i] = Math.round((255 * x) / (W - 1));
    data[i + 1] = Math.round((255 * y) / (H - 1));
    data[i + 2] = Math.round((255 * (x + y)) / (W + H - 2));
    data[i + 3] = 255;
  }
  return { data, width: W, height: H, x: 0, y: 0 };
}
/** 영상에서 region만 잘라 낸다 (앱이 캔버스에서 읽는 것과 같은 모양). */
function cut(frame, r) {
  const data = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * frame.width + r.x) * 4;
    data.set(frame.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return { data, width: r.width, height: r.height, x: r.x, y: r.y };
}

// ── 원본과 같은가 ───────────────────────────────────────────────────────────

for (const c of reference.cases) {
  const landmarks = asLandmarks(c);
  const lm2d = toPixelLandmarks(landmarks, c.W, c.H);
  const M = readFaceMatrix(c.matrixData);

  test(`[${c.name}] 얼굴 폭·EAR·머리 벡터가 원본과 같다`, () => {
    near(estimateFaceWidthCm(lm2d), c.expected.faceWidthCm, 1e-9, '얼굴 폭');
    near(computeEAR(landmarks, 'left'), c.expected.ear[0], 1e-12, '왼눈 EAR');
    near(computeEAR(landmarks, 'right'), c.expected.ear[1], 1e-12, '오른눈 EAR');
    getHeadVector(M).forEach((v, i) => near(v, c.expected.headVector[i], 1e-12, `머리 벡터[${i}]`));
  });

  test(`[${c.name}] 3D 원점이 원본과 같다 (cm)`, () => {
    const Pinv = invertMatrix(createPerspectiveMatrix(c.W / c.H));
    const { metricFace } = faceReconstruction(Pinv, c.landmarks, M, createIntrinsicsMatrix(c.W, c.H),
      c.expected.faceWidthCm, c.W, c.H, 60);
    computeFaceOrigin3D(metricFace).forEach((v, i) => near(v, c.expected.faceOrigin3D[i], 1e-9, `원점[${i}]`));
  });

  test(`[${c.name}] 눈 조각이 원본과 같다 (가장 가까운 화소 한 칸 이내)`, () => {
    const frame = gradientFrame(c.W, c.H);
    const plan = planEyePatch(lm2d, c.W, c.H);
    assert.ok(plan, '계획이 나와야 한다');
    const patch = renderEyePatch(plan, cut(frame, plan.region));
    assert.equal(patch.length, EYE_PATCH.width * EYE_PATCH.height * 3);
    // 원본은 줄이기 호모그래피의 부동소수 잡음 때문에 칸이 하나씩 밀리곤 한다. 그라데이션에서 한 칸은 1~2단계다.
    for (const [x, y, r, g, b] of c.expected.patchProbes) {
      const i = (y * EYE_PATCH.width + x) * 3;
      near(patch[i] * 255, r, 3, `(${x},${y}) R`); near(patch[i + 1] * 255, g, 3, `(${x},${y}) G`); near(patch[i + 2] * 255, b, 3, `(${x},${y}) B`);
    }
    // 원본은 같은 잡음으로 첫 줄(또는 첫 칸)이 통째로 검게 남곤 한다 (floor(−ε) = −1 → 영상 밖). 이식본은 그 자리를 채운다.
    // 그래서 합은 이식본이 한 줄(1/128 ≈ 0.8%)쯤 클 수 있고, 작을 수는 없다.
    let sum = 0; for (const v of patch) sum += v * 255;
    const ratio = sum / c.expected.patchSum;
    assert.ok(ratio > 0.997 && ratio < 1.012, `조각 전체 합의 비 ${ratio}`);
  });

  test(`[${c.name}] 영상에서 필요한 자리만 잘라 줘도 통째로 준 것과 같다`, () => {
    const frame = gradientFrame(c.W, c.H);
    const plan = planEyePatch(lm2d, c.W, c.H);
    const whole = renderEyePatch(plan, frame), part = renderEyePatch(plan, cut(frame, plan.region));
    assert.deepEqual(part, whole);
    assert.ok(plan.region.width * plan.region.height <= c.W * c.H, '자른 자리가 영상보다 크지 않다');
  });
}

test('어파인 맞춤이 원본(ml-matrix solve)과 같다', () => {
  const { src, dst, expected } = reference.affine;
  const A = solveAffine(src, dst);
  A.flat().forEach((v, i) => near(v, expected.flat()[i], 1e-10, `A[${i}]`));
});

// ── 식이 뜻한 대로 도는가 ───────────────────────────────────────────────────

test('어파인: 잡음 없는 대응은 정확히 되찾고, 한 줄에 놓인 점은 거절한다', () => {
  const T = [[1.4, -0.3, 0.07], [0.2, 0.9, -0.04]];
  const src = [[0, 0], [1, 0], [0, 1], [1, 1], [0.3, 0.7]];
  const A = solveAffine(src, src.map((p) => applyAffine(T, p)));
  A.flat().forEach((v, i) => near(v, T.flat()[i], 1e-12));
  assert.equal(solveAffine([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]), null);
  assert.equal(solveAffine([[0, 0], [1, 0]], [[0, 0], [1, 0]]), null);
});

test('호모그래피: 네 귀를 정확히 보내고, 역행렬로 되돌아온다', () => {
  const src = [[10, 20], [5, 300], [410, 280], [390, 30]], dst = [[0, 0], [0, 512], [512, 512], [512, 0]];
  const H = computeHomography(src, dst);
  src.forEach((p, i) => applyHomography(H, p).forEach((v, k) => near(v, dst[i][k], 1e-8)));
  const back = applyHomography(invertMatrix(H), [256, 256]);
  applyHomography(H, back).forEach((v) => near(v, 256, 1e-8));
  assert.equal(computeHomography([[0, 0], [1, 1], [2, 2], [3, 3]], dst), null);   // 한 줄에 놓인 네 점
});

test('역행렬: 곱하면 단위행렬, 특이행렬은 null', () => {
  const M = [[2, 1, 0, 0], [1, 3, 1, 0], [0, 1, 4, 1], [0, 0, 1, 5]];
  const I = invertMatrix(M);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    near(M[i].reduce((s, v, k) => s + v * I[k][j], 0), i === j ? 1 : 0, 1e-12);
  }
  assert.equal(invertMatrix([[1, 2], [2, 4]]), null);
});

test('투영 행렬의 역행렬이 손으로 푼 식과 같다', () => {
  const aspect = 16 / 9, f = 1 / Math.tan(Math.PI / 6), n = 1, far = 10000;
  const A = (n + far) / (n - far), B = (2 * far * n) / (n - far);
  const inv = invertMatrix(createPerspectiveMatrix(aspect));
  near(inv[0][0], aspect / f, 1e-12); near(inv[1][1], 1 / f, 1e-12);
  near(inv[2][3], 1 / B, 1e-12); near(inv[3][2], -1, 1e-12); near(inv[3][3], A / B, 1e-9);
});

test('오일러 각: 행렬로 갔다 돌아오면 같다', () => {
  for (const [p, y, r] of [[0, 0, 0], [10, -20, 5], [-35, 40, -15]]) {
    const back = matrixToEuler(eulerToMatrix(p, y, r));
    // 이름은 원본을 따랐다: matrixToEuler의 pitch·yaw는 eulerToMatrix의 yaw·pitch 자리에서 나온다
    near(back[0], y, 1e-9); near(back[1], p, 1e-9); near(back[2], r, 1e-9);
  }
});

test('머리 벡터: 정면이면 카메라 쪽(−z), 길이는 1', () => {
  const front = getHeadVector(readFaceMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  near(front[0], 0, 1e-12); near(front[1], 0, 1e-12); near(front[2], -1, 1e-12);
  const R = eulerToMatrix(12, -25, 7);
  const v = getHeadVector(readFaceMatrix([...R[0], 0, ...R[1], 0, ...R[2], 0, 0, 0, 0, 1]));
  near(Math.hypot(...v), 1, 1e-12);
});

test('머리 행렬: 모자라거나 깨진 값은 null', () => {
  assert.equal(readFaceMatrix(null), null);
  assert.equal(readFaceMatrix([1, 2, 3]), null);
  assert.equal(readFaceMatrix(new Array(16).fill(NaN)), null);
});

test('얼굴이 카메라에서 멀어지면 원점의 깊이가 커진다', () => {
  const [near_, far_] = [reference.cases.find((c) => c.name === 'front-640'), reference.cases.find((c) => c.name === 'far-small')];
  assert.ok(far_.expected.faceOrigin3D[2] > near_.expected.faceOrigin3D[2] + 10);
});

test('눈 조각: 영상 밖을 가리키는 화소는 검정으로 남는다', () => {
  const c = reference.cases.find((k) => k.name === 'tilted-edge');
  const lm2d = toPixelLandmarks(asLandmarks(c), c.W, c.H);
  const plan = planEyePatch(lm2d, c.W, c.H);
  const frame = gradientFrame(c.W, c.H);
  for (let i = 0; i < frame.data.length; i += 4) { frame.data[i] = 200; frame.data[i + 1] = 200; frame.data[i + 2] = 200; }
  const patch = renderEyePatch(plan, frame);
  let black = 0, lit = 0;
  for (let i = 0; i < patch.length; i += 3) { if (patch[i] === 0) black++; else { lit++; near(patch[i], 200 / 255, 1e-6); } }
  assert.ok(black > 0 && lit > black, `검정 ${black}, 채워진 것 ${lit}`);
  assert.ok(plan.region.x === 0 || plan.region.y === 0, '얼굴이 가장자리에 걸려 자를 자리가 영상 끝에서 잘린다');
});

test('눈 조각: 필요한 점이 없거나 눈 띠가 뒤집히면 계획을 세우지 않는다', () => {
  const c = reference.cases[0];
  const lm2d = toPixelLandmarks(asLandmarks(c), c.W, c.H);
  const flipped = lm2d.map((p) => [...p]);
  [flipped[151], flipped[195]] = [flipped[195], flipped[151]];
  assert.equal(planEyePatch(flipped, c.W, c.H), null);
  const missing = [...lm2d]; missing[103] = undefined;
  assert.equal(planEyePatch(missing, c.W, c.H), null);
});

// ── 프레임 사이 상태 ────────────────────────────────────────────────────────

test('전처리기: 한 프레임에서 모형 입력 세 가지가 나온다', () => {
  const c = reference.cases.find((k) => k.name === 'turned-1280');
  const pre = createFacePreprocessor({ widthFrames: 1 });
  const out = pre.prepare(asLandmarks(c), c.matrixData, c.W, c.H);
  assert.ok(out?.plan && out.headVector.length === 3 && out.faceOrigin3D.length === 3);
  out.headVector.forEach((v, i) => near(v, c.expected.headVector[i], 1e-12));
  out.faceOrigin3D.forEach((v, i) => near(v, c.expected.faceOrigin3D[i], 1e-6, `원점[${i}]`));
  near(pre.faceWidthCm, c.expected.faceWidthCm, 1e-9);
  assert.equal(pre.faceWidthLocked, true);
});

test('전처리기: 얼굴 폭은 처음 몇 프레임의 중앙값으로 묶이고 그 뒤로 안 바뀐다', () => {
  const c = reference.cases.find((k) => k.name === 'front-640');
  const pre = createFacePreprocessor({ widthFrames: 5 });
  const base = asLandmarks(c);
  // 한 프레임만 홍채가 엉뚱하게 크게 잡힌 경우 (깜빡임·옆모습 흉내)
  const odd = base.map((p) => ({ ...p })); odd[476] = { ...odd[476], x: odd[476].x - 0.05 };
  pre.prepare(odd, c.matrixData, c.W, c.H);
  assert.equal(pre.faceWidthLocked, false);
  for (let i = 0; i < 4; i++) pre.prepare(base, c.matrixData, c.W, c.H);
  assert.equal(pre.faceWidthLocked, true);
  near(pre.faceWidthCm, c.expected.faceWidthCm, 1e-9, '튀는 한 프레임에 끌려가지 않는다');
  pre.prepare(odd, c.matrixData, c.W, c.H);
  near(pre.faceWidthCm, c.expected.faceWidthCm, 1e-9, '묶인 뒤에는 그대로다');
});

test('전처리기: 깊이는 직전 프레임에서 이어 가며 몇 프레임 안에 자리를 잡는다', () => {
  // 한 프레임에 깊이를 10번까지만 고치므로(한 번에 5cm 이내) 먼 얼굴은 첫 프레임에 다 못 간다. 원본도 같다.
  for (const c of reference.cases) {
    const pre = createFacePreprocessor({ widthFrames: 1 });
    const z = [];
    for (let i = 0; i < 20; i++) z.push(pre.prepare(asLandmarks(c), c.matrixData, c.W, c.H).faceOrigin3D[2]);
    near(z[0], c.expected.faceOrigin3D[2], 1e-6, `[${c.name}] 첫 프레임은 원본의 한 프레임과 같다`);
    near(z[19], z[10], 0.3, `[${c.name}] 10프레임 뒤에는 멈춘다`);
    assert.ok(z[19] >= z[0], `[${c.name}] 짐작(60cm)보다 먼 얼굴은 뒤로 물러난다`);
    near(pre.depthCm, z[19], 1e-12);
  }
});

test('전처리기: 쓸 수 없는 입력은 null', () => {
  const c = reference.cases[0];
  const pre = createFacePreprocessor();
  assert.equal(pre.prepare(null, c.matrixData, c.W, c.H), null);
  assert.equal(pre.prepare(asLandmarks(c).slice(0, 468), c.matrixData, c.W, c.H), null);   // 홍채 점이 없는 468점 메시
  assert.equal(pre.prepare(asLandmarks(c), null, c.W, c.H), null);                          // 머리 자세 행렬이 꺼져 있다
  assert.equal(pre.prepare(asLandmarks(c), c.matrixData, 0, 0), null);
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
