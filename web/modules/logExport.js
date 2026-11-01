// 기록 내보내기 — C 소유. samples.csv · events.csv · session.json (공통 스크립트 25절 규격).
import { SAMPLE_KEYS, EVENT_KEYS } from './contracts.js';
import { APP_VERSION } from './config.js';

const SAMPLE_COLUMNS = ['contractVersion', 'source', 'documentId', 'sessionId', 'pageId', 'segmentId', 'seq', 'tMs', 'valid',
  'leftIrisX', 'rightIrisX', 'leftIrisY', 'rightIrisY', 'leftEar', 'rightEar', 'headMotion', 'invalidReason'];
const EVENT_COLUMNS = ['contractVersion', 'documentId', 'sessionId', 'eventId', 'pageId', 'segmentId', 'tMs', 'type', 'amplitudeX', 'durationMs', 'detectorVersion'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c])).join(','));
  return [head, ...body].join('\n') + '\n';
}

export function samplesCsv(samples) { return toCsv(samples, SAMPLE_COLUMNS); }
export function eventsCsv(events) { return toCsv(events, EVENT_COLUMNS); }

export function sessionJson({ snapshot, detectorConfig, blinkConfig, cameraDiagnostics, detectorDiagnostics, mode }) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    runtime: 'web',
    origin: location.origin,
    mode, // 'real' | 'mock' | 'fixture'
    contractVersion: snapshot.contractVersion,
    detectorVersion: detectorConfig.detectorVersion,
    scorePolicyVersion: snapshot.configSnapshot.scorePolicyVersion,
    validationLevel: snapshot.configSnapshot.validationLevel,
    documentId: snapshot.documentId,
    sessionId: snapshot.sessionId,
    startedAt: snapshot.startedAt,
    cameraDiagnostics, detectorDiagnostics,
    configSnapshot: snapshot.configSnapshot,
    detectorConfig, blinkConfig,
    judgement: { rule: true, model: snapshot.configSnapshot.modelRuntimeEnabled },
    pages: snapshot.pages,
    segments: snapshot.segments,
    signatureMethod: snapshot.signatureMethod,
    signatureImageSha256: snapshot.signatureImageSha256,
    seal: snapshot.seal
  }, null, 2);
}

export function download(filename, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { SAMPLE_COLUMNS, EVENT_COLUMNS, SAMPLE_KEYS, EVENT_KEYS };
