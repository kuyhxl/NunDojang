// 시선 모형의 뒷부분과 개인 보정 — 순수 함수만. DOM·카메라·TensorFlow.js에 의존하지 않는다.
// 브라우저 없이 시험한다:  node tests/gazeModel.test.mjs
//
// BlazeGaze(WebEyeTrack)는 두 토막이다.
//   cnn_encoder : 눈 영상 조각 128×512×3 → 특징 512개.   얼려 둔다. TensorFlow.js로 돌린다 (blazeGaze.js).
//   gaze_mlp    : [특징 512, 머리 벡터 3, 원점 3] → 화면 좌표 2개.   Dense 16 → Dense 16 → Dense 2.
// 뒤 토막은 가중치가 8,594개뿐이라 여기서 직접 계산한다. 그래서 보정(가중치 미세조정·어파인 맞춤·빼고 맞히기)을
// 전부 node에서 시험할 수 있고, 보정이 TensorFlow.js의 학습 기능에 기대지 않는다.
//
// 좌표 약속
//   모형 출력(raw)은 화면 한가운데가 (0, 0), 범위 −0.5~0.5 (오른쪽·아래가 +).
//   이 모듈 밖으로 내는 값(norm)은 화면 비율 0~1 이다 (raw + 0.5).
//
// 보정 절차는 WebEyeTrack.adapt() 를 따른다 (RedForestAI/WebEyeTrack@75fbd2f, MIT).
//   ① 지금 모형의 예측을 목표에 맞추는 어파인을 최소제곱으로 구한다 (점이 4개 이상일 때)
//   ② 그 어파인을 거친 오차(MSE)로 gaze_mlp만 Adam 한 걸음(lr 1e-5) 움직인다
// 다른 점: 원본은 점 하나를 볼 때마다 adapt를 부르고, 우리는 27점을 다 모은 뒤 한 번 부른다.
//         그래서 ② 뒤에 어파인을 한 번 더 구해 마지막 모형과 맞춘다.

import { solveAffine, applyAffine } from './webEyeTrackMath.js';

export const GAZE_MODEL_VERSION = 'gaze-model/1.0.0';
export const HEAD_INPUT = Object.freeze({ embedding: 512, headVector: 3, faceOrigin: 3, total: 518 });
/** WebEyeTrack.adapt()의 기본값. tf.train.adam(1e-5, 0.85, 0.9, 1e-8), 한 걸음. */
export const ADAPT_DEFAULTS = Object.freeze({ steps: 1, learningRate: 1e-5, beta1: 0.85, beta2: 0.9, epsilon: 1e-8 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1]; };

/** 모형 입력 한 줄: [눈 특징 512, 머리 벡터 3, 원점 3]. */
export function packHeadInput(embedding, headVector, faceOrigin3D) {
  if (embedding?.length !== HEAD_INPUT.embedding || headVector?.length !== 3 || faceOrigin3D?.length !== 3) return null;
  const x = new Float32Array(HEAD_INPUT.total);
  x.set(embedding, 0);
  x.set(headVector, HEAD_INPUT.embedding);
  x.set(faceOrigin3D, HEAD_INPUT.embedding + 3);
  return x;
}

/**
 * gaze_mlp.
 * @param layers [{kernel: Float32Array(in·out) — kernel[i·out + j], bias: Float32Array(out), in, out, relu}] 세 층
 */
