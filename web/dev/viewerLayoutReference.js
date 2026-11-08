// A 시험 전용 고정 참조. C의 제품 파일을 대신하지 않습니다.
// 출처: kuyhxl/NunDojang commit 7ea3987fcd2df3ba1e9d0bff2e833b362c90c15e, web/modules/reflow.js.
// REFLOW, wrapText, 글꼴·캔버스 함수의 원문을 보존한 부분 복사입니다.
// 실제 로컬 C 뷰어와 자동 동기화되지 않습니다. 통합 전에 설정·좌표를 다시 대조해야 합니다.
export const REFLOW = Object.freeze({
  version: 'reflow-13px/0.1.0',
  fontPx: 13,          // 글자 크기 (CSS px, 배율 100% 기준)
  lineHeightPx: 26,    // 줄 간격
  columnPx: 520,       // 본문 폭
  linesPerPage: 12,    // 쪽당 줄 수
  padTopPx: 56,
  padBottomPx: 56,
  figureSlots: 2,      // 그림 자리 표시가 차지하는 줄 칸 수 (줄 수에는 넣지 않는다)
  fontFamily: 'NunDojang Reflow'
});

export function wrapText(text, measure, width) {
  const out = []; let cur = '';
  for (let w of text.split(' ')) {
    if (!w) continue;
    const cand = cur ? `${cur} ${w}` : w;
    if (measure(cand) <= width) { cur = cand; continue; }
    if (cur) out.push(cur);
    while (measure(w) > width) {
      let k = w.length;
      while (k > 1 && measure(w.slice(0, k)) > width) k--;
      out.push(w.slice(0, k)); w = w.slice(k);
    }
    cur = w;
  }
  if (cur) out.push(cur);
  return out;
}

let fontReady = null;
/** 원본과 같은 Noto Sans CJK KR을 캔버스용 글꼴로 등록한다. 재배치 PDF(demo/13px)와 줄 나눔이 같아진다. */
export function loadReflowFont(fontUrl) {
  if (!fontReady) {
    const face = new FontFace(REFLOW.fontFamily, `url(${fontUrl})`);
    fontReady = face.load().then((f) => { document.fonts.add(f); return true; })
      .catch((e) => { console.warn('재배치 글꼴을 불러오지 못해 시스템 글꼴을 씁니다', e); return false; });
  }
  return fontReady;
}

export const fontCss = (opts = REFLOW) => `${opts.fontPx}px "${opts.fontFamily}", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;

export function createMeasure(opts = REFLOW) {
  const ctx = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
  ctx.font = fontCss(opts);
  if ('fontKerning' in ctx) ctx.fontKerning = 'none';
  const cache = new Map();
  return (t) => { let w = cache.get(t); if (w === undefined) { w = ctx.measureText(t).width; cache.set(t, w); } return w; };
}

/**
 * 한 쪽을 캔버스에 그린다. 캔버스는 CSS 폭을 그대로 쓰고(글자가 늘어나지 않게) 기기 배율만큼 선명하게 그린다.
 * @returns lineBoxes [{top, height, left, width}] — 캔버스 CSS px. 물방울이 줄을 따라갈 때 쓴다.
 */
/** 그림 자리 표시: 옅은 회색 상자 + 안내문. 읽을 줄이 아니라는 것이 한눈에 보이게. */
function drawFigure(ctx, x, top, w, h, sourcePage, opts) {
  const y = top + 5, hh = h - 10;
  ctx.save();
  ctx.fillStyle = '#f2f2ef'; ctx.fillRect(x, y, w, hh);
  ctx.strokeStyle = '#cfcfca'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = '#85857f'; ctx.font = `12px "${opts.fontFamily}", "Apple SD Gothic Neo", sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(`그림 — 원본 ${sourcePage}쪽. 재배치 보기에서는 표시하지 않으며 줄 수에서 뺍니다`, x + w / 2, y + hh / 2);
  ctx.restore();
}

export function drawPage(canvas, pageLines, opts = REFLOW) {
  const cssW = Math.max(canvas.parentElement?.clientWidth || 0, opts.columnPx + 48);
  const cssH = opts.padTopPx + opts.linesPerPage * opts.lineHeightPx + opts.padBottomPx;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cssW, cssH);
  ctx.font = fontCss(opts);
  if ('fontKerning' in ctx) ctx.fontKerning = 'none';
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#141414';
  const left = Math.round((cssW - opts.columnPx) / 2);
  const boxes = [];
  let slot = 0;
  for (const ln of pageLines) {
    const top = opts.padTopPx + slot * opts.lineHeightPx;
    if (ln.kind === 'figure') { drawFigure(ctx, left, top, opts.columnPx, (ln.slots ?? opts.figureSlots) * opts.lineHeightPx, ln.sourcePage, opts); slot += ln.slots ?? opts.figureSlots; continue; }
    const y = top + opts.lineHeightPx / 2;
    ctx.fillStyle = '#141414';
    ctx.fillText(ln.text, left, y);
    if (ln.kind === 'h') { ctx.strokeStyle = '#141414'; ctx.lineWidth = 0.45; ctx.strokeText(ln.text, left, y); }  // 굵게: 폭이 바뀌지 않게 획만 덧칠
    boxes.push({ top, height: opts.lineHeightPx, left, width: opts.columnPx });   // 물방울은 글줄만 따라간다
    slot += 1;
  }
  return boxes;
}
