// 자세 맞춤 → 다점 보정·재중심 화면 — C 소유. 표본 수집과 회귀는 gazeTracker가 맡는다.
// 영상은 이 화면에 표시만 하며 저장하거나 밖으로 보내지 않는다.
import { POSE_RULES, COLLECT, HEAD_TURNS, FIT_LIMITS, evaluatePose, poseDrifted, poseReturnHint, turnAmount, turnStatus, calibrationPoints, assessFit, faceLightRegion, meanLuma, usableRegion, REGION_GRID } from './gazeCalibration.js';

export const DARK_MESSAGE = '카메라에 얼굴이 어둡게 보여요. 조명을 켜거나 밝은 곳으로 옮겨 주세요.';
const UNREADABLE_MESSAGE = '눈을 충분히 읽지 못했어요. 눈을 뜨고 다시 눌러 주세요';
const FACE_FRONT_MESSAGE = '이제 고개를 정면으로 돌려 주세요';
/** 결과 화면이 뜬 뒤 이만큼(ms)은 스페이스바를 받지 않는다 (연달아 누른 키로 건너뛰지 않게) */
const RESULT_KEY_GUARD_MS = 600;
/** 첫 줄 맞춤 점이 뜬 뒤 이만큼(ms)은 스페이스바를 받지 않는다 (쪽을 넘긴 키가 연달아 들어오는 것을 막는다) */
const RECENTER_KEY_GUARD_MS = 500;
const ANCHOR_MESSAGE = '첫 줄 왼쪽의 점을 바라보며 점을 클릭하거나 스페이스바를 눌러 주세요';
// 첫 줄 맞춤·재중심은 점 하나로 치우침 전체를 정한다. 짧으면 그 순간의 흔들림이 그대로 남는다
// (실측: 0.9초 분량일 때 맞춘 뒤 남은 치우침 6·7·45px). 다점 보정 한 점보다 길게 본다.
const RECENTER_COLLECT_MS = 2000;

/** 현재 영상의 얼굴 영역(없으면 화면 전체) 평균 밝기를 잰다. 영상은 축소해 읽기만 하고 저장하지 않는다. */
export function createLightMeter(video, size = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    read(face) {
      if (video.readyState < 2 || !video.videoWidth) return null;
      const r = faceLightRegion(face) ?? { x: 0, y: 0, w: video.videoWidth, h: video.videoHeight };
      ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, size, size);
      return meanLuma(ctx.getImageData(0, 0, size, size).data);
    }
  };
}

