// PDF 표시·줄 수 계산 — C 소유.
// 계약: createPdfManager({canvasElement, config}) → {open(file) → {pageCount}, renderPage(pageId) → {pageId,lineCount,supported,unsupportedReason}, close()}
//
// 보기 방식 (config.viewMode)
//  'reflow'  (기본) 텍스트를 뽑아 13px 한 단으로 다시 배치한다. pageId·pageCount는 재배치된 쪽 기준(쪽당 12줄).
//            줄 수는 앱이 직접 배치한 값이라 추정이 아니다. 11/3 회의 결정.
//  'original' 원본 그대로 그리고 줄 수는 텍스트 y 좌표로 추정한다 (예전 방식, 비교·디버그용).
import { resolveAssetUrls } from './config.js';
import { REFLOW, reflowDocument, loadReflowFont, createMeasure, drawPage } from './reflow.js';

export async function createPdfManager({ canvasElement, config }) {
  const urls = resolveAssetUrls(config);
  const mode = config.viewMode === 'original' ? 'original' : 'reflow';
  let pdfjs = null;
  let doc = null;
  let reflowed = null;     // {pages: [[{kind,text}]], sourcePages}
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
    if (mode === 'original') return { pageCount: doc.numPages, sourcePageCount: doc.numPages, mode };

    await loadReflowFont(urls.reflowFontUrl);
    reflowed = await reflowDocument(doc, createMeasure());
    if (reflowed.pages.length === 0) {
      await close();
      throw Object.assign(new Error('이 PDF에서 텍스트를 찾지 못했습니다. 스캔한 이미지 PDF는 다시 배치할 수 없습니다.'), { code: 'pdf_no_text', recoverable: true });
    }
    return { pageCount: reflowed.pages.length, sourcePageCount: doc.numPages, mode };
  }

  async function renderPage(pageId) {
    if (!doc) throw new Error('no document');
    const mySeq = ++renderSeq;
    if (mode === 'reflow') {
      const lines = reflowed.pages[pageId - 1];
      if (!lines) throw new Error(`no page ${pageId}`);
      const lineBoxes = drawPage(canvasElement, lines);
      return { pageId, lineCount: lines.length, supported: true, unsupportedReason: null, lineBoxes };
    }

    const page = await doc.getPage(pageId);
    // 한 페이지 전체가 보이도록 캔버스 폭에 맞춘다 (스크롤 없음)
    const unscaled = page.getViewport({ scale: 1 });
    const scale = canvasElement.clientWidth > 0 ? canvasElement.clientWidth / unscaled.width : 1;
    const viewport = page.getViewport({ scale });
    canvasElement.style.width = ''; canvasElement.style.height = '';
    canvasElement.width = Math.floor(viewport.width);
    canvasElement.height = Math.floor(viewport.height);
    const task = page.render({ canvasContext: canvasElement.getContext('2d'), viewport });
    await task.promise;
    if (mySeq !== renderSeq) return null; // 늦게 끝난 렌더는 무시

    const lines = await estimateLineCount(page, viewport);
    return { pageId, ...lines };
  }

  /**
   * (original 모드) 본문 줄 수 추정: 텍스트 조각의 y 좌표를 묶어 줄로 센다.
   * 같은 줄 = y 차이가 글자 높이의 절반 이하. 머리말·꼬리말·2단을 구분하지 못한다.
   */
  async function estimateLineCount(page, viewport) {
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it.str && it.str.trim().length > 0 && it.height > 0);
    if (items.length === 0) return { lineCount: null, supported: false, unsupportedReason: 'no_text', lineBoxes: [] };
    const rows = [];
    const sorted = items.map((it) => ({ y: it.transform[5], h: it.height })).sort((a, b) => b.y - a.y);
    for (const it of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(last.h, it.h) * 0.5) continue;
      rows.push(it);
    }
    if (rows.length === 0) return { lineCount: null, supported: false, unsupportedReason: 'line_count_failed' };
    const lineBoxes = rows.map((r) => { const [, top] = viewport.convertToViewportPoint(0, r.y + r.h); return { top, height: r.h * viewport.scale }; });
    return { lineCount: rows.length, supported: true, unsupportedReason: null, lineBoxes };
  }

  /** 검색용 페이지 텍스트 (계약 밖, 표시 보조). reflow 모드에서는 재배치된 쪽의 글. */
  async function getPageText(pageId) {
    if (!doc) return '';
    if (mode === 'reflow') return (reflowed.pages[pageId - 1] ?? []).map((l) => l.text).join(' ');
    const page = await doc.getPage(pageId);
    const content = await page.getTextContent();
    return content.items.map((it) => it.str).join(' ');
  }

  /** 재배치 결과 전체 (계약 밖). 정답 파일·시험용. */
  function getReflow() {
    return reflowed ? { version: REFLOW.version, layout: { ...REFLOW }, sourcePages: reflowed.sourcePages, pages: reflowed.pages } : null;
  }

  async function close() {
    renderSeq++;
    if (doc) { try { await doc.destroy(); } catch (_) { /* ignore */ } }
    doc = null; reflowed = null;
  }

  return { open, renderPage, getPageText, getReflow, close, mode };
}
