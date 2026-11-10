// 시선 기록 — C 소유. 개발용이며 주소에 ?gazelog=1 을 붙였을 때만 켠다.
// 프레임별 숫자만 로컬 서버(tools/serve_local.py)로 보내 logs/gaze/ 에 CSV로 쌓는다. 영상과 PDF는 보내지 않는다.

const FEATURE_COLUMNS = Object.freeze([
  ['eye_h', 'eyeH'], ['eye_v', 'eyeV'], ['eye_h_l', 'eyeHL'], ['eye_h_r', 'eyeHR'], ['eye_v_l', 'eyeVL'], ['eye_v_r', 'eyeVR'],
  ['head_yaw', 'headYaw'], ['head_pitch', 'headPitch'], ['face_cx', 'faceCx'], ['face_cy', 'faceCy'],
  ['face_scale', 'faceScale'], ['openness', 'openness']
]);

export const GAZE_LOG_COLUMNS = Object.freeze([
  't_ms', 'seq', 'phase', 'point', 'target_x', 'target_y', 'valid', 'reason', 'held', 'blink', 'fixating',
  'x_px', 'y_px', 'raw_x', 'raw_y', 'offscreen', 'confidence', 'fps', 'scroll_y',
  ...FEATURE_COLUMNS.map(([name]) => name)
]);

const num = (v, digits = 5) => (Number.isFinite(v) ? Number(v.toFixed(digits)) : null);
const flag = (v) => (v ? 1 : 0);

/**
 * @param g     gazeTracker의 onGaze 출력
 * @param where 보정 화면의 진행 상태 {phase, point, targetX, targetY}
 */
export function gazeLogRow(g, where, scrollY) {
  return [
    num(g.tMs, 1), g.seq, where.phase, where.point, num(where.targetX, 1), num(where.targetY, 1),
    flag(g.valid), g.reason, flag(g.held), flag(g.blink), flag(g.fixating),
    num(g.xPx, 1), num(g.yPx, 1), num(g.rawXNorm), num(g.rawYNorm), flag(g.offscreen),
    num(g.confidence, 3), num(g.fps, 1), num(scrollY, 1),
    ...FEATURE_COLUMNS.map(([, key]) => (g.valid ? num(g.features?.[key]) : null))
  ];
}

function sessionName(now = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function createGazeLog({ endpoint = '/__gazelog', flushMs = 1000, onFail } = {}) {
  const session = sessionName();
  let rows = [], failed = false;
  const post = (body) => fetch(endpoint, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, ...body })
  }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); }).catch((e) => {
    if (!failed) { failed = true; onFail?.(e); }   // 같은 안내를 프레임마다 띄우지 않는다
  });
  function flush() {
    if (!rows.length) return;
    const batch = rows; rows = [];
    post({ columns: GAZE_LOG_COLUMNS, rows: batch });
  }
  setInterval(flush, flushMs);
  addEventListener('pagehide', flush);
  return {
    session,
    push(row) { rows.push(row); },
    /** 보정 결과·페이지 위치처럼 프레임에 속하지 않는 기록. */
    meta(entry) { post({ meta: entry }); }
  };
}
