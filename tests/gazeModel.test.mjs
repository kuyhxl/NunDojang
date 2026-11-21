// gazeModel.js 시험 — 브라우저·카메라·TensorFlow.js 없이 돈다.  실행:  node tests/gazeModel.test.mjs
// 가중치는 난수로 만든 가짜다. "식이 의도대로 도는가"만 본다 — 실제 모형과 같은지는 tests/blazeGaze.test.mjs.

import assert from 'node:assert/strict';
import {
  HEAD_INPUT, ADAPT_DEFAULTS, packHeadInput, createGazeHead, createGazeModel, trimByPrediction
} from '../web/modules/gazeModel.js';
import { applyAffine } from '../web/modules/webEyeTrackMath.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≠ ${b} (허용 ${tol})`);

let seed = 20261121;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };

function randomLayers(scale = 0.05) {
  const make = (nIn, nOut, relu) => ({
    in: nIn, out: nOut, relu,
    kernel: Float32Array.from({ length: nIn * nOut }, () => gauss() * scale),
    bias: Float32Array.from({ length: nOut }, () => gauss() * 0.1)
  });
  return [make(HEAD_INPUT.total, 16, true), make(16, 16, true), make(16, 2, false)];
}

/** 눈이 (gx, gy)를 볼 때의 입력 한 줄. 특징의 앞 몇 개가 시선에 따라 움직이고 나머지는 잡음이다. */
function inputFor(gx, gy, noise = 0.01) {
  const emb = new Float32Array(HEAD_INPUT.embedding);
  for (let i = 0; i < emb.length; i++) emb[i] = Math.max(0, 0.3 + gauss() * noise + (i % 2 ? gx : gy) * ((i % 7) - 3) * 0.2);
  return packHeadInput(emb, [0.02, -0.05, -0.99], [1.5, -2.0, 62]);
}

// ── 입력 묶기 ───────────────────────────────────────────────────────────────

test('입력 한 줄은 특징 512 + 머리 3 + 원점 3 순서다', () => {
  const emb = Float32Array.from({ length: 512 }, (_, i) => i);
  const x = packHeadInput(emb, [7, 8, 9], [1, 2, 3]);
  assert.equal(x.length, 518);
  assert.equal(x[0], 0); assert.equal(x[511], 511);
  assert.deepEqual(Array.from(x.slice(512)), [7, 8, 9, 1, 2, 3]);
  assert.equal(packHeadInput(emb.slice(0, 100), [7, 8, 9], [1, 2, 3]), null);
  assert.equal(packHeadInput(emb, [7, 8], [1, 2, 3]), null);
});

// ── gaze_mlp ────────────────────────────────────────────────────────────────

test('층 모양이 어긋난 가중치는 거절한다', () => {
  assert.throws(() => createGazeHead([]));
  const bad = randomLayers(); bad[1].in = 8;
  assert.throws(() => createGazeHead(bad));
  const three = randomLayers(); three[2].out = 3; three[2].kernel = new Float32Array(48); three[2].bias = new Float32Array(3);
  assert.throws(() => createGazeHead(three));
});

test('앞으로 보내기가 손으로 계산한 값과 같다', () => {
  const layers = randomLayers();
  const head = createGazeHead(layers);
  const x = inputFor(0.1, -0.2);
  let a = Array.from(x);
  for (const l of layers) {
    const z = Array.from({ length: l.out }, (_, j) => l.bias[j] + a.reduce((s, v, i) => s + v * l.kernel[i * l.out + j], 0));
    a = l.relu ? z.map((v) => Math.max(0, v)) : z;
  }
  const p = head.forward(x);
  near(p[0], a[0], 1e-9); near(p[1], a[1], 1e-9);
});

