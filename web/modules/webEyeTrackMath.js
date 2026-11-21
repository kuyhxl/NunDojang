// WebEyeTrack 전처리 수학 — 순수 함수만. DOM·카메라·MediaPipe·TensorFlow.js에 의존하지 않는다.
// 그래서 브라우저 없이 바로 시험할 수 있다:  node tests/webEyeTrackMath.test.mjs
//
// 무엇을 하나
//   MediaPipe가 준 얼굴 landmark(478점)와 머리 자세 행렬에서, BlazeGaze 모형이 받는 세 입력을 만든다.
//     ① 눈 영상 조각 128×512×3 (0~1)   ② 머리 방향 단위벡터 [3]   ③ 두 눈 사이 원점의 3D 위치 [3] (cm)
//
// 어디서 왔나
//   RedForestAI/WebEyeTrack 의 js/src/utils/mathUtils.ts · WebEyeTrack.ts 를 고정 커밋
//   75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c 에서 옮겨 적었다 (TypeScript + ml-matrix → 순수 JS).
//   모형은 이 전처리로 학습됐으므로 **계산 결과가 원본과 같아야 한다.** 편의로 식을 바꾸지 말 것.
//   원본과 숫자가 같은지는 tests/webEyeTrackMath.test.mjs 가 기준값으로 본다.
//
// 원본과 다른 곳 (결과는 같거나, 다르면 여기 적는다)
//   - 호모그래피: 원본은 8×9 행렬의 SVD 영공간, 여기는 h33=1로 둔 8×8 연립방정식. 배율만 다르고 같은 변환이다.
//   - 눈 조각: 원본은 얼굴 전체(512×512)를 펴고 → 눈 띠를 자르고 → 512×128로 줄인다. 여기는 최종 128줄에
//     쓰이는 화소만 원본 영상에서 바로 가져온다. 같은 화소를 고른다(가장 가까운 화소, 내림).
//     다만 원본은 줄이는 단계의 부동소수 잡음(floor(−1e-13) = −1) 때문에 칸이 하나 밀리거나 첫 줄·첫 칸이
//     검게 남곤 한다. 여기는 그 잡음이 없다. 합성 얼굴 4개로 재면 값이 다른 화소는 1~7%이고 전부 한 칸 이내다.
//   - 투영 행렬의 역행렬을 landmark마다(478번) 구하지 않고 한 번만 구한다.
//   - 얼굴 폭(cm): 원본은 첫 프레임 값 하나를 끝까지 쓴다. 여기는 처음 몇 프레임의 중앙값을 쓴다 (createFacePreprocessor).
//
// ── MIT License (WebEyeTrack) ──────────────────────────────────────────────────────────────
// Copyright (c) 2025 (Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial
// portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
// LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
// EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// ───────────────────────────────────────────────────────────────────────────────────────────

import { solveLinearSystem } from './gazeMath.js';

export const WET_MATH_VERSION = 'webeyetrack-math/1.0.0';
export const WET_UPSTREAM = Object.freeze({
  repo: 'RedForestAI/WebEyeTrack',
  commit: '75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c',
  license: 'MIT'
});

/** 모형이 받는 눈 조각 크기. */
export const EYE_PATCH = Object.freeze({ width: 512, height: 128, channels: 3 });

// 얼굴 폭을 재는 두 점, 홍채 다섯 점(중심·위·오른쪽·아래·왼쪽), 눈꼬리
const LEFTMOST_LANDMARK = 356;
const RIGHTMOST_LANDMARK = 127;
const RIGHT_IRIS_LANDMARKS = [468, 470, 469, 472, 471];
const LEFT_IRIS_LANDMARKS = [473, 475, 474, 477, 476];
const AVERAGE_IRIS_SIZE_CM = 1.2;
const LEFT_EYE_HORIZONTAL_LANDMARKS = [362, 263];
const RIGHT_EYE_HORIZONTAL_LANDMARKS = [33, 133];
const LEFT_EYE_EAR_LANDMARKS = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_EAR_LANDMARKS = [133, 158, 160, 33, 144, 153];

// 눈 조각을 뜨는 얼굴 네 귀(왼위·왼아래·오른아래·오른위), 중심(코), 눈 띠의 위·아래
const PATCH_CENTER = 4;
const PATCH_CORNERS = [103, 150, 379, 332];
const PATCH_TOP = 151;
const PATCH_BOTTOM = 195;
const FACE_PADDING = [0.4, 0.2];
const FACE_CROP_SIZE = 512;

