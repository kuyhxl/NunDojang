// 봉인(Seal) 1단계 — C 소유. 단계 5(11/11~13)에서 구현.
// 계약: issueSeal({pdfFile, snapshot, signaturePng, config}) → {sealId, issuedAt, sealedPdfBlob, sealPayload}
// 규칙: canSign·동의·서명이 모두 충족된 상태에서만 호출. 원본 페이지는 건드리지 않고 마지막에 스탬프 페이지 1장을 추가.
// 현재 상태: sealId·issuedAt·sealPayload 생성까지만 구현. PDF 삽입은 TODO (pdf-lib).
import { resolveAssetUrls } from './config.js';

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
    schemaVersion: 'gazegate-seal/0.1.0',
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

export async function issueSeal({ pdfFile, snapshot, signaturePng, signatureMethod, signatureImageSha256, appVersion, config }) {
  if (!snapshot.canSign) throw Object.assign(new Error('모든 페이지가 기준을 충족하지 않아 봉인을 발급할 수 없습니다.'), { code: 'seal_not_allowed' });
  if (!snapshot.consent) throw Object.assign(new Error('동의 체크가 필요합니다.'), { code: 'seal_not_allowed' });
  if (!signaturePng) throw Object.assign(new Error('서명이 필요합니다.'), { code: 'seal_not_allowed' });

  const sealId = makeSealId(config.sealIssuerPrefix);
  const issuedAt = isoWithOffset();
  const sealPayload = buildSealPayload({ snapshot, signatureMethod, signatureImageSha256, appVersion, config, sealId, issuedAt });

  // TODO(단계 5): pdf-lib로 pdfFile을 열어 마지막에 스탬프 페이지 추가, 메타데이터 Subject/Keywords 기록.
  // const { PDFDocument, StandardFonts } = await import(resolveAssetUrls(config).pdfLibModuleUrl);
  // 한글은 sealFontUrl의 TTF를 embedFont. 실패 시 영문 스탬프로 대체하고 fontFallback=true 표시.
  const sealedPdfBlob = null;

  return { sealId, issuedAt, sealedPdfBlob, sealPayload, implemented: false };
}