test('기울기가 수치 미분과 같다 (어파인을 거친 오차 포함)', () => {
  const layers = randomLayers(0.08);
  const inputs = Array.from({ length: 6 }, () => inputFor(rnd() - 0.5, rnd() - 0.5, 0.05));
  const targets = inputs.map(() => [rnd() - 0.5, rnd() - 0.5]);
  const affine = [[1.3, -0.2, 0.05], [0.15, 0.8, -0.02]];
  for (const A of [null, affine]) {
    const { grads } = createGazeHead(layers).lossAndGradients(inputs, targets, A);
    const lossWith = (li, key, idx, delta) => {
      const copy = layers.map((l) => ({ ...l, kernel: Float32Array.from(l.kernel), bias: Float32Array.from(l.bias) }));
      // Float32로는 작은 변화가 묻히므로 Float64로 바꿔 흔든다
      copy[li][key] = Float64Array.from(copy[li][key]); copy[li][key][idx] += delta;
      return createGazeHead(copy).lossAndGradients(inputs, targets, A).loss;
    };
    for (const [li, key, idx] of [[2, 'kernel', 5], [2, 'bias', 1], [1, 'kernel', 40], [1, 'bias', 3], [0, 'kernel', 16 * 3 + 2], [0, 'kernel', 16 * 513 + 7], [0, 'bias', 9]]) {
      const h = 1e-4;
      const numeric = (lossWith(li, key, idx, h) - lossWith(li, key, idx, -h)) / (2 * h);
      near(grads[li][key][idx], numeric, 1e-6 + Math.abs(numeric) * 1e-3, `층 ${li} ${key}[${idx}] (어파인 ${A ? '있음' : '없음'})`);
    }
  }
});

test('Adam 첫 걸음은 가중치마다 학습률만큼만 움직인다', () => {
  const head = createGazeHead(randomLayers());
  const before = head.snapshot();
  const inputs = Array.from({ length: 8 }, () => inputFor(rnd() - 0.5, rnd() - 0.5, 0.05));
  const targets = inputs.map(() => [rnd() - 0.5, rnd() - 0.5]);
  const r = head.adapt(inputs, targets);
  assert.equal(r.ok, true);
  assert.equal(r.steps, ADAPT_DEFAULTS.steps); assert.equal(r.learningRate, ADAPT_DEFAULTS.learningRate);
  const after = head.snapshot();
  let moved = 0, maxStep = 0;
  for (let li = 0; li < 3; li++) for (let i = 0; i < after[li].kernel.length; i++) {
    const d = Math.abs(after[li].kernel[i] - before[li].kernel[i]);
    if (d > 0) moved++;
    maxStep = Math.max(maxStep, d);
  }
  assert.ok(moved > 100, `움직인 가중치 ${moved}`);
  assert.ok(maxStep <= ADAPT_DEFAULTS.learningRate * 1.01 + 1e-9, `가장 큰 걸음 ${maxStep}`);   // m̂/√v̂ = ±1
  assert.ok(r.lossAfter <= r.lossBefore, '오차가 늘지 않는다');
  assert.equal(head.adapted, true);
});

test('여러 걸음을 밟으면 오차가 줄고, reset하면 받아 온 가중치로 돌아간다', () => {
  const head = createGazeHead(randomLayers());
  const inputs = Array.from({ length: 12 }, () => inputFor(rnd() - 0.5, rnd() - 0.5, 0.05));
  const targets = inputs.map(() => [rnd() - 0.5, rnd() - 0.5]);
  const p0 = head.forward(inputs[0]);
  const r = head.adapt(inputs, targets, { steps: 200, learningRate: 1e-3 });
  assert.ok(r.lossAfter < r.lossBefore * 0.9, `${r.lossBefore} → ${r.lossAfter}`);
  assert.notDeepEqual(head.forward(inputs[0]), p0);
  head.reset();
  assert.deepEqual(head.forward(inputs[0]), p0);
  assert.equal(head.adapted, false);
});

test('snapshot·restore로 가중치를 되돌린다', () => {
  const head = createGazeHead(randomLayers());
  const x = inputFor(0.2, 0.1);
  const snap = head.snapshot(), p0 = head.forward(x);
  head.adapt([x], [[0.4, 0.4]], { steps: 20, learningRate: 1e-2 });
  assert.notDeepEqual(head.forward(x), p0);
  head.restore(snap);
  assert.deepEqual(head.forward(x), p0);
});

test('표본이 없으면 adapt는 아무것도 하지 않는다', () => {
  const head = createGazeHead(randomLayers());
  assert.equal(head.adapt([], []).ok, false);
  assert.equal(head.adapted, false);
});

// ── 보정 ────────────────────────────────────────────────────────────────────

/** rows×cols 격자의 보정 표본. 화면 좌표와 모형 예측 사이에 어파인 관계가 있도록 만든다. */
function calibrationSamples(head, { cols = 5, rows = 4, perPoint = 12, noise = 0.004, hidden = [[0.7, 0.1, 0.03], [-0.05, 1.2, -0.06]] } = {}) {
  const samples = [];
  let point = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const nx = 0.08 + (c * 0.84) / (cols - 1), ny = 0.08 + (r * 0.84) / (rows - 1);
    for (let k = 0; k < perPoint; k++) samples.push({ input: inputFor(nx - 0.5, ny - 0.5, noise), nx, ny, point });
    point++;
  }
  return samples;
}

