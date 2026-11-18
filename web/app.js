// 앱 진입점 — C 소유. 문서·페이지·세그먼트 관리, 측정 연결, 점수·서명·봉인·내보내기.
// 문서 열기·페이지 이동·측정 연결·점수 표시·서명·봉인 PDF 발급·로그 내보내기.
import { DEFAULT_CONFIG, DETECTOR_CONFIG, BLINK_CONFIG, APP_VERSION, resolveAssetUrls, missingDetectorKeys } from './modules/config.js';
import { PAGE_STATUS, SEGMENT_END_REASONS } from './modules/contracts.js';
import { createEyeTracker, IS_MOCK as TRACKER_MOCK } from './modules/eyeTracker.js';
import { createMovementDetector, IS_MOCK as DETECTOR_MOCK } from './modules/movementDetector.js';
import { createPdfManager } from './modules/pdfManager.js';
import { createSessionStore } from './modules/sessionStore.js';
import { createSignaturePad, imageFileToPngDataUrl, sha256OfDataUrl } from './modules/signature.js';
import { issueSeal } from './modules/sealExport.js';
import { samplesCsv, eventsCsv, sessionJson, download } from './modules/logExport.js';
import { formatScore, expectedReturnSweeps, expectedDetectableSweeps, auxScore, AUX_POLICY_VERSION, AUX_WEIGHT_RAMP } from './modules/pageScoring.js';
import { createGazeSweepCounter, sweepOptionsFor, SWEEP_MAX_GAP_MS, SWEEP_WINDOW_MS_WIDE } from './modules/gazeSweep.js';
import { createLineProgress, LINE_PROGRESS_POLICY, passLineIndex, lineProgressScore, LP_MAX_GAP_MS } from './modules/lineProgress.js';
import { X_OBSERVE_POLICY } from './modules/xObserve.js';
import { createPaceWatch } from './modules/pace.js';
import { createEyeGlass } from './modules/eyeGlass.js';
import { createCalibrationOverlay, createLightMeter, DARK_MESSAGE } from './modules/calibrationOverlay.js';
import { poseDrifted, createDarkDetector } from './modules/gazeCalibration.js';
import { createGazeTracker } from './modules/gazeTracker.js';
import { createGazeLog, gazeLogRow } from './modules/gazeLog.js';

const $ = (id) => document.getElementById(id);
// ?reflow=20 · ?reflow=24 → 큰 글자 시험판(개발용). 없으면 기본 13px판.
const urlParams = new URLSearchParams(location.search);
const reflowParam = Number(urlParams.get('reflow'));
// ?ylock=1 → 세로 고정 표시(개발용 시험): 물방울 세로는 지금 줄 밑선에 두고 가로만 시선을 따라간다.
// 줄은 시선 x 줄바꿈(gazeSweep.js)으로 넘긴다. 표시 전용이며 점수에는 영향이 없다.
const yLock = urlParams.has('ylock');
// ?yfix=1 → y로 줄 번호 바로잡기. 켜지 말 것 — 측정해 보고 폐기했다.
// 세로 이득이 0.53이고 보정 후에도 오차가 ±2.1줄(줄 간격의 두 배)이라 y로는 줄을 지목할 수 없다.
// 켜면 더 나쁜 추정이 x 줄바꿈을 덮어써 읽은 줄이 7% 줄어든다 (docs/comprehension_evidence.md 9-6).
const yFix = urlParams.has('yfix');
// ?validtime=1 → 시간 조건을 벽시계가 아니라 유효 시간으로 센다 (개발용 시험, 팀 합의 전).
// 왜: 지금은 추적이 끊긴 시간도 읽은 시간으로 계산돼, 줄 인정의 시간 조건이 공짜로 통과한다.
//     줄바꿈 계수기도 끊김을 가로지른 x 이동을 줄바꿈으로 세고 있다.
// 점수가 바뀌므로 기본값은 꺼짐이고, 합의 전에는 이 플래그로만 켠다 (docs/decisions.md 열린 제안).
const validTime = urlParams.has('validtime');
// ?xwindow=1 → 11절 제안(개발용 시험, 팀 합의 전): 쪽의 앞 8초 동안 시선 x를 모아,
// 줄바꿈 착지권과 이동 문턱을 **그 쪽의 관측 범위**로 갈아 끼운다. 창 길이도 400 → 600ms.
// 왜: 착지권이 글의 절대 기하에서 나와서, 시선 x가 눌려 찍히는 정도가 쪽마다 다르면
//     같은 사람이 같은 글을 더 오래 읽고도 97%와 61%를 받는다 (docs/comprehension_evidence.md 10절).
// 재생 결과: 전체 78.7% → 84.1%, 거짓 탈락 기록 61.2% → 79.1%, 나빠진 쪽 1개.
// 순환이 완전히 없어지지는 않는다 — 훑기 대조군으로 확인하기 전에는 합의하지 말 것 (11-3절).
const xWindow = urlParams.has('xwindow');
// 읽기 속도·가로 폭 경고 (pace.js). 기본 켜짐 — ?pace=0 으로 끈다.
// 점수·통과 여부는 건드리지 않고 "빠르게 훑은 것 같다"를 알리고 기록에만 남긴다.
// 관문은 한 사람의 기록(성실 47쪽·훑기 11쪽)에서 고른 잠정값이다 (docs/comprehension_evidence.md 16절).
const paceWarn = urlParams.get('pace') !== '0';
// ?focus=1 → 읽기 모드(개발용 시험): 측정하는 동안 PDF를 화면 가운데로 띄운다.
const focusMode = urlParams.has('focus');
// ?score=lines → 줄 단위 진행 점수(개발용 시험, 팀 합의 전): 쪽 점수 = 읽은 줄 ÷ 전체 줄. 줄마다 읽음 표식과 통과 선을 보여 준다.
const scoreLines = urlParams.get('score') === 'lines';
// ?ocr=0 → 사진·스캔 PDF를 글자 인식으로 여는 것을 끈다 (기본 켜짐). ?ocrlang=kor → 인식 언어 바꾸기.
const ocrOff = urlParams.get('ocr') === '0';
const ocrLangParam = urlParams.get('ocrlang');
const configOverrides = {
  ...(reflowParam === 20 || reflowParam === 24 ? { reflowSize: reflowParam } : {}),
  ...(scoreLines ? { scorePolicyVersion: LINE_PROGRESS_POLICY } : {}),
  ...(ocrOff ? { ocrEnabled: false } : {}),
  ...(ocrLangParam ? { ocrLangs: ocrLangParam } : {})
};
const config = Object.keys(configOverrides).length
  ? Object.freeze({ ...DEFAULT_CONFIG, ...configOverrides })
  : DEFAULT_CONFIG;
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
let sealed = null;          // 발급된 봉인 {sealId, url, fileName}. 발급 뒤에는 측정을 다시 열지 않는다
const graph = { iris: [], ear: [], max: 300 };
const eyeGlass = createEyeGlass($('eyeGlass'));
if (DETECTOR_CONFIG.directionSign !== null) eyeGlass.setDirectionSign(DETECTOR_CONFIG.directionSign);
if (yLock) eyeGlass.setLineAnchor(1);   // 줄 밑선
const calibration = createCalibrationOverlay({ sourceVideo: $('camPreview') });
let gazeTracker = null;    // 시선 좌표 추정기. A의 영상을 함께 읽으며 물방울 표시에만 쓰고 점수에는 쓰지 않는다
let latestGaze = null;     // 추정기의 가장 최근 출력
let shownGaze = null;      // 물방울에 마지막으로 준 좌표. 추정이 잠깐 끊겨도 이 자리를 지킨다
const gazeLog = new URLSearchParams(location.search).has('gazelog')
  ? createGazeLog({ onFail: (e) => setMsg('viewerMsg', `시선 기록을 저장하지 못했습니다 (${e.message}). tools/serve_local.py로 연 서버인지 확인하세요.`, 'warn') })
  : null;
