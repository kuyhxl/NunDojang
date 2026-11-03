// 텍스트 재배치 — C 소유. PDF의 텍스트를 뽑아 13px 한 단으로 다시 배치한다 (11/3 회의 결정).
// 왜: 원본 PDF는 글자 크기·단 수·배율이 제각각이라 줄바꿈 안구 운동의 폭이 문서마다 달라진다.
//     같은 크기·같은 폭으로 다시 그리면 (1) 측정 조건이 같아지고 (2) 앱이 줄 수와 줄 위치를 정확히 안다.
// 흐름: PDF.js 텍스트 조각 → 줄 → 문단 → 13px로 줄 나눔 → 12줄씩 쪽 나눔 → 캔버스에 그림.
// DOM은 drawPage에서만 쓴다. 나머지는 순수 함수라 node에서도 시험할 수 있다.

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

const MARK = /^(\d+\.\s|\d+\.\d+\s|\[\d+\](?:\s|$)|[•·\-–]\s|\([가-힣]\)|[①-⑳])/;   // 목록·참고문헌 항목의 시작
const CELL = '\u001f';   // 줄 안의 표 칸 경계 (나중에 │ 또는 공백으로 바꾼다)
const CELL_BAR = '\u00a0│ ';   // 표의 칸 구분. 앞을 줄바꿈 없는 공백으로 붙여 │가 줄 맨 앞에 오지 않게
const CELL_GAP = 12;   // pt. 표의 칸 사이로 볼 최소 간격 (양쪽 정렬로 넓어진 낱말 간격은 8pt 이하였다)

// ---------------------------------------------------------------- 1) 조각 → 줄

/** 고정폭 글꼴 찾기: 영문·숫자 조각의 글자당 폭이 모두 0.6em 근처인 글꼴. (PDF.js는 글꼴 이름을 주지 않는다) */
function monoFonts(items) {
  const stat = new Map();
  for (const it of items) {
    if (!/^[\x21-\x7e]+$/.test(it.str)) continue;
    const size = Math.hypot(it.transform[2], it.transform[3]) || it.height;
    const r = it.width / (it.str.length * size);
    const s = stat.get(it.fontName) ?? { n: 0, ok: 0 };
    s.n++; if (r > 0.57 && r < 0.63) s.ok++;
    stat.set(it.fontName, s);
  }
  return new Set([...stat].filter(([, s]) => s.n >= 2 && s.ok === s.n).map(([f]) => f));
}

/**
 * 한 쪽의 텍스트 조각을 화면에 보이는 줄로 묶는다.
 * - 멀리 떨어짐(max(12pt, 글자 1.2개) 초과) = 표의 다른 칸 → 두 칸 띄어 붙이고 row 표시
 * - 공백 조각 = 낱말 사이 (양쪽 정렬로 넓어져도 공백 하나)
 * - 공백 조각 없이 조금 떨어짐 = 글꼴이 바뀌는 자리의 낱말 사이(기울임 N 등) → 공백 하나
 * - 자간을 넓힌 제목(글자마다 공백 조각)은 넓은 공백만 낱말 사이로 본다
 */
