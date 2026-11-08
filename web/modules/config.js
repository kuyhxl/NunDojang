// 초기 설정 — C 소유. 숫자는 개발용 초기값이며 연구로 확정된 값이 아님.
import { CONTRACT_VERSION } from './contracts.js';

export const APP_VERSION = 'nundojang/0.1.0-skeleton';

export const DEFAULT_CONFIG = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  scorePolicyVersion: 'count-over-sweeps/0.2.0',   // 점수 = 줄바꿈 후보 / (줄 수 − 1). 0.1.0은 / 줄 수
  sealPolicyVersion: 'seal/0.1.0',
  sealIssuerPrefix: 'GG',
  passThreshold: 80,
  minValidMs: 1000,
  minValidRatio: 0.70,
  maxFrameGapMs: 200,
  pageSettleMs: 500,
  maxDisplayScore: 100,
  modelRuntimeEnabled: false,
  validationLevel: 'pilot',
  viewMode: 'reflow',            // 'reflow' = 13px 한 단 재배치(기본, 11/3 결정) · 'original' = 원본 그대로(비교용)
  reflowFontPath: './vendor/fonts/NotoSansKR-Regular.ttf',  // 재배치 글꼴. demo/13px PDF와 같은 글꼴이라 줄 나눔이 같다
  mediaPipeWasmPath: './vendor/mediapipe/wasm',
  faceModelPath: './models/face_landmarker.task',
  pdfWorkerPath: './vendor/pdfjs/pdf.worker.mjs',
  pdfCMapPath: './vendor/pdfjs/cmaps/',
  pdfStandardFontPath: './vendor/pdfjs/standard_fonts/',
  sealFontPath: './vendor/fonts/NotoSansKR-Regular.ttf'
});

// 사건 검출 설정 — A의 시험값(PR #9 PILOT_CONFIG, return-sweep/0.1.0-pilot2). 개발용 초기값이며 일반 사용자로 검증된 값이 아니다.
// null로 되돌리면 검출기는 사건을 내지 않는다.
export const DETECTOR_CONFIG = Object.freeze({
  detectorVersion: 'return-sweep/0.1.0-pilot2',
  directionSign: -1,
  maxFrameGapMs: DEFAULT_CONFIG.maxFrameGapMs,
  minAmplitudeX: 0.03,
  minDurationMs: 40,
  maxDurationMs: 400,
  refractoryMs: 500,
  smoothingWindowMs: 60
});

// 깜빡임 설정 — null인 동안 깜빡임 횟수는 '미설정'으로 표시.
export const BLINK_CONFIG = Object.freeze({
  blinkVersion: 'ear-blink/0.1.0',
  earClosedThreshold: null,
  minClosedMs: null,
  maxClosedMs: null
});

/**
 * web 루트 기준 상대 경로를 실제 브라우저 URL로 바꾼다.
 * index.html과 dev/*.html 어디서 불러도 같은 자산을 가리킨다.
 */
export function resolveAssetUrls(config = DEFAULT_CONFIG) {
  const webBaseUrl = new URL('../', import.meta.url);
  return {
    webBaseUrl: webBaseUrl.href,
    wasmBaseUrl: new URL(config.mediaPipeWasmPath, webBaseUrl).href,
    modelAssetUrl: new URL(config.faceModelPath, webBaseUrl).href,
    pdfWorkerUrl: new URL(config.pdfWorkerPath, webBaseUrl).href,
    pdfCMapUrl: new URL(config.pdfCMapPath, webBaseUrl).href,
    pdfStandardFontUrl: new URL(config.pdfStandardFontPath, webBaseUrl).href,
    sealFontUrl: new URL(config.sealFontPath, webBaseUrl).href,
    reflowFontUrl: new URL(config.reflowFontPath, webBaseUrl).href,
    pdfjsModuleUrl: new URL('./vendor/pdfjs/pdf.mjs', webBaseUrl).href,
    mediapipeModuleUrl: new URL('./vendor/mediapipe/vision_bundle.mjs', webBaseUrl).href,
    pdfLibModuleUrl: new URL('./vendor/pdf-lib/pdf-lib.esm.min.js', webBaseUrl).href
  };
}

/** 검출 설정의 필수 키 중 null인 것 목록. 비어 있으면 검출 가능. */
export function missingDetectorKeys(detectorConfig = DETECTOR_CONFIG) {
  return ['directionSign', 'minAmplitudeX', 'minDurationMs', 'maxDurationMs', 'refractoryMs']
    .filter((k) => detectorConfig[k] === null || detectorConfig[k] === undefined);
}