let gazeFit = null;        // 보정 판정 {xErrorPx, yErrorPx, yUsable}
let gazeReference = null;  // 보정 때의 자세
let pageLineBoxes = [];    // 지금 쪽의 줄 상자(캔버스 CSS px). 첫 줄 맞춤 자리를 잡는 데 쓴다
let trackedTextLeft = NaN; // 줄바꿈 계수기들이 지금 알고 있는 글 왼쪽 끝 (화면 x). 옮겨지면 syncTextLeft가 다시 알려 준다
let navSeq = 0;            // 쪽 넘김 번호. 넘기는 도중에 또 넘기면 앞선 넘김은 여기서 자기가 밀린 것을 안다
const passedSeen = new Set();   // 기준을 충족한 적 있는 pageId. 다시 미달이 되는 순간 이유를 한 번 알리려고 둔다
// 보조 점수(기록 전용, 공식 점수 아님): 쪽마다 시선 x 줄바꿈 수를 누적한다. pageId → {gazeSweeps}
const auxPages = new Map();
let gazeSweep = null;      // 지금 쪽의 시선 x 줄바꿈 계수기 (쪽을 넘기면 새로 만든다)
let observeLogged = false;   // 관측 창 닫힘을 쪽마다 한 번만 기록
let paceWatch = null;        // 지금 쪽의 읽기 속도·가로 폭 감시 (쪽을 넘기면 새로 만든다)
let paceShown = false;       // 경고를 쪽마다 한 번만 띄운다
let lineProg = null;       // 지금 쪽의 줄 추적·읽음 판정 (lineProgress.js). 세로 고정 물방울과 줄 단위 점수가 함께 쓴다
let gaugePassed = null;     // 통과 선 표시를 마지막으로 그린 통과 상태
const readByPage = new Map();   // pageId → 읽음이 된 줄 번호 Set (쪽을 다시 열어도 누적)
let driftSince = null, driftWarned = false;
const POSE_DRIFT_WARN_MS = 2000;
const POSE_DRIFT_MESSAGE = '자세가 보정할 때와 달라졌어요. 처음 자세로 돌아오거나 재보정을 눌러 주세요.';
const lightMeter = createLightMeter($('camPreview'));
const darkDetector = createDarkDetector();
const LIGHT_CHECK_MS = 500;
let lastLightCheckMs = -Infinity, lastLuma = null, tooDark = false;

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nowMs = () => performance.now() - sessionT0;

// ---------- 초기화 ----------
$('appVersion').textContent = gazeLog ? `${APP_VERSION} · 시선 기록 중` : APP_VERSION;
function setModeBadge(hasDoc) { $('modeBadge').textContent = hasDoc ? MODE.toUpperCase() : '대기 중'; $('modeBadge').className = hasDoc && MODE === 'real' ? 'is-real' : ''; }
setModeBadge(false);
if (missingDetectorKeys(DETECTOR_CONFIG).length === 0) $('detectorNote').hidden = true;

(async () => {
  try {
    pdf = await createPdfManager({ canvasElement: $('pdfCanvas'), config });
    document.body.classList.toggle('is-reflow', pdf.mode === 'reflow');
    document.body.classList.toggle('is-reflow-lg', pdf.mode === 'reflow' && pdf.layout.fontPx > 13);   // 큰 글자판: 틀을 조금 올린다
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
    if (pdf.mode === 'reflow') setMsg('viewerMsg', `텍스트를 뽑아 ${pdf.layout.fontPx}px로 다시 배치하는 중…`, '');
    const { pageCount: n, sourcePageCount, ocr, unreadSourcePages = [] } = await pdf.open(file, { onProgress: showOpenProgress });
    pageCount = n; currentFile = file; currentDocName = file.name;
    $('paneLabel').textContent = file.name.replace(/\.pdf$/i, '');
    $('docName').textContent = pdf.mode === 'reflow'
      ? `원본 ${sourcePageCount}쪽 → ${n}쪽 · ${pdf.layout.fontPx}px${ocr ? ' · 글자 인식' : ''}${unreadSourcePages.length ? ` · 표시 못 한 쪽 ${unreadSourcePages.length}` : ''}`
      : `${n}쪽`;
    $('searchInput').disabled = false;
    searchCache = null;
    store = createSessionStore({ documentId: uid('doc'), sessionId: uid('session'), pageCount: n, config });
    sessionT0 = performance.now(); segmentCounter = 0;
    auxPages.clear(); readByPage.clear(); passedSeen.clear();
    detector = createMovementDetector({ config: DETECTOR_CONFIG });
    resetSignature();
    $('camStartBtn').disabled = false;
    document.body.classList.remove('is-empty');   // 지면을 먼저 보이게 해야 폭·높이를 재서 그릴 수 있다
    await goToPage(1);
    setMsg('viewerMsg', '', '');
    checkZoom();
    // 인식한 글은 틀릴 수 있다. 숨기지 말고 문서를 여는 내내 띄워 둔다 (봉인은 원본 글자를 보증하지 않는다).
    // 배율 안내보다 뒤에 둔다 — 둘 다 있으면 이쪽이 더 중요하다.
    // 텍스트 쪽과 스캔 쪽이 섞인 문서: 스캔 쪽만 인식했으면 그 쪽 번호를, 못 읽은 쪽이 있으면 그것도 반드시 알린다.
    // (예전에는 스캔 쪽이 아무 말 없이 빠져, 보여 주지도 않은 쪽까지 읽은 것으로 봉인됐다)
    const notes = [];
    if (ocr) {
      const where = ocr.sourcePages ? `원본 ${ocr.sourcePages.join('·')}쪽은 텍스트가 없어` : '텍스트가 없는 PDF라';
      notes.push(`${where} 글자를 인식해 읽었습니다 (${ocr.langs}, 확신도 ${Math.round(ocr.confidence)}%). 인식이 틀린 글자가 있을 수 있습니다.`);
    }
    if (unreadSourcePages.length) {
      notes.push(`원본 ${unreadSourcePages.join('·')}쪽은 스캔한 그림이라 글을 보여 주지 못했습니다${ocrOff ? ' (글자 인식 꺼짐)' : ''}. 이 쪽은 읽기 확인에 들어가지 않습니다.`);
    }
    if (notes.length) setMsg('viewerMsg', notes.join(' '), 'warn');
    setModeBadge(true);
  } catch (err) {
    setMsg('viewerMsg', err.message, 'bad');
  }
}
/** 문서 여는 동안의 진행 표시. 글자 인식은 쪽당 몇 초씩 걸려 알려 주지 않으면 멈춘 것처럼 보인다. */
function showOpenProgress(s) {
  if (s.stage === 'ocr-load') setMsg('viewerMsg', '텍스트가 없는 쪽이 있습니다. 글자 인식을 준비하는 중… (처음 한 번은 오래 걸립니다)', '');
  else if (s.stage === 'ocr-page') setMsg('viewerMsg', `글자를 읽는 중… ${s.page}/${s.pageCount}쪽`, '');
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

// 지면 밖(왼쪽 패널·아래 막대·보정 화면)에 떨어뜨린 파일은 받지 않는다. 막지 않으면 브라우저가 그 파일을 열면서
// 이 페이지를 떠나, 읽던 기록이 통째로 사라진다. 지면 안의 드롭은 위 처리기가 이미 받았다.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    const el = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (type === 'dragover' && !el?.closest('.pane')) e.dataTransfer.dropEffect = 'none';   // "여기는 못 놓는다" 커서
  });
}