const MAX_STEP_CM = 5;            // 깊이를 한 번에 이만큼 넘게 고치지 않는다
const DEFAULT_DEPTH_CM = 60;      // 첫 프레임의 깊이 짐작

// MediaPipe face_effect 그래프의 카메라 설정과 같다
const VERTICAL_FOV_DEGREES = 60;
const NEAR = 1.0;                 // 1cm
const FAR = 10000;                // 100m

// ── 작은 행렬 도구 ──────────────────────────────────────────────────────────

/** 가우스–조르당 역행렬. 특이행렬이면 null. */
export function invertMatrix(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (!(Math.abs(A[piv][c]) > 1e-14)) return null;
    if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; }
    const d = A[c][c];
    for (let k = 0; k < 2 * n; k++) A[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const out = A.map((row) => row.slice(n));
  return out.every((row) => row.every(Number.isFinite)) ? out : null;
}

const mul3 = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const transpose3 = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const mulVec3 = (A, v) => [
  A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
  A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
  A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
];
/** 4×4 변환 T를 점 p에 적용한다 (동차좌표 w=1). */
const transformPoint = (T, p) => [
  T[0][0] * p[0] + T[0][1] * p[1] + T[0][2] * p[2] + T[0][3],
  T[1][0] * p[0] + T[1][1] * p[1] + T[1][2] * p[2] + T[1][3],
  T[2][0] * p[0] + T[2][1] * p[1] + T[2][2] * p[2] + T[2][3]
];

// ── 어파인 (보정) ───────────────────────────────────────────────────────────

/**
 * src[i] → dst[i] 를 가장 잘 맞추는 2×3 어파인 (최소제곱).
 * @param src [[x, y], …]   @param dst [[u, v], …]
 * @returns [[a, b, c], [d, e, f]] — u = ax + by + c, v = dx + ey + f.  점이 한 줄에 놓이면 null.
 */
export function solveAffine(src, dst) {
  if (!Array.isArray(src) || src.length < 3 || src.length !== dst?.length) return null;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bu = [0, 0, 0], bv = [0, 0, 0];
  for (let i = 0; i < src.length; i++) {
    const s = [src[i][0], src[i][1], 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) M[r][c] += s[r] * s[c];
      bu[r] += s[r] * dst[i][0];
      bv[r] += s[r] * dst[i][1];
    }
  }
  const a = solveLinearSystem(M, bu);
  const b = solveLinearSystem(M, bv);
  return a && b ? [a, b] : null;
}

export function applyAffine(A, p) {
  return [A[0][0] * p[0] + A[0][1] * p[1] + A[0][2], A[1][0] * p[0] + A[1][1] * p[1] + A[1][2]];
}

// ── 호모그래피와 눈 조각 ────────────────────────────────────────────────────

/** 네 점 대응에서 3×3 호모그래피를 구한다 (h33 = 1). 풀 수 없으면 null. */
export function computeHomography(src, dst) {
  if (src?.length !== 4 || dst?.length !== 4) throw new Error('호모그래피에는 점 네 쌍이 필요합니다.');
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solveLinearSystem(A, b);
  return h ? [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]] : null;
}

export function applyHomography(H, pt) {
  const [x, y] = pt;
  const denom = H[2][0] * x + H[2][1] * y + H[2][2];
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / denom, (H[1][0] * x + H[1][1] * y + H[1][2]) / denom];
}

/** landmark(정규 좌표)를 영상 화소로. 원본처럼 내림한다. */
export function toPixelLandmarks(landmarks, width, height) {
  return landmarks.map((l) => [Math.floor(l.x * width), Math.floor(l.y * height)]);
}

/**
 * 눈 조각을 뜰 계획을 세운다. 화소는 아직 읽지 않는다 — 읽어야 할 영상 영역(region)을 먼저 알려 준다.
 * @param landmarks2d toPixelLandmarks 결과
 * @returns {Hinv, top, cropHeight, region:{x, y, width, height}} | null
 */