export function createCalibrationOverlay({ sourceVideo, rules = POSE_RULES, collect = COLLECT, resultNote = '' }) {
  const root = document.createElement('div');
  root.className = 'calib'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '시선 보정');
  root.innerHTML = `
    <section class="calib-pose">
      <h2 class="calib-title">1. 자세 맞추기</h2>
      <p class="calib-sub">카메라에 가까이 앉아 얼굴이 틀에 꽉 차게 맞추고, 눈은 정면을 봐 주세요.</p>
      <div class="calib-frame"><video class="calib-video" playsinline muted></video><i class="calib-guide"></i></div>
      <p class="calib-hint" aria-live="polite"></p>
    </section>
    <section class="calib-points" hidden>
      <p class="calib-instruction" aria-live="polite"></p>
      <button class="calib-dot" type="button" aria-label="보정 점"></button>
    </section>
    <section class="calib-result" hidden>
      <h2 class="calib-title"></h2>
      <p class="calib-sub calib-result-text"></p>
      <div class="calib-actions"><button class="btn-ghost calib-retry" type="button">다시 보정</button><button class="btn-white calib-done" type="button">읽기 시작 <span class="kbd">Space</span></button></div>
    </section>
    <div class="calib-turn" hidden>
      <div class="calib-turn-arrow"><svg viewBox="0 0 120 120" aria-hidden="true"><path d="M104 60H22M58 24 22 60l36 36"/></svg></div>
      <div class="calib-turn-gauge" aria-hidden="true"><i class="calib-turn-zone"><span>여기까지</span></i><i class="calib-turn-marker"></i></div>
    </div>
    <section class="calib-pause" hidden>
      <div class="calib-frame"><video class="calib-video" playsinline muted></video><i class="calib-guide"></i></div>
      <p class="calib-pause-hint" aria-live="polite"></p>
    </section>
    <button class="btn-ghost calib-skip" type="button">보정 건너뛰기</button>
    <p class="calib-light" aria-live="polite" hidden>${DARK_MESSAGE}</p>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const video = $('.calib-video'), guide = $('.calib-guide'), hint = $('.calib-hint');
  const poseView = $('.calib-pose'), pointsView = $('.calib-points'), resultView = $('.calib-result');
  const dot = $('.calib-dot'), instruction = $('.calib-instruction');

  let phase = 'idle', resolveRun = null, holdStart = null, reference = null, gaze = null, mode = 'calibrate', lastFace = null;
  let points = [], pointIndex = 0, collected = [];
  let offSince = null, backSince = null, collectRun = 0, lastHead = null, untapHead = null, audio = null;
  let turnStart = null, turnSince = null;
  const skip = $('.calib-skip');
  const pauseView = $('.calib-pause'), pauseVideo = $('.calib-pause video'), pauseGuide = $('.calib-pause .calib-guide'), pauseHint = $('.calib-pause-hint');

  const turnView = $('.calib-turn'), turnGauge = $('.calib-turn-gauge'), turnMarker = $('.calib-turn-marker');
  const TURN_GAUGE_MAX = rules.maxTurn * 4 / 3;   // 게이지 오른쪽 끝에 해당하는 돌림 양
  const turnZone = $('.calib-turn-zone');
  turnZone.style.left = `${(rules.minTurn / TURN_GAUGE_MAX) * 100}%`;
  turnZone.style.width = `${((rules.maxTurn - rules.minTurn) / TURN_GAUGE_MAX) * 100}%`;
  const OPPOSITE_TURN = Object.freeze({ left: 'right', right: 'left', up: 'down' });

  function showTurnView(direction, withGauge) {
    root.classList.add('is-turning');
    turnView.hidden = false; turnView.dataset.dir = direction; turnGauge.hidden = !withGauge;
  }
  function hideTurnView() { root.classList.remove('is-turning'); turnView.hidden = true; }

  function updateTurnGauge(amount, status) {
    const ratio = Math.min(1, Math.max(0, amount / TURN_GAUGE_MAX));
    turnMarker.style.left = `${ratio * 100}%`;
    turnMarker.dataset.status = status;
  }

  function hidePause() { pauseView.hidden = true; pauseVideo.srcObject = null; }

  function pause() {
    collectRun++;                      // 모으던 표본은 버린다. 자세가 돌아오면 같은 점을 다시 본다
    phase = 'paused'; backSince = null; offSince = null;
    dot.hidden = true;
    instruction.textContent = '자세가 바뀌어 잠시 멈췄어요. 왼쪽 위 화면을 보며 처음 자세로 돌아와 주세요';
    instruction.classList.remove('is-warn');
    pauseGuide.classList.remove('is-ok');
    pauseView.hidden = false;
    if (sourceVideo.srcObject) { pauseVideo.srcObject = sourceVideo.srcObject; pauseVideo.play().catch(() => {}); }
  }

  /** 소리는 사용자가 누른 순간에 켜 둬야 브라우저가 막지 않는다. */
  function prepareBeep() {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  }

  function beep() {
    if (!audio) return;
    const t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.value = 1760;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain).connect(audio.destination);
    osc.start(t); osc.stop(t + 0.08);
  }

  const show = (view) => { for (const v of [poseView, pointsView, resultView]) v.hidden = v !== view; };

  function finish(result) {
    phase = 'idle'; root.hidden = true; video.srcObject = null;
    hidePause(); hideTurnView(); root.classList.remove('is-light', 'is-anchor', 'is-region', 'is-region-top'); untapHead?.(); untapHead = null;
    document.removeEventListener('keydown', onKey);
    const resolve = resolveRun; resolveRun = null;
    resolve?.(result);
  }

  function beginPose() {
    root.classList.remove('is-light');
    phase = 'pose'; holdStart = null; reference = null; show(poseView); skip.hidden = false; skip.textContent = '보정 건너뛰기';
    guide.classList.remove('is-ok'); hint.textContent = '카메라를 준비하는 중…';
    if (sourceVideo.srcObject) { video.srcObject = sourceVideo.srcObject; video.play().catch(() => {}); }
  }

  function beginPoints() {
    phase = 'wait-click'; show(pointsView); video.srcObject = null;
    points = calibrationPoints(window.innerWidth, window.innerHeight, { region: runRegion });
    // 글 영역 위에 점을 찍으면 화면 위쪽 26%의 안내 글이 맨 윗줄 점과 겹친다. 영역 아래(자리가 없으면 위)로 옮긴다.
    const used = usableRegion(runRegion, window.innerWidth, window.innerHeight);
    root.classList.toggle('is-region', !!used);
    root.classList.toggle('is-region-top', !!used && used.top + used.height > window.innerHeight - 96);
    pointIndex = 0; collected = [];
    placeDot();
  }

  /** target이 있으면 PDF 위의 그 자리(첫 줄 맞춤), 없으면 화면 가운데에서 치우침을 바로잡는다. */
  function beginRecenter(target) {
    phase = 'wait-click'; show(pointsView); skip.hidden = false; skip.textContent = target ? '건너뛰기' : '취소';
    recenterShownAt = performance.now();
    root.classList.toggle('is-anchor', !!target);   // PDF가 보이게 배경을 비운다
    points = [{ x: target?.x ?? window.innerWidth / 2, y: target?.y ?? window.innerHeight / 2, theme: 'light' }];
    pointIndex = 0;
    placeDot(target ? ANCHOR_MESSAGE : '가운데 점을 바라보며 점을 클릭하거나 스페이스바를 눌러 주세요', false);
  }

  function placeDot(message, warn = !!message) {
    const p = points[pointIndex];
    root.classList.toggle('is-light', p.theme === 'light');
    dot.style.left = `${p.x}px`; dot.style.top = `${p.y}px`;
    dot.hidden = false; offSince = null;
    dot.classList.remove('is-collecting');
    if (p.turn) {
      phase = 'turn-wait'; turnStart = null; turnSince = null;
      showTurnInstruction(p, 'more'); showTurnView(p.turn, true); updateTurnGauge(0, 'more');
      return;
    }
    hideTurnView();
    instruction.textContent = message ?? `${pointIndex + 1} / ${points.length} · 점을 바라보며 점을 클릭하거나 스페이스바를 눌러 주세요`;
    instruction.classList.toggle('is-warn', warn);
    phase = 'wait-click';
  }

  function showTurnInstruction(p, status) {
    const { label } = HEAD_TURNS[p.turn];
    const action = status === 'less' ? '너무 많이 돌렸어요. 조금만 덜 돌려 주세요' : `고개만 ${label} 살짝 돌려 주세요`;
    instruction.textContent = `${pointIndex + 1} / ${points.length} · 점을 계속 보면서 ${action}`;
    instruction.classList.remove('is-warn');
  }

  function advance() {
    pointIndex += 1;
    if (pointIndex < points.length) placeDot(); else showResult();
  }

  function waitForFront() {
    phase = 'turn-return';
    showTurnView(OPPOSITE_TURN[points[pointIndex].turn], false);
    dot.classList.remove('is-collecting');
    instruction.textContent = FACE_FRONT_MESSAGE;
  }

  async function collectTurn() {
    phase = 'turn-collect'; offSince = null;
    const run = ++collectRun, p = points[pointIndex];
    dot.classList.add('is-collecting');
    instruction.textContent = '그대로 점을 바라봐 주세요';
    const samples = await gaze.calibration.collectPoint({
      nx: p.x / window.innerWidth, ny: p.y / window.innerHeight, point: pointIndex,
      durationMs: collect.settleMs + collect.durationMs, settleMs: collect.settleMs
    });
    if (phase !== 'turn-collect' || run !== collectRun) return;
    if (samples.length >= collect.minFrames) { beep(); collected.push(...samples); }
    waitForFront();
  }

  function feedTurn(tMs, face) {
    const p = points[pointIndex];
    const status = face && lastHead ? turnStatus(reference, lastHead, p.turn, rules) : 'more';
    updateTurnGauge(face && lastHead ? turnAmount(reference, lastHead, p.turn) : 0, status);
    if (phase === 'turn-collect') {
      if (status === 'ok') { offSince = null; return; }
      offSince ??= tMs;
      if (tMs - offSince >= rules.pauseAfterMs) { collectRun++; placeDot(); }
      return;
    }
    turnStart ??= tMs;
    if (tMs - turnStart >= rules.turnTimeoutMs) { waitForFront(); return; }   // 돌리지 못한 방향은 건너뛴다
    showTurnInstruction(p, status);
    if (status !== 'ok') { turnSince = null; return; }
    turnSince ??= tMs;
    if (tMs - turnSince >= rules.turnHoldMs) collectTurn();
  }

  async function startCollect() {
    if (phase !== 'wait-click') return;
    prepareBeep();
    phase = 'collect';
    const run = ++collectRun;
    dot.classList.add('is-collecting');
    instruction.textContent = '점을 계속 바라봐 주세요';
    instruction.classList.remove('is-warn');
    const settleMs = collect.settleMs, durationMs = collect.settleMs + collect.durationMs;
    if (mode !== 'calibrate') {
      const t = points[0];
      const r = await gaze.recenterTo(t.x / window.innerWidth, t.y / window.innerHeight, { durationMs: settleMs + RECENTER_COLLECT_MS, settleMs });
      if (phase !== 'collect' || run !== collectRun) return;
      if (r.ok) { beep(); finish({ status: 'recentered', reference: lastFace }); } else placeDot(UNREADABLE_MESSAGE);
      return;
    }
    const p = points[pointIndex];
    const samples = await gaze.calibration.collectPoint({
      nx: p.x / window.innerWidth, ny: p.y / window.innerHeight, point: pointIndex, durationMs, settleMs
    });
    if (phase === 'collect' && run === collectRun) endCollect(samples);
  }

  function endCollect(samples) {
    if (samples.length < collect.minFrames) { placeDot(UNREADABLE_MESSAGE); return; }
    beep();
    collected.push(...samples);
    advance();
  }

  let lastFit = null;
  let resultShownAt = 0;
  let recenterShownAt = 0;
  let runRegion = null;   // 이번 보정에서 점을 찍을 글 영역. null이면 화면 전체
  function showResult() {
    root.classList.remove('is-light');
    phase = 'result'; show(resultView); skip.hidden = true; resultShownAt = performance.now();
    const turnPoints = new Set(points.filter((p) => p.turn).map((p) => p.index));
    const quality = assessFit(gaze.calibration.fit(collected), { width: window.innerWidth, height: window.innerHeight }, FIT_LIMITS, turnPoints);
    lastFit = quality.ok ? quality : null;
    $('.calib-done').hidden = !quality.ok;
    if (!quality.ok) {
      $('.calib-result .calib-title').textContent = '보정이 잘 되지 않았어요';
      $('.calib-result-text').textContent = '점을 볼 때 눈 움직임이 충분히 구분되지 않았습니다. 다시 시도해 주세요.';
      return;
    }
    $('.calib-result .calib-title').textContent = '보정 완료';
    const yText = quality.yUsable ? `세로 약 ${Math.round(quality.yErrorPx)}px` : '세로는 오차가 커서 사용하지 않습니다';
    // resultNote: 읽기 전에 미리 알려 둘 한 문장 (예: 물방울 색의 뜻). 읽는 도중에 글로 알리면 눈이 그리로 간다
    $('.calib-result-text').textContent = `예상 오차는 가로 약 ${Math.round(quality.xErrorPx)}px, ${yText}입니다. 이 자세를 유지해 주세요.${resultNote ? ` ${resultNote}` : ''}`;
  }

  function open(tracker, nextMode, begin) {
    gaze = tracker; mode = nextMode; lastFace = null; lastHead = null;
    untapHead = tracker.tap((g) => { if (g.valid && g.features) lastHead = { headYaw: g.features.headYaw, headPitch: g.features.headPitch }; });
    root.hidden = false; document.addEventListener('keydown', onKey);
    return new Promise((resolve) => { resolveRun = resolve; begin(); });
  }

  function onKey(e) {
    if (e.code === 'Space' && pointsView.hidden === false) {
      e.preventDefault();
      // 첫 줄 맞춤·재중심: 점이 뜨고 0.5초는 받지 않는다. 스페이스바로 쪽을 넘긴 손이 연달아 눌러,
      // 눈이 점에 닿기도 전에 맞춤이 시작되면 그 쪽 전체가 틀린 자리로 밀린다.
      if (mode !== 'calibrate' && performance.now() - recenterShownAt < RECENTER_KEY_GUARD_MS) return;
      if (!e.repeat) startCollect();
    }
    // 결과 화면: 스페이스바·Enter로 "읽기 시작". 점을 누르던 손을 그대로 쓴다.
    // 마지막 점에서 누르고 있던 키(반복)나 곧바로 따라온 두 번째 누름으로 결과를 건너뛰지 않게, 화면이 뜨고 0.6초는 받지 않는다.
    else if ((e.code === 'Space' || e.code === 'Enter') && resultView.hidden === false) {
      e.preventDefault();
      const done = $('.calib-done');
      if (!e.repeat && !done.hidden && performance.now() - resultShownAt > RESULT_KEY_GUARD_MS) done.click();
    }
  }
  dot.addEventListener('click', startCollect);
  skip.addEventListener('click', () => finish({ status: 'skipped' }));
  $('.calib-retry').addEventListener('click', () => beginPose());
  $('.calib-done').addEventListener('click', () => finish({ status: 'done', fit: lastFit, reference }));

  return {
    get active() { return phase !== 'idle'; },
    /** 시선 기록용: 지금 단계와, 표본을 모으는 중이면 그 목표점(CSS px). */
    get progress() {
      const target = phase === 'collect' || phase === 'turn-collect' ? points[pointIndex] : null;
      return {
        phase: phase === 'idle' ? 'reading' : `${mode}:${phase}`,
        point: target ? pointIndex : null, targetX: target?.x ?? null, targetY: target?.y ?? null
      };
    },
    setLightWarning(on) { $('.calib-light').hidden = !on; },
    /** @returns Promise<{status:'done'|'skipped'|'aborted', fit?, reference?}> */
    /**
     * 자세 맞춤 → 다점 보정 → 결과.
     * @param {{region?: {left:number,top:number,width:number,height:number}|null}} [o]
     *   region: 글이 놓이는 영역(뷰포트 CSS px). 주면 그 위에 9점만 찍는다. 없으면 화면 전체 27점(예전 배치).
     */
    run(tracker, { region = null } = {}) { runRegion = region; return open(tracker, 'calibrate', beginPose); },
    /** 방금(또는 지금) 보정에 쓴 점들의 자리 (기록용) */
    get layout() {
      const used = usableRegion(runRegion, window.innerWidth, window.innerHeight);
      return { name: used ? `region-${REGION_GRID.cols}x${REGION_GRID.rows}` : 'screen-27', region: used, points: points.length };
    },
    /**
     * 보정은 두고 치우침만 바로잡는다. target({x, y}, CSS px)을 주면 PDF를 가리지 않고 그 자리에 점을 띄운다.
     * @returns Promise<{status:'recentered'|'skipped'|'aborted', reference?}>
     */
    recenter(tracker, target = null) { return open(tracker, target ? 'anchor' : 'recenter', () => beginRecenter(target)); },
    feed(sample, frame) {
      const face = frame?.seq === sample.seq ? frame.faceGeometry : null;
      if (face) lastFace = { ...face };
      if (phase === 'pose') {
        const pose = sample.valid ? evaluatePose(face, rules) : { ok: false, hint: '얼굴과 두 눈이 잘 보이게 해 주세요' };
        hint.textContent = pose.hint; guide.classList.toggle('is-ok', pose.ok);
        if (!pose.ok || !lastHead) { holdStart = null; return; }   // 고개 방향을 읽기 전에는 기준 자세로 삼지 않는다
        holdStart ??= sample.tMs;
        if (sample.tMs - holdStart >= rules.holdMs) { reference = { ...face, ...lastHead }; beginPoints(); }
      } else if (phase === 'turn-wait' || phase === 'turn-collect') {
        feedTurn(sample.tMs, face);
      } else if (phase === 'turn-return') {
        const off = !face || poseDrifted(reference, face, rules, lastHead);
        const stillTurned = !!lastHead && turnAmount(reference, lastHead, points[pointIndex].turn) >= rules.minTurn;
        if (off || stillTurned) {
          backSince = null;
          instruction.textContent = off ? poseReturnHint(reference, face, rules, lastHead) : FACE_FRONT_MESSAGE;
          return;
        }
        backSince ??= sample.tMs;
        if (sample.tMs - backSince >= rules.turnHoldMs) { backSince = null; advance(); }
      } else if (mode === 'calibrate' && (phase === 'wait-click' || phase === 'collect')) {
        if (face && !poseDrifted(reference, face, rules, lastHead)) { offSince = null; return; }
        offSince ??= sample.tMs;
        if (sample.tMs - offSince >= rules.pauseAfterMs) pause();
      } else if (phase === 'paused') {
        const off = !face || poseDrifted(reference, face, rules, lastHead);
        pauseHint.textContent = off ? poseReturnHint(reference, face, rules, lastHead) : '좋아요, 그대로 있어 주세요';
        pauseGuide.classList.toggle('is-ok', !off);
        if (off) { backSince = null; return; }
        backSince ??= sample.tMs;
        if (sample.tMs - backSince >= rules.resumeHoldMs) { hidePause(); placeDot(); }
      }
    },
    abort(reason) { if (phase !== 'idle') finish({ status: 'aborted', reason }); }
  };
}
