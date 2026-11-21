// blazeGaze.js + 실제 가중치 시험 — 카메라 없이 돈다.  실행:  node tests/blazeGaze.test.mjs
//
// 받아 온 자산이 있어야 한다 (python3 tools/setup_assets.py). 없으면 건너뛰고 0으로 끝난다.
// TensorFlow.js를 CPU로 돌리므로 10초쯤 걸린다.
//
// 보는 것: 우리가 모형을 둘로 나눠 뒤 토막을 직접 계산하는데, 그 결과가 TensorFlow.js가 통째로 돌린 것과 같은가.
//          보정의 가중치 미세조정이 tf.train.adam(WebEyeTrack.adapt가 쓰는 것)과 같은 걸음을 밟는가.
//          실제 눈 영상으로 본 정확도는 여기서 말하지 않는다.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const at = (rel) => fileURLToPath(new URL(`../web/${rel}`, import.meta.url));
const needed = ['vendor/tfjs/tf.fesm.min.js', 'models/blazegaze/model.json', 'models/blazegaze/group1-shard1of1.bin'];
const missing = needed.filter((rel) => !existsSync(at(rel)));
if (missing.length) {
  console.log(`  건너뜀 — 자산이 없습니다: ${missing.join(', ')}\n          python3 tools/setup_assets.py 를 먼저 실행하세요.`);
  process.exit(0);
}

globalThis.require = createRequire(import.meta.url);   // tf.fesm이 node를 알아보고 require('util')을 부른다
const log = console.log; console.log = () => {};        // "node 백엔드를 깔라"는 안내를 삼킨다
const tf = await import(new URL('../web/vendor/tfjs/tf.fesm.min.js', import.meta.url).href);
await tf.setBackend('cpu'); await tf.ready();

