// 이미지 PDF 글자 인식(OCR) — C 소유.
// 왜: 재배치(reflow.js)는 PDF가 이미 갖고 있는 텍스트 층만 입력으로 받는다. 사진·스캔 PDF는 그 층이 없어
//     `pdf_no_text`로 막혔다. 여기서 쪽을 그림으로 그린 뒤 글자를 읽어 같은 모양의 '줄'을 만들어 주면,
//     그 뒤 문단 잇기·줄 나눔·쪽 나눔은 텍스트 PDF와 똑같은 길을 탄다.
// 흐름: PDF 쪽 → 캔버스 그림 → Tesseract → 낱말 상자 → 줄 → (reflow.js) 문단 → 13·20·24px 줄 → 쪽.
//
// 한계 (발표에서 주장하면 안 되는 것):
//  - 인식이 틀리면 글이 틀린다. 특히 작은 글씨·회색 글씨·표 안 숫자. 사람이 보고 고칠 길은 아직 없다.
//  - 줄 나눔은 인식된 낱말 상자에서 다시 만든 것이라 원본의 줄과 다를 수 있다.
//  - 그러므로 OCR로 연 문서는 '읽기 측정 시험용'이고, 봉인은 원본 글자를 보증하지 않는다.
// DOM·브라우저가 필요한 것은 createOcrEngine·ocrDocument뿐이다. 나머지는 순수 함수라 node에서 시험한다.

import { linesToParagraphs } from './reflow.js';

export const OCR = Object.freeze({
  version: 'ocr-tesseract/0.1.0',
  langs: 'kor+eng',
  /** 인식에 넣을 그림의 목표 가로 픽셀. 작은 쪽은 키워서, 큰 쪽은 줄여서 이 근처로 맞춘다 */
  targetWidthPx: 2000,
  minScale: 1.5,
  maxScale: 4,
  /** 이 확신도 미만인 낱말은 버린다 (0~100). Tesseract 기본 출력 기준 */
  minConfidence: 40,
  /** 줄 평균 확신도가 이보다 낮으면 줄째로 버린다. 화살표·장식 그림을 글자로 읽은 줄이 여기서 걸린다
   *  (실측: 장식 줄 15%, 본문 줄 76~97%) */
  minLineConfidence: 50,
  /** 이 비율(× 글자 높이)보다 크게 벌어지면 한 줄이 아니라 **다른 단**으로 본다.
   *  Tesseract는 좌우로 나란한 상자 두 개를 한 줄로 이어 읽어 내놓을 때가 있다 (안내문·포스터).
   *  그대로 두면 왼쪽 단과 오른쪽 단의 글이 한 줄 안에서 번갈아 섞인다. 여기서 잘라 두면
   *  reflow.js의 2단 판별이 제 일을 한다. 실측: 단 사이 265px, 글자 높이 40px (6.6배) */
  columnGapRatio: 2.5,
  /** 낱말 사이 띄어쓰기로 볼 최소 간격 = 글자 높이의 이 비율.
   *  한글은 한 낱말이 음절 상자로 쪼개져 나와서 ('코','로','나') 그냥 이으면 "코 로 나"가 된다.
   *  실측(2026-11-17, 질병관리청 안내문): 음절 사이 -1~13px, 낱말 사이 21~35px, 글자 높이 40~46px */
  spaceGapRatio: 0.4,
  /** 쪽 전체 평균 확신도가 이보다 낮으면 '읽을 수 없는 쪽'으로 본다 */
  minPageConfidence: 30
});

// ---------------------------------------------------------------- 1) Tesseract 결과 → 줄별 낱말

/**
 * Tesseract 판마다 결과 모양이 달라(v5는 data.blocks 중첩, 예전 판은 data.lines/words 평면)
 * 줄 단위 낱말 묶음만 꺼낸다.
 * @returns [[{text, confidence, bbox:{x0,y0,x1,y1}}]]  줄 하나가 배열 하나
 */
export function collectLines(data) {
  const out = [];
  const pushLine = (words) => {
    const ws = (words ?? []).filter((w) => w && typeof w.text === 'string' && w.bbox);
    if (ws.length) out.push(ws);
  };
  if (Array.isArray(data?.blocks)) {
    for (const b of data.blocks) for (const p of b?.paragraphs ?? []) for (const l of p?.lines ?? []) pushLine(l.words);
    if (out.length) return out;
  }
  if (Array.isArray(data?.lines)) {
    for (const l of data.lines) pushLine(l.words);
    if (out.length) return out;
  }
  // 줄 구조가 없으면 낱말만 있는 것이다 — 세로 위치로 직접 묶는다
  if (Array.isArray(data?.words) && data.words.length) {
    const ws = [...data.words].filter((w) => w?.bbox).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const pushRow = (row) => pushLine([...row].sort((a, b) => a.bbox.x0 - b.bbox.x0));   // 한 줄 안은 왼쪽부터
    let cur = [];
    for (const w of ws) {
      const prev = cur[cur.length - 1];
      const h = prev ? Math.max(prev.bbox.y1 - prev.bbox.y0, w.bbox.y1 - w.bbox.y0) : 0;
      if (prev && Math.abs(w.bbox.y1 - prev.bbox.y1) > h * 0.6) { pushRow(cur); cur = []; }
      cur.push(w);
    }
    pushRow(cur);
  }
  return out;
}

