// 세션 상태의 유일한 보관소 — C 소유.
// 시간 누적·사건 중복 방지·canSign 규칙은 공통 스크립트 17·18절을 따른다.
import { validateSample, validateEvent } from './contracts.js';
import { evaluatePage } from './pageScoring.js';

export function createSessionStore({ documentId, sessionId, pageCount, config }) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('pageCount must be a positive integer');

  const pages = new Map();          // pageId -> PageState (+ 내부 필드)
  const seenEventIds = new Set();
  const samples = [];               // 로그용 (documentId·pageId·segmentId 포함)
  const events = [];
  const segments = [];              // {segmentId, pageId, startMs, endMs, reason}
  let current = null;               // {pageId, segmentId, lastSample}
  let consent = false;
  let signature = null;             // {method:'drawn'|'uploaded', pngDataUrl, sha256}
  let seal = null;                  // sealPayload (발급 후)
  const startedAt = new Date().toISOString();

  function newPageState(pageId) {
    return {
      pageId, lineCount: null, supported: false, unsupportedReason: null,
      acceptedEventCount: 0, activeMs: 0, validMs: 0,
      blinkCount: null, earSum: 0, earN: 0
    };
  }

  function registerPage({ pageId, lineCount, supported, unsupportedReason = null }) {
    if (!Number.isInteger(pageId) || pageId < 1 || pageId > pageCount) throw new Error(`pageId out of range: ${pageId}`);
    const p = pages.get(pageId) ?? newPageState(pageId);
    p.lineCount = lineCount;
    p.supported = supported;
    p.unsupportedReason = unsupportedReason;
    pages.set(pageId, p); // 재등록해도 사건·시간은 유지
  }

  function beginSegment({ pageId, segmentId, tMs }) {
    if (!pages.has(pageId)) throw new Error(`page not registered: ${pageId}`);
    if (current) endSegment({ tMs, reason: 'page_change' });
    current = { pageId, segmentId, lastSample: null, startMs: tMs };
    segments.push({ segmentId, pageId, startMs: tMs, endMs: null, reason: null });
  }

  function endSegment({ tMs, reason }) {
    if (!current) return;
    const seg = segments.find((s) => s.segmentId === current.segmentId);
    if (seg) { seg.endMs = tMs; seg.reason = reason; }
    current = null;
  }

  /** C가 현재 구간의 입력으로 채택한 샘플만 넣는다. 시간 누적은 여기서만. */
  function acceptSample({ sample, pageId, segmentId }) {
    const problems = validateSample(sample);
    if (problems.length) return { accepted: false, reason: `invalid_sample:${problems.join(',')}` };
    if (!current || current.pageId !== pageId || current.segmentId !== segmentId) {
      return { accepted: false, reason: 'not_current_segment' };
    }
    const p = pages.get(pageId);
    const prev = current.lastSample;
    if (prev) {
      const dt = sample.tMs - prev.tMs;
      if (dt > 0 && dt <= config.maxFrameGapMs) {
        p.activeMs += dt;
        if (prev.valid && sample.valid) p.validMs += dt;
      } else {
        // 공백·역행: 누적하지 않고 이력을 끊는다 (lastSample 교체만)
      }
    }
    if (sample.leftEar !== null && sample.rightEar !== null) {
      p.earSum += (sample.leftEar + sample.rightEar) / 2;
      p.earN += 1;
    }
    current.lastSample = sample;
    samples.push({ documentId, pageId, segmentId, ...sample });
    return { accepted: true };
  }

  /** 현재 문맥과 다른 사건·중복 eventId는 거절. */
  function acceptEvents(list) {
    const result = { accepted: 0, rejected: [] };
    for (const e of list ?? []) {
      const problems = validateEvent(e);
      if (problems.length) { result.rejected.push({ eventId: e?.eventId, reason: problems.join(',') }); continue; }
      if (e.sessionId !== sessionId) { result.rejected.push({ eventId: e.eventId, reason: 'session_mismatch' }); continue; }
      if (!current || e.pageId !== current.pageId || e.segmentId !== current.segmentId) {
        result.rejected.push({ eventId: e.eventId, reason: 'not_current_segment' }); continue;
      }
      if (seenEventIds.has(e.eventId)) { result.rejected.push({ eventId: e.eventId, reason: 'duplicate' }); continue; }
      seenEventIds.add(e.eventId);
      pages.get(e.pageId).acceptedEventCount += 1;
      events.push({ documentId, ...e });
      result.accepted += 1;
    }
    return result;
  }

  function getPage(pageId) {
    const p = pages.get(pageId);
    if (!p) return null;
    const state = { pageId: p.pageId, lineCount: p.lineCount, supported: p.supported,
      acceptedEventCount: p.acceptedEventCount, activeMs: p.activeMs, validMs: p.validMs };
    return {
      ...state,
      unsupportedReason: p.unsupportedReason,
      blinkCount: p.blinkCount,
      meanEar: p.earN > 0 ? p.earSum / p.earN : null,
      evaluation: evaluatePage(state, config)
    };
  }

  function canSign() {
    if (pages.size !== pageCount) return false;
    for (let id = 1; id <= pageCount; id++) {
      const p = getPage(id);
      if (!p || !p.evaluation.passed) return false;
    }
    return true;
  }

  function setConsent(v) { consent = Boolean(v); }
  function setSignature(sig) { signature = sig ? { ...sig } : null; }
  function setSeal(payload) { seal = payload ? structuredClone(payload) : null; }
  function isComplete() { return canSign() && consent && !!signature; }

  function getSnapshot() {
    return structuredClone({
      documentId, sessionId, pageCount, startedAt,
      contractVersion: config.contractVersion,
      configSnapshot: config,
      currentPageId: current?.pageId ?? null,
      currentSegmentId: current?.segmentId ?? null,
      pages: Array.from({ length: pageCount }, (_, i) => getPage(i + 1)),
      segments,
      consent,
      signatureMethod: signature?.method ?? null,
      signatureImageSha256: signature?.sha256 ?? null,
      seal,
      canSign: canSign(),
      counts: { samples: samples.length, events: events.length }
    });
  }

  function getLogs() { return { samples: samples.slice(), events: events.slice() }; }

  return {
    registerPage, beginSegment, endSegment, acceptSample, acceptEvents,
    getPage, getSnapshot, canSign,
    setConsent, setSignature, setSeal, isComplete, getLogs,
    getSignature: () => (signature ? { ...signature } : null)
  };
}
