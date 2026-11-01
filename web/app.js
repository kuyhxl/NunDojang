// 앱 진입점 — C 소유. 문서·페이지·세그먼트 관리, 측정 연결, 점수·서명·봉인·내보내기.
// 뼈대 상태: PDF 열기·페이지 이동·mock 측정 연결·점수 표시·서명·로그 내보내기까지 동작. 봉인 PDF 삽입은 단계 5.
import { DEFAULT_CONFIG, DETECTOR_CONFIG, BLINK_CONFIG, APP_VERSION, resolveAssetUrls, missingDetectorKeys } from './modules/config.js';
import { PAGE_STATUS, SEGMENT_END_REASONS } from './modules/contracts.js';
import { createEyeTracker, IS_MOCK as TRACKER_MOCK } from './modules/eyeTracker.js';
import { createMovementDetector, IS_MOCK as DETECTOR_MOCK } from './modules/movementDetector.js';
import { createPdfManager } from './modules/pdfManager.js';
import { createSessionStore } from './modules/sessionStore.js';
import { createSignaturePad, imageFileToPngDataUrl, sha256OfDataUrl } from './modules/signature.js';
import { issueSeal } from './modules/sealExport.js';
import { samplesCsv, eventsCsv, sessionJson, download } from './modules/logExport.js';
import { formatScore } from './modules/pageScoring.js';
import { createEyeGlass } from './modules/eyeGlass.js';

const $ = (id) => document.getElementById(id);
const config = DEFAULT_CONFIG;
const urls = resolveAssetUrls(config);
const MODE = (TRACKER_MOCK || DETECTOR_MOCK) ? 'mock' : 'real';

// ---------- 상태 ----------
let pdf = null;            // PdfManager
let store = null;          // SessionStore
let tracker = null;        // EyeTracker
let detector = null;       // MovementDetector
let pageCount = 0;
let currentPage = 0;
let sessionT0 = 0;
let segmentCounter = 0;
let measuring = false;     // 사용자가 측정을 켠 상태
let segmentOpen = false;   // 현재 페이지에 열린 구간이 있는가
let segmentStartMs = 0;
let currentDocName = '';
let currentFile = null;
let sigPad = null;
let signaturePng = null, signatureMethod = null;
const graph = { iris: [], ear: [], max: 300 };
const eyeGlass = createEyeGlass($('eyeGlass'));
if (DETECTOR_CONFIG.directionSign !== null) eyeGlass.setDirectionSign(DETECTOR_CONFIG.directionSign);

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nowMs = () => performance.now() - sessionT0;

// ---------- 초기화 ----------
$('appVersion').textContent = APP_VERSION;
function setModeBadge(hasDoc) { $('modeBadge').textContent = hasDoc ? MODE.toUpperCase() : '대기 중'; $('modeBadge').className = hasDoc && MODE === 'real' ? 'is-real' : ''; }
setModeBadge(false);
if (missingDetectorKeys(DETECTOR_CONFIG).length === 0) $('detectorNote').hidden = true;

(async () => {
  try {
    pdf = await createPdfManager({ canvasElement: $('pdfCanvas'), config });
  } catch (e) {
    setMsg('viewerMsg', e.message, 'bad');
  }
})();

// ---------- PDF ----------
async function openPdfFile(file) {
  if (!file || !pdf) return;
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setMsg('viewerMsg', 'PDF 파일만 열 수 있습니다.', 'bad'); return; }
  await closeDocument();
  try {
    const { pageCount: n } = await pdf.open(file);
    pageCount = n; currentFile = file; currentDocName = file.name;
    $('paneLabel').textContent = file.name.replace(/\.pdf$/i, '');
    $('docName').textContent = `${n}쪽`;
    $('searchInput').disabled = false;
    searchCache = null;
    store = createSessionStore({ documentId: uid('doc'), sessionId: uid('session'), pageCount: n, config });
    sessionT0 = performance.now(); segmentCounter = 0;
    detector = createMovementDetector({ config: DETECTOR_CONFIG });
    resetSignature();
    $('camStartBtn').disabled = false;
    await goToPage(1);
    setMsg('viewerMsg', '', '');
    document.body.classList.remove('is-empty');
    setModeBadge(true);
  } catch (err) {
    setMsg('viewerMsg', err.message, 'bad');
  }
}
for (const id of ['pdfInput', 'pdfInput2']) {
  $(id).addEventListener('change', async (e) => { await openPdfFile(e.target.files?.[0]); e.target.value = ''; });
}
// 드래그앤드롭 (드롭 영역 + 문서 패널)
for (const el of [$('dropZone'), document.querySelector('.pane')]) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); $('dropZone').classList.add('is-over'); });
  el.addEventListener('dragleave', () => $('dropZone').classList.remove('is-over'));
  el.addEventListener('drop', async (e) => { e.preventDefault(); $('dropZone').classList.remove('is-over'); await openPdfFile(e.dataTransfer?.files?.[0]); });
}