test('보정 전에는 모형 출력을 그대로 화면 비율로 옮긴다 (가운데가 0.5)', () => {
  const model = createGazeModel({ head: createGazeHead(randomLayers()) });
  assert.equal(model.calibrated, false);
  assert.deepEqual(model.predictNorm([0, 0]), { x: 0.5, y: 0.5, calibrated: false });
  assert.deepEqual(model.predictNorm([-0.5, 0.25]), { x: 0, y: 0.75, calibrated: false });
  assert.equal(model.predictNorm([NaN, 0]), null);
  assert.equal(model.predictNorm(null), null);
  assert.equal(model.getFit(), null);
});

test('보정하면 격자 점을 화면 좌표로 되찾고, 점별 오차를 픽셀로 낸다', () => {
  const head = createGazeHead(randomLayers());
  const model = createGazeModel({ head });
  const samples = calibrationSamples(head);
  const r = model.fit(samples, { width: 1512, height: 828 });
  assert.equal(r.ok, true);
  assert.equal(r.order, 'blazegaze-affine');
  assert.equal(r.points, 20);
  assert.equal(r.perPoint.length, 20);
  for (const p of r.perPoint) assert.ok(['point', 'errPx', 'dxPx', 'dyPx'].every((k) => Number.isFinite(p[k])));
  // trainRmsPx는 표본 하나하나의 오차, looRmsPx는 점마다 평균을 낸 뒤의 오차라 둘을 크기로 견줄 수는 없다
  assert.ok(r.looRmsPx > 0 && Number.isFinite(r.trainRmsPx));
  assert.ok(r.dropped > 0 && r.samples + r.dropped === samples.length);
  assert.equal(model.calibrated, true);
  // 보정에 쓴 표본의 예측이 목표 근처로 간다 — 보정 전보다 확실히
  const errOf = (m) => Math.sqrt(samples.reduce((s, x) => { const p = m.predictNorm(head.forward(x.input)); return s + (p.x - x.nx) ** 2 + (p.y - x.ny) ** 2; }, 0) / samples.length);
  const fitted = errOf(model);
  const raw = errOf(createGazeModel({ head: createGazeHead(head.snapshot()) }));
  assert.ok(fitted < raw * 0.8, `보정 후 ${fitted.toFixed(4)} vs 보정 전 ${raw.toFixed(4)}`);
  assert.equal(model.getFit().order, 'blazegaze-affine');
});

test('모형 출력과 화면 사이가 정확히 어파인이면 오차가 0에 가깝다', () => {
  // 층을 손으로 짜서 출력 = [특징0, 특징1]의 선형식이 되게 한다
  const layers = randomLayers(0);
  for (const l of layers) l.bias.fill(0);
  layers[0].kernel[0 * 16 + 0] = 1; layers[0].kernel[1 * 16 + 1] = 1;     // 특징 0·1을 첫 층의 0·1번으로
  layers[1].kernel[0 * 16 + 0] = 1; layers[1].kernel[1 * 16 + 1] = 1;
  layers[2].kernel[0 * 2 + 0] = 1; layers[2].kernel[1 * 2 + 1] = 1;
  const head = createGazeHead(layers);
  const T = [[0.6, 0.1, 0.02], [-0.1, 0.9, -0.03]];      // 화면 raw → 모형 raw (보정이 뒤집어 찾아야 할 관계)
  const samples = [];
  let point = 0;
  for (const ny of [0.1, 0.5, 0.9]) for (const nx of [0.1, 0.5, 0.9]) {
    const [u, v] = applyAffine(T, [nx - 0.5, ny - 0.5]);
    const emb = new Float32Array(512); emb[0] = u + 1; emb[1] = v + 1;     // relu에 안 걸리게 1을 더한다
    for (let k = 0; k < 5; k++) samples.push({ input: packHeadInput(emb, [0, 0, -1], [0, 0, 60]), nx, ny, point });
    point++;
  }
  const model = createGazeModel({ head });
  const r = model.fit(samples, { width: 1000, height: 800 });
  assert.equal(r.ok, true);
  assert.ok(r.looRmsPx < 0.5, `빼고 맞히기 ${r.looRmsPx}px`);
  const p = model.predictNorm(head.forward(samples[0].input));
  near(p.x, 0.1, 1e-3); near(p.y, 0.1, 1e-3);
});

