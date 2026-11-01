import { DEFAULT_CONFIG } from '../modules/config.js';
import { CONTRACT_VERSION } from '../modules/contracts.js';
import { evaluatePage } from '../modules/pageScoring.js';
import { createSessionStore } from '../modules/sessionStore.js';

const fixtures = await (await fetch('./fixtures.json')).json();
const tbody = document.querySelector('#scoreTable tbody');
for (const c of fixtures.cases) {
  const ev = evaluatePage(c.pageState, DEFAULT_CONFIG);
  const e = c.expect;
  let ok = true;
  if ('rawScore' in e && ev.rawScore !== e.rawScore) ok = false;
  if ('passed' in e && ev.passed !== e.passed) ok = false;
  if ('status' in e && ev.status !== e.status) ok = false;
  if (e.reasonIncludes && !e.reasonIncludes.every((r) => ev.reasonCodes.includes(r))) ok = false;
  if (e.reasonExcludes && e.reasonExcludes.some((r) => ev.reasonCodes.includes(r))) ok = false;
  tbody.insertAdjacentHTML('beforeend', `<tr><td>${c.id}</td><td>${c.name}</td><td>${ev.rawScore}</td><td>${ev.status}</td><td>${ev.passed}</td><td>${ev.reasonCodes.join(', ')}</td><td class="${ok ? 'ok' : 'ng'}">${ok ? 'OK' : 'FAIL'}</td></tr>`);
}

// sessionStore 규칙 (27절 2, 5, 6, 8)
const ul = document.getElementById('storeChecks');
const check = (name, cond) => ul.insertAdjacentHTML('beforeend', `<li class="${cond ? 'ok' : 'ng'}">${cond ? 'OK' : 'FAIL'} — ${name}</li>`);

const store = createSessionStore({ documentId: 'doc-fx', sessionId: 'sess-fx', pageCount: 2, config: DEFAULT_CONFIG });
store.registerPage({ pageId: 1, lineCount: 10, supported: true });
store.beginSegment({ pageId: 1, segmentId: 'seg-1', tMs: 0 });
const sample = (seq, tMs, valid = true) => ({ contractVersion: CONTRACT_VERSION, source: 'fixture', sessionId: 'sess-fx', seq, tMs, valid,
  leftIrisX: valid ? 0.5 : null, rightIrisX: valid ? 0.5 : null, leftIrisY: null, rightIrisY: null, leftEar: 0.3, rightEar: 0.3, headMotion: null, invalidReason: valid ? null : 'no_face' });
for (let i = 0; i <= 300; i++) store.acceptSample({ sample: sample(i, i * 33), pageId: 1, segmentId: 'seg-1' });
const ev = (n, t) => ({ contractVersion: CONTRACT_VERSION, sessionId: 'sess-fx', eventId: `sess-fx:event:${n}`, pageId: 1, segmentId: 'seg-1', tMs: t, type: 'return_sweep_candidate', amplitudeX: 0.1, durationMs: 150, detectorVersion: 'return-sweep/0.1.0' });
store.acceptEvents(Array.from({ length: 8 }, (_, i) => ev(i + 1, (i + 1) * 1000)));
check('8사건 10줄 → 페이지1 통과', store.getPage(1).evaluation.passed === true);
const before = store.getPage(1).acceptedEventCount;
store.acceptEvents([ev(1, 1000)]);
check('같은 eventId 재전송 → 사건 수 불변', store.getPage(1).acceptedEventCount === before);
check('페이지 2 미등록 → canSign false', store.canSign() === false);
store.endSegment({ tMs: 10000, reason: 'page_change' });
const r = store.acceptEvents([ev(99, 10500)]);
check('구간 닫힌 뒤 사건 → 거절', r.accepted === 0 && r.rejected[0].reason === 'not_current_segment');
store.registerPage({ pageId: 2, lineCount: 10, supported: true });
store.beginSegment({ pageId: 2, segmentId: 'seg-2', tMs: 11000 });
check('페이지2 미달 → canSign false', store.canSign() === false);
const snap = store.getSnapshot();
check('snapshot은 JSON 직렬화 가능', typeof JSON.stringify(snap) === 'string');
