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
  const n = payload.pages.length;
  const maxRowsPerCol = 16;
  const cols = Math.max(1, Math.min(4, Math.ceil(n / maxRowsPerCol)));
  const rowsPerCol = Math.ceil(n / cols);
  const gap = 14, colW = (W - 2 * M - gap * (cols - 1)) / cols;
  const rowH = Math.max(7, Math.min(17, 290 / (rowsPerCol + 1)));   // 64쪽이 넘으면 줄 높이를 줄여 서명란을 덮지 않게
  const fs = Math.min(10, rowH * 0.6), ty0 = rowH * 0.7;
  const tableTop = y;
  for (let c = 0; c < cols; c++) {
    const x0 = M + c * (colW + gap);
    let ty = tableTop;
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(x0, ty, colW, rowH);
    ctx.fillStyle = MUTED; ctx.font = font(Math.min(9, fs));
    ctx.fillText('쪽', x0 + 8, ty + ty0); ctx.textAlign = 'right';
    ctx.fillText('점수', x0 + colW * 0.62, ty + ty0); ctx.fillText('판정', x0 + colW - 8, ty + ty0); ctx.textAlign = 'left';
    ty += rowH;
    for (let i = c * rowsPerCol; i < Math.min(n, (c + 1) * rowsPerCol); i++) {
      const p = payload.pages[i];
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x0, ty + rowH); ctx.lineTo(x0 + colW, ty + rowH); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = font(fs);
      ctx.fillText(String(p.pageId), x0 + 8, ty + ty0);
      ctx.textAlign = 'right';
      ctx.fillText(Number.isFinite(p.displayScore) ? `${Math.round(p.displayScore)}점` : '—', x0 + colW * 0.62, ty + ty0);
      ctx.fillStyle = p.passed ? GOOD : BAD; ctx.fillText(p.passed ? '통과' : '미달', x0 + colW - 8, ty + ty0);
      ctx.textAlign = 'left';
      ty += rowH;
    }
  }
  y = tableTop + rowH * (rowsPerCol + 1) + 26;

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