$('prevBtn').addEventListener('click', () => goToPage(currentPage - 1));
// 왼쪽 '페이지' 목록에서 쪽을 누르면 그 쪽으로 (목록은 다시 그려지므로 ol에 한 번만 건다)
const pageFromList = (e) => Number(e.target.closest('li[data-page]')?.dataset.page);
$('pageList').addEventListener('click', (e) => { const n = pageFromList(e); if (n && n !== currentPage) goToPage(n); });
$('pageList').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const n = pageFromList(e); if (!n) return;
  e.preventDefault();
  if (n !== currentPage) goToPage(n).then(() => $('pageList').querySelector(`li[data-page="${n}"]`)?.focus());  // 다시 그려진 목록에서 포커스 유지
});
$('nextBtn').addEventListener('click', () => goToPage(currentPage + 1));

// 지면 위에서 스크롤하면 쪽 넘김. 지면 끝이 화면에 보일 때만 넘기고(그 전엔 평소처럼 스크롤),
// 트랙패드 관성(손을 뗀 뒤 줄어들며 이어지는 스크롤)으로는 한 쪽만 넘어가게 한다.
// 새로 쓸어 넘기면(스크롤 세기가 다시 커지면) 관성이 끝나기를 기다리지 않고 바로 다음 쪽으로.
const WHEEL_TURN = 40;        // 이만큼 모이면 넘김 (마우스 휠 한 칸 ≈ 100 → 한 칸에 바로 넘어감)
const WHEEL_MIN_GAP = 220;    // ms. 트랙패드로 다시 쓸어 넘길 때 앞 넘김과의 최소 간격
let wheelSum = 0, wheelLast = 0, wheelLocked = false, wheelTurnAt = 0, wheelPrevAbs = 0, wheelEvtAt = 0, wheelPrevGap = 1e9;
document.querySelector('.page-frame').addEventListener('wheel', (e) => {
  if (!store || pageCount < 1 || e.ctrlKey) return;              // ctrl+휠 = 확대 → 건드리지 않음
  const now = e.timeStamp || performance.now();                  // 입력이 생긴 시각 (처리가 밀려도 간격이 흔들리지 않게)
  const abs = Math.abs(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
  // 새 손짓: 세기가 다시 커졌거나(트랙패드로 또 쓸어 넘김), 잠깐 끊겼다 다시 옴(마우스 휠 한 칸 더). 관성은 16ms 간격으로 줄어들며 이어진다
  const swipe = abs > wheelPrevAbs * 1.5 && abs >= 8;                         // 트랙패드: 다시 세게
  const gap = now - wheelEvtAt;
  const notch = gap > 30 && wheelPrevGap > 25 && abs >= 30 && abs >= wheelPrevAbs;   // 마우스: 띄엄띄엄, 같은 세기 (관성은 16ms마다 줄어들며 온다)
  wheelPrevAbs = abs; wheelEvtAt = now; wheelPrevGap = gap;
  const rect = e.currentTarget.getBoundingClientRect();
  const down = e.deltaY > 0;
  const edgeVisible = down ? rect.bottom <= window.innerHeight + 2 : rect.top >= 0;
  const canTurn = down ? currentPage < pageCount : currentPage > 1;
  if (!edgeVisible || !canTurn) { wheelSum = 0; return; }        // 아직 지면 안쪽을 스크롤 중이거나 첫/끝 쪽
  e.preventDefault();
  // 넘긴 뒤에는 잠근다. 풀리는 때: 새 손짓이 왔을 때, 또는 스크롤이 180ms 넘게 멈췄다가 다시 시작할 때. 관성 꼬리로는 풀리지 않는다
  if (wheelLocked) {
    const quiet = gap > 180;
    const gapOk = now - wheelTurnAt >= (notch || quiet ? 50 : WHEEL_MIN_GAP);   // 휠 한 칸마다 한 쪽, 트랙패드는 한 번 쓸 때마다 한 쪽
    if (!((swipe || notch || quiet) && gapOk)) return;            // 관성 중
    wheelLocked = false; wheelSum = 0;                            // 새 손짓 → 잠금 풀기
  }
  if (now - wheelLast > 250 || Math.sign(wheelSum) !== Math.sign(e.deltaY)) wheelSum = 0;
  wheelLast = now;
  wheelSum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;       // 줄 단위 휠은 px로
  if (Math.abs(wheelSum) >= WHEEL_TURN) {
    wheelSum = 0; wheelTurnAt = now; wheelLocked = true;
    goToPage(currentPage + (down ? 1 : -1));
    // 창이 작아 지면이 잘려 있으면: 다음 쪽은 첫 줄부터, 이전 쪽은 마지막 줄부터 보이게
    const frame = e.currentTarget, stickyH = document.querySelector('.pane-sticky')?.offsetHeight ?? 0;
    const r = frame.getBoundingClientRect();
    if (r.height + stickyH > window.innerHeight) {
      window.scrollBy({ top: down ? r.top - stickyH - 8 : r.bottom - window.innerHeight, behavior: 'instant' });
    }
  }
}, { passive: false });

async function goToPage(pageId) {
  if (!store || pageId < 1 || pageId > pageCount) return;
  if (calibration.active) return;   // 보정·첫 줄 맞춤 중에는 쪽을 넘기지 않는다
  // 15절 순서: 구간 닫기 → detector.reset → 렌더·줄 수 → settle → 새 구간
  // 기다리는 사이에 또 넘기면 앞선 넘김은 그만둔다. 그러지 않으면 앞선 넘김의 settle이 먼저 끝나면서
  // **새 쪽**의 구간을 열어 버려, 새 쪽은 500ms를 다 기다리지 않고 측정이 시작됐다.
  const my = ++navSeq;
  endSegment('page_change');
  detector?.reset();
  currentPage = pageId;
  const info = await showPage(pageId);
  if (!info || my !== navSeq) return; // 늦은 렌더 · 밀린 넘김
  // 쪽을 넘길 때마다 첫 줄에서 다시 맞춘다. 읽는 동안 고개가 조금씩 들리고 눈꺼풀이 내려와
  // 세로가 밀리는데(실측: 한 쪽 지나 +90px), 첫 줄 맞춤은 시작 순간만 바로잡기 때문이다.
  if (gazeFit && info.supported && !document.hidden) await anchorFirstLine();
  if (my !== navSeq) return;
  await sleep(config.pageSettleMs);
  if (my !== navSeq) return;
  if (measuring && info.supported && !document.hidden) beginSegment();
}

/** 쪽을 그리고 그 쪽에 딸린 상태(줄 상자·물방울·줄바꿈 계수기·기록)를 새로 맞춘다. 읽기 모드로 자리를 옮길 때도 쓴다. */
async function showPage(pageId) {
  const info = await pdf.renderPage(pageId);
  if (!info) return null;
  store.registerPage({ pageId: info.pageId, lineCount: info.lineCount, supported: info.supported, unsupportedReason: info.unsupportedReason });
  pageLineBoxes = info.lineBoxes ?? [];
  eyeGlass.setLines(pageLineBoxes);
  const gapMs = validTime ? SWEEP_MAX_GAP_MS : null;
  trackedTextLeft = textLeftPx();
  // gazeSweep은 보조 점수(기록 전용)라 관측 창을 쓰지 않는다. 줄 판정 쪽만 11절 제안을 받는다.
  gazeSweep = pdf.mode === 'reflow'
    ? createGazeSweepCounter(sweepOptionsFor(pdf.layout, trackedTextLeft, { maxGapMs: gapMs }))
    : null;
  lineProg = pdf.mode === 'reflow'
    ? createLineProgress({
      lineWidths: pageLineBoxes.map((b) => b.textWidth), layout: pdf.layout, textLeftPx: trackedTextLeft,
      lineCenterY: lineCenterYPx, yFix,   // lineCenterY는 비교·기록용. yFix가 꺼져 있으면 줄 번호를 건드리지 않는다
      maxGapMs: validTime ? LP_MAX_GAP_MS : null,
      observeMs: xWindow ? X_OBSERVE_POLICY.observeMs : null,
      sweepWindowMs: xWindow ? SWEEP_WINDOW_MS_WIDE : undefined
    })
    : null;
  observeLogged = false;
  paceWatch = paceWarn && pdf.mode === 'reflow'
    ? createPaceWatch({ layout: pdf.layout, lineWidths: pageLineBoxes.map((b) => b.textWidth) })
    : null;
  paceShown = false;
  setMsg('paceMsg', '', '');
  renderGauge();
  if (gazeLog) {
    const r = $('eyeGlass').parentElement.getBoundingClientRect();
    const focused = document.body.classList.contains('is-focus');   // 읽기 모드에서는 틀이 화면에 고정돼 스크롤과 무관하다
    gazeLog.meta({ type: 'page', pageId, layout: pdf.layout?.version ?? null, yLock, focus: focused, frame: { left: r.left, top: r.top + (focused ? 0 : window.scrollY), width: r.width, height: r.height }, lines: info.lineBoxes ?? [] });
  }
  $('prevBtn').disabled = pageId <= 1; $('nextBtn').disabled = pageId >= pageCount;
  $('pageLabel').textContent = `페이지 ${pageId}/${pageCount}`;
  updateProgress();
  renderPanel();
  return info;
}

// ---------- 읽기 모드 (?focus=1, 개발용 시험) ----------
// 측정하는 동안 PDF를 화면 가운데로 띄운다. 왜: 왼쪽 아래 지면은 웹캠(화면 위 가운데)에서 멀어
// 눈이 비스듬히 찍히고 고개도 돌아가 시선 추정이 더 부정확했다. 가운데·정면이면 둘 다 줄어든다.
// 자리를 옮기면 줄 위치가 바뀌므로 다시 그린 뒤 첫 줄 맞춤을 한다. 점수 계산은 그대로다.
async function setFocus(on) {
  on = focusMode && on && pdf?.mode === 'reflow' && currentPage > 0;
  if (on === document.body.classList.contains('is-focus')) return false;
  document.body.classList.toggle('is-focus', on);
  $('navFocusExitBtn').hidden = !on;
  if (on) document.documentElement.style.setProperty('--focus-w', `${pdf.layout.columnPx + 96}px`);
  await showPage(currentPage);   // 새 자리에 맞춰 다시 그린다 (줄 상자·글 왼쪽 끝이 바뀐다)
  return true;
}
/** 읽기 모드에서 나가며 측정을 멈춘다 (Esc · 나가기 버튼). 다시 읽으려면 "측정 재개". */
async function leaveFocus() {
  if (!document.body.classList.contains('is-focus') || calibration.active) return;
  endSegment('manual_stop'); measuring = false; updateMeasureBtn();
  await setFocus(false);
}

async function closeDocument() {
  navSeq++;   // 넘기던 쪽이 있으면 그만두게 한다 (닫힌 문서의 구간을 열지 않게)
  endSegment('document_closed');
  clearCalibration(); await stopGaze();
  if (tracker) { await tracker.stop(); }
  measuring = false; segmentOpen = false; currentPage = 0; pageCount = 0; store = null; currentFile = null;
  auxPages.clear(); readByPage.clear(); passedSeen.clear(); gazeSweep = null; lineProg = null; renderGauge();
  document.body.classList.remove('is-focus'); $('navFocusExitBtn').hidden = true;
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
  if (!store || segmentOpen || sealed) return;
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
  logAuxScore(currentPage, reason);
}

/** 지금 쪽 글 왼쪽 끝의 화면 x (시선 좌표와 같은 뷰포트 CSS px). 창 크기를 바꾸거나 틀 안에서 가로로 굴리면 바뀐다. */
function textLeftPx() {
  const first = pageLineBoxes[0];
  return first ? $('pdfCanvas').getBoundingClientRect().left + first.left : NaN;
}
/**
 * 글 왼쪽 끝이 옮겨졌으면 줄바꿈 착지권을 새 자리로 맞춘다. 시선 표본마다 부른다 (옮겨지지 않았으면 아무 일도 안 한다).
 * 왜: 착지권을 쪽을 그릴 때 한 번만 재서, 창 크기를 바꾸고 재보정해도 쪽을 넘기기 전까지 옛 화면 좌표로 판정했다.
 * 줄 번호·읽음은 건드리지 않는다 — 쪽 중간에서 다시 그려 줄 추적을 처음으로 돌리지 않으려고 문턱만 갈아 끼운다.
 */
function syncTextLeft() {
  if (!lineProg && !gazeSweep) return;
  const left = textLeftPx();
  if (!Number.isFinite(left) || Math.abs(left - trackedTextLeft) < 0.5) return;
  trackedTextLeft = left;
  lineProg?.setTextLeft(left);
  gazeSweep?.setThresholds(sweepOptionsFor(pdf.layout, left, { maxGapMs: validTime ? SWEEP_MAX_GAP_MS : null }));
  gazeLog?.meta({ type: 'textLeft', pageId: currentPage, textLeftPx: Math.round(left * 10) / 10 });
}
/** 줄 k 중심의 화면 y (시선 좌표와 같은 기준). 스크롤·읽기 모드로 자리가 바뀌므로 그때그때 잰다. */
function lineCenterYPx(k) {
  const box = pageLineBoxes[k];
  return box ? $('pdfCanvas').getBoundingClientRect().top + box.top + box.height / 2 : NaN;
}
/** 쪽 하나의 보조 점수. 공식 점수와 나란히 비교하려고 계산만 하며 화면·봉인에는 쓰지 않는다. */
function auxScoreOf(pageId) {
  const p = store?.getPage(pageId);
  if (!p || pdf?.mode !== 'reflow' || pageId !== currentPage) return null;
  const widths = pageLineBoxes.map((b) => b.textWidth).filter(Number.isFinite);
  const detectable = expectedDetectableSweeps(widths, pdf.layout.columnPx);
  const gazeSweeps = auxPages.get(pageId)?.gazeSweeps ?? 0;
  return {
    policy: AUX_POLICY_VERSION, pageId, lineCount: p.lineCount, weightRamp: AUX_WEIGHT_RAMP,
    expectedSweeps: expectedReturnSweeps(p.lineCount), detectableSweeps: Math.round(detectable * 100) / 100,
    acceptedEventCount: p.acceptedEventCount, gazeSweeps,
    officialScore: p.evaluation.rawScore,
    auxDetector: auxScore(p.acceptedEventCount, detectable),   // A의 줄바꿈 후보 ÷ 잡힐 수 있는 줄바꿈
    auxGaze: auxScore(gazeSweeps, detectable),                 // C의 시선 x 줄바꿈 ÷ 잡힐 수 있는 줄바꿈
    readLines: (readByPage.get(pageId) ?? new Set()).size,
    lineProgress: lineProgressScore((readByPage.get(pageId) ?? new Set()).size, widths.length),   // 읽은 줄 ÷ 전체 줄
    lineWidths: widths
  };
}
function logAuxScore(pageId, reason) {
  const aux = auxScoreOf(pageId);
  if (aux) gazeLog?.meta({ type: 'auxScore', reason, ...aux });
}
/**
 * 줄 추적·읽음 판정 (lineProgress.js). 줄이 바뀌면 세로 고정 물방울을 옮기고, 측정 구간 안에서 읽음이 된 줄을 쪽마다 누적한다.
 * 읽음 누적은 정책과 상관없이 기록(lineRead)에 남기고, 공식 점수에는 ?score=lines일 때만 쓰인다.
 */
function trackLine(g) {
  if (!lineProg || !gazeFit || calibration.active || !g?.valid || g.rawXNorm == null) return;
  const vw = g.viewport?.width ?? window.innerWidth, vh = g.viewport?.height ?? window.innerHeight;
  const sample = { tMs: g.tMs, xPx: g.rawXNorm * vw, yPx: g.rawYNorm == null ? null : g.rawYNorm * vh, valid: true };
  const { step, newly } = lineProg.push(sample, { credit: segmentOpen && !!store });
  if (paceWatch) {
    paceWatch.push(sample);
    if (newly.length) paceWatch.credit(newly);
    // 경고는 쪽마다 한 번만. 한 번 뜨면 쪽을 넘길 때까지 둔다 (깜빡이지 않게)
    if (!paceShown && paceWatch.status.warn) {
      paceShown = true;
      setMsg('paceMsg', paceWatch.message(), 'warn');
      gazeLog?.meta({ type: 'pace', pageId: currentPage, tMs: g.tMs, ...paceWatch.snapshot() });
    }
  }
  if (step) {
    if (yLock) eyeGlass.setLine(step.to);
    // atMs(줄을 실제로 끝낸 시각)·peak/landed·yLine은 기록 전용이다. 판정에는 쓰지 않는다.
    // yLine이 to와 자주 어긋나면 줄바꿈 검출이 놓치고 있다는 뜻 (docs/comprehension_evidence.md 9절).
    const sw = step.cause === 'sweep' ? lineProg.lastSweep : null;
    gazeLog?.meta({
      type: 'lineLock', pageId: currentPage, from: step.from, to: step.to, cause: step.cause,
      speed: Math.round(lineProg.speed), tMs: g.tMs,
      atMs: step.atMs ?? null, yLine: lineProg.yLineOf(sample), yFix,
      peakX: sw ? Math.round(sw.peakX) : null, landedX: sw ? Math.round(sw.landedX) : null
    });
  }
  // 관측 창이 닫힌 순간을 한 번만 기록한다 (어떤 문턱으로 바뀌었는지 되짚을 수 있게)
  if (xWindow && !observeLogged) {
    const sn = lineProg.observeSnapshot();
    if (sn?.closed) {
      observeLogged = true;
      gazeLog?.meta({ type: 'xWindow', pageId: currentPage, tMs: g.tMs, ...sn, thresholds: lineProg.thresholds });
    }
  }
  if (newly.length) {
    const set = readByPage.get(currentPage) ?? new Set();
    for (const k of newly) set.add(k);
    readByPage.set(currentPage, set);
    store.setReadLines(currentPage, set.size);
    // group: 그 묶음을 인정한 근거 (벽시계·유효 시간·유효 비율). 기록 전용이며 판정에는 쓰지 않는다.
    // validtime이 꺼져 있어도 유효 비율은 쌓이므로, 끊김이 점수에 얼마나 끼어드는지 나중에 되짚을 수 있다.
    const grp = lineProg.lastGroup;
    gazeLog?.meta({ type: 'lineRead', pageId: currentPage, lines: newly, total: set.size, lineCount: lineProg.lineCount, tMs: g.tMs,
      validTime, group: grp ? { wallMs: Math.round(grp.wallMs), elapsedMs: Math.round(grp.elapsedMs),
        coverage: grp.coverage === null ? null : Math.round(grp.coverage * 100) / 100, rangePx: Math.round(grp.rangePx) } : null });
    throttledRender();
  }
  if (step || newly.length) renderGauge();
}

/** 줄마다 읽음 표식(왼쪽 여백)과 "여기까지 읽으면 통과" 선. ?score=lines일 때만 보인다. */
function renderGauge() {
  const el = $('readGauge');
  if (!scoreLines || pdf?.mode !== 'reflow' || !pageLineBoxes.length || !store) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const read = readByPage.get(currentPage) ?? new Set();
  const cur = lineProg?.line ?? -1;
  const passIdx = passLineIndex(pageLineBoxes.length, config.passThreshold);
  const passed = !!store.getPage(currentPage)?.evaluation.passed;
  gaugePassed = passed;
  const ticks = pageLineBoxes.map((b, k) =>
    `<i class="tick${read.has(k) ? ' is-read' : ''}${k === cur ? ' is-current' : ''}" style="left:${b.left - 20}px;top:${b.top + 6}px;height:${b.height - 12}px"></i>`).join('');
  const pb = passIdx === null ? null : pageLineBoxes[passIdx];
  const mark = pb ? `<div class="pass-mark${passed ? ' is-passed' : ''}" style="left:${pb.left}px;width:${pb.width}px;top:${pb.top + pb.height}px"><span>${passed ? '통과 ✓' : '여기까지 읽으면 통과'}</span></div>` : '';
  el.innerHTML = ticks + mark;
}
/** 측정 구간이 열려 있을 때만 시선 x 줄바꿈을 센다 (공식 점수와 같은 시간 범위). */
function countGazeSweep(g) {
  if (!gazeSweep || !segmentOpen || !store || calibration.active || !g?.valid || g.rawXNorm == null) return;
  const vw = g.viewport?.width ?? window.innerWidth, vh = g.viewport?.height ?? window.innerHeight;
  if (gazeSweep.push({ tMs: g.tMs, xPx: g.rawXNorm * vw, yPx: g.rawYNorm == null ? null : g.rawYNorm * vh, valid: true })) {
    const a = auxPages.get(currentPage) ?? { gazeSweeps: 0 };
    a.gazeSweeps++; auxPages.set(currentPage, a);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { endSegment('tab_hidden'); setMsg('viewerMsg', '탭이 숨겨져 측정을 일시정지했습니다. "측정 재개"를 누르세요.', 'warn'); measuring = false; updateMeasureBtn(); } });
window.addEventListener('resize', () => {
  checkZoom();
  // 보정 점은 화면 좌표라 창 크기가 바뀌면 맞지 않는다.
  if (calibration.active || gazeFit) {
    calibration.abort('window_resize'); clearCalibration();
    setMsg('viewerMsg', '창 크기가 바뀌어 보정이 해제됐습니다. 재보정을 눌러 주세요.', 'warn');
  }
  if (segmentOpen) { endSegment('window_resize'); measuring = false; updateMeasureBtn(); setMsg('viewerMsg', '창 크기가 바뀌어 측정을 일시정지했습니다.', 'warn'); }
});

// ---------- 배율 확인: 13px은 브라우저 배율 100%에서만 13px이다 ----------
function zoomLooksOff() {
  const vv = window.visualViewport;
  if (vv && vv.scale > 1.01) return true;                                  // 트랙패드로 확대
  if (!(window.outerWidth > 0 && window.innerWidth > 0)) return false;
  return Math.abs(window.outerWidth / window.innerWidth - 1) > 0.08;       // ⌘+/⌘− 배율 (개발자 도구를 옆에 붙이면 잘못 알릴 수 있음)
}
function checkZoom() {
  if (pdf?.mode !== 'reflow' || !store) return;
  const off = zoomLooksOff();
  if (off) setMsg('viewerMsg', `브라우저 배율이 100%가 아닌 것 같습니다. 글자가 ${pdf.layout.fontPx}px이 되도록 ⌘0(윈도우는 Ctrl+0)으로 되돌리세요.`, 'warn');
  else if ($('viewerMsg').textContent.startsWith('브라우저 배율')) setMsg('viewerMsg', '', '');
}
window.visualViewport?.addEventListener('resize', checkZoom);
if (scoreLines) $('eventCount').previousElementSibling.textContent = '읽은 줄';

// 개발·시험용: 재배치 결과를 콘솔에서 확인 (window.nundojang.reflow())
window.nundojang = {
  reflow: () => pdf?.getReflow?.() ?? null,
  aux: () => auxScoreOf(currentPage),   // 지금 쪽의 보조 점수 (기록 전용)
  light: () => lastLuma,
  gaze: () => gazeTracker && { ...gazeTracker.getDiagnostics(), measurementFps: tracker?.getDiagnostics().estimatedFps ?? null }
};

// ---------- 카메라·측정 ----------
// 트래커가 이 오류들을 보고하면 스스로 멈춘다. 앱도 구간을 닫고 '꺼짐' 상태로 맞춘다. "카메라 시작"으로 같은 세션을 이어 간다.
const TRACKER_STOPPED_CODES = new Set(['camera_lost', 'timestamp_error', 'inference_failed']);
function handleTrackerError(err) {
  setMsg('viewerMsg', `측정 오류: ${err.message}`, err.recoverable ? 'warn' : 'bad');
  if (!TRACKER_STOPPED_CODES.has(err.code)) return;
  calibration.abort(err.code); clearCalibration(); resetLight(); void stopGaze();
  endSegment('camera_lost'); measuring = false;
  updateCamBadge(false); updateMeasureBtn();
  $('camStopBtn').disabled = true; $('measureToggleBtn').disabled = true; $('calibrateBtn').disabled = true;
}

function handleGazeError(err) {
  setMsg('viewerMsg', `시선 추적 오류: ${err.message}`, 'warn');
  if (err.code === 'inference_failed') { calibration.abort(err.code); clearCalibration(); }   // 이때 추정기는 스스로 멈춘다
}

/** 시선 추정기를 준비해 A가 재생 중인 영상을 읽게 한다. 실패해도 측정은 그대로 진행한다. */
async function startGaze() {
  setMsg('viewerMsg', '시선 모델을 불러오는 중…', '');
  try {
    gazeTracker ??= await createGazeTracker({
      videoElement: $('camPreview'), wasmBaseUrl: urls.wasmBaseUrl, modelAssetUrl: urls.modelAssetUrl,
      options: { shareVideo: true },
      onGaze: (g) => { latestGaze = g; syncTextLeft(); countGazeSweep(g); trackLine(g); gazeLog?.push(gazeLogRow(g, calibration.progress, window.scrollY)); },
      onError: handleGazeError
    });
    await gazeTracker.start();
    setMsg('viewerMsg', '', '');
  } catch (err) {
    setMsg('viewerMsg', `시선 추적을 켜지 못해 보정 없이 진행합니다: ${err.message}`, 'warn');
  }
}

function stopGaze() { latestGaze = null; shownGaze = null; return gazeTracker?.stop(); }

function clearCalibration() {
  gazeFit = null; shownGaze = null; gazeReference = null; driftSince = null; driftWarned = false;
  gazeTracker?.calibration.clear();
  $('recenterBtn').disabled = true;
}

/** 자세 맞춤과 다점 보정을 돌린다. 끝나면 'done' | 'skipped' | 'aborted'. */
async function runCalibration() {
  clearCalibration();
  if (!gazeTracker?.running) return 'skipped';
  const result = await calibration.run(gazeTracker);
  if (result.status === 'done') {
    gazeFit = result.fit; gazeReference = result.reference; $('recenterBtn').disabled = false;
    gazeLog?.meta({ type: 'calibration', viewport: { width: window.innerWidth, height: window.innerHeight }, quality: result.fit, fit: gazeTracker.calibration.fit_, reference: result.reference });
    await setFocus(true);   // 읽기 모드면 가운데로 옮겨 다시 그린 뒤 첫 줄을 맞춘다
    if (await anchorFirstLine() === 'aborted') return 'aborted';
  }
  else clearCalibration();     // 다시 보정하다 건너뛰면 앞서 맞춘 모형이 남아 있다
  return result.status;
}

/** 첫 줄 맞춤 점의 화면 좌표(CSS px). 첫 줄이 화면 밖이면 보이게 굴린다. 줄이 없으면 null. */
function firstLineTarget() {
  const first = pageLineBoxes[0];
  if (!first) return null;
  const canvas = $('pdfCanvas');
  const midY = () => canvas.getBoundingClientRect().top + first.top + first.height / 2;
  if (midY() < 120 || midY() > window.innerHeight - 160) {
    window.scrollBy({ top: midY() - window.innerHeight * 0.35, behavior: 'instant' });
  }
  const r = canvas.getBoundingClientRect();
  return { x: r.left + first.left - 18, y: midY() };   // 첫 글자 바로 왼쪽 여백. 글자를 가리지 않는다
}

/**
 * 보정 직후, 읽기 자세에서 PDF 첫 줄 옆 점을 보게 해 치우침을 바로잡는다.
 * 보정 때와 읽을 때 자세가 조금 달라 생기는 세로 밀림(실측 2~6줄)을 줄인다.
 */
async function anchorFirstLine() {
  const target = firstLineTarget();
  if (!target || !gazeTracker?.running) return 'skipped';
  document.body.classList.add('is-anchoring');
  let result;
  try { result = await calibration.recenter(gazeTracker, target); }
  finally { document.body.classList.remove('is-anchoring'); }
  if (result.status === 'aborted') return 'aborted';
  if (result.reference) { gazeReference = result.reference; driftSince = null; driftWarned = false; }
  gazeLog?.meta({ type: 'anchor', status: result.status, target, pageId: currentPage, offset: gazeTracker.getOffset() });
  return result.status;
}

function applyDarkState(dark) {
  if (dark === tooDark) return;
  tooDark = dark; calibration.setLightWarning(dark);
  if (dark) setMsg('viewerMsg', DARK_MESSAGE, 'warn');
  else if ($('viewerMsg').textContent === DARK_MESSAGE) setMsg('viewerMsg', '', '');
}
function resetLight() { darkDetector.reset(); lastLightCheckMs = -Infinity; lastLuma = null; applyDarkState(false); }
function checkLight(sample) {
  if (sample.tMs - lastLightCheckMs < LIGHT_CHECK_MS) return;
  lastLightCheckMs = sample.tMs;
  const frame = tracker.getDiagnostics().lastFrameDiagnostics;
  const luma = lightMeter.read(frame?.seq === sample.seq ? frame.faceGeometry : null);
  if (luma === null) return;
  lastLuma = luma;
  applyDarkState(darkDetector.update(sample.tMs, luma));
}

function startMeasuring() {
  measuring = true; updateMeasureBtn();
  if (tooDark) setMsg('viewerMsg', DARK_MESSAGE, 'warn');   // 보정 시작 때 지운 안내를 되살린다
  if (store?.getPage(currentPage)?.supported && !document.hidden) beginSegment();
}

$('camStartBtn').addEventListener('click', async () => {
  if (!store || calibration.active || document.body.classList.contains('is-live')) return;
  if (!window.isSecureContext || !navigator.mediaDevices) { setMsg('viewerMsg', '카메라를 쓸 수 없는 환경입니다 (localhost 또는 HTTPS에서 여세요).', 'bad'); return; }
  try {
    if (!tracker) {
      tracker = await createEyeTracker({
        videoElement: $('camPreview'), wasmBaseUrl: urls.wasmBaseUrl, modelAssetUrl: urls.modelAssetUrl,
        onSample: handleSample,
        onError: handleTrackerError
      });
    }
    await tracker.start({ sessionId: store.getSnapshot().sessionId, sessionT0 });
    updateCamBadge(true); setMsg('viewerMsg', '', '');
    $('camStopBtn').disabled = false; $('measureToggleBtn').disabled = false; $('calibrateBtn').disabled = false;
    await startGaze();
    if (await runCalibration() !== 'aborted') startMeasuring();
  } catch (err) {
    setMsg('viewerMsg', `카메라 시작 실패: ${err.message}`, 'bad');
  }
});
$('calibrateBtn').addEventListener('click', async () => {
  if (calibration.active) return;
  endSegment('manual_stop'); measuring = false; updateMeasureBtn(); setMsg('viewerMsg', '', '');
  if (await runCalibration() !== 'aborted') startMeasuring();
});
$('recenterBtn').addEventListener('click', async () => {
  if (calibration.active || !gazeFit) return;
  endSegment('manual_stop'); measuring = false; updateMeasureBtn(); setMsg('viewerMsg', '', '');
  const result = await calibration.recenter(gazeTracker);
  if (result.status === 'aborted') return;
  if (result.reference) { gazeReference = result.reference; driftSince = null; driftWarned = false; }
  gazeLog?.meta({ type: 'recenter', status: result.status, offset: gazeTracker.getOffset() });
  startMeasuring();
});
$('camStopBtn').addEventListener('click', async () => {
  endSegment('manual_stop'); measuring = false; clearCalibration(); resetLight();
  await setFocus(false);
  await stopGaze();
  if (tracker) await tracker.stop();
  updateCamBadge(false); updateMeasureBtn(); $('calibrateBtn').disabled = true;
});
$('measureToggleBtn').addEventListener('click', async () => {
  if (measuring) { endSegment('manual_stop'); measuring = false; updateMeasureBtn(); await setFocus(false); return; }
  if (sealed) { setMsg('viewerMsg', '봉인을 발급한 뒤에는 측정을 다시 시작하지 않습니다. 새로 읽으려면 문서를 다시 여세요.', 'warn'); return; }
  // 읽기 모드로 다시 들어가면 줄 위치가 바뀌므로 첫 줄부터 맞춘다
  if (await setFocus(!!gazeFit) && gazeFit && await anchorFirstLine() === 'aborted') return;
  measuring = true; if (store?.getPage(currentPage)?.supported && !document.hidden) beginSegment();
  updateMeasureBtn();
});
function updateMeasureBtn() { $('measureToggleBtn').textContent = measuring ? '측정 일시정지' : '측정 재개'; }
function updateCamBadge(on) { $('camBadge').innerHTML = `<span class="dot" aria-hidden="true"></span>${on ? '카메라 켜짐' : '카메라 꺼짐'}`; $('camBadge').className = on ? 'is-on' : ''; document.body.classList.toggle('is-live', on); if (!on) eyeGlass.idle(); }

function warnIfPoseDrifted(sample, frame) {
  if (!poseDrifted(gazeReference, frame?.faceGeometry)) {
    driftSince = null;
    if (driftWarned) { driftWarned = false; if ($('viewerMsg').textContent === POSE_DRIFT_MESSAGE) setMsg('viewerMsg', '', ''); }
    return;
  }
  driftSince ??= sample.tMs;
  if (!driftWarned && sample.tMs - driftSince >= POSE_DRIFT_WARN_MS) { driftWarned = true; setMsg('viewerMsg', POSE_DRIFT_MESSAGE, 'warn'); }
}

/** 보정된 시선의 화면 좌표(CSS px). 추정이 잠깐 끊기면 마지막 좌표를 유지한다. 보정이 없을 때만 null이다. */
function currentGaze() {
  if (!gazeFit) return null;
  const g = latestGaze;
  if (g?.calibrated && Number.isFinite(g.xPx) && Number.isFinite(g.yPx)) shownGaze = { x: g.xPx, y: gazeFit.yUsable && !yLock ? g.yPx : null };   // 세로 고정이면 줄에 둔다
  return shownGaze;
}

function handleSample(sample) {
  checkLight(sample);
  const frame = calibration.active || gazeFit ? tracker.getDiagnostics().lastFrameDiagnostics : null;
  if (calibration.active) { calibration.feed(sample, frame); return; }
  pushGraph(sample);
  if (gazeFit) warnIfPoseDrifted(sample, frame);
  eyeGlass.update(sample, currentGaze());
  if (!store || !segmentOpen) return;
  if (sample.tMs < segmentStartMs) return; // 구간 시작 전 프레임은 버림
  const segmentId = `seg-${segmentCounter}`;
  store.acceptSample({ sample, pageId: currentPage, segmentId });
  const events = detector.push({ sample, pageId: currentPage, segmentId });
  if (events.length) { const r = store.acceptEvents(events); if (r.accepted && !yLock) eyeGlass.advance(r.accepted); }   // 세로 고정은 시선 x 줄바꿈으로 넘긴다
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
// 읽기 모드: Esc로 나가기, ←/→ · PageUp/PageDown으로 쪽 넘기기 (지면 밖 버튼이 가려지므로)
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('is-focus') || calibration.active || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { e.preventDefault(); leaveFocus(); }
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(currentPage + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(currentPage - 1); }
});
$('navFocusExitBtn').addEventListener('click', leaveFocus);