test('보정은 점이 4곳보다 적거나 한 줄에 놓이면 거절하고, 가중치를 건드리지 않는다', () => {
  const head = createGazeHead(randomLayers());
  const model = createGazeModel({ head });
  const all = calibrationSamples(head);
  const few = model.fit(all.filter((s) => s.point < 3), { width: 1000, height: 800 });
  assert.deepEqual([few.ok, few.reason, few.points], [false, 'need_at_least_4_points', 3]);
  assert.equal(model.calibrated, false);
  assert.equal(head.adapted, false);
  assert.equal(model.fit(null).ok, false);
  assert.equal(model.fit([{ input: new Float32Array(3), nx: 0.5, ny: 0.5, point: 0 }]).ok, false);
});

test('다시 보정하면 앞선 보정 위에 쌓지 않고 받아 온 가중치에서 시작한다', () => {
  const head = createGazeHead(randomLayers());
  const model = createGazeModel({ head });
  const samples = calibrationSamples(head);
  const a = model.fit(samples, { width: 1000, height: 800, adapt: { steps: 30, learningRate: 1e-3 } });
  const b = model.fit(samples, { width: 1000, height: 800, adapt: { steps: 30, learningRate: 1e-3 } });
  near(b.adapt.lossBefore, a.adapt.lossBefore, 1e-12, '두 번째도 같은 자리에서 출발');
  near(b.looRmsPx, a.looRmsPx, 1e-9);
});

test('보정을 지우면 어파인과 가중치가 모두 처음으로 돌아간다', () => {
  const head = createGazeHead(randomLayers());
  const model = createGazeModel({ head });
  const x = inputFor(0.1, 0.1);
  const p0 = head.forward(x);
  model.fit(calibrationSamples(head), { width: 1000, height: 800, adapt: { steps: 30, learningRate: 1e-3 } });
  assert.equal(head.adapted, true);
  model.clearFit();
  assert.equal(model.calibrated, false);
  assert.deepEqual(head.forward(x), p0);
  assert.equal(model.getFit(), null);
});

test('튀는 표본을 버린다', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ raw: [0.1 + (i % 5) * 0.001, 0.2 - (i % 3) * 0.001] }));
  items[4].raw = [0.9, 0.9]; items[11].raw = [-0.7, 0.3];
  const kept = trimByPrediction(items, 0.75);
  assert.equal(kept.length, 15);
  assert.ok(!kept.includes(items[4]) && !kept.includes(items[11]));
  assert.equal(trimByPrediction(items.slice(0, 5)).length, 5, '표본이 적으면 버리지 않는다');
});

// ── 치우침 ──────────────────────────────────────────────────────────────────

test('치우침: 아는 점을 가리키도록 밀고, 한도 안에 묶이며, 지울 수 있다', () => {
  const model = createGazeModel({ head: createGazeHead(randomLayers()) });
  const before = model.predictNorm([0.1, 0.1]);
  const r = model.anchorTo({ predictedX: before.x, predictedY: before.y, nx: 0.5, ny: 0.45 });
  assert.equal(r.ok, true); assert.equal(r.clamped, false);
  const after = model.predictNorm([0.1, 0.1]);
  near(after.x, 0.5, 1e-12); near(after.y, 0.45, 1e-12);
  // 다른 곳을 볼 때도 같은 만큼만 밀린다 (기울기는 그대로)
  near(model.predictNorm([0.3, 0.1]).x - after.x, 0.2, 1e-12);
  const far = model.anchorTo({ predictedX: 0, predictedY: 0, nx: 5, ny: 5 });
  assert.equal(far.clamped, true);
  assert.deepEqual(model.getOffset(), { x: 0.35, y: 0.35 });
  assert.equal(model.anchorTo({ predictedX: NaN, predictedY: 0, nx: 0, ny: 0 }).ok, false);
  model.clearOffset();
  assert.deepEqual(model.getOffset(), { x: 0, y: 0 });
});

test('새 보정은 치우침 없이 시작한다', () => {
  const head = createGazeHead(randomLayers());
  const model = createGazeModel({ head });
  model.anchorTo({ predictedX: 0.4, predictedY: 0.4, nx: 0.5, ny: 0.5 });
  assert.notDeepEqual(model.getOffset(), { x: 0, y: 0 });
  model.fit(calibrationSamples(head), { width: 1000, height: 800 });
  assert.deepEqual(model.getOffset(), { x: 0, y: 0 });
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
