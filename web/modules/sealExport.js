// 봉인(Seal) 1단계 — C 소유.
// 계약: issueSeal({pdfFile, snapshot, signaturePng, config}) → {sealId, issuedAt, sealedPdfBlob, sealPayload}
// 규칙: canSign·동의·서명이 모두 충족된 상태에서만 호출. 원본 페이지는 건드리지 않고 마지막에 스탬프 페이지 1장을 추가.
// 구현 방식: 스탬프 페이지를 캔버스에 그려(재배치와 같은 Noto Sans KR) PNG로 넣는다.
//   pdf-lib에 한글 TTF를 넣으려면 fontkit이 더 필요해, 데모 전까지는 그림으로 넣고 봉인 번호만 Helvetica 글자로 함께 남긴다
//   (복사·검색용). 봉인 내용(sealPayload)은 PDF 메타데이터(Subject·Keywords)와 첨부 파일 seal-<sealId>.json에도 넣는다.
import { resolveAssetUrls } from './config.js';
import { loadReflowFont, REFLOW } from './reflow.js';

export const SEAL_SCHEMA_VERSION = 'gazegate-seal/0.1.0';
export const SEAL_NOTICE = '이 봉인은 눈도장 뷰어에서 읽기 기준 충족 기록에 서명했음을 나타냅니다. 신원 인증이나 법적 효력을 뜻하지 않습니다.';

export function makeSealId(prefix = 'GG', now = new Date()) {
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(4); crypto.getRandomValues(buf);
  const rand = Array.from(buf, (b) => alphabet[b % alphabet.length]).join('');
  return `${prefix}-${d}-${rand}`;
}

export function isoWithOffset(now = new Date()) {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
}

export function buildSealPayload({ snapshot, signatureMethod, signatureImageSha256, appVersion, config, sealId, issuedAt }) {
  return {
    schemaVersion: SEAL_SCHEMA_VERSION,
    sealId, issuedAt,
    documentId: snapshot.documentId,
    sessionId: snapshot.sessionId,
    pageCount: snapshot.pageCount,
    pages: snapshot.pages.map((p) => ({ pageId: p.pageId, displayScore: p.evaluation.displayScore, passed: p.evaluation.passed })),
    signatureMethod, signatureImageSha256,
    appVersion,
    contractVersion: config.contractVersion,
    scorePolicyVersion: config.scorePolicyVersion,
    sealPolicyVersion: config.sealPolicyVersion,
    originalPdfSha256: null, // 2단계
    sealSignature: null      // 2단계
  };
}

// ---------------------------------------------------------------- 스탬프 페이지 그리기 (브라우저 전용)

const A4 = [595.28, 841.89];        // pt
const RENDER_SCALE = 3;             // 1pt = 3px → 약 216dpi
const INK = '#16181d', MUTED = '#6b7280', LINE = '#d9dce1', RED = '#c8102e', GOOD = '#1f7a4d', BAD = '#b42318';