export function planEyePatch(landmarks2d, frameWidth, frameHeight) {
  const center = landmarks2d[PATCH_CENTER];
  const corners = PATCH_CORNERS.map((i) => landmarks2d[i]);
  if (!center || corners.some((p) => !p)) return null;

  // 코에서 바깥으로 밀어 여백을 둔다 (가로 40%, 세로 20%)
  const srcPts = corners.map(([x, y]) => [
    x + (x - center[0]) * FACE_PADDING[0],
    y + (y - center[1]) * FACE_PADDING[1]
  ]);
  const S = FACE_CROP_SIZE;
  const H = computeHomography(srcPts, [[0, 0], [0, S], [S, S], [S, 0]]);
  const Hinv = H && invertMatrix(H);
  if (!Hinv) return null;

  // 펴진 얼굴에서 눈 띠의 위·아래 줄
  const top = Math.round(applyHomography(H, landmarks2d[PATCH_TOP])[1]);
  const cropHeight = Math.round(applyHomography(H, landmarks2d[PATCH_BOTTOM])[1] - applyHomography(H, landmarks2d[PATCH_TOP])[1]);
  if (!Number.isFinite(top) || !(cropHeight > 0)) return null;

  // 그 띠가 원본 영상에서 차지하는 자리 (네 귀를 거꾸로 보내 감싸는 사각형)
  const back = [[0, top], [S, top], [S, top + cropHeight], [0, top + cropHeight]].map((p) => applyHomography(Hinv, p));
  if (back.some((p) => !p.every(Number.isFinite))) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...back.map((p) => p[0]))) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...back.map((p) => p[1]))) - 1);
  const x1 = Math.min(frameWidth, Math.ceil(Math.max(...back.map((p) => p[0]))) + 2);
  const y1 = Math.min(frameHeight, Math.ceil(Math.max(...back.map((p) => p[1]))) + 2);
  if (!(x1 > x0 && y1 > y0)) return null;

  return { Hinv, top, cropHeight, frameWidth, frameHeight, region: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}

/**
 * 계획대로 화소를 가져와 눈 조각을 만든다.
 * @param plan   planEyePatch 결과
 * @param pixels {data: RGBA Uint8, width, height, x, y} — 영상의 (x, y)에서 시작하는 조각. plan.region을 덮어야 한다.
 * @returns Float32Array(128·512·3) — 줄·칸·RGB 순서, 0~1
 */
export function renderEyePatch(plan, pixels) {
  const { Hinv, top, cropHeight, frameWidth, frameHeight } = plan;
  const { width: W, height: Hh, channels: C } = EYE_PATCH;
  const out = new Float32Array(W * Hh * C);
  const src = pixels.data, pw = pixels.width, ph = pixels.height;
  const ox = pixels.x ?? 0, oy = pixels.y ?? 0;

  for (let y = 0; y < Hh; y++) {
    const row = top + Math.floor((y * cropHeight) / Hh);     // 펴진 얼굴(512×512)에서의 줄
    if (row < 0 || row >= FACE_CROP_SIZE) continue;          // 펴진 얼굴 밖은 검정
    for (let x = 0; x < W; x++) {
      const denom = Hinv[2][0] * x + Hinv[2][1] * row + Hinv[2][2];
      const ix = Math.floor((Hinv[0][0] * x + Hinv[0][1] * row + Hinv[0][2]) / denom);
      const iy = Math.floor((Hinv[1][0] * x + Hinv[1][1] * row + Hinv[1][2]) / denom);
      if (!(ix >= 0 && iy >= 0 && ix < frameWidth && iy < frameHeight)) continue;   // 영상 밖은 검정
      const px = ix - ox, py = iy - oy;
      if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
      const s = (py * pw + px) * 4, d = (y * W + x) * C;
      out[d] = src[s] / 255; out[d + 1] = src[s + 1] / 255; out[d + 2] = src[s + 2] / 255;
    }
  }
  return out;
}

// ── 카메라 모형 ─────────────────────────────────────────────────────────────

/** 원근 투영 행렬. (행벡터 배치 — 원본 그대로) */
export function createPerspectiveMatrix(aspectRatio) {
  const f = 1.0 / Math.tan(((Math.PI / 180) * VERTICAL_FOV_DEGREES) / 2.0);
  const denom = 1.0 / (NEAR - FAR);
  return [
    [f / aspectRatio, 0, 0, 0],
    [0, f, 0, 0],
    [0, 0, (NEAR + FAR) * denom, -1.0],
    [0, 0, 2.0 * FAR * NEAR * denom, 0]
  ];
}

