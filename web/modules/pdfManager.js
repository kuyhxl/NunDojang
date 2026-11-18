// PDF 표시·줄 수 계산 — C 소유.
// 계약: createPdfManager({canvasElement, config}) → {open(file) → {pageCount}, renderPage(pageId) → {pageId,lineCount,supported,unsupportedReason}, close()}
//
// 보기 방식 (config.viewMode)
//  'reflow'  (기본) 텍스트를 뽑아 13px 한 단으로 다시 배치한다. pageId·pageCount는 재배치된 쪽 기준(쪽당 12줄).
//            줄 수는 앱이 직접 배치한 값이라 추정이 아니다. 11/3 회의 결정.
//  'original' 원본 그대로 그리고 줄 수는 텍스트 y 좌표로 추정한다 (예전 방식, 비교·디버그용).
import { resolveAssetUrls } from './config.js';
import { reflowLayout, reflowDocument, loadReflowFont, createMeasure, drawPage, textLines, layoutParagraphs } from './reflow.js';
import { OCR, createOcrEngine, ocrDocument } from './ocr.js';

export async function createPdfManager({ canvasElement, config }) {
  const urls = resolveAssetUrls(config);
  const mode = config.viewMode === 'original' ? 'original' : 'reflow';
  const layout = reflowLayout(config.reflowSize);   // 13px(기본) 또는 20px 시험판
  let pdfjs = null;
  let doc = null;
  let reflowed = null;     // {pages: [[{kind,text}]], sourcePages}
  let renderSeq = 0;
  let ocrInfo = null;      // 글자 인식으로 연 문서면 {langs, confidence, scale, version}. 일부 쪽만 인식했으면 sourcePages에 그 원본 쪽 번호
  let unreadSourcePages = [];   // 스캔 쪽인데 글을 보여 주지 못한 원본 쪽 번호 (인식을 껐거나, 자산이 없거나, 못 알아봄)

  try {
    pdfjs = await import(urls.pdfjsModuleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = urls.pdfWorkerUrl;
  } catch (e) {
    throw Object.assign(new Error('PDF.js 자산을 불러오지 못했습니다. python3 tools/setup_assets.py 를 먼저 실행하세요.'),
      { code: 'pdfjs_missing', cause: e, recoverable: false });
  }

  /**
   * @param file PDF 파일
   * @param {{onProgress?: (s:{stage:string, page?:number, pageCount?:number, ratio?:number}) => void}} [o]
   *   stage: 'reflow' | 'ocr-load' | 'ocr-page'. 글자 인식은 쪽당 몇 초씩 걸려 진행을 알려야 한다.
   */
  async function open(file, { onProgress } = {}) {
    await close();
    const data = new Uint8Array(await file.arrayBuffer());
    try {
      doc = await pdfjs.getDocument({ data, cMapUrl: urls.pdfCMapUrl, cMapPacked: true, standardFontDataUrl: urls.pdfStandardFontUrl }).promise;
    } catch (e) {
      throw Object.assign(new Error('PDF를 열 수 없습니다 (암호·손상 가능).'), { code: 'pdf_open_failed', cause: e, recoverable: true });
    }
    if (mode === 'original') return { pageCount: doc.numPages, sourcePageCount: doc.numPages, mode };

    await loadReflowFont(urls.reflowFontUrl);
    onProgress?.({ stage: 'reflow' });
    reflowed = await reflowDocument(doc, createMeasure(layout), layout, { OPS: pdfjs.OPS });
    if (reflowed.pages.length === 0) await openByOcr(onProgress);
    else if (reflowed.scanPages.length) await fillScanPages(onProgress);
    return { pageCount: reflowed.pages.length, sourcePageCount: doc.numPages, mode, ocr: ocrInfo, unreadSourcePages: [...unreadSourcePages] };
  }

  /**
   * 텍스트 쪽과 스캔 쪽이 섞인 문서: 스캔 쪽만 글자를 읽어 제자리에 끼운다.
   * 왜: 예전에는 문서 전체에 글이 한 줄도 없을 때만 인식했다. 섞인 문서는 스캔 쪽이 아무 표시 없이 빠져,
   *     보여 주지도 않은 쪽까지 "모든 페이지 기준 충족"으로 봉인됐다.
   * 인식을 못 해도 문서는 연다 — 대신 그 쪽 번호를 unreadSourcePages에 남기고, 부른 쪽이 반드시 사용자에게 알린다.
   */
  async function fillScanPages(onProgress) {
    const scan = reflowed.scanPages;
    unreadSourcePages = [...scan];
    if (config.ocrEnabled === false) return;
    let engine = null;
    try {
      onProgress?.({ stage: 'ocr-load' });
      engine = await createOcrEngine({
        moduleUrl: urls.tesseractModuleUrl, workerUrl: urls.tesseractWorkerUrl,
        coreUrl: urls.tesseractCoreUrl, langUrl: urls.tesseractLangUrl,
        langs: config.ocrLangs ?? OCR.langs
      });
      const r = await ocrDocument(doc, {
        engine, pages: scan,
        onProgress: (p) => onProgress?.({ stage: 'ocr-page', ...p })
      });
      const used = r.byPage.filter((p) => p.paragraphs.length > 0 && p.confidence >= OCR.minPageConfidence);
      if (!used.length) return;
      const pageParagraphs = reflowed.pageParagraphs.slice();
      for (const p of used) pageParagraphs[p.page - 1] = p.paragraphs;   // 그 쪽의 (비어 있던) 문단을 인식한 글로
      const paragraphs = pageParagraphs.flat();
      reflowed = { ...reflowed, pageParagraphs, paragraphs, pages: layoutParagraphs(paragraphs, createMeasure(layout), layout) };
      unreadSourcePages = scan.filter((n) => !used.some((p) => p.page === n));
      ocrInfo = { langs: engine.langs, confidence: used.reduce((s, p) => s + p.confidence, 0) / used.length,
        scale: r.scale, version: OCR.version, sourcePages: used.map((p) => p.page) };
    } catch (e) {
      console.warn('스캔 쪽 글자 인식 실패 — 그 쪽은 표시하지 못한 쪽으로 남긴다', e);
    } finally {
      await engine?.terminate();
    }
  }

  /**
   * 텍스트 층이 없는 사진·스캔 PDF: 쪽을 그림으로 그려 글자를 읽고 그 글로 재배치한다.
   * 인식한 글이라 틀릴 수 있다 — 부른 쪽에서 반드시 사용자에게 알려야 한다 (ocrInfo).
   */
  async function openByOcr(onProgress) {
    const noText = () => Object.assign(
      new Error('이 PDF에서 텍스트를 찾지 못했습니다. 스캔한 이미지 PDF는 다시 배치할 수 없습니다.'),
      { code: 'pdf_no_text', recoverable: true });
    if (config.ocrEnabled === false) { await close(); throw noText(); }

    const measure = createMeasure(layout);
    let engine = null;
    try {
      onProgress?.({ stage: 'ocr-load' });
      engine = await createOcrEngine({
        moduleUrl: urls.tesseractModuleUrl, workerUrl: urls.tesseractWorkerUrl,
        coreUrl: urls.tesseractCoreUrl, langUrl: urls.tesseractLangUrl,
        langs: config.ocrLangs ?? OCR.langs
      });
      const r = await ocrDocument(doc, {
        engine,
        onProgress: (p) => onProgress?.({ stage: 'ocr-page', ...p })
      });
      const pages = layoutParagraphs(r.paragraphs, measure, layout);
      const confidence = r.pageConfidences.length
        ? r.pageConfidences.reduce((s, c) => s + c, 0) / r.pageConfidences.length : 0;
      if (pages.length === 0 || confidence < OCR.minPageConfidence) {
        await close();
        throw Object.assign(
          new Error(`글자를 읽어 봤지만 알아볼 수 있는 글이 없습니다 (확신도 ${Math.round(confidence)}%). 더 선명한 PDF가 필요합니다.`),
          { code: 'ocr_unreadable', recoverable: true });
      }
      reflowed = { pages, sourcePages: doc.numPages, paragraphs: r.paragraphs };
      ocrInfo = { langs: engine.langs, confidence, scale: r.scale, version: OCR.version };
    } catch (e) {
      if (e?.code === 'ocr_unreadable') throw e;
      await close();
      if (e?.code === 'ocr_missing') throw e;        // 자산이 없다 — 안내가 다르다
      throw Object.assign(noText(), { cause: e });
    } finally {
      await engine?.terminate();
    }
  }

  async function renderPage(pageId) {
    if (!doc) throw new Error('no document');
    const mySeq = ++renderSeq;
    if (mode === 'reflow') {
      const lines = reflowed.pages[pageId - 1];
      if (!lines) throw new Error(`no page ${pageId}`);
      const lineBoxes = drawPage(canvasElement, lines, layout);
      const n = textLines(lines).length;   // 그림 자리는 세지 않는다
      return { pageId, lineCount: n > 0 ? n : null, supported: n > 0, unsupportedReason: n > 0 ? null : 'no_text', lineBoxes,
               figureCount: lines.length - n };
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
    if (mode === 'reflow') return textLines(reflowed.pages[pageId - 1] ?? []).map((l) => l.text).join(' ');
    const page = await doc.getPage(pageId);
    const content = await page.getTextContent();
    return content.items.map((it) => it.str).join(' ');
  }

  /** 재배치 결과 전체 (계약 밖). 정답 파일·시험용. */
  function getReflow() {
    return reflowed ? { version: layout.version, layout: { ...layout }, sourcePages: reflowed.sourcePages, pages: reflowed.pages, ocr: ocrInfo, unreadSourcePages: [...unreadSourcePages] } : null;
  }

  async function close() {
    renderSeq++;
    if (doc) { try { await doc.destroy(); } catch (_) { /* ignore */ } }
    doc = null; reflowed = null; ocrInfo = null; unreadSourcePages = [];
  }

  return { open, renderPage, getPageText, getReflow, close, mode, layout, get ocrInfo() { return ocrInfo; },
    get unreadSourcePages() { return [...unreadSourcePages]; } };
}