export function createGazeHead(layers) {
  if (!Array.isArray(layers) || !layers.length) throw new Error('gaze_mlp 가중치가 필요합니다.');
  let prev = HEAD_INPUT.total;
  for (const l of layers) {
    if (l.in !== prev || l.kernel?.length !== l.in * l.out || l.bias?.length !== l.out) {
      throw new Error(`gaze_mlp 층 모양이 맞지 않습니다 (기대 입력 ${prev}, 받은 것 ${l.in}→${l.out}).`);
    }
    prev = l.out;
  }
  if (prev !== 2) throw new Error('gaze_mlp의 마지막 층은 출력이 2개여야 합니다.');

  const copy = (ls) => ls.map((l) => ({ ...l, kernel: Float32Array.from(l.kernel), bias: Float32Array.from(l.bias) }));
  const initial = copy(layers);
  let net = copy(layers);

  /** 한 표본을 앞으로 보낸다. keep이면 층마다 활성값을 남긴다(역전파용). */
  function run(x, keep = null) {
    let a = x;
    for (let li = 0; li < net.length; li++) {
      const { kernel, bias, in: nIn, out: nOut, relu } = net[li];
      const z = new Float64Array(nOut);
      for (let j = 0; j < nOut; j++) z[j] = bias[j];
      for (let i = 0; i < nIn; i++) {
        const ai = a[i];
        if (ai === 0) continue;
        const base = i * nOut;
        for (let j = 0; j < nOut; j++) z[j] += ai * kernel[base + j];
      }
      if (keep) keep.push({ input: a, z });
      if (relu) for (let j = 0; j < nOut; j++) if (z[j] < 0) z[j] = 0;
      a = z;
    }
    return a;
  }

  const through = (affine, p) => (affine ? applyAffine(affine, p) : [p[0], p[1]]);

  /**
   * 평균제곱오차와 가중치별 기울기. tf.losses.meanSquaredError와 같이 모든 원소(N×2)의 평균이다.
   * @param inputs  [Float32Array(518)]   @param targets [[x, y]] raw 좌표   @param affine 2×3 | null
   */
  function lossAndGradients(inputs, targets, affine = null) {
    const grads = net.map((l) => ({ kernel: new Float64Array(l.kernel.length), bias: new Float64Array(l.out) }));
    const n = inputs.length;
    let loss = 0;
    for (let s = 0; s < n; s++) {
      const keep = [];
      const p = run(inputs[s], keep);
      const pt = through(affine, p);
      const ex = pt[0] - targets[s][0], ey = pt[1] - targets[s][1];
      loss += (ex * ex + ey * ey) / (2 * n);
      // d(loss)/d(pt) = (pt − y)/n,  어파인의 선형 부분을 거슬러 p로
      const gx = ex / n, gy = ey / n;
      let delta = affine
        ? [affine[0][0] * gx + affine[1][0] * gy, affine[0][1] * gx + affine[1][1] * gy]
        : [gx, gy];
      for (let li = net.length - 1; li >= 0; li--) {
        const { kernel, in: nIn, out: nOut, relu } = net[li];
        const { input, z } = keep[li];
        if (relu) delta = Array.from(delta, (d, j) => (z[j] > 0 ? d : 0));   // run이 z를 0으로 눌러 뒀다
        const g = grads[li];
        for (let j = 0; j < nOut; j++) g.bias[j] += delta[j];
        const back = li > 0 ? new Float64Array(nIn) : null;
        for (let i = 0; i < nIn; i++) {
          const ai = input[i], base = i * nOut;
          let acc = 0;
          for (let j = 0; j < nOut; j++) {
            if (ai !== 0) g.kernel[base + j] += ai * delta[j];
            if (back) acc += kernel[base + j] * delta[j];
          }
          if (back) back[i] = acc;
        }
        delta = back;
      }
    }
    return { loss, grads };
  }

  return {
    get layers() { return net.map((l) => ({ in: l.in, out: l.out, relu: !!l.relu })); },
    /** 입력 한 줄 → raw 좌표 [x, y]. */
    forward(x) { const p = run(x); return [p[0], p[1]]; },
    lossAndGradients,
    /** 어파인을 거친 오차로 Adam을 steps걸음 밟는다. 호출마다 새 최적화기로 시작한다(원본과 같다). */
    adapt(inputs, targets, { affine = null, steps, learningRate, beta1, beta2, epsilon } = {}) {
      const o = { ...ADAPT_DEFAULTS };
      for (const [k, v] of Object.entries({ steps, learningRate, beta1, beta2, epsilon })) if (v !== undefined) o[k] = v;
      if (!inputs.length || inputs.length !== targets.length) return { ok: false, reason: 'no_samples' };
      const state = net.map((l) => ({
        mk: new Float64Array(l.kernel.length), vk: new Float64Array(l.kernel.length),
        mb: new Float64Array(l.out), vb: new Float64Array(l.out)
      }));
      const lossBefore = lossAndGradients(inputs, targets, affine).loss;
      for (let t = 1; t <= o.steps; t++) {
        const { grads } = lossAndGradients(inputs, targets, affine);
        const c1 = 1 - o.beta1 ** t, c2 = 1 - o.beta2 ** t;
        const step = (w, g, m, v) => {
          for (let i = 0; i < w.length; i++) {
            m[i] = o.beta1 * m[i] + (1 - o.beta1) * g[i];
            v[i] = o.beta2 * v[i] + (1 - o.beta2) * g[i] * g[i];
            w[i] -= (o.learningRate * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + o.epsilon);
          }
        };
        for (let li = 0; li < net.length; li++) {
          step(net[li].kernel, grads[li].kernel, state[li].mk, state[li].vk);
          step(net[li].bias, grads[li].bias, state[li].mb, state[li].vb);
        }
      }
      const lossAfter = lossAndGradients(inputs, targets, affine).loss;
      return { ok: true, steps: o.steps, learningRate: o.learningRate, lossBefore, lossAfter };
    },
    snapshot() { return copy(net); },
    restore(snap) { net = copy(snap); },
    /** 받아 온 가중치로 되돌린다. */
    reset() { net = copy(initial); },
    get adapted() { return net.some((l, i) => l.kernel.some((v, k) => v !== initial[i].kernel[k])); }
  };
}

