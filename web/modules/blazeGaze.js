// BlazeGaze 모형 불러오기 — TensorFlow.js에 닿는 곳은 이 파일 하나다.
//
// 맡는 일은 둘뿐이다.
//   ① 얼려 둔 앞 토막(cnn_encoder)으로 눈 영상 조각 → 특징 512개
//   ② 뒤 토막(gaze_mlp)의 가중치를 꺼내 gazeModel.js에 넘긴다 (계산·보정은 거기서 한다)
//
// 모형: RedForestAI/WebEyeTrack@75fbd2f 의 js/examples/minimal-example/public/web.
//       tools/setup_assets.py 가 web/models/blazegaze/ 에 받아 두고 SHA-256을 확인한다.
// 조건: 저장소 표기는 MIT지만 **학습 데이터가 비상업·연구 전용**이다 (MPIIFaceGaze CC BY-NC-SA 4.0 등).
//       상업적 이용·서비스 배포 전에 web/vendor/NOTICE.md 의 "BlazeGaze 가중치" 절을 볼 것.
//       가중치를 다른 것으로 바꿀 때 손댈 곳은 이 파일과 config.gazeModelPath 뿐이다 (층 이름·모양이 같다면).

import { EYE_PATCH } from './webEyeTrackMath.js';
import { HEAD_INPUT } from './gazeModel.js';

export const BLAZE_GAZE_VERSION = 'blazegaze/webeyetrack-75fbd2f';

/**
 * @param tfModuleUrl tf.fesm.min.js 주소
 * @param modelUrl    model.json 주소 (가중치 .bin은 같은 폴더에서 찾는다)
 * @param tf          이미 불러온 TensorFlow.js (시험용)
 * @param io          tf.io 처리기 (시험용. 파일에서 읽을 때)
 */
export async function createBlazeGaze({ tfModuleUrl, modelUrl, tf: injected = null, io = null } = {}) {
  const tf = injected ?? await import(tfModuleUrl);
  await tf.ready();
  const model = await tf.loadLayersModel(io ?? modelUrl);

  let encoder, mlp;
  try { encoder = model.getLayer('cnn_encoder'); mlp = model.getLayer('gaze_mlp'); }
  catch (e) { model.dispose(); throw new Error(`BlazeGaze 모형의 층 이름이 기대와 다릅니다: ${e.message}`); }

  // gaze_mlp: [kernel, bias] × 3.  kernel은 [입력, 출력] 모양이고 줄 우선으로 풀린다 → kernel[i·출력 + j]
  const tensors = mlp.getWeights();
  if (tensors.length !== 6) { model.dispose(); throw new Error(`gaze_mlp 가중치가 6묶음이 아닙니다 (${tensors.length}).`); }
  const headLayers = [0, 1, 2].map((i) => {
    const k = tensors[2 * i], b = tensors[2 * i + 1];
    return { in: k.shape[0], out: k.shape[1], relu: i < 2, kernel: Float32Array.from(k.dataSync()), bias: Float32Array.from(b.dataSync()) };
  });
  if (headLayers[0].in !== HEAD_INPUT.total) { model.dispose(); throw new Error(`gaze_mlp 입력이 ${HEAD_INPUT.total}이 아닙니다 (${headLayers[0].in}).`); }

  const { width: W, height: H, channels: C } = EYE_PATCH;
  const patchTensor = (patch) => {
    if (patch?.length !== W * H * C) throw new Error(`눈 조각 크기가 ${W}×${H}×${C}가 아닙니다.`);
    return tf.tensor4d(patch, [1, H, W, C], 'float32');
  };
  let disposed = false;

  return {
    version: BLAZE_GAZE_VERSION,
    get backend() { return tf.getBackend(); },
    /** gaze_mlp의 받아 온 가중치. gazeModel.createGazeHead 에 그대로 넣는다. */
    headLayers,
    /** 눈 조각(0~1, 128·512·3) → 특징 Float32Array(512). */
    async embed(patch) {
      if (disposed) throw new Error('닫힌 모형입니다.');
      const out = tf.tidy(() => encoder.predict(patchTensor(patch)));
      try { return Float32Array.from(await out.data()); }
      finally { out.dispose(); }
    },
    /**
     * 빈 조각을 한 번 돌려 둔다. WebGL은 첫 추론에서 셰이더를 엮느라 몇 초 멈춘다(실측 4.5초, 그 뒤로는 7ms).
     * 그 멈춤이 읽는 도중이 아니라 "모델을 불러오는 중"에 끝나게 한다.
     */
    async warmUp() { await this.embed(new Float32Array(W * H * C)); },
    /** 모형 전체를 한 번에 돌린 결과 [x, y]. 두 토막으로 나눠 계산한 값과 같은지 확인하는 용도. */
    async predictWhole(patch, headVector, faceOrigin3D) {
      const out = tf.tidy(() => {
        const y = model.predict([patchTensor(patch), tf.tensor2d([headVector], [1, 3]), tf.tensor2d([faceOrigin3D], [1, 3])]);
        return Array.isArray(y) ? y[0] : y;
      });
      try { return Array.from(await out.data()); }
      finally { out.dispose(); }
    },
    dispose() { if (!disposed) { disposed = true; model.dispose(); } }
  };
}
