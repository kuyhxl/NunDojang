// ⚠️ MOCK — A(박민서)가 실제 MediaPipe 구현으로 교체한다. 이 파일은 C가 통합 시험용으로 둔 자리표시자다.
// 계약: createEyeTracker({videoElement, wasmBaseUrl, modelAssetUrl, onSample, onError}) → {start, stop, destroy, getDiagnostics}
// 실제 구현 규칙은 docs/공통시작스크립트_v2.0.2.md 11~13절.
import { CONTRACT_VERSION } from './contracts.js';

export const IS_MOCK = true;

export async function createEyeTracker({ videoElement, wasmBaseUrl, modelAssetUrl, onSample, onError }) {
  let running = false;
  let generation = 0;
  let seq = 0;
  let timer = null;
  let sessionId = null;
  let sessionT0 = 0;
  let frames = 0;

  function emit() {
    // 가짜 샘플: 눈이 천천히 좌우로 흔들리는 사인파. 실제 측정이 아니다.
    const tMs = Math.round(performance.now() - sessionT0);
    const x = 0.5 + 0.08 * Math.sin(tMs / 400);
    onSample({
      contractVersion: CONTRACT_VERSION,
      source: 'mock',
      sessionId,
      seq: seq++,
      tMs,
      valid: true,
      leftIrisX: x, rightIrisX: x + 0.01,
      leftIrisY: null, rightIrisY: null,
      leftEar: 0.3, rightEar: 0.3,
      headMotion: null,
      invalidReason: null
    });
    frames++;
  }

  return {
    async start(opts) {
      if (running && opts.sessionId === sessionId) return;
      sessionId = opts.sessionId; sessionT0 = opts.sessionT0;
      running = true; generation++;
      const g = generation;
      timer = setInterval(() => { if (running && g === generation) emit(); }, 1000 / 30);
    },
    async stop() { running = false; if (timer) clearInterval(timer); timer = null; },
    async destroy() { await this.stop(); generation++; },
    getDiagnostics() {
      return { mock: true, videoWidth: null, videoHeight: null, requestedConstraints: null,
        framesProcessed: frames, estimatedFps: running ? 30 : null, modelVersion: null, packageVersion: null };
    }
  };
}