export function itemsToLines(items, pageHeight) {
  const mono = monoFonts(items);
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (!it.str) continue;
    const size = Math.round((Math.hypot(it.transform[2], it.transform[3]) || it.height) * 10) / 10;
    const x0 = it.transform[4], x1 = x0 + it.width, base = pageHeight - it.transform[5];
    const blank = it.str.trim() === '';
    const isMono = mono.has(it.fontName);
    const ascii = /[\x21-\x7e]/.test(it.str);
    // 같은 줄: 기준선이 같고 오른쪽으로 이어짐. 크롬이 만든 한글(Type3)은 폭이 조금 크게 잡혀 겹칠 수 있어 여유를 둔다.
    if (cur && Math.abs(base - cur.base) < 3 && x0 > cur.x1 - Math.max(1, size * 0.6)) {
      if (blank) { cur.pendW = (cur.pendW ?? 0) + it.width; if (cur.firstW === null) cur.firstW = cur.x1 - cur.x0; continue; }
      const gap = x0 - cur.x1;   // 공백 조각의 폭은 부정확해 위치 계산에는 쓰지 않는다
      let sep = null;
      const cellGap = Math.max(CELL_GAP, size * 1.2);
      if (gap > cellGap) { sep = { kind: 'cell' }; cur.row = true; if (cur.firstW === null) cur.firstW = cur.x1 - cur.x0; }
      else if (cur.pendW !== null) sep = { kind: 'space', w: cur.pendW, gap, size };
      else if (gap > size * 0.25) sep = { kind: 'space', w: gap, gap, size };
      if (sep) cur.parts.push(sep);
      cur.parts.push({ kind: 'text', s: it.str }); cur.pendW = null;
      cur.x1 = x1; cur.sizes.set(size, (cur.sizes.get(size) ?? 0) + it.str.length);
      if (ascii) { cur.monoHits += isMono ? 1 : 0; cur.propHits += isMono ? 0 : 1; }
      continue;
    }
    if (blank) continue;   // 줄 맨 앞의 공백 조각
    cur = { parts: [{ kind: 'text', s: it.str }], pendW: null, firstW: null, x0, x1, base, sizes: new Map([[size, it.str.length]]), row: false,
            monoHits: ascii && isMono ? 1 : 0, propHits: ascii && !isMono ? 1 : 0 };
    lines.push(cur);
  }
  const out = lines.map((l) => {
    const isMono = l.monoHits > 0 && l.propHits === 0;
    const spaces = l.parts.filter((p) => p.kind === 'space');
    const texts = l.parts.filter((p) => p.kind === 'text');
    // 자간을 넓힌 제목: 거의 모든 글자 뒤에 공백 조각이 있고 공백 폭이 두 무리로 갈림 → 넓은 쪽만 낱말 사이
    let minWord = 0;
    if (!isMono && spaces.length >= 3 && spaces.length >= (texts.length - 1) * 0.7) {
      const ws = spaces.map((p) => p.w).sort((a, b) => a - b);
      if (ws[ws.length - 1] > ws[0] * 1.8) minWord = (ws[0] + ws[ws.length - 1]) / 2;
    }
    let text = '', exact = '';
    for (const p of l.parts) {
      if (p.kind === 'text') { text += p.s; exact += p.s; }
      else if (p.kind === 'cell') { text += CELL; exact += '  '; }
      else if (p.w >= minWord) { text += ' '; exact += ' '.repeat(isMono ? Math.max(1, Math.round(p.gap / (0.602 * p.size))) : 1); }
    }
    const clean = (s) => s.replace(/\u00a0/g, ' ');
    const size = [...l.sizes].sort((a, b) => b[1] - a[1])[0][0];   // 줄의 글자 크기 = 가장 많은 글자의 크기 (기울임 N 같은 조각 무시)
    return {
      x0: l.x0, x1: l.x1, base: l.base, size, row: l.row, mono: isMono,
      firstW: l.firstW ?? l.x1 - l.x0,                    // 첫 낱말의 폭 — 앞 줄에 들어갈 수 있었는지 판단용
      raw: clean(exact).replace(/\s+$/, ''),             // 코드 줄: 공백 그대로
      t: clean(text).replace(/\s+/g, ' ').trim()
    };
  });
  // 칸 경계: 위나 아래 줄도 표의 행이면 진짜 표 → │로 구분. 혼자 떨어진 줄(머리말의 날짜 등)은 공백 하나
  return out.map((l, i) => {
    const inTable = l.row && (out[i - 1]?.row || out[i + 1]?.row);
    return { ...l, row: inTable, t: l.t.replace(/\s*\u001f\s*/g, inTable ? CELL_BAR : ' ').trim() };   // 혼자 떨어진 줄은 표로 보지 않는다 (글 속 아이콘 자리 등)
  });
}

// ---------------------------------------------------------------- 2) 줄 → 문단

/**
 * 다음 줄의 첫 낱말이 앞 줄 끝에 들어갈 수 없었고(= 자동 줄바꿈) 글자 크기가 같으면 같은 문단으로 잇는다 (2단 논문의 단 넘김 포함).
 * 끊는 경우: 표의 행, 코드 줄, 가운데 정렬 줄(수식·캡션), 목록 번호로 시작하는 줄, 문단 사이 간격, 크기가 다른 줄(제목).
 */