/** 가운데값. 글자 크기를 낱말 높이의 중앙값으로 잡아 유난히 큰·작은 상자에 끌려가지 않게 한다. */
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 인식된 낱말 상자를 reflow.js의 `itemsToLines`가 내는 줄과 같은 모양으로 바꾼다.
 * 좌표는 그림 픽셀 → pt (scale로 나눈다). y는 쪽 위에서부터 잰다 (itemsToLines의 base와 같은 기준).
 *
 * @param {Array} lineWords collectLines의 결과
 * @param {{scale:number, minConfidence?:number}} o scale = 그림 픽셀 ÷ pt
 * @returns [{x0,x1,base,size,row,mono,firstW,raw,t}]
 */
export function wordsToLines(lineWords, {
  scale, minConfidence = OCR.minConfidence, minLineConfidence = OCR.minLineConfidence,
  spaceGapRatio = OCR.spaceGapRatio, columnGapRatio = OCR.columnGapRatio
} = {}) {
  if (!(scale > 0)) throw new Error('scale이 필요합니다');
  const px = (v) => v / scale;
  const lines = [];
  for (const words of lineWords) {
    const keep = words.filter((w) => w.text.trim() && (w.confidence ?? 100) >= minConfidence);
    if (!keep.length) continue;
    const conf = keep.reduce((s, w) => s + (w.confidence ?? 100), 0) / keep.length;
    if (conf < minLineConfidence) continue;          // 장식 그림을 글자로 읽은 줄
    const hPx = median(keep.map((w) => w.bbox.y1 - w.bbox.y0));

    // 크게 벌어진 자리에서 끊는다 = 서로 다른 단 (한 줄로 이어 읽어 내놓은 것을 되돌린다)
    const segs = [[keep[0]]];
    for (let i = 1; i < keep.length; i++) {
      if (keep[i].bbox.x0 - keep[i - 1].bbox.x1 > hPx * columnGapRatio) segs.push([]);
      segs[segs.length - 1].push(keep[i]);
    }

    for (const seg of segs) {
      // 상자 사이가 글자 높이의 spaceGapRatio를 넘을 때만 띄어쓴다. 그래야 음절로 쪼개진 한글이 다시 붙는다.
      let t = '', firstEnd = null;
      seg.forEach((w, i) => {
        const prev = seg[i - 1];
        const spaced = prev && w.bbox.x0 - prev.bbox.x1 > hPx * spaceGapRatio;
        if (spaced && firstEnd === null) firstEnd = prev.bbox.x1;      // 첫 낱말이 끝나는 자리
        t += (spaced ? ' ' : '') + w.text.trim();
      });
      t = t.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const size = Math.round(px(median(seg.map((w) => w.bbox.y1 - w.bbox.y0))) * 10) / 10;
      lines.push({
        x0: px(Math.min(...seg.map((w) => w.bbox.x0))),
        x1: px(Math.max(...seg.map((w) => w.bbox.x1))),
        base: px(Math.max(...seg.map((w) => w.bbox.y1))),              // 아랫변 ≈ 기준선
        size: size > 0 ? size : 1,
        row: false,        // 표 칸은 인식 결과만으로 가릴 수 없다 (상자 간격이 글꼴마다 달라진다)
        mono: false,       // 고정폭 판별은 글꼴 이름이 있어야 하는데 OCR은 주지 않는다
        firstW: px((firstEnd ?? seg[seg.length - 1].bbox.x1) - seg[0].bbox.x0),
        raw: t, t
      });
    }
  }
  // 읽는 순서: 위에서 아래, 같은 높이면 왼쪽부터. Tesseract가 이미 그 순서로 주지만 다시 맞춰 둔다
  return lines.sort((a, b) => (Math.abs(a.base - b.base) < Math.max(a.size, b.size) * 0.5 ? a.x0 - b.x0 : a.base - b.base));
}