/** 내부 변수 행렬. 화각을 모르면 초점거리를 영상 폭으로 짐작한다 (원본과 같다). */
export function createIntrinsicsMatrix(width, height, fovXDeg) {
  let f = width;
  if (fovXDeg !== undefined) f = width / (2 * Math.tan(((fovXDeg * Math.PI) / 180) / 2));
  return [[f, 0, width / 2], [0, f, height / 2], [0, 0, 1]];
}

/** 홍채 지름(평균 1.2cm)을 자 삼아 얼굴 폭을 cm로 짐작한다. */
export function estimateFaceWidthCm(landmarks2d) {
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const iris = [LEFT_IRIS_LANDMARKS, RIGHT_IRIS_LANDMARKS].map((ids) => dist(landmarks2d[ids[4]], landmarks2d[ids[2]]));
  const avgIris = (iris[0] + iris[1]) / 2;
  const facePx = dist(landmarks2d[LEFTMOST_LANDMARK], landmarks2d[RIGHTMOST_LANDMARK]);
  return AVERAGE_IRIS_SIZE_CM / (avgIris / facePx);
}

function convertUvToXyz(perspectiveInverse, u, v, zRelative) {
  const ndc = [2 * u - 1, 1 - 2 * v, -1.0, 1.0];
  const row = (i) => perspectiveInverse[i][0] * ndc[0] + perspectiveInverse[i][1] * ndc[1] + perspectiveInverse[i][2] * ndc[2] + perspectiveInverse[i][3] * ndc[3];
  const w = row(3);
  return [-(row(0) / w), row(1) / w, zRelative];   // x는 원본 약속대로 뒤집는다
}

function projectToImage(point, K) {
  const p = mulVec3(K, point);
  const z = Math.abs(p[2]) < 1e-6 ? 1e-6 : p[2];
  return [Math.round(p[0] / z), Math.round(p[1] / z)];
}

function refineDepthByRadialMagnitude(projected, detected, oldZ) {
  const n = projected.length;
  let cx = 0, cy = 0;
  for (const [x, y] of detected) { cx += x / n; cy += y / n; }
  let total = 0;
  for (let i = 0; i < n; i++) {
    const vx = detected[i][0] - projected[i][0], vy = detected[i][1] - projected[i][1];
    const norm = Math.hypot(vx, vy);
    const dot = vx * (cx - projected[i][0]) + vy * (cy - projected[i][1]);
    total += dot < 0 ? -norm : norm;
  }
  const delta = 1e-1 * (total / n);
  return oldZ + Math.max(-MAX_STEP_CM, Math.min(MAX_STEP_CM, delta));
}

/** 회전행렬 → [pitch, yaw, roll]. (원본의 이름·식 그대로) */
export function matrixToEuler(R, degrees = true) {
  const pitch = Math.asin(-R[2][0]);
  const yaw = Math.atan2(R[2][1], R[2][2]);
  const roll = Math.atan2(R[1][0], R[0][0]);
  const k = degrees ? 180 / Math.PI : 1;
  return [pitch * k, yaw * k, roll * k];
}

/** [pitch, yaw, roll] → 회전행렬.  R = Rz · Ry · Rx */
export function eulerToMatrix(pitch, yaw, roll, degrees = true) {
  const k = degrees ? Math.PI / 180 : 1;
  const cp = Math.cos(pitch * k), sp = Math.sin(pitch * k);
  const cy = Math.cos(yaw * k), sy = Math.sin(yaw * k);
  const cr = Math.cos(roll * k), sr = Math.sin(roll * k);
  const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  return mul3(mul3(Rz, Ry), Rx);
}

/**
 * MediaPipe의 facialTransformationMatrixes[0].data(16개)를 4×4로 읽는다.
 * 원본과 같이 data[i·4 + j]를 i행 j열로 본다. 배치가 실제로 무엇이든, 모형이 이 읽기에 맞춰 쓰였으므로 따른다.
 */
export function readFaceMatrix(data) {
  if (!data || data.length < 16) return null;
  const M = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => Number(data[i * 4 + j])));
  return M.every((row) => row.every(Number.isFinite)) ? M : null;
}