$('prevBtn').addEventListener('click', () => goToPage(currentPage - 1));
$('nextBtn').addEventListener('click', () => goToPage(currentPage + 1));

async function goToPage(pageId) {
  if (!store || pageId < 1 || pageId > pageCount) return;
  // 15절 순서: 구간 닫기 → detector.reset → 렌더·줄 수 → settle → 새 구간
  endSegment('page_change');
  detector?.reset();
  currentPage = pageId;
  const info = await pdf.renderPage(pageId);
  if (!info) return; // 늦은 렌더
  store.registerPage({ pageId: info.pageId, lineCount: info.lineCount, supported: info.supported, unsupportedReason: info.unsupportedReason });
  eyeGlass.setLines(info.lineBoxes ?? []);
  $('prevBtn').disabled = pageId <= 1; $('nextBtn').disabled = pageId >= pageCount;
  $('pageLabel').textContent = `페이지 ${pageId}/${pageCount}`;
  updateProgress();
  renderPanel();
  await sleep(config.pageSettleMs);
  if (measuring && info.supported && !document.hidden) beginSegment();
}

async function closeDocument() {
  endSegment('document_closed');
  if (tracker) { await tracker.stop(); }
  measuring = false; segmentOpen = false; currentPage = 0; pageCount = 0; store = null; currentFile = null;
  if (pdf) await pdf.close();
  $('pageList').innerHTML = '<li class="placeholder">아직 연 문서가 없습니다</li>'; $('pageLabel').textContent = '페이지 –/–'; $('paneLabel').textContent = '문서 없음'; $('docName').textContent = '–'; $('progressDot').style.left = '0%'; $('navPages').textContent = '페이지 –/–'; $('navScore').textContent = '점수 –';
  $('pageScore').textContent = '–'; $('pageStatus').textContent = 'PDF를 열면 측정이 시작됩니다'; $('pageStatus').className = 'status';
  for (const id of ['lineCount', 'eventCount', 'validTime']) $(id).textContent = '–';
  $('searchInput').disabled = true; $('searchInput').value = '';
  document.body.classList.add('is-empty'); document.body.classList.remove('is-live'); setModeBadge(false);
  $('signRequestBtn').disabled = true; $('sealBtn').disabled = true; $('signArea').hidden = true;
  updateCamBadge(false);
}

// ---------- 구간 ----------
function beginSegment() {
  if (!store || segmentOpen) return;
  const segmentId = `seg-${++segmentCounter}`;
  segmentStartMs = nowMs();
  store.beginSegment({ pageId: currentPage, segmentId, tMs: segmentStartMs });
  segmentOpen = true;
}
function endSegment(reason) {
  if (!store || !segmentOpen) return;
  if (!SEGMENT_END_REASONS.includes(reason)) reason = 'manual_stop';
  store.endSegment({ tMs: nowMs(), reason });
  segmentOpen = false;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { endSegment('tab_hidden'); setMsg('viewerMsg', '탭이 숨겨져 측정을 일시정지했습니다. "측정 재개"를 누르세요.', 'warn'); measuring = false; updateMeasureBtn(); } });
window.addEventListener('resize', () => { if (segmentOpen) { endSegment('window_resize'); measuring = false; updateMeasureBtn(); setMsg('viewerMsg', '창 크기가 바뀌어 측정을 일시정지했습니다.', 'warn'); } });

