// 페이지 점수 정책 — C 소유. DOM·카메라를 쓰지 않는 순수 함수.
// 정책: count-over-lines/0.1.0. 분모를 lineCount-1로 바꾸는 등의 변경은 정책 버전을 올리고 공통 변경 제안으로.
import { PAGE_STATUS, REASON_CODES } from './contracts.js';

/**
 * @param {object} pageState {pageId, lineCount, supported, acceptedEventCount, activeMs, validMs}
 * @param {object} config DEFAULT_CONFIG
 * @returns {object} PageEvaluation
 */
export function evaluatePage(pageState, config) {
  const err = validatePageState(pageState);
  if (err) {
    throw new Error(`evaluatePage: invalid pageState (${err})`);
  }
  const { pageId, lineCount, supported, acceptedEventCount, activeMs, validMs } = pageState;
  const base = {
    scorePolicyVersion: config.scorePolicyVersion,
    pageId,
    rawScore: null,
    displayScore: null,
    validRatio: activeMs > 0 ? validMs / activeMs : 0,
    passed: false,
    status: PAGE_STATUS.NOT_PASSED,
    reasonCodes: []
  };

  // 1) 지원 불가: 나눗셈 자체를 하지 않는다.
  if (!supported || !Number.isInteger(lineCount) || lineCount <= 0) {
    return { ...base, status: PAGE_STATUS.UNSUPPORTED, reasonCodes: [REASON_CODES.UNSUPPORTED_PAGE] };
  }

  const rawScore = (acceptedEventCount / lineCount) * 100; // 반올림하지 않음
  const displayScore = Math.min(config.maxDisplayScore, Math.max(0, rawScore));

  // 2) 미측정
  if (activeMs === 0) {
    return { ...base, rawScore, displayScore, status: PAGE_STATUS.UNMEASURED, reasonCodes: [REASON_CODES.INSUFFICIENT_MEASUREMENT] };
  }

  const reasonCodes = [];
  if (validMs < config.minValidMs) reasonCodes.push(REASON_CODES.INSUFFICIENT_MEASUREMENT);
  if (base.validRatio < config.minValidRatio) reasonCodes.push(REASON_CODES.INSUFFICIENT_QUALITY);

  // 3) 품질 부족이면 점수를 보여주되 통과시키지 않는다.
  if (reasonCodes.length > 0) {
    return { ...base, rawScore, displayScore, status: PAGE_STATUS.INSUFFICIENT_QUALITY, reasonCodes };
  }

  // 4) 점수 판정
  if (rawScore >= config.passThreshold) {
    return { ...base, rawScore, displayScore, passed: true, status: PAGE_STATUS.PASSED, reasonCodes: [] };
  }
  reasonCodes.push(REASON_CODES.SCORE_BELOW_THRESHOLD);
  if (acceptedEventCount === 0) reasonCodes.push(REASON_CODES.NO_READING_EVENTS);
  return { ...base, rawScore, displayScore, passed: false, status: PAGE_STATUS.NOT_PASSED, reasonCodes };
}

/** 입력이 계약 범위를 벗어나면 이유 문자열, 정상이면 null. 조용히 보정하지 않는다. */
export function validatePageState(p) {
  if (!p || typeof p !== 'object') return 'not_an_object';
  if (!Number.isInteger(p.pageId) || p.pageId < 1) return 'pageId';
  if (typeof p.supported !== 'boolean') return 'supported';
  if (p.lineCount !== null && !Number.isInteger(p.lineCount)) return 'lineCount';
  if (!Number.isInteger(p.acceptedEventCount) || p.acceptedEventCount < 0) return 'acceptedEventCount';
  if (!Number.isFinite(p.activeMs) || p.activeMs < 0) return 'activeMs';
  if (!Number.isFinite(p.validMs) || p.validMs < 0) return 'validMs';
  if (p.validMs > p.activeMs) return 'validMs_gt_activeMs';
  return null;
}

/** 화면 표시용 점수 문자열. 판정에는 쓰지 않는다. */
export function formatScore(evaluation) {
  if (evaluation.displayScore === null) return '—';
  return `${Math.round(evaluation.displayScore)}%`;
}
