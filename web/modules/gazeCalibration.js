// 자세 맞춤·다점 보정 계산 — C 소유. DOM·카메라를 쓰지 않는 순수 함수.
// 시선 회귀는 gazeMath.js에 있고, 여기는 자세 안내·보정 점·결과 판정·밝기만 맡는다. 계약·로그·점수에는 관여하지 않는다.
// 숫자는 개발용 초기값이며 일반 사용자로 검증되지 않았다.

export const POSE_RULES = Object.freeze({
  // 영상 너비 대비 양쪽 바깥 눈꼬리 간격. 노트북 카메라 약 28~38cm를 가정한 값이다.
  // 눈이 영상에서 클수록 홍채 움직임이 더 많은 픽셀로 잡힌다.
  minEyeSpanRatio: 0.19,
  maxEyeSpanRatio: 0.27,
  targetX: 0.5,
  targetY: 0.45,
  toleranceX: 0.09,
  toleranceY: 0.1,
  maxRollDeg: 6,
  holdMs: 1200,
  // 기준 자세에서 벗어났다고 볼 경계 (눈꼬리 간격 배수·비율)
  maxShiftEyeSpans: 0.25,
  maxSpanChange: 0.12,
  // 고개 돌림 경계(코-눈꼬리 비례값). 기하 계산으로 약 8°에 해당하며 실측 전이다.
  maxYawDelta: 0.08,
  maxPitchDelta: 0.08,
  pauseAfterMs: 300,   // 이만큼 벗어나 있으면 보정을 멈춘다
  resumeHoldMs: 600,   // 이만큼 제자리에 있으면 보정을 잇는다
  // 고개 돌림 단계: 약 5~15° 돌렸을 때를 표본으로 쓴다. 실측 전 값이다.
  minTurn: 0.05,
  maxTurn: 0.15,
  turnHoldMs: 250,
  turnTimeoutMs: 8000  // 이 안에 범위에 못 들면 그 방향은 건너뛴다
});

// 점을 보면서 고개만 돌린 표본을 넣으면, 읽는 동안 자세가 달라져도 덜 빗나간다.
// headYaw는 사용자의 오른쪽, headPitch는 위쪽이 양수다.
export const HEAD_TURNS = Object.freeze({
  left: Object.freeze({ axis: 'headYaw', sign: -1, label: '왼쪽으로' }),
  right: Object.freeze({ axis: 'headYaw', sign: 1, label: '오른쪽으로' }),
  up: Object.freeze({ axis: 'headPitch', sign: 1, label: '위로' })
});

/** 고개를 turn 방향으로 돌린 양. 반대로 돌리면 음수다. */
export function turnAmount(reference, head, turn) {
  const { axis, sign } = HEAD_TURNS[turn];
  return sign * (head[axis] - reference[axis]);
}

/** 고개를 turn 방향으로 알맞게 돌렸는지. 'ok' | 'more' | 'less'. */
export function turnStatus(reference, head, turn, rules = POSE_RULES) {
  const amount = turnAmount(reference, head, turn);
  if (amount < rules.minTurn) return 'more';
  return amount > rules.maxTurn ? 'less' : 'ok';
}

export const COLLECT = Object.freeze({
  settleMs: 200,       // 클릭 직후 손·눈이 안정될 시간
  durationMs: 900,
  minFrames: 10
});

// 교차검증 RMS 오차가 화면 크기의 이 비율을 넘으면 그 축을 믿지 않는다.
export const FIT_LIMITS = Object.freeze({ maxXErrorRatio: 0.2, maxYErrorRatio: 0.2 });