// ---------- 진행선: 문서 안 현재 위치. 첫 쪽 = 왼쪽 끝(0%), 마지막 쪽 = 오른쪽 끝(100%) ----------
function updateProgress() {
  if (!pageCount) { $('progressDot').style.left = '0%'; return; }
  let pct;
  if (pageCount > 1) pct = (currentPage - 1) / (pageCount - 1) * 100;
  else {   // 한 쪽짜리: 지면을 스크롤한 만큼 (위 0% → 끝까지 내리면 100%)
    const rect = $('pdfCanvas').parentElement.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    pct = scrollable > 0 ? (-rect.top / scrollable) * 100 : 0;
  }
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
  $('eventCount').textContent = scoreLines
    ? (p.lineCount ? `${p.readLines} / ${p.lineCount}` : '–')   // 읽은 줄 / 전체 줄
    : (p.lineCount ? `${p.acceptedEventCount} / ${expectedReturnSweeps(p.lineCount)}` : p.acceptedEventCount);   // 수락된 후보 / 기대 줄바꿈
  $('pageScore').textContent = formatScore(ev);
  $('validTime').textContent = `${(p.validMs / 1000).toFixed(1)}s / ${(p.activeMs / 1000).toFixed(1)}s (${Math.round(ev.validRatio * 100)}%)`;
  $('blinkCount').textContent = p.blinkCount ?? '미설정';
  $('pageStatus').textContent = statusText(ev);
  noteIfUnpassed(currentPage, ev);
  if (scoreLines && ev.passed !== gaugePassed) { gaugePassed = ev.passed; renderGauge(); }   // 통과 선을 '통과 ✓'로
  $('pageStatus').className = `st-${ev.status}`;

  const snap = store.getSnapshot();
  $('pageList').innerHTML = snap.pages.map((pg, i) => {
    const id = i + 1, cur = id === currentPage ? ' current' : '', aria = id === currentPage ? ' aria-current="page"' : '';
    const attrs = `data-page="${id}" tabindex="0" role="button"${aria}`;   // 누르면 그 쪽으로 이동
    if (!pg) return `<li class="st-unmeasured${cur}" ${attrs} title="${id}쪽으로 이동"><span>${id}쪽 · 아직 열지 않음</span><span class="num">—</span></li>`;  // 아직 넘겨 보지 않은 쪽
    const e = pg.evaluation;
    return `<li class="st-${e.status}${cur}" ${attrs} title="${statusText(e)} · ${id}쪽으로 이동"><span>${id}쪽 · ${statusText(e)}</span><span class="num">${formatScore(e)}</span></li>`;
  }).join('');
  $('signRequestBtn').disabled = !snap.canSign;
  $('navSignBtn').disabled = !snap.canSign;
  $('navPages').textContent = `페이지 ${currentPage}/${pageCount}`;
  $('navScore').textContent = `점수 ${formatScore(ev)}`;
}

