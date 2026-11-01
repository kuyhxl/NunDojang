// ⚠️ MOCK — A(박민서)가 실제 줄바꿈 후보 검출기로 교체한다.
// 계약: createMovementDetector({config}) → {push({sample,pageId,segmentId}) → MovementEvent[], reset(), getDiagnostics()}
// 규칙: 설정값이 null이면 사건을 내지 않고 diagnostics.configured=false. 무효 샘플·segment 변경·시간 역행·큰 공백에서 이력을 끊는다.
import { CONTRACT_VERSION, EVENT_TYPES } from './contracts.js';
import { missingDetectorKeys } from './config.js';

export const IS_MOCK = true;

export function createMovementDetector({ config }) {
  const missing = missingDetectorKeys(config);
  let eventCounter = 0;
  let lastSegmentId = null;
  let lastT = null;
  let lastEmitT = -Infinity;
  const sessionIds = new Set();

  function newEventId(sessionId) { return `${sessionId}:event:${++eventCounter}`; }

  return {
    push({ sample, pageId, segmentId }) {
      sessionIds.add(sample.sessionId);
      if (missing.length) return []; // 검출 기준 미설정
      // 이력 끊기
      if (!sample.valid || segmentId !== lastSegmentId || (lastT !== null && (sample.tMs <= lastT || sample.tMs - lastT > config.maxFrameGapMs))) {
        lastSegmentId = segmentId; lastT = sample.tMs; return [];
      }
      lastT = sample.tMs;
      // MOCK 규칙: refractoryMs마다 한 번씩 가짜 사건 (실제 검출 아님)
      if (sample.tMs - lastEmitT >= config.refractoryMs) {
        lastEmitT = sample.tMs;
        return [{
          contractVersion: CONTRACT_VERSION,
          sessionId: sample.sessionId,
          eventId: newEventId(sample.sessionId),
          pageId, segmentId,
          tMs: sample.tMs,
          type: EVENT_TYPES.RETURN_SWEEP_CANDIDATE,
          amplitudeX: config.minAmplitudeX,
          durationMs: config.minDurationMs,
          detectorVersion: `${config.detectorVersion}+mock`
        }];
      }
      return [];
    },
    reset() { lastSegmentId = null; lastT = null; lastEmitT = -Infinity; },
    getDiagnostics() { return { mock: true, configured: missing.length === 0, missingKeys: missing, eventsEmitted: eventCounter }; }
  };
}
