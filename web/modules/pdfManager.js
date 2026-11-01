// PDF 표시·줄 수 계산 — C 소유.
// 계약: createPdfManager({canvasElement, config}) → {open(file) → {pageCount}, renderPage(pageId) → {pageId,lineCount,supported,unsupportedReason}, close()}
// 뼈대 상태: PDF.js 자산이 있으면 표시·줄 수 추정을 시도하고, 없으면 명확한 오류를 낸다.
import { resolveAssetUrls } from './config.js';

export async function createPdfManager({ canvasElement, config }) {
  const urls = resolveAssetUrls(config);
  let pdfjs = null;
  let doc = null;
  let renderSeq = 0;

  try {
    pdfjs = await import(urls.pdfjsModuleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = urls.pdfWorkerUrl;
  } catch (e) {
    throw Object.assign(new Error('PDF.js 자산을 불러오지 못했습니다. python3 tools/setup_assets.py 를 먼저 실행하세요.'),
      { code: 'pdfjs_missing', cause: e, recoverable: false });
  }

  async function open(file) {
    await close();
    const data = new Uint8Array(await file.arrayBuffer());
    try {
      doc = await pdfjs.getDocument({ data, cMapUrl: urls.pdfCMapUrl, cMapPacked: true, standardFontDataUrl: urls.pdfStandardFontUrl }).promise;
    } catch (e) {
      throw Object.assign(new Error('PDF를 열 수 없습니다 (암호·손상 가능).'), { code: 'pdf_open_failed', cause: e, recoverable: true });
    }
    return { pageCount: doc.numPages };
  }

  async function renderPage(pageId) {
    if (!doc) throw new Error('no document');
    const mySeq = ++renderSeq;
    const page = await doc.getPage(pageId);
    // 한 페이지 전체가 보이도록 캔버스 폭에 맞춘다 (스크롤 없음)
    const unscaled = page.getViewport({ scale: 1 });
    const scale = canvasElement.clientWidth > 0 ? canvasElement.clientWidth / unscaled.width : 1;
    const viewport = page.getViewport({ scale });
    canvasElement.width = Math.floor(viewport.width);
    canvasElement.height = Math.floor(viewport.height);
    const task = page.render({ canvasContext: canvasElement.getContext('2d'), viewport });
    await task.promise;
    if (mySeq !== renderSeq) return null; // 늦게 끝난 렌더는 무시

    const lines = await estimateLineCount(page);
    return { pageId, ...lines };
  }

  /**
   * 본문 줄 수 추정: 텍스트 조각의 y 좌표를 묶어 줄로 센다.
   * 1차 규칙: 같은 줄 = y 차이가 글자 높이의 절반 이하. 머리말·꼬리말 제외 규칙은 아직 없음 (사람 대조 필요).
   * demo/reading-demo-ground-truth.json과 반드시 대조한다.
   */
  async function estimateLineCount(page) {
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it.str && it.str.trim().length > 0 && it.height > 0);
    if (items.length === 0) return { lineCount: null, supported: false, unsupportedReason: 'no_text' };
    const rows = [];
    const sorted = items.map((it) => ({ y: it.transform[5], h: it.height })).sort((a, b) => b.y - a.y);
    for (const it of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(last.h, it.h) * 0.5) continue;
      rows.push(it);
    }
    if (rows.length === 0) return { lineCount: null, supported: false, unsupportedReason: 'line_count_failed' };
    return { lineCount: rows.length, supported: true, unsupportedReason: null };
  }

  async function close() {
    renderSeq++;
    if (doc) { try { await doc.destroy(); } catch (_) { /* ignore */ } }
    doc = null;
  }

  return { open, renderPage, close };
}