// ---------- 카메라·측정 ----------
$('camStartBtn').addEventListener('click', async () => {
  if (!store) return;
  if (!window.isSecureContext || !navigator.mediaDevices) { setMsg('viewerMsg', '카메라를 쓸 수 없는 환경입니다 (localhost 또는 HTTPS에서 여세요).', 'bad'); return; }
  try {
    if (!tracker) {
      tracker = await createEyeTracker({
        videoElement: $('camPreview'), wasmBaseUrl: urls.wasmBaseUrl, modelAssetUrl: urls.modelAssetUrl,
        onSample: handleSample,
        onError: (err) => setMsg('viewerMsg', `측정 오류: ${err.message}`, err.recoverable ? 'warn' : 'bad')
      });
    }
    await tracker.start({ sessionId: store.getSnapshot().sessionId, sessionT0 });
    measuring = true; updateCamBadge(true); updateMeasureBtn();
    $('camStopBtn').disabled = false; $('measureToggleBtn').disabled = false;
    const info = store.getPage(currentPage);
    if (info?.supported) beginSegment();
  } catch (err) {
    setMsg('viewerMsg', `카메라 시작 실패: ${err.message}`, 'bad');
  }
});
$('camStopBtn').addEventListener('click', async () => {
  endSegment('manual_stop'); measuring = false;
  if (tracker) await tracker.stop();
  updateCamBadge(false); updateMeasureBtn();
});
$('measureToggleBtn').addEventListener('click', () => {
  if (measuring) { endSegment('manual_stop'); measuring = false; }
  else { measuring = true; if (store?.getPage(currentPage)?.supported && !document.hidden) beginSegment(); }
  updateMeasureBtn();
});
function updateMeasureBtn() { $('measureToggleBtn').textContent = measuring ? '측정 일시정지' : '측정 재개'; }
function updateCamBadge(on) { $('camBadge').innerHTML = `<span class="dot" aria-hidden="true"></span>${on ? '카메라 켜짐' : '카메라 꺼짐'}`; $('camBadge').className = on ? 'is-on' : ''; document.body.classList.toggle('is-live', on); if (!on) eyeGlass.idle(); }

function handleSample(sample) {
  pushGraph(sample);
  eyeGlass.update(sample);
  if (!store || !segmentOpen) return;
  if (sample.tMs < segmentStartMs) return; // 구간 시작 전 프레임은 버림
  const segmentId = `seg-${segmentCounter}`;
  store.acceptSample({ sample, pageId: currentPage, segmentId });
  const events = detector.push({ sample, pageId: currentPage, segmentId });
  if (events.length) { const r = store.acceptEvents(events); if (r.accepted) eyeGlass.advance(r.accepted); }
  throttledRender();
}

// ---------- 검색 (페이지 단위) ----------
let searchCache = null; // [pageText...]
async function buildSearchCache() {
  if (searchCache || !pdf?.getPageText) return;
  searchCache = [];
  for (let i = 1; i <= pageCount; i++) searchCache.push((await pdf.getPageText(i)).toLowerCase());
}
$('searchInput').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || !store) return;
  const q = e.target.value.trim().toLowerCase(); if (!q) return;
  await buildSearchCache();
  if (!searchCache) return;
  for (let k = 1; k <= pageCount; k++) {
    const p = ((currentPage + k - 1) % pageCount) + 1;
    if (searchCache[p - 1].includes(q)) { await goToPage(p); setMsg('viewerMsg', `${p}쪽에서 "${e.target.value.trim()}" 찾음`, ''); return; }
  }
  setMsg('viewerMsg', `"${e.target.value.trim()}"을(를) 찾지 못했습니다`, '');
});
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !$('searchInput').disabled) { e.preventDefault(); $('searchInput').focus(); } });