const fmtIssued = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/.exec(iso);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 ${m[4]}:${m[5]}:${m[6]} (UTC${m[7]})` : iso;
};

// 점수 표가 쓸 수 있는 높이. 이보다 길면 서명란과 아래 고지문을 덮는다.
const TABLE_MAX_H = 290;             // pt
const TABLE_MIN_ROW_H = 7;           // pt. 이보다 낮으면 글자를 읽을 수 없다
const TABLE_MAX_ROWS = Math.floor(TABLE_MAX_H / TABLE_MIN_ROW_H) - 1;   // 머리줄을 뺀 한 단의 최대 줄 수 (40)
const TABLE_MAX_COLS = 8;            // 쪽마다 한 줄씩 적을 때의 최대 단 수 → 320쪽까지
const TABLE_GROUP_COLS = 6;          // 묶어 적을 때의 단 수 ("1201–1205"처럼 쪽 표시가 길어 단을 넓힌다)

/**
 * 점수 표의 배치. 쪽 수가 몇이든 표 높이가 TABLE_MAX_H를 넘지 않게 한다 (DOM을 쓰지 않아 node에서 시험할 수 있다).
 *  - 160쪽까지: 예전과 같다 (최대 4단)
 *  - 320쪽까지: 단을 8단까지 늘린다
 *  - 그 위: 여러 쪽을 한 줄로 묶어 그 묶음의 **가장 낮은 점수**를 적는다. 쪽별 점수는 첨부한 seal-<id>.json에 그대로 있다
 * 왜: 예전에는 줄 높이를 7pt 밑으로 못 줄이면서 단은 4단에 묶여 있어, 약 168쪽을 넘으면 표가 서명란을 덮고
 *     320쪽쯤에서는 서명란이 쪽 밖으로 밀려 나갔다. 재배치는 쪽당 12줄이라 긴 문서는 쉽게 그 쪽 수가 된다.
 * @param {Array<{pageId:number, displayScore:number|null, passed:boolean}>} pages
 * @returns {{rows:Array<{label:string, score:number|null, passed:boolean, verdict:string}>, cols:number, rowsPerCol:number, rowH:number, heightPt:number, groupSize:number}}
 */
export function stampTableLayout(pages) {
  const n = pages.length;
  let rows, cols, groupSize = 1;
  if (n <= TABLE_MAX_COLS * TABLE_MAX_ROWS) {
    rows = pages.map((p) => ({ label: String(p.pageId), score: p.displayScore, passed: p.passed, verdict: p.passed ? '통과' : '미달' }));
    cols = n <= 4 * TABLE_MAX_ROWS ? Math.max(1, Math.min(4, Math.ceil(n / 16))) : Math.ceil(n / TABLE_MAX_ROWS);
  } else {
    cols = TABLE_GROUP_COLS;
    groupSize = Math.ceil(n / (cols * TABLE_MAX_ROWS));
    rows = [];
    for (let i = 0; i < n; i += groupSize) {
      const g = pages.slice(i, i + groupSize);
      const scores = g.map((p) => p.displayScore).filter(Number.isFinite);
      const failed = g.filter((p) => !p.passed).length;
      rows.push({
        label: g.length > 1 ? `${g[0].pageId}–${g[g.length - 1].pageId}` : String(g[0].pageId),
        score: scores.length ? Math.min(...scores) : null,
        passed: failed === 0, verdict: failed ? `미달 ${failed}` : '통과'
      });
    }
  }
  const rowsPerCol = Math.ceil(rows.length / cols);
  const rowH = Math.max(TABLE_MIN_ROW_H, Math.min(17, TABLE_MAX_H / (rowsPerCol + 1)));
  return { rows, cols, rowsPerCol, rowH, heightPt: rowH * (rowsPerCol + 1), groupSize };
}

/** 긴 글을 폭에 맞춰 줄 나눔 (한글은 글자 단위) */
function wrapText(ctx, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line.trimEnd()); line = ch === ' ' ? '' : ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}

async function dataUrlToBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

/**
 * 스탬프 페이지 PNG를 만든다.
 * @returns {Promise<{png: Uint8Array, fontFallback: boolean}>}
 */
export async function renderStampPng({ payload, docName, signaturePng, fontUrl }) {
  const fontOk = fontUrl ? await loadReflowFont(fontUrl) : false;
  const family = `"${REFLOW.fontFamily}", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const font = (pt) => `${pt}px ${family}`;

  const [W, H] = A4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * RENDER_SCALE); canvas.height = Math.round(H * RENDER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  const M = 56;                          // 여백
  const passedAll = payload.pages.every((p) => p.passed);
  const passedCount = payload.pages.filter((p) => p.passed).length;

  // 바깥 테두리
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(M - 20, M - 20, W - 2 * (M - 20), H - 2 * (M - 20));
  ctx.lineWidth = 0.4; ctx.strokeRect(M - 16, M - 16, W - 2 * (M - 16), H - 2 * (M - 16));

  // 제목
  let y = M + 14;
  ctx.fillStyle = MUTED; ctx.font = font(9); ctx.fillText('NUNDOJANG SEAL', M, y);
  y += 30; ctx.fillStyle = INK; ctx.font = font(26); ctx.fillText('눈도장 봉인', M, y);
  y += 20; ctx.fillStyle = MUTED; ctx.font = font(10.5); ctx.fillText('읽기 기준 충족 기록과 서명', M, y);

  // 도장 (오른쪽 위)
  const cx = W - M - 46, cy = M + 40, r = 42;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-0.12);
  ctx.strokeStyle = RED; ctx.fillStyle = RED;
  ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, r - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = font(19); ctx.fillText('눈도장', 0, 3);
  ctx.font = font(7.5); ctx.fillText(passedAll ? '읽기 확인' : '확인 불가', 0, 18);
  ctx.font = font(6.5); ctx.fillText(payload.sealId.slice(3, 11), 0, -16);
  ctx.restore();
  ctx.textAlign = 'left';

  // 구분선
  y += 22; ctx.strokeStyle = LINE; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();

  // 기본 정보
  const rows = [
    ['봉인 번호', payload.sealId],
    ['발급 일시', fmtIssued(payload.issuedAt)],
    ['문서', docName || payload.documentId],
    ['페이지 수', `${payload.pageCount}쪽`],
    ['결과', passedAll ? `모든 페이지 기준 충족 (${passedCount}/${payload.pageCount})` : `기준 충족 ${passedCount}/${payload.pageCount}쪽`]
  ];
  y += 26;
  for (const [k, v] of rows) {
    ctx.fillStyle = MUTED; ctx.font = font(10); ctx.fillText(k, M, y);
    ctx.fillStyle = k === '결과' ? (passedAll ? GOOD : BAD) : INK; ctx.font = font(k === '봉인 번호' ? 13 : 11);
    const lines = wrapText(ctx, String(v), W - 2 * M - 80);
    lines.forEach((ln, i) => ctx.fillText(ln, M + 80, y + i * 15));
    y += 22 + (lines.length - 1) * 15;
  }

  // 페이지별 점수 표
  y += 10; ctx.fillStyle = INK; ctx.font = font(12); ctx.fillText('페이지별 점수', M, y);
  y += 12;
  // 배치는 stampTableLayout이 정한다 — 쪽 수가 몇이든 표가 서명란을 덮지 않는다
  const table = stampTableLayout(payload.pages);
  const { rows: tableRows, cols, rowsPerCol, rowH } = table;
  const gap = cols > 4 ? 8 : 14, colW = (W - 2 * M - gap * (cols - 1)) / cols;
  const pad = cols > 4 ? 4 : 8;      // 단이 좁으면 안쪽 여백도 줄인다
  const fs = Math.min(10, rowH * 0.6), ty0 = rowH * 0.7;
  const tableTop = y;
  for (let c = 0; c < cols; c++) {
    const x0 = M + c * (colW + gap);
    let ty = tableTop;
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(x0, ty, colW, rowH);
    ctx.fillStyle = MUTED; ctx.font = font(Math.min(9, fs));
    ctx.fillText('쪽', x0 + pad, ty + ty0); ctx.textAlign = 'right';
    ctx.fillText(table.groupSize > 1 ? '최저' : '점수', x0 + colW * 0.62, ty + ty0); ctx.fillText('판정', x0 + colW - pad, ty + ty0); ctx.textAlign = 'left';
    ty += rowH;
    for (let i = c * rowsPerCol; i < Math.min(tableRows.length, (c + 1) * rowsPerCol); i++) {
      const r = tableRows[i];
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x0, ty + rowH); ctx.lineTo(x0 + colW, ty + rowH); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = font(fs);
      ctx.fillText(r.label, x0 + pad, ty + ty0);
      ctx.textAlign = 'right';
      ctx.fillText(Number.isFinite(r.score) ? `${Math.round(r.score)}점` : '—', x0 + colW * 0.62, ty + ty0);
      ctx.fillStyle = r.passed ? GOOD : BAD; ctx.fillText(r.verdict, x0 + colW - pad, ty + ty0);
      ctx.textAlign = 'left';
      ty += rowH;
    }
  }
  if (table.groupSize > 1) {
    ctx.fillStyle = MUTED; ctx.font = font(7.5);
    ctx.fillText(`쪽 수가 많아 ${table.groupSize}쪽씩 묶어 가장 낮은 점수를 적었습니다. 쪽별 점수는 첨부 파일 seal-${payload.sealId}.json에 있습니다.`, M, tableTop + table.heightPt + 11);
  }
  y = tableTop + table.heightPt + 26;

  // 서명
  ctx.fillStyle = INK; ctx.font = font(12); ctx.fillText('서명', M, y);
  ctx.fillStyle = MUTED; ctx.font = font(9);
  ctx.fillText(payload.signatureMethod === 'uploaded' ? '이미지로 서명' : '직접 그린 서명', M + 34, y);
  y += 10;
  const boxW = 240, boxH = 96;
  ctx.strokeStyle = LINE; ctx.lineWidth = 0.8; ctx.strokeRect(M, y, boxW, boxH);
  if (signaturePng) {
    try {
      const bmp = await dataUrlToBitmap(signaturePng);
      const s = Math.min(200 / bmp.width, (boxH - 16) / bmp.height);   // 가로 최대 200pt
      const w = bmp.width * s, h = bmp.height * s;
      ctx.drawImage(bmp, M + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
    } catch (e) { console.warn('서명 이미지를 그리지 못했습니다', e); }
  }
  ctx.fillStyle = MUTED; ctx.font = font(8.5);
  const sx = M + boxW + 16, sw = W - M - sx;
  const fit = (t) => { let o = String(t); while (o.length > 4 && ctx.measureText(o).width > sw) o = o.slice(0, -2); return o === String(t) ? o : `${o}…`; };
  ctx.fillText('서명 이미지 SHA-256', sx, y + 18);
  ctx.fillStyle = INK; ctx.fillText(fit(payload.signatureImageSha256 ?? '—'), sx, y + 31);
  ctx.fillStyle = MUTED; ctx.fillText('세션', sx, y + 52);
  ctx.fillStyle = INK; ctx.fillText(fit(payload.sessionId), sx, y + 65);

  // 아래: 고지와 버전
  let fy = H - M - 40;
  ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(M, fy - 16); ctx.lineTo(W - M, fy - 16); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = font(9.5);
  for (const ln of wrapText(ctx, SEAL_NOTICE, W - 2 * M)) { ctx.fillText(ln, M, fy); fy += 14; }
  ctx.fillStyle = MUTED; ctx.font = font(7.5);
  ctx.fillText(`${payload.appVersion} · 계약 ${payload.contractVersion} · 점수 ${payload.scorePolicyVersion} · ${payload.sealPolicyVersion} · ${payload.schemaVersion}`, M, fy + 4);

  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('스탬프 그림을 만들지 못했습니다.'))), 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), fontFallback: !fontOk };
}