export function linesToParagraphs(lines, pageWidth) {
  if (!lines.length) return [];
  const chars = new Map();
  for (const l of lines) chars.set(l.size, (chars.get(l.size) ?? 0) + l.t.length);
  const body = [...chars].sort((a, b) => b[1] - a[1])[0][0];      // 본문 글자 크기 = 글자 수가 가장 많은 크기

  const mid = pageWidth / 2;
  // 2단: 가운데 왼쪽에 끝나는 줄과 오른쪽에서 시작하는 줄이 각각 2줄 이상, 그 줄들의 왼쪽 끝이 가지런함
  const aligned = (ls) => ls.some((a) => ls.filter((b) => Math.abs(a.x0 - b.x0) < 2).length >= 2);
  const twoCol = aligned(lines.filter((l) => l.x1 < mid - 5)) && aligned(lines.filter((l) => l.x0 > mid + 5));
  const col = (l) => (!twoCol ? 'F' : l.x1 <= mid + 5 ? 'L' : l.x0 >= mid - 5 ? 'R' : 'F');
  const right = {};
  for (const l of lines) right[col(l)] = Math.max(right[col(l)] ?? 0, l.x1);

  const paras = [];
  let cur = null;
  for (const ln of lines) {
    const prev = cur?.last;
    const colBreak = prev && ln.base < prev.base;                    // 위로 올라감 = 다음 단 첫 줄
    const cont = prev && !cur.row && !cur.solo && !prev.mono && !ln.mono && !ln.row
      && prev.size === ln.size
      && (ln.x0 <= prev.x0 + 2 || colBreak || (cur.list && ln.x0 <= cur.x0 + 24))
      && prev.x1 + prev.size * 0.4 + ln.firstW > right[col(prev)] - 2     // 다음 줄 첫 낱말이 앞 줄에 들어갈 수 없었다 = 자동 줄바꿈
      && !MARK.test(ln.t)
      && (colBreak || ln.base - prev.base < prev.size * 2.0);
    if (cont) {
      const glue = /[_\-/]$/.test(cur.t) || /^\[\d/.test(ln.t) ? '' : ' ';   // 줄 끝 하이픈·밑줄, 인용 번호는 붙인다
      cur.t += glue + ln.t; cur.last = ln; continue;
    }
    const solo = !!prev && ln.x0 > prev.x0 + 20 && ln.base > prev.base;  // 가운데 정렬 줄
    cur = { t: ln.mono ? ln.raw : ln.t, kind: ln.mono ? 'code' : ln.size > body + 0.3 ? 'h' : 'p',
            last: ln, row: ln.row, solo, list: MARK.test(ln.t), x0: ln.x0, x1: ln.x1, top: ln.base - ln.size };
    paras.push(cur);
  }
  return paras
    .map((p) => ({ kind: p.kind, text: p.kind === 'code' ? p.t : p.t.replace(/[\s\u00a0│]+\d+\s*\/\s*\d+$/, '').trim(), top: p.top, x0: p.x0, x1: p.x1 }))  // 꼬리말 "1 / 1"
    .filter((p) => p.text && !/^(-\s*\d+\s*-|\d+\s*\/\s*\d+)$/.test(p.text.trim()));                                 // 쪽 번호
}

// ---------------------------------------------------------------- 3) 문단 → 13px 줄 → 쪽

/** 낱말 단위로 폭에 맞춰 나눈다. 한 낱말이 폭보다 길면 글자 단위로 자른다. measure(text) → px */
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

/**
 * 쪽마다 linesPerPage 칸. 글줄은 1칸, 그림 자리 표시는 figureSlots칸(남은 칸이 모자라면 다음 쪽으로).
 * 그림 자리는 {kind:'figure', slots, sourcePage}로 들어가고 줄 수(lineCount)에는 세지 않는다.
 */
export function layoutParagraphs(paras, measure, opts = REFLOW) {
  const items = [];
  for (const p of paras) {
    if (p.kind === 'figure') { items.push({ kind: 'figure', text: '', slots: opts.figureSlots, sourcePage: p.sourcePage }); continue; }
    if (p.kind === 'code' && measure(p.text) <= opts.columnPx) { items.push({ kind: 'code', text: p.text }); continue; }  // 코드 줄은 공백 유지
    for (const t of wrapText(p.text, measure, opts.columnPx)) items.push({ kind: p.kind, text: t });
  }
  const pages = []; let page = [], used = 0;
  for (const it of items) {
    const need = it.slots ?? 1;
    if (used + need > opts.linesPerPage && page.length) { pages.push(page); page = []; used = 0; }
    page.push(it); used += need;
  }
  if (page.length) pages.push(page);
  // 그림 자리만 있는 쪽은 뺀다: 읽을 줄이 없는 쪽은 점수를 낼 수 없어 서명을 막기 때문
  return pages.filter((pg) => pg.some((l) => l.kind !== 'figure'));
}

/** 그림 자리를 뺀 글줄만. 줄 수·검색·정답 파일에 쓴다. */
export const textLines = (pageItems) => pageItems.filter((l) => l.kind !== 'figure');

// ---------------------------------------------------------------- 그림(사진·이미지) 찾기

const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];

/**
 * 쪽 안의 래스터 그림 위치. PDF.js 그리기 명령을 따라가며 좌표 변환(CTM)을 계산해 그림의 단위 사각형을 쪽 좌표로 옮긴다.
 * 너무 작은 것(아이콘·글머리표)과 쪽 대부분을 덮는 것(배경·스캔)은 뺀다.
 * @returns [{x0, x1, top, bottom}] 위에서부터 잰 pt
 */
