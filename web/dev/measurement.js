// A(박민서) 소유. 지금은 eyeTracker.js(mock)를 그대로 불러 그래프만 그린다.
// A는 eyeTracker.js를 실제 MediaPipe 구현으로 바꾸면 이 화면에서 바로 확인할 수 있다.
import { DEFAULT_CONFIG, resolveAssetUrls } from '../modules/config.js';
import { createEyeTracker, IS_MOCK } from '../modules/eyeTracker.js';
import { samplesCsv, download } from '../modules/logExport.js';

const $ = (id) => document.getElementById(id);
const urls = resolveAssetUrls(DEFAULT_CONFIG);
const samples = [];
const iris = [], ear = [], MAX = 600;
let tracker = null, sessionT0 = 0, lastT = null, dts = [];

if (IS_MOCK) $('diag').textContent = '⚠️ eyeTracker.js는 아직 MOCK입니다. 실제 측정값이 아닙니다.';

$('startBtn').onclick = async () => {
  if (!tracker) {
    tracker = await createEyeTracker({ videoElement: $('video'), wasmBaseUrl: urls.wasmBaseUrl, modelAssetUrl: urls.modelAssetUrl,
      onSample: (s) => {
        samples.push({ documentId: 'dev', pageId: null, segmentId: 'dev', ...s });
        iris.push(s.valid ? (s.leftIrisX + s.rightIrisX) / 2 : null);
        ear.push(s.leftEar !== null && s.rightEar !== null ? (s.leftEar + s.rightEar) / 2 : null);
        if (iris.length > MAX) { iris.shift(); ear.shift(); }
        if (lastT !== null) { dts.push(s.tMs - lastT); if (dts.length > 60) dts.shift(); }
        lastT = s.tMs;
        draw($('irisGraph'), iris, 0, 1, '#1f5fbf'); draw($('earGraph'), ear, 0, 0.5, '#1e8a4b');
        if (s.seq % 15 === 0) { const mean = dts.reduce((a, b) => a + b, 0) / (dts.length || 1); $('fps').textContent = `≈ ${(1000 / mean).toFixed(1)} fps`; $('diag').textContent = (IS_MOCK ? '⚠️ MOCK\n' : '') + JSON.stringify(tracker.getDiagnostics(), null, 2); }
      },
      onError: (e) => { $('diag').textContent = `오류: ${e.code} ${e.message}`; } });
  }
  sessionT0 = performance.now();
  await tracker.start({ sessionId: 'dev-session', sessionT0 });
  $('stopBtn').disabled = false; $('dlBtn').disabled = false;
};
$('stopBtn').onclick = async () => { await tracker?.stop(); };
$('dlBtn').onclick = () => download('samples.csv', samplesCsv(samples), 'text/csv');

function draw(canvas, data, lo, hi, color) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); let pen = false;
  data.forEach((v, i) => { if (v === null) { pen = false; return; } const x = (i / MAX) * W, y = H - ((v - lo) / (hi - lo)) * H; if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); });
  ctx.stroke();
}