/** 쪽 전체 평균 확신도 (낱말 수로 가중). 결과를 믿을 만한지 가리는 데 쓴다. */
export function pageConfidence(lineWords) {
  const ws = lineWords.flat().filter((w) => w.text.trim());
  if (!ws.length) return 0;
  return ws.reduce((s, w) => s + (w.confidence ?? 0), 0) / ws.length;
}

/** 인식에 넣을 그림 배율: 가로를 targetWidthPx 근처로 맞추되 minScale~maxScale 안에 둔다. */
export function renderScaleFor(pageWidthPt, opts = OCR) {
  if (!(pageWidthPt > 0)) return opts.minScale;
  return Math.min(opts.maxScale, Math.max(opts.minScale, opts.targetWidthPx / pageWidthPt));
}

// ---------------------------------------------------------------- 2) 엔진 (브라우저 전용)

/**
 * Tesseract 일꾼을 띄운다. 자산은 모두 vendor에 받아 둔 것을 쓴다 (오프라인 동작).
 * @param {{moduleUrl, workerUrl, coreUrl, langUrl, langs, onProgress}} o
 * @returns {Promise<{recognize(canvas):Promise<object>, terminate():Promise<void>, langs:string}>}
 */
export async function createOcrEngine({ moduleUrl, workerUrl, coreUrl, langUrl, langs = OCR.langs, onProgress } = {}) {
  let T;
  try {
    T = await import(/* @vite-ignore */ moduleUrl);
  } catch (e) {
    throw Object.assign(new Error('글자 인식 자산(tesseract.js)을 불러오지 못했습니다. python3 tools/setup_assets.py 를 먼저 실행하세요.'),
      { code: 'ocr_missing', cause: e, recoverable: false });
  }
  const create = T.createWorker ?? T.default?.createWorker;
  if (!create) throw Object.assign(new Error('tesseract.js 모양이 예상과 다릅니다.'), { code: 'ocr_missing' });

  // logger 자리에 undefined를 넣으면 tesseract.js가 그대로 부르려다 터진다 — 줄 때만 넣는다
  const options = { workerPath: workerUrl, corePath: coreUrl, langPath: langUrl, gzip: true };
  if (onProgress) options.logger = (m) => { if (m?.status === 'recognizing text') onProgress(m.progress ?? 0); };
  const worker = await create(langs, 1, options);  // 1 = LSTM 전용 (vendor에 받는 core도 lstm판)
  return {
    langs,
    async recognize(canvas) { return (await worker.recognize(canvas)).data; },
    async terminate() { try { await worker.terminate(); } catch (_) { /* ignore */ } }
  };
}

// ---------------------------------------------------------------- 3) 문서 전체 (브라우저 전용)

/**
 * PDF 쪽들을 그림으로 그려 글자를 읽고, reflow.js가 받을 문단 목록을 만든다.
 * @param pdfDoc PDF.js 문서
 * @param {{engine, opts, onProgress, signal, pages}} env onProgress({page, pageCount, ratio})
 *   pages: 인식할 원본 쪽 번호들. 안 주면 문서 전체. 텍스트 쪽과 스캔 쪽이 섞인 문서에서 스캔 쪽만 읽을 때 준다.
 *   그때 onProgress의 page·pageCount는 "고른 쪽 중 몇 번째"이고, 원본 쪽 번호는 sourcePage로 간다.
 * @returns {Promise<{paragraphs:Array, pageConfidences:number[], scale:number, byPage:Array<{page:number, paragraphs:Array, confidence:number}>}>}
 */
export async function ocrDocument(pdfDoc, { engine, opts = OCR, onProgress, signal, pages = null } = {}) {
  const paragraphs = [];
  const pageConfidences = [];
  const byPage = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  let scale = opts.minScale;
  const list = Array.isArray(pages) ? pages : Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (signal?.aborted) throw Object.assign(new Error('글자 인식을 멈췄습니다.'), { code: 'ocr_aborted' });
    const page = await pdfDoc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    scale = renderScaleFor(base.width, opts);
    const vp = page.getViewport({ scale });
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);   // 투명 배경이 검게 인식되지 않게
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    onProgress?.({ page: i + 1, pageCount: list.length, sourcePage: n, ratio: 0 });
    const data = await engine.recognize(canvas);
    const lineWords = collectLines(data);
    const confidence = pageConfidence(lineWords);
    pageConfidences.push(confidence);
    const lines = wordsToLines(lineWords, { scale, minConfidence: opts.minConfidence });
    const paras = linesToParagraphs(lines, base.width);
    paragraphs.push(...paras);
    byPage.push({ page: n, paragraphs: paras, confidence });
    onProgress?.({ page: i + 1, pageCount: list.length, sourcePage: n, ratio: 1 });
  }
  canvas.width = canvas.height = 0;
  return { paragraphs, pageConfidences, scale, byPage };
}