// 얼굴 영역의 평균 밝기(0~255) 기준. 개발용 초기값이며 어둠에서 눈 검출이 나빠지는 지점을 측정한 값이 아니다.
export const LIGHT_RULES = Object.freeze({ darkBelow: 60, clearAbove: 72, holdMs: 1500 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 밝기를 잴 얼굴 영역(영상 픽셀). 창을 등진 역광도 잡도록 화면 전체가 아니라 눈 주변을 본다. */
export function faceLightRegion(face) {
  if (!face || !(face.eyeSpanPx > 0) || !(face.videoWidth > 0) || !(face.videoHeight > 0)) return null;
  const x = clamp(face.centerXPx - face.eyeSpanPx * 0.7, 0, face.videoWidth - 1);
  const y = clamp(face.centerYPx - face.eyeSpanPx * 0.35, 0, face.videoHeight - 1);
  const w = Math.min(face.eyeSpanPx * 1.4, face.videoWidth - x);
  const h = Math.min(face.eyeSpanPx * 1.2, face.videoHeight - y);
  return w >= 1 && h >= 1 ? { x, y, w, h } : null;
}

/** RGBA 픽셀의 평균 밝기 (Rec.601). */
export function meanLuma(rgba) {
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return rgba.length ? sum / (rgba.length / 4) : null;
}

/** 어두운 상태가 holdMs 이어지면 켜지고, 밝은 상태가 holdMs 이어지면 꺼진다. 경고가 깜빡이지 않게 경계를 둘로 나눴다. */
export function createDarkDetector(rules = LIGHT_RULES) {
  let dark = false, changingSince = null;
  return {
    update(tMs, luma) {
      const wantsChange = dark ? luma > rules.clearAbove : luma < rules.darkBelow;
      if (!wantsChange) { changingSince = null; return dark; }
      changingSince ??= tMs;
      if (tMs - changingSince >= rules.holdMs) { dark = !dark; changingSince = null; }
      return dark;
    },
    reset() { dark = false; changingSince = null; }
  };
}

/** 현재 얼굴이 안내 틀에 맞는지. hint는 거울처럼 보이는 화면 기준의 안내문이다. */
export function evaluatePose(face, rules = POSE_RULES) {
  if (!face || !(face.videoWidth > 0) || !(face.videoHeight > 0)) return { ok: false, hint: '얼굴이 틀 안에 들어오게 앉아 주세요' };
  const span = face.eyeSpanPx / face.videoWidth;
  if (span < rules.minEyeSpanRatio) return { ok: false, hint: '화면에 조금 더 가까이 와 주세요' };
  if (span > rules.maxEyeSpanRatio) return { ok: false, hint: '화면에서 조금 멀어져 주세요' };
  const mirroredX = 1 - face.centerXPx / face.videoWidth;
  const y = face.centerYPx / face.videoHeight;
  if (mirroredX < rules.targetX - rules.toleranceX) return { ok: false, hint: '오른쪽으로 조금 옮겨 주세요' };
  if (mirroredX > rules.targetX + rules.toleranceX) return { ok: false, hint: '왼쪽으로 조금 옮겨 주세요' };
  if (y < rules.targetY - rules.toleranceY) return { ok: false, hint: '얼굴을 조금 아래로 옮겨 주세요' };
  if (y > rules.targetY + rules.toleranceY) return { ok: false, hint: '얼굴을 조금 위로 옮겨 주세요' };
  if (Math.abs(face.rollDeg) > rules.maxRollDeg) return { ok: false, hint: '고개를 기울이지 말고 똑바로 해 주세요' };
  return { ok: true, hint: '좋아요, 그대로 있어 주세요' };
}

const yawDelta = (reference, head) => head.headYaw - reference.headYaw;
const pitchDelta = (reference, head) => head.headPitch - reference.headPitch;

/** 보정 때 잡은 자세에서 벗어났는지. head({headYaw, headPitch})를 주면 고개 돌림까지 본다. */
export function poseDrifted(reference, face, rules = POSE_RULES, head = null) {
  if (!reference || !face) return false;
  const shift = Math.hypot(face.centerXPx - reference.centerXPx, face.centerYPx - reference.centerYPx) / reference.eyeSpanPx;
  if (shift > rules.maxShiftEyeSpans || Math.abs(face.eyeSpanPx / reference.eyeSpanPx - 1) > rules.maxSpanChange) return true;
  if (!head) return false;
  return Math.abs(yawDelta(reference, head)) > rules.maxYawDelta || Math.abs(pitchDelta(reference, head)) > rules.maxPitchDelta;
}

/** 처음 자세로 돌아오도록 알려 줄 안내문. 좌우는 거울처럼 보이는 화면 기준이다. */
export function poseReturnHint(reference, face, rules = POSE_RULES, head = null) {
  if (!face) return '얼굴이 보이게 해 주세요';
  const sizeChange = face.eyeSpanPx / reference.eyeSpanPx - 1;
  if (sizeChange > rules.maxSpanChange) return '화면에서 조금 멀어져 주세요';
  if (sizeChange < -rules.maxSpanChange) return '화면에 조금 더 가까이 와 주세요';
  if (head && Math.abs(yawDelta(reference, head)) > rules.maxYawDelta) return yawDelta(reference, head) > 0 ? '고개를 왼쪽으로 조금 돌려 주세요' : '고개를 오른쪽으로 조금 돌려 주세요';
  if (head && Math.abs(pitchDelta(reference, head)) > rules.maxPitchDelta) return pitchDelta(reference, head) > 0 ? '고개를 조금 숙여 주세요' : '고개를 조금 들어 주세요';
  const dx = face.centerXPx - reference.centerXPx, dy = face.centerYPx - reference.centerYPx;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? '오른쪽으로 조금 옮겨 주세요' : '왼쪽으로 조금 옮겨 주세요';
  return dy > 0 ? '얼굴을 조금 위로 옮겨 주세요' : '얼굴을 조금 아래로 옮겨 주세요';
}

const DARK_SCREEN_POINTS = Object.freeze([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]);

/** 글 영역 보정의 격자 (3×3 = 9점). 근거: docs/comprehension_evidence.md 20-10절 */
export const REGION_GRID = Object.freeze({ cols: 3, rows: 3 });
/** 이보다 작은 영역(CSS px)에는 글 영역 보정을 하지 않는다 — 점이 너무 붙으면 배율을 못 정한다 */
export const REGION_MIN = Object.freeze({ width: 240, height: 120 });

/**
 * 보정 점 순서.
 *
 * **region을 주면 그 영역 위에만 찍는다 (기본 3×3).** 고개 돌리기·검정 화면 점은 넣지 않는다.
 *   왜: 2026-11-21에 바꾼 엔진(BlazeGaze)의 출력은 화면 좌우 끝에서 눌린다 (이웃 열 사이 기울기 0.52·1.79·1.95·0.66).
 *   화면 전체를 곧은 식 하나로 맞추면 끝을 덮느라 배율이 커지고, 글이 놓인 가운데가 그만큼 늘어 찍힌다.
 *   기록 5회를 다시 맞춰 보면 글 영역 안쪽 5점이 화면 전체 19점보다 가로 오차가 작다 (35px 대 113px).
 *   고개 돌리기·검정 화면 점은 넣어도 빼도 오차가 같았다 (127.9 → 129.4 · 125.1px).
 *   대신 **맞춘 영역 밖은 믿을 수 없다** — 영역은 글의 끝까지 덮어야 한다.
 *
 * region이 없으면 예전 배치다: 흰 화면의 격자(5×4)를 ㄹ자로 돌고, 가운데 점을 보며 고개를 돌린 뒤, 검정 화면에서 몇 점을 더 본다.
 * @param {{left:number, top:number, width:number, height:number}|null} [o.region] 글이 놓이는 영역 (뷰포트 CSS px)
 */
export function calibrationPoints(width, height, { region = null, cols, rows, margin = 0.08, turns, darkPoints } = {}) {
  const useRegion = usableRegion(region, width, height);
  cols ??= useRegion ? REGION_GRID.cols : 5;
  rows ??= useRegion ? REGION_GRID.rows : 4;
  turns ??= useRegion ? [] : Object.keys(HEAD_TURNS);
  darkPoints ??= useRegion ? [] : DARK_SCREEN_POINTS;
  const x0 = useRegion ? useRegion.left : margin * width, x1 = useRegion ? useRegion.left + useRegion.width : (1 - margin) * width;
  const y0 = useRegion ? useRegion.top : margin * height, y1 = useRegion ? useRegion.top + useRegion.height : (1 - margin) * height;
  const at = (i, n, lo, hi) => (n > 1 ? lo + (i * (hi - lo)) / (n - 1) : (lo + hi) / 2);
  const points = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = r % 2 ? cols - 1 - c : c;
      points.push({ index: points.length, x: at(col, cols, x0, x1), y: at(r, rows, y0, y1), theme: 'light' });
    }
  }
  for (const turn of turns) points.push({ index: points.length, x: width / 2, y: height / 2, theme: 'light', turn });
  for (const [nx, ny] of darkPoints) points.push({ index: points.length, x: nx * width, y: ny * height, theme: 'dark' });
  return points;
}