/** 머리가 향하는 방향의 단위벡터 (카메라 좌표). */
export function getHeadVector(faceMatrix) {
  const R = [0, 1, 2].map((i) => faceMatrix[i].slice(0, 3));
  const [pitch, yaw, roll] = matrixToEuler(R, false);
  const hp = -yaw, hy = pitch, hr = roll;          // 축 이름과 방향을 원본처럼 바꾼다
  const x = Math.cos(hp) * Math.sin(hy);
  const y = Math.sin(hp);
  const z = -Math.cos(hp) * Math.cos(hy);
  const c = Math.cos(hr), s = Math.sin(hr);
  return [c * x - s * y, s * x + c * y, z];
}

/**
 * 2D landmark와 머리 회전에서 cm 단위 3D 얼굴을 되짚는다.
 * @param normLandmarks [[u, v], …] 정규 좌표
 * @param initialZ 깊이 짐작(cm). 보통 직전 프레임의 값
 * @returns {transform: 4×4, metricFace: [[x, y, z], …]}
 */
export function faceReconstruction(perspectiveInverse, normLandmarks, faceMatrix, K, faceWidthCm, videoWidth, videoHeight, initialZ = DEFAULT_DEPTH_CM) {
  // 1) 화면 좌표 → 상대 3D, 코를 원점으로
  const relative = normLandmarks.map(([u, v]) => convertUvToXyz(perspectiveInverse, u, v, initialZ));
  const nose = relative[PATCH_CENTER];
  const centered = relative.map(([x, y, z]) => [-(x - nose[0]), -(y - nose[1]), z - nose[2]]);

  // 2) 얼굴 폭이 faceWidthCm가 되도록 배율을 맞춘다
  const L = centered[LEFTMOST_LANDMARK], Rm = centered[RIGHTMOST_LANDMARK];
  const span = Math.hypot(L[0] - Rm[0], L[1] - Rm[1], L[2] - Rm[2]);
  const normalized = centered.map(([x, y, z]) => [(x / span) * faceWidthCm, (y / span) * faceWidthCm, (z / span) * faceWidthCm]);

  // 3) 머리 회전을 풀어 정면 얼굴로
  const faceR = [0, 1, 2].map((i) => faceMatrix[i].slice(0, 3));
  let [pitch, yaw, roll] = matrixToEuler(faceR);
  [pitch, yaw] = [-yaw, pitch];
  const finalR = eulerToMatrix(pitch, yaw, roll);
  const finalRt = transpose3(finalR);
  const canonical = normalized.map((p) => mulVec3(finalRt, p));

  // 4) 회전행렬 열의 길이에서 배율을 꺼내 처음 변환을 만든다
  const scale = [0, 1, 2].reduce((s, j) => s + Math.hypot(faceR[0][j], faceR[1][j], faceR[2][j]), 0) / 3;
  const transform = [
    [finalR[0][0] / scale, finalR[0][1] / scale, finalR[0][2] / scale, 0],
    [finalR[1][0] / scale, finalR[1][1] / scale, finalR[1][2] / scale, 0],
    [finalR[2][0] / scale, finalR[2][1] / scale, finalR[2][2] / scale, initialZ],
    [0, 0, 0, 1]
  ];

  // 5) 코가 관측 자리에 오도록 옆으로 민다
  const detected = normLandmarks.map(([u, v]) => [u * videoWidth, v * videoHeight]);
  const noseProjected = projectToImage(transformPoint(transform, canonical[PATCH_CENTER]), K);
  const shift = [detected[PATCH_CENTER][0] - noseProjected[0], detected[PATCH_CENTER][1] - noseProjected[1]];
  transform[0][3] += shift[0] * (initialZ / K[0][0]);
  transform[1][3] += shift[1] * (initialZ / K[1][1]);
  const firstX = transform[0][3], firstY = transform[1][3];

  // 6) 투영이 관측보다 퍼져 있으면 멀리, 모여 있으면 가까이 — 깊이를 되풀이해 맞춘다
  for (let i = 0; i < 10; i++) {
    const projected = canonical.map((p) => projectToImage(transformPoint(transform, p), K));
    const newZ = refineDepthByRadialMagnitude(projected, detected, transform[2][3]);
    if (Math.abs(newZ - transform[2][3]) < 0.25) break;
    transform[0][3] = firstX * (newZ / initialZ);
    transform[1][3] = firstY * (newZ / initialZ);
    transform[2][3] = newZ;
  }

  return { transform, metricFace: canonical.map((p) => transformPoint(transform, p)) };
}