export async function findImages(page, OPS, pageW, pageH) {
  if (!OPS) return [];
  const { fnArray, argsArray } = await page.getOperatorList();
  const paint = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter((v) => v !== undefined));
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; const boxes = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (paint.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const b = { x0: Math.min(...xs), x1: Math.max(...xs), top: pageH - Math.max(...ys), bottom: pageH - Math.min(...ys) };
      const w = b.x1 - b.x0, h = b.bottom - b.top;
      if (w < 24 || h < 24) continue;                              // 아이콘·글머리표
      if (w * h > pageW * pageH * 0.6) continue;                    // 배경·스캔 쪽
      boxes.push(b);
    }
  }
  // 겹치거나 맞닿은 조각(타일로 나뉜 그림)은 하나로
  boxes.sort((a, b) => a.top - b.top);
  const merged = [];
  for (const b of boxes) {
    const m = merged.find((o) => b.x0 <= o.x1 + 2 && b.x1 >= o.x0 - 2 && b.top <= o.bottom + 2 && b.bottom >= o.top - 2);
    if (m) { m.x0 = Math.min(m.x0, b.x0); m.x1 = Math.max(m.x1, b.x1); m.top = Math.min(m.top, b.top); m.bottom = Math.max(m.bottom, b.bottom); }
    else merged.push({ ...b });
  }
  return merged;
}

/** 그림 안에 찍힌 글(그래프 축 이름 등)은 읽는 글이 아니므로 뺀다. */
function insideAny(line, imgs) {
  const cx = (line.x0 + line.x1) / 2, cy = line.base - line.size / 2;
  return imgs.some((b) => cx >= b.x0 - 2 && cx <= b.x1 + 2 && cy >= b.top - 2 && cy <= b.bottom + 2);
}

/** 그림 자리를 읽는 순서에 끼운다: 같은 단에서 그림 위쪽보다 아래에서 시작하는 첫 문단 앞. */
function insertFigures(paras, imgs, sourcePage, pageW) {
  const mid = pageW / 2;
  const colOf = (x0, x1) => (x1 <= mid + 5 ? 'L' : x0 >= mid - 5 ? 'R' : 'F');
  const out = [...paras];
  for (const b of [...imgs].sort((a, c) => a.top - c.top)) {
    const c = colOf(b.x0, b.x1);
    const fig = { kind: 'figure', text: '', top: b.top, x0: b.x0, x1: b.x1, sourcePage };
    const same = (p) => p.kind !== 'figure' && (c === 'F' || colOf(p.x0, p.x1) === c || colOf(p.x0, p.x1) === 'F');
    // 같은 단에서 그림보다 위에서 시작한 마지막 문단 뒤. 그런 문단이 없으면 그 단의 첫 문단 앞
    let at = -1;
    out.forEach((p, k) => { if (same(p) && p.top < b.top - 1) at = k + 1; });
    if (at === -1) { at = out.findIndex(same); if (at === -1) at = out.length; }
    out.splice(at, 0, fig);
  }
  return out;
}

// ---------------------------------------------------------------- 4) PDF 문서 → 재배치 결과

/**
 * @param pdfDoc PDF.js 문서
 * @param measure (text) → 13px 글꼴에서의 폭(px)
 * @param env.OPS PDF.js의 OPS 표 (그림 위치를 찾을 때 필요. 없으면 그림을 찾지 않는다)
 * @returns {pages: [[{kind,text} | {kind:'figure',slots,sourcePage}]], sourcePages, paragraphs}
 */
export async function reflowDocument(pdfDoc, measure, opts = REFLOW, { OPS } = {}) {
  // 이미 재배치해 둔 PDF(demo/13px)를 다시 열면 줄을 그대로 쓴다 — 다시 이으면 줄 나눔이 바뀐다
  const meta = await pdfDoc.getMetadata().catch(() => null);
  const already = /nundojang/.test(meta?.info?.Keywords ?? '') && /reflow/.test(meta?.info?.Keywords ?? '');
  const paragraphs = [];
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    const page = await pdfDoc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let lines = itemsToLines(tc.items, vp.height);
    if (already) {   // 그림 자리 안내문은 다시 그림 자리로
      paragraphs.push(...lines.map((l) => { const m = /^그림 — 원본 (\d+)쪽\./.exec(l.t); return m ? { kind: 'figure', text: '', sourcePage: +m[1] } : { kind: 'p', text: l.t }; }));
      continue;
    }
    const imgs = await findImages(page, OPS, vp.width, vp.height).catch(() => []);
    if (imgs.length) lines = lines.filter((l) => !insideAny(l, imgs));
    paragraphs.push(...insertFigures(linesToParagraphs(lines, vp.width), imgs, n, vp.width));
  }
  return { pages: layoutParagraphs(paragraphs, measure, opts), sourcePages: pdfDoc.numPages, paragraphs };
}

// ---------------------------------------------------------------- 5) 그리기 (브라우저 전용)

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