/**
 * 기준을 충족했던 쪽이 다시 미달이 되면 이유를 한 번 알린다.
 * 다시 미달이 되는 것 자체는 공통 스크립트의 규칙이다 ("한 번 통과했다고 영구 통과로 고정하지 않습니다 …
 * 앱은 그 이유를 표시합니다"). 고정하지 않고, 왜 서명이 다시 잠겼는지만 말해 준다.
 */
function noteIfUnpassed(pageId, ev) {
  if (ev.passed) { passedSeen.add(pageId); return; }
  if (!passedSeen.delete(pageId)) return;
  const why = ev.status === PAGE_STATUS.INSUFFICIENT_QUALITY
    ? `측정을 켠 채 눈이 보이지 않은 시간이 늘어 유효 측정 비율이 ${Math.round(ev.validRatio * 100)}%로 내려갔습니다 (기준 ${Math.round(config.minValidRatio * 100)}%). 화면을 보며 더 읽으면 다시 올라갑니다.`
    : `${statusText(ev)}.`;
  setMsg('viewerMsg', `${pageId}쪽이 다시 기준 미달이 됐습니다. ${why}`, 'warn');
}

function statusText(ev) {
  switch (ev.status) {
    case PAGE_STATUS.PASSED: return '페이지 기준 충족';
    case PAGE_STATUS.UNSUPPORTED: return '이 페이지는 현재 버전에서 처리할 수 없습니다';
    case PAGE_STATUS.UNMEASURED: return '미측정';
    case PAGE_STATUS.INSUFFICIENT_QUALITY: return '측정 품질·시간 부족';
    default: return ev.reasonCodes.includes('no_reading_events') ? (scoreLines ? '읽은 줄 없음' : '줄바꿈 후보 사건 없음') : '기준 미달';
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
// 획을 다 그었을 때 서명 그림을 잡는다. 캔버스의 mouseup만 들으면 밖에서 뗀 경우와 터치를 놓친다 (signature.js).
sigPad = createSignaturePad($('sigPad'), {
  onChange: () => { if (!sigPad.isEmpty()) { signaturePng = sigPad.toPngDataUrl(); signatureMethod = 'drawn'; } updateSignComplete(); }
});
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
function resetSignature() { resetSeal(); signaturePng = null; signatureMethod = null; sigPad.clear(); $('consentChk').checked = false; $('signArea').hidden = true; setMsg('signMsg', '', ''); setMsg('sealMsg', '', ''); $('sealBtn').disabled = true; }

// ---------- 봉인 ----------
$('sealBtn').addEventListener('click', async () => {
  if (sealed) return;
  $('sealBtn').disabled = true;
  setMsg('sealMsg', '봉인 PDF를 만드는 중…', '');
  try {
    endSegment('sign_requested'); measuring = false; updateMeasureBtn(); await setFocus(false);
    const sig = store.getSignature();
    const r = await issueSeal({ pdfFile: currentFile, snapshot: store.getSnapshot(), signaturePng: sig.pngDataUrl,
      signatureMethod: sig.method, signatureImageSha256: sig.sha256, appVersion: APP_VERSION, config, docName: currentDocName });
    store.setSeal(r.sealPayload);
    const fileName = `${currentDocName.replace(/\.pdf$/i, '')}.gazegate-${r.sealId}.pdf`;
    sealed = { sealId: r.sealId, url: URL.createObjectURL(r.sealedPdfBlob), fileName };
    download(fileName, r.sealedPdfBlob, 'application/pdf');
    download(`session-${r.sealId}.json`, buildSessionJson(), 'application/json');
    showSealResult(r);
    $('sealBtn').closest('.left-section').classList.add('is-issued');
  } catch (err) {
    setMsg('sealMsg', err.message, 'bad');
    $('sealBtn').disabled = !store?.isComplete();
  }
});
function showSealResult(r) {
  const el = $('sealMsg');
  el.className = 'note good';
  el.textContent = `봉인 발급됨 · ${r.sealId} · ${r.issuedAt}${r.fontFallback ? ' (한글 글꼴을 못 불러와 시스템 글꼴로 그림)' : ''} `;
  const view = Object.assign(document.createElement('a'), { href: sealed.url, target: '_blank', rel: 'noopener', textContent: '봉인 PDF 보기' });
  const again = Object.assign(document.createElement('a'), { href: sealed.url, download: sealed.fileName, textContent: '다시 받기' });
  el.append(view, ' · ', again);
}
function resetSeal() {
  if (sealed?.url) URL.revokeObjectURL(sealed.url);
  sealed = null;
  $('sealBtn').closest('.left-section').classList.remove('is-issued');
}

// ---------- 내보내기 ----------
function buildSessionJson() {
  return sessionJson({ snapshot: store.getSnapshot(), detectorConfig: DETECTOR_CONFIG, blinkConfig: BLINK_CONFIG,
    cameraDiagnostics: tracker?.getDiagnostics() ?? null, detectorDiagnostics: detector?.getDiagnostics() ?? null, mode: MODE,
    ocr: pdf?.ocrInfo ?? null, unreadSourcePages: pdf?.unreadSourcePages ?? [] });
}
$('dlSamplesBtn').addEventListener('click', () => store && download('samples.csv', samplesCsv(store.getLogs().samples), 'text/csv'));
$('dlEventsBtn').addEventListener('click', () => store && download('events.csv', eventsCsv(store.getLogs().events), 'text/csv'));
$('dlSessionBtn').addEventListener('click', () => store && download(`session-${store.getSnapshot().seal?.sealId ?? store.getSnapshot().sessionId}.json`, buildSessionJson(), 'application/json'));

// ---------- 유틸 ----------
function setMsg(id, text, kind) { const el = $(id); el.textContent = text; const base = id === 'viewerMsg' ? 'pane-msg' : 'note'; el.className = `${base} ${kind || ''}`; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