// ---------------------------------------------------------------- 봉인 발급

export async function issueSeal({ pdfFile, snapshot, signaturePng, signatureMethod, signatureImageSha256, appVersion, config, docName }) {
  if (!snapshot.canSign) throw Object.assign(new Error('모든 페이지가 기준을 충족하지 않아 봉인을 발급할 수 없습니다.'), { code: 'seal_not_allowed' });
  if (!snapshot.consent) throw Object.assign(new Error('동의 체크가 필요합니다.'), { code: 'seal_not_allowed' });
  if (!signaturePng) throw Object.assign(new Error('서명이 필요합니다.'), { code: 'seal_not_allowed' });
  if (!pdfFile) throw Object.assign(new Error('원본 PDF가 없습니다.'), { code: 'seal_no_pdf' });

  const sealId = makeSealId(config.sealIssuerPrefix);
  const issuedAt = isoWithOffset();
  const sealPayload = buildSealPayload({ snapshot, signatureMethod, signatureImageSha256, appVersion, config, sealId, issuedAt });

  const urls = resolveAssetUrls(config);
  const { PDFDocument, StandardFonts, rgb } = await import(urls.pdfLibModuleUrl);

  let doc;
  try {
    // updateMetadata:false → 원래 Title·Author·Producer를 그대로 둔다
    doc = await PDFDocument.load(await pdfFile.arrayBuffer(), { updateMetadata: false });
  } catch (e) {
    const msg = /encrypt/i.test(String(e?.message)) ? '암호가 걸린 PDF는 봉인할 수 없습니다.' : `PDF를 열지 못했습니다: ${e?.message ?? e}`;
    throw Object.assign(new Error(msg), { code: 'seal_pdf_load', cause: e });
  }

  const { png, fontFallback } = await renderStampPng({ payload: sealPayload, docName, signaturePng, fontUrl: urls.reflowFontUrl });
  const page = doc.addPage(A4);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  // 봉인 번호를 글자로도 남긴다 (복사·검색용, 영문 표준 글꼴)
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(`GazeGate Seal ${sealId} ${issuedAt}`, { x: 56, y: 22, size: 6.5, font: helv, color: rgb(0.55, 0.57, 0.6) });

  doc.setSubject(`GazeGate Seal ${sealId}`);
  doc.setKeywords([SEAL_SCHEMA_VERSION, sealId]);
  try {
    await doc.attach(new TextEncoder().encode(JSON.stringify(sealPayload, null, 2)), `seal-${sealId}.json`, {
      mimeType: 'application/json', description: 'NunDojang seal payload', creationDate: new Date(), modificationDate: new Date()
    });
  } catch (e) { console.warn('봉인 내용 첨부 실패 (session.json에는 남음)', e); }

  const bytes = await doc.save();
  const sealedPdfBlob = new Blob([bytes], { type: 'application/pdf' });
  return { sealId, issuedAt, sealedPdfBlob, sealPayload, fontFallback, implemented: true };
}