/** 한 보정점의 표본 가운데 예측이 무리에서 먼 것을 버린다 (눈이 옮겨 가는 중이거나 딴 데를 본 프레임). */
export function trimByPrediction(items, keep = 0.75) {
  if (items.length < 6) return items;
  const mx = median(items.map((s) => s.raw[0])), my = median(items.map((s) => s.raw[1]));
  const sx = median(items.map((s) => Math.abs(s.raw[0] - mx))) || 1e-6;
  const sy = median(items.map((s) => Math.abs(s.raw[1] - my))) || 1e-6;
  return items.map((s) => ({ s, d: Math.hypot((s.raw[0] - mx) / sx, (s.raw[1] - my) / sy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(4, Math.round(items.length * keep)))
    .map((x) => x.s);
}

/**
 * raw 예측 → 화면 비율 좌표. 보정 결과(어파인)와 치우침을 들고 있다.
 * @param head createGazeHead 결과
 */
export function createGazeModel({ head }) {
  if (!head) throw new Error('head가 필요합니다.');
  let affine = null, stats = null;
  // 치우침 보정. 보정 뒤 자세가 바뀌면 좌표가 통째로 밀린다. 보정은 그대로 두고 예측 위에 더하는 상수로 바로잡는다.
  let offset = { x: 0, y: 0 };

  /** 보정점 단위 leave-one-out: 한 점을 빼고 어파인을 맞춘 뒤 그 점을 얼마나 틀리는지 본다. */
  function looError(items, width, height) {
    const ids = [...new Set(items.map((s) => s.point))];
    const errs = [];
    for (const id of ids) {
      const train = items.filter((s) => s.point !== id);
      const test = items.filter((s) => s.point === id);
      const A = solveAffine(train.map((s) => s.raw), train.map((s) => s.target));
      if (!A) return null;
      let sx = 0, sy = 0;
      for (const s of test) { const p = applyAffine(A, s.raw); sx += p[0]; sy += p[1]; }
      const dxPx = (sx / test.length - test[0].target[0]) * width;
      const dyPx = (sy / test.length - test[0].target[1]) * height;
      errs.push({ point: id, errPx: Math.hypot(dxPx, dyPx), dxPx, dyPx });
    }
    return { rmsPx: Math.sqrt(errs.reduce((s, e) => s + e.errPx * e.errPx, 0) / errs.length), perPoint: errs };
  }

  return {
    get calibrated() { return !!affine; },
    getFit() { return stats ? { order: stats.order, affine: affine.map((r) => [...r]), stats: { ...stats } } : null; },
    /** 보정을 지우고 가중치도 받아 온 값으로 되돌린다. */
    clearFit() { affine = null; stats = null; head.reset(); },

    /** raw 예측 → {x, y} 화면 비율(0~1, 벗어날 수 있다). */
    predictNorm(raw) {
      if (!raw || ![raw[0], raw[1]].every(Number.isFinite)) return null;
      const p = affine ? applyAffine(affine, raw) : raw;
      return { x: p[0] + 0.5 + offset.x, y: p[1] + 0.5 + offset.y, calibrated: !!affine };
    },

    // ── 치우침 보정 ──
    getOffset() { return { ...offset }; },
    clearOffset() { offset = { x: 0, y: 0 }; },
    /** 예측이 (nx, ny)를 가리키도록 치우침을 더한다. maxOffset을 넘지 않게 묶는다. */
    anchorTo({ predictedX, predictedY, nx, ny, maxOffset = 0.35 }) {
      if (![predictedX, predictedY, nx, ny].every(Number.isFinite)) return { ok: false, reason: 'bad_input' };
      const want = { x: offset.x + (nx - predictedX), y: offset.y + (ny - predictedY) };
      const next = { x: clamp(want.x, -maxOffset, maxOffset), y: clamp(want.y, -maxOffset, maxOffset) };
      const clamped = Math.abs(want.x) > maxOffset + 1e-9 || Math.abs(want.y) > maxOffset + 1e-9;
      const moved = { x: next.x - offset.x, y: next.y - offset.y };
      offset = next;
      return { ok: true, offset: { ...offset }, moved, clamped };
    },

    /**
     * 보정 표본으로 모형을 맞춘다.
     * @param samples [{input: Float32Array(518), nx, ny, point}] — nx·ny는 화면 비율(0~1) 목표
     * @returns {ok, order, perPoint:[{point, errPx, dxPx, dyPx}], looRmsPx, trainRmsPx, …}
     */
    fit(samples, { width = 1, height = 1, trim = 0.75, adapt = {} } = {}) {
      const clean = (samples ?? []).filter((s) => s && s.input?.length === HEAD_INPUT.total &&
        [s.nx, s.ny].every(Number.isFinite) && Number.isFinite(s.point));
      const points = [...new Set(clean.map((s) => s.point))];
      if (points.length < 4) return { ok: false, reason: 'need_at_least_4_points', points: points.length };

      // 새 보정은 받아 온 가중치에서 시작한다. 앞선 보정 위에 덧쌓지 않는다.
      const before = head.snapshot();
      head.reset();
      const items = clean.map((s) => ({ input: s.input, point: s.point, target: [s.nx - 0.5, s.ny - 0.5], raw: head.forward(s.input) }));
      const usable = points.flatMap((id) => trimByPrediction(items.filter((s) => s.point === id), trim));
      const targets = usable.map((s) => s.target);

      const first = solveAffine(usable.map((s) => s.raw), targets);
      if (!first) { head.restore(before); return { ok: false, reason: 'degenerate_points', points: points.length }; }
      const tuned = head.adapt(usable.map((s) => s.input), targets, { ...adapt, affine: first });
      for (const s of usable) s.raw = head.forward(s.input);
      const A = solveAffine(usable.map((s) => s.raw), targets);
      const loo = A && looError(usable, width, height);
      if (!A || !loo) { head.restore(before); return { ok: false, reason: 'degenerate_points', points: points.length }; }

      let se = 0;
      for (const s of usable) {
        const p = applyAffine(A, s.raw);
        se += ((p[0] - s.target[0]) * width) ** 2 + ((p[1] - s.target[1]) * height) ** 2;
      }
      affine = A;
      offset = { x: 0, y: 0 };            // 새 보정은 치우침 없이 시작한다
      stats = {
        order: 'blazegaze-affine',
        samples: usable.length,
        dropped: clean.length - usable.length,
        points: points.length,
        trainRmsPx: Math.sqrt(se / usable.length),
        looRmsPx: loo.rmsPx,
        perPoint: loo.perPoint,
        adapt: { steps: tuned.steps, learningRate: tuned.learningRate, lossBefore: tuned.lossBefore, lossAfter: tuned.lossAfter },
        fittedAt: Date.now()
      };
      return { ok: true, ...stats };
    }
  };
}
