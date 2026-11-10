// 페이지 점수 정책 — C 소유. DOM·카메라를 쓰지 않는 순수 함수.
// 정책: count-over-sweeps/0.2.0 (2026-11-04, docs/decisions.md)
//   L줄을 끝까지 읽으면 줄바꿈은 L−1번 → 점수 = 수락된 줄바꿈 후보 수 / (L−1) × 100
//   (0.1.0은 분모가 L이라 10줄을 다 읽어도 9/10 = 90%였다)
//   한 줄짜리 쪽(L=1)은 기대 줄바꿈이 0이므로 사건 대신 유효 측정 시간·품질로만 판정한다.
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

  const expectedSweeps = expectedReturnSweeps(lineCount);
  const rawScore = expectedSweeps > 0
    ? (acceptedEventCount / expectedSweeps) * 100            // 반올림하지 않음
    : (activeMs > 0 ? 100 : 0);                              // 한 줄짜리 쪽: 아래 품질 조건만으로 판정
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
  if (acceptedEventCount === 0) reasonCodes.push(REASON_CODES.NO_READING_EVENTS);   // L=1이면 여기까지 오지 않는다 (rawScore 100)
  return { ...base, rawScore, displayScore, passed: false, status: PAGE_STATUS.NOT_PASSED, reasonCodes };
}

/** L줄 쪽을 끝까지 읽을 때 기대하는 줄바꿈 수 (L−1, 최소 0). 화면 표시와 점수가 같은 값을 쓰도록 여기 하나만 둔다. */
export function expectedReturnSweeps(lineCount) {
  return Number.isInteger(lineCount) && lineCount > 0 ? lineCount - 1 : 0;
}

// ---------------------------------------------------------------- 보조 점수 (기록 전용, 공식 점수 아님)
// 문제: 문단 끝·제목처럼 짧은 줄 뒤에서는 눈이 그만큼만 돌아가 줄바꿈이 잘 안 잡힌다.
//       consent.pdf(20px)를 끝까지 읽어도 39번 중 약 24~27번만 잡혀, 공식 점수(÷ L−1)는 60~70%에 그친다.
// 안: 분모를 "잡힐 수 있는 줄바꿈 수"로 센다. 앞줄 폭으로 가중치를 준다.
//     - 검출 최소 이동(단 폭 19%)보다 짧은 줄 → 0 (눈이 그만큼 돌아가지 않으니 원리상 못 잡는다)
//     - 단 폭 44% 이상 → 1, 그 사이는 비례
//     딱 자르는 기준(예: 40% 이상만 1)은 경계 근처 줄이 많은 문서에서 무너졌다
//     (시간표 PDF는 319px 줄이 5개라 320px 기준 분모가 1로 떨어짐).
//     앱이 줄 폭을 직접 배치하므로 분모는 추정이 아니다.
// 실측(한 사람 기록 2회, 기준을 이 기록에 맞췄으므로 과적합 가능): 문서 전체 consent 109%, 시간표 111%, 쪽별 100~140%.
// 팀 합의 전 실험값이다. 정책으로 바꾸려면 decisions.md 제안 + A(검출기)·B(정답 분모) 확인이 필요하다.
export const AUX_POLICY_VERSION = 'detectable-sweeps/0.1.0-aux';
export const AUX_WEIGHT_RAMP = Object.freeze([0.19, 0.44]);   // 단 폭 비율: 이보다 짧으면 0, 길면 1

/**
 * 잡힐 수 있는 줄바꿈 수(가중 합). 마지막 줄 뒤에는 줄바꿈이 없으므로 0..L−2번째 줄만 본다.
 * @param {number[]} lineWidths 글줄마다 실제 글자 폭 (그림 자리 제외, 위에서부터)
 * @param {number} columnPx 단 폭
 */
export function expectedDetectableSweeps(lineWidths, columnPx, ramp = AUX_WEIGHT_RAMP) {
  if (!Array.isArray(lineWidths) || !(columnPx > 0)) return 0;
  const a = ramp[0] * columnPx, b = ramp[1] * columnPx;
  let sum = 0;
  for (let i = 0; i < lineWidths.length - 1; i++) {
    const w = lineWidths[i];
    if (Number.isFinite(w)) sum += Math.min(1, Math.max(0, (w - a) / (b - a)));
  }
  return sum;
}

/** 보조 점수 (%). 반올림·상한 없음(기록 전용이라 넘친 값도 그대로 남긴다). 기대가 0이면 null. */
export function auxScore(count, expected) {
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(expected) || expected <= 0) return null;
  return (count / expected) * 100;
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
