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
    // 가짜 읽기 궤적: 2.4초 동안 왼쪽→오른쪽으로 천천히(톱니), 줄 끝에서 왼쪽으로 급히 되돌아감.
    // 스프링 물방울의 관성(오버슈트)이 보이도록 만든 것이며 실제 측정이 아니다.
    const period = 2400, phase = (tMs % period) / period;
    const jitter = (Math.random() - 0.5) * 0.01;
    const x = 0.36 + phase * 0.28 + jitter;
    // 깜빡임 흉내: 3.7초마다 120ms 동안 EAR 하락
    const blink = (tMs % 3700) < 120;
    const ear = blink ? 0.08 : 0.3;
    onSample({
      contractVersion: CONTRACT_VERSION,
      source: 'mock',
      sessionId,
      seq: seq++,
      tMs,
      valid: true,
      leftIrisX: x, rightIrisX: x + 0.01,
      leftIrisY: null, rightIrisY: null,
      leftEar: ear, rightEar: ear,
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