// ---------- 진행선: 문서 전체 대비 현재 위치 (페이지 + 페이지 안 스크롤) ----------
function updateProgress() {
  if (!pageCount) { $('progressDot').style.left = '0%'; return; }
  const frame = $('pdfCanvas').parentElement;
  const rect = frame.getBoundingClientRect();
  const visible = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / Math.max(rect.height, 1)));
  const inPage = pageCount === 1 ? visible : visible; // 페이지 안 스크롤 비율
  const pct = ((currentPage - 1) + inPage) / pageCount * 100;
  $('progressDot').style.left = `${Math.min(100, Math.max(0, pct)).toFixed(2)}%`;
}
window.addEventListener('scroll', () => requestAnimationFrame(updateProgress), { passive: true });

// ---------- 화면 ----------
let renderPending = false;
function throttledRender() { if (renderPending) return; renderPending = true; requestAnimationFrame(() => { renderPending = false; renderPanel(); }); }

function renderPanel() {
  if (!store) return;
  const p = store.getPage(currentPage);
  if (!p) return;
  const ev = p.evaluation;
  $('lineCount').textContent = p.lineCount ?? `– (${p.unsupportedReason ?? '미지원'})`;
  $('eventCount').textContent = p.acceptedEventCount;
  $('pageScore').textContent = formatScore(ev);
  $('validTime').textContent = `${(p.validMs / 1000).toFixed(1)}s / ${(p.activeMs / 1000).toFixed(1)}s (${Math.round(ev.validRatio * 100)}%)`;
  $('blinkCount').textContent = p.blinkCount ?? '미설정';
  $('pageStatus').textContent = statusText(ev);
  $('pageStatus').className = `st-${ev.status}`;

  const snap = store.getSnapshot();
  $('pageList').innerHTML = snap.pages.map((pg) => {
    const e = pg.evaluation;
    return `<li class="st-${e.status} ${pg.pageId === currentPage ? 'current' : ''}" title="${statusText(e)}"><span>${pg.pageId}쪽 · ${statusText(e)}</span><span class="num">${formatScore(e)}</span></li>`;
  }).join('');
  $('signRequestBtn').disabled = !snap.canSign;
  $('navSignBtn').disabled = !snap.canSign;
  $('navPages').textContent = `페이지 ${currentPage}/${pageCount}`;
  $('navScore').textContent = `점수 ${formatScore(ev)}`;
}

function statusText(ev) {
  switch (ev.status) {
    case PAGE_STATUS.PASSED: return '페이지 기준 충족';
    case PAGE_STATUS.UNSUPPORTED: return '이 페이지는 현재 버전에서 처리할 수 없습니다';
    case PAGE_STATUS.UNMEASURED: return '미측정';
    case PAGE_STATUS.INSUFFICIENT_QUALITY: return '측정 품질·시간 부족';
    default: return ev.reasonCodes.includes('no_reading_events') ? '줄바꿈 후보 사건 없음' : '기준 미달';
  }
}

