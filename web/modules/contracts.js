// 공통 계약 상수 — C 소유. 바꾸려면 docs/decisions.md에 공통 변경 제안.
export const CONTRACT_VERSION = 'gazegate-contract/1.1.0';

export const INVALID_REASONS = Object.freeze([
  'no_face',
  'multiple_faces',
  'eye_unreliable',
  'head_motion',
  'timestamp_error'
]);

export const EVENT_TYPES = Object.freeze({
  RETURN_SWEEP_CANDIDATE: 'return_sweep_candidate'
});

export const PAGE_STATUS = Object.freeze({
  UNSUPPORTED: 'unsupported',
  UNMEASURED: 'unmeasured',
  INSUFFICIENT_QUALITY: 'insufficient_quality',
  PASSED: 'passed',
  NOT_PASSED: 'not_passed'
});

export const REASON_CODES = Object.freeze({
  UNSUPPORTED_PAGE: 'unsupported_page',
  INSUFFICIENT_MEASUREMENT: 'insufficient_measurement',
  INSUFFICIENT_QUALITY: 'insufficient_quality',
  SCORE_BELOW_THRESHOLD: 'score_below_threshold',
  NO_READING_EVENTS: 'no_reading_events' // 1.1.0 추가: 유효 시간은 충분한데 사건 0개
});

export const UNSUPPORTED_REASONS = Object.freeze([
  'no_text',
  'unsupported_layout',
  'line_count_failed'
]);

export const SEGMENT_END_REASONS = Object.freeze([
  'page_change',
  'manual_stop',
  'tab_hidden',
  'window_resize',
  'camera_restart',
  'camera_lost',
  'sign_requested',
  'document_closed'
]);

// Sample의 키 순서. samples.csv 열 순서와 같다 (앞에 documentId·pageId·segmentId가 붙음).
export const SAMPLE_KEYS = Object.freeze([
  'contractVersion', 'source', 'sessionId', 'seq', 'tMs', 'valid',
  'leftIrisX', 'rightIrisX', 'leftIrisY', 'rightIrisY',
  'leftEar', 'rightEar', 'headMotion', 'invalidReason'
]);

export const EVENT_KEYS = Object.freeze([
  'contractVersion', 'sessionId', 'eventId', 'pageId', 'segmentId',
  'tMs', 'type', 'amplitudeX', 'durationMs', 'detectorVersion'
]);

/** Sample이 계약 형식인지 검사. 문제 목록을 반환(빈 배열이면 정상). */
export function validateSample(s) {
  const problems = [];
  if (!s || typeof s !== 'object') return ['not_an_object'];
  for (const k of SAMPLE_KEYS) if (!(k in s)) problems.push(`missing:${k}`);
  if (s.contractVersion !== CONTRACT_VERSION) problems.push('contract_version_mismatch');
  if (!Number.isInteger(s.seq) || s.seq < 0) problems.push('seq');
  if (!Number.isFinite(s.tMs) || s.tMs < 0) problems.push('tMs');
  if (typeof s.valid !== 'boolean') problems.push('valid');
  for (const k of ['leftIrisX', 'rightIrisX', 'leftIrisY', 'rightIrisY', 'leftEar', 'rightEar', 'headMotion']) {
    const v = s[k];
    if (v !== null && !Number.isFinite(v)) problems.push(`nonfinite:${k}`);
  }
  if (s.valid) {
    if (s.leftIrisX === null || s.rightIrisX === null) problems.push('valid_but_null_x');
    if (s.invalidReason !== null) problems.push('valid_but_reason');
  } else {
    if (typeof s.invalidReason !== 'string' || !INVALID_REASONS.includes(s.invalidReason)) problems.push('invalid_reason');
  }
  return problems;
}

/** MovementEvent 형식 검사. */
export function validateEvent(e) {
  const problems = [];
  if (!e || typeof e !== 'object') return ['not_an_object'];
  for (const k of EVENT_KEYS) if (!(k in e)) problems.push(`missing:${k}`);
  if (e.contractVersion !== CONTRACT_VERSION) problems.push('contract_version_mismatch');
  if (typeof e.eventId !== 'string' || !e.eventId) problems.push('eventId');
  if (!Number.isInteger(e.pageId) || e.pageId < 1) problems.push('pageId');
  if (!Number.isFinite(e.tMs) || e.tMs < 0) problems.push('tMs');
  if (e.type !== EVENT_TYPES.RETURN_SWEEP_CANDIDATE) problems.push('type');
  if (!Number.isFinite(e.amplitudeX) || e.amplitudeX <= 0) problems.push('amplitudeX');
  if (!Number.isFinite(e.durationMs) || e.durationMs <= 0) problems.push('durationMs');
  return problems;
}