/** 두 눈(눈꼬리 중점)의 한가운데. 시선의 원점으로 쓴다. */
export function computeFaceOrigin3D(metricFace) {
  const mean = (ids) => [0, 1, 2].map((k) => ids.reduce((s, i) => s + metricFace[i][k], 0) / ids.length);
  const l = mean(LEFT_EYE_HORIZONTAL_LANDMARKS), r = mean(RIGHT_EYE_HORIZONTAL_LANDMARKS);
  return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
}

/** 눈 가로세로비(EAR). 작을수록 감긴 눈. */
export function computeEAR(landmarks, side) {
  const [p1, p2, p3, p4, p5, p6] = (side === 'left' ? LEFT_EYE_EAR_LANDMARKS : RIGHT_EYE_EAR_LANDMARKS)
    .map((i) => [landmarks[i].x, landmarks[i].y]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return (d(p2, p6) + d(p3, p5)) / (2.0 * d(p1, p4));
}

// ── 프레임 사이에 이어지는 상태 ─────────────────────────────────────────────

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1]; };

/**
 * 한 프레임의 landmark·머리 행렬을 모형 입력으로 바꾼다. 얼굴 폭과 직전 깊이를 기억한다.
 *
 * 얼굴 폭(cm)은 사람마다 정해진 값이라 한 번 정하면 **바꾸지 않는다** — 바뀌면 원점의 배율이 달라져
 * 그 전에 한 보정이 어긋난다. 원본은 첫 프레임 값을 쓰는데, 그 한 프레임이 깜빡임·옆모습이면 끝까지 틀린다.
 * 그래서 처음 widthFrames 프레임의 중앙값을 쓰고 그 뒤로 묶는다 (보정은 그보다 한참 뒤에 시작한다).
 */
export function createFacePreprocessor({ widthFrames = 15 } = {}) {
  let widths = [], faceWidthCm = null, lastZ = null;
  let aspect = null, perspectiveInverse = null;

  return {
    get faceWidthCm() { return faceWidthCm ?? (widths.length ? median(widths) : null); },
    get faceWidthLocked() { return faceWidthCm !== null; },
    get depthCm() { return lastZ; },
    /** 다른 사람이 앉았을 때만 부른다. 보정도 함께 지워야 한다. */
    reset() { widths = []; faceWidthCm = null; lastZ = null; },

    /**
     * @param landmarks  MediaPipe faceLandmarks[0] ({x, y} 정규 좌표, 478점)
     * @param matrixData facialTransformationMatrixes[0].data
     * @returns {plan, headVector, faceOrigin3D, leftEAR, rightEAR} | null (쓸 수 없는 프레임)
     */
    prepare(landmarks, matrixData, width, height) {
      if (!landmarks || landmarks.length < 478 || !(width > 0 && height > 0)) return null;
      const faceMatrix = readFaceMatrix(matrixData);
      if (!faceMatrix) return null;

      if (aspect !== width / height) {
        aspect = width / height;
        perspectiveInverse = invertMatrix(createPerspectiveMatrix(aspect));
      }
      const K = createIntrinsicsMatrix(width, height);
      const landmarks2d = toPixelLandmarks(landmarks, width, height);

      const plan = planEyePatch(landmarks2d, width, height);
      if (!plan) return null;

      if (faceWidthCm === null) {
        const w = estimateFaceWidthCm(landmarks2d);
        if (Number.isFinite(w) && w > 0) widths.push(w);
        if (widths.length >= widthFrames) faceWidthCm = median(widths);
      }
      const widthCm = faceWidthCm ?? (widths.length ? median(widths) : null);
      if (!(widthCm > 0)) return null;

      const z0 = lastZ > 5 && lastZ < 500 ? lastZ : DEFAULT_DEPTH_CM;
      const { metricFace } = faceReconstruction(
        perspectiveInverse, landmarks.map((l) => [l.x, l.y]), faceMatrix, K, widthCm, width, height, z0);
      const faceOrigin3D = computeFaceOrigin3D(metricFace);
      const headVector = getHeadVector(faceMatrix);
      if (![...faceOrigin3D, ...headVector].every(Number.isFinite)) return null;
      lastZ = faceOrigin3D[2];

      return {
        plan, headVector, faceOrigin3D,
        leftEAR: computeEAR(landmarks, 'left'), rightEAR: computeEAR(landmarks, 'right')
      };
    }
  };
}