function pushGraph(s) {
  const x = s.valid ? (s.leftIrisX + s.rightIrisX) / 2 : null;
  const ear = s.leftEar !== null && s.rightEar !== null ? (s.leftEar + s.rightEar) / 2 : null;
  graph.iris.push(x); graph.ear.push(ear);
  if (graph.iris.length > graph.max) { graph.iris.shift(); graph.ear.shift(); }
  drawSeries($('irisGraph'), graph.iris, 0, 1, '#ededed');
  drawSeries($('earGraph'), graph.ear, 0, 0.5, '#686868');
}
function drawSeries(canvas, data, lo, hi, color) {
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  let pen = false;
  data.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    const x = (i / graph.max) * W, y = H - ((v - lo) / (hi - lo)) * H;
    if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ---------- 서명 ----------
sigPad = createSignaturePad($('sigPad'));
const openSign = () => {
  endSegment('sign_requested'); measuring = false; updateMeasureBtn();
  renderPanel();
  if (!store.canSign()) { setMsg('signMsg', '기준 미달 페이지가 있어 서명을 열 수 없습니다.', 'warn'); return; }
  $('signArea').hidden = false; setMsg('signMsg', '', '');
  $('signArea').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('signRequestBtn').addEventListener('click', openSign);
$('navSignBtn').addEventListener('click', openSign);
$('consentChk').addEventListener('change', updateSignComplete);
$('sigClearBtn').addEventListener('click', () => { sigPad.clear(); signaturePng = null; signatureMethod = null; updateSignComplete(); });
$('sigPad').addEventListener('mouseup', () => { if (!sigPad.isEmpty()) { signaturePng = sigPad.toPngDataUrl(); signatureMethod = 'drawn'; } updateSignComplete(); });
$('sigUpload').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  try { signaturePng = await imageFileToPngDataUrl(f); signatureMethod = 'uploaded'; setMsg('signMsg', `이미지 서명 준비: ${f.name}`, ''); }
  catch (err) { setMsg('signMsg', err.message, 'bad'); }
  updateSignComplete(); e.target.value = '';
});
function updateSignComplete() { $('signCompleteBtn').disabled = !($('consentChk').checked && signaturePng); }
$('signCompleteBtn').addEventListener('click', async () => {
  if (!store.canSign()) { setMsg('signMsg', '점수 상태가 더 이상 충족되지 않아 확정할 수 없습니다.', 'bad'); return; }
  store.setConsent(true);
  store.setSignature({ method: signatureMethod, pngDataUrl: signaturePng, sha256: await sha256OfDataUrl(signaturePng) });
  setMsg('signMsg', '서명 완료. 봉인을 발급할 수 있습니다.', 'good');
  $('sealBtn').disabled = false;
});
function resetSignature() { signaturePng = null; signatureMethod = null; sigPad.clear(); $('consentChk').checked = false; $('signArea').hidden = true; setMsg('signMsg', '', ''); setMsg('sealMsg', '', ''); $('sealBtn').disabled = true; }

// ---------- 봉인 ----------
$('sealBtn').addEventListener('click', async () => {
  try {
    const sig = store.getSignature();
    const r = await issueSeal({ pdfFile: currentFile, snapshot: store.getSnapshot(), signaturePng: sig.pngDataUrl,
      signatureMethod: sig.method, signatureImageSha256: sig.sha256, appVersion: APP_VERSION, config });
    store.setSeal(r.sealPayload);
    if (r.sealedPdfBlob) {
      download(`${currentDocName.replace(/\.pdf$/i, '')}.gazegate-${r.sealId}.pdf`, r.sealedPdfBlob, 'application/pdf');
      setMsg('sealMsg', `봉인 발급됨 · ${r.sealId} · ${r.issuedAt}`, 'good');
      $('sealBtn').closest('.left-section').classList.add('is-issued');
    } else {
      setMsg('sealMsg', `봉인 ID ${r.sealId} 생성 (PDF 스탬프 삽입은 단계 5에서 구현 예정 — 지금은 session.json에만 기록)`, 'warn');
      $('sealBtn').closest('.left-section').classList.add('is-issued');
    }
    download(`session-${r.sealId}.json`, buildSessionJson());
    $('sealBtn').disabled = true;
  } catch (err) { setMsg('sealMsg', err.message, 'bad'); }
});

// ---------- 내보내기 ----------
function buildSessionJson() {
  return sessionJson({ snapshot: store.getSnapshot(), detectorConfig: DETECTOR_CONFIG, blinkConfig: BLINK_CONFIG,
    cameraDiagnostics: tracker?.getDiagnostics() ?? null, detectorDiagnostics: detector?.getDiagnostics() ?? null, mode: MODE });
}
$('dlSamplesBtn').addEventListener('click', () => store && download('samples.csv', samplesCsv(store.getLogs().samples), 'text/csv'));
$('dlEventsBtn').addEventListener('click', () => store && download('events.csv', eventsCsv(store.getLogs().events), 'text/csv'));
$('dlSessionBtn').addEventListener('click', () => store && download(`session-${store.getSnapshot().seal?.sealId ?? store.getSnapshot().sessionId}.json`, buildSessionJson(), 'application/json'));

// ---------- 유틸 ----------
function setMsg(id, text, kind) { const el = $(id); el.textContent = text; const base = id === 'viewerMsg' ? 'pane-msg' : 'note'; el.className = `${base} ${kind || ''}`; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