/**
 * 글 영역을 화면 안으로 다듬는다. 쓸 수 없으면(없음·너무 작음) null — 그때는 예전 화면 전체 배치로 돌아간다.
 * 점이 화면 가장자리에 붙으면 누르기도 보기도 어려워 edge만큼 안으로 들인다.
 */
export function usableRegion(region, width, height, { edge = 24, min = REGION_MIN } = {}) {
  if (!region || ![region.left, region.top, region.width, region.height].every(Number.isFinite)) return null;
  const left = clamp(region.left, edge, width - edge), right = clamp(region.left + region.width, edge, width - edge);
  const top = clamp(region.top, edge, height - edge), bottom = clamp(region.top + region.height, edge, height - edge);
  if (right - left < min.width || bottom - top < min.height) return null;
  return { left, top, width: right - left, height: bottom - top };
}

const rms = (values) => Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length);

/**
 * gazeMath의 보정 결과를 축별 오차로 판정한다.
 * @param fit model.fit 결과 (perPoint: 점 하나를 빼고 맞췄을 때의 {dxPx, dyPx})
 * @param excludedPoints 오차 집계에서 뺄 점. 고개 돌림 점은 하나만 빼도 그 자세의 표본이 사라져 오차가 부풀려진다
 * @returns 가로가 나쁘면 {ok:false}, 세로만 나쁘면 yUsable=false (세로는 줄바꿈 후보로 표시)
 */
export function assessFit(fit, { width, height }, limits = FIT_LIMITS, excludedPoints = new Set()) {
  if (!fit?.ok) return { ok: false, reason: fit?.reason ?? 'fit_failed' };
  const counted = fit.perPoint.filter((p) => !excludedPoints.has(p.point));
  const xErrorPx = rms(counted.map((p) => p.dxPx));
  const yErrorPx = rms(counted.map((p) => p.dyPx));
  if (xErrorPx > width * limits.maxXErrorRatio) return { ok: false, reason: 'x_error_too_large', xErrorPx, yErrorPx };
  return { ok: true, order: fit.order, xErrorPx, yErrorPx, yUsable: yErrorPx <= height * limits.maxYErrorRatio };
}