const { createBlazeGaze } = await import('../web/modules/blazeGaze.js');
const { createGazeHead, packHeadInput, ADAPT_DEFAULTS, HEAD_INPUT } = await import('../web/modules/gazeModel.js');
const { EYE_PATCH, applyAffine } = await import('../web/modules/webEyeTrackMath.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const json = JSON.parse(readFileSync(at('models/blazegaze/model.json'), 'utf8'));
const bin = readFileSync(at('models/blazegaze/group1-shard1of1.bin'));
const io = () => tf.io.fromMemory({
  modelTopology: json.modelTopology, weightSpecs: json.weightsManifest[0].weights,
  weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
});
const blaze = await createBlazeGaze({ tf, io: io() });
await blaze.warmUp();
console.log = log;

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** 눈 영상이 아니라 무늬다. 두 계산이 같은 입력에서 같은 답을 내는지만 본다. */
const patchOf = (k) => Float32Array.from({ length: EYE_PATCH.width * EYE_PATCH.height * 3 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.0007 * (k + 1) + k) * rnd());
const cases = [0, 1, 2, 3].map((k) => ({ patch: patchOf(k), head: [rnd() * 0.4 - 0.2, rnd() * 0.4 - 0.2, -0.95], origin: [rnd() * 10 - 5, rnd() * 10 - 5, 50 + rnd() * 30] }));
const embeddings = [];
for (const c of cases) embeddings.push(await blaze.embed(c.patch));

await test('모형이 기대한 모양이다 (518 → 16 → 16 → 2)', () => {
  assert.deepEqual(blaze.headLayers.map((l) => [l.in, l.out, l.relu]), [[HEAD_INPUT.total, 16, true], [16, 16, true], [16, 2, false]]);
  assert.equal(embeddings[0].length, HEAD_INPUT.embedding);
  assert.ok(embeddings[0].some((v) => v !== 0) && embeddings[0].every(Number.isFinite));
});

await test('둘로 나눠 계산한 값이 통째로 돌린 값과 같다', async () => {
  const head = createGazeHead(blaze.headLayers);
  for (const [i, c] of cases.entries()) {
    const whole = await blaze.predictWhole(c.patch, c.head, c.origin);
    const split = head.forward(packHeadInput(embeddings[i], c.head, c.origin));
    assert.ok(Math.abs(whole[0] - split[0]) < 1e-5 && Math.abs(whole[1] - split[1]) < 1e-5, `${whole} vs ${split}`);
  }
});

await test('가중치 미세조정이 tf.train.adam 한 걸음과 같다 (WebEyeTrack.adapt의 설정)', async () => {
  const affine = [[1.2, -0.1, 0.03], [0.05, 0.9, -0.02]];
  const targets = cases.map(() => [rnd() - 0.5, rnd() - 0.5]);
  const inputs = cases.map((c, i) => packHeadInput(embeddings[i], c.head, c.origin));

  // 우리 쪽
  const head = createGazeHead(blaze.headLayers);
  const r = head.adapt(inputs, targets, { affine });
  const mine = head.snapshot();

  // TensorFlow.js 쪽: 같은 뒤 토막을 따로 불러 같은 오차로 Adam 한 걸음
  const model = await tf.loadLayersModel(io());
  const mlp = model.getLayer('gaze_mlp');
  const emb = tf.tensor2d(embeddings.map((e) => Array.from(e)), [cases.length, 512]);
  const hv = tf.tensor2d(cases.map((c) => c.head)), org = tf.tensor2d(cases.map((c) => c.origin));
  const y = tf.tensor2d(targets), A = tf.tensor2d(affine);
  const opt = tf.train.adam(ADAPT_DEFAULTS.learningRate, ADAPT_DEFAULTS.beta1, ADAPT_DEFAULTS.beta2, ADAPT_DEFAULTS.epsilon);
  const lossOf = () => {
    const p = mlp.apply([emb, hv, org]);
    const pt = tf.matMul(tf.concat([p, tf.ones([cases.length, 1])], 1), A.transpose());
    return tf.losses.meanSquaredError(y, pt).asScalar();
  };
  const lossBefore = (await lossOf().data())[0];
  const { grads } = tf.variableGrads(lossOf, mlp.trainableWeights.map((w) => w.val));
  opt.applyGradients(grads);
  const theirs = mlp.getWeights().map((w) => w.dataSync());

  assert.ok(Math.abs(lossBefore - r.lossBefore) < 1e-6 * Math.max(1, lossBefore), `오차 ${lossBefore} vs ${r.lossBefore}`);
  let worst = 0, moved = 0;
  for (let li = 0; li < 3; li++) {
    for (const [mineArr, theirArr, orig] of [[mine[li].kernel, theirs[2 * li], blaze.headLayers[li].kernel], [mine[li].bias, theirs[2 * li + 1], blaze.headLayers[li].bias]]) {
      for (let i = 0; i < mineArr.length; i++) {
        worst = Math.max(worst, Math.abs(mineArr[i] - theirArr[i]));
        if (theirArr[i] !== orig[i]) moved++;
      }
    }
  }
  assert.ok(moved > 50, `TensorFlow.js 쪽에서 움직인 가중치 ${moved}`);
  // 한 걸음이 1e-5다. 두 구현이 그 100분의 1 안에서 같아야 한다 (float32 반올림 감안)
  assert.ok(worst < 2e-7, `가중치 차이 최대 ${worst}`);
  model.dispose();
});

await test('어파인을 거친 예측이 두 쪽에서 같다', () => {
  const A = [[1.2, -0.1, 0.03], [0.05, 0.9, -0.02]];
  const p = createGazeHead(blaze.headLayers).forward(packHeadInput(embeddings[0], cases[0].head, cases[0].origin));
  const t = tf.matMul(tf.tensor2d([[p[0], p[1], 1]]), tf.tensor2d(A).transpose()).dataSync();
  const m = applyAffine(A, p);
  assert.ok(Math.abs(t[0] - m[0]) < 1e-6 && Math.abs(t[1] - m[1]) < 1e-6);
});

await test('크기가 다른 눈 조각은 거절한다', async () => {
  await assert.rejects(() => blaze.embed(new Float32Array(10)));
});

blaze.dispose();
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
