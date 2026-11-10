// 시선 추적기 — 카메라 + MediaPipe + 보정 모형을 묶어 뷰포트 좌표를 낸다. (새 구현)
// 기존 modules/eyeTracker.js(A 소유, 홍채 상대 x만 내보냄)를 건드리지 않고 따로 선다.
// 출력은 화면 좌표이며, 어디에도 묶이지 않는다 — 뷰포트 전체가 범위다.
//
// 한 프레임의 흐름
//   requestVideoFrameCallback → detectForVideo → landmark+머리자세
//   → extractGazeFeatures → 깜빡임/품질 판정 → 모형 예측(비율)
//   → One Euro 필터 → 고정 보정 → 뷰포트 픽셀 → onGaze
//
// 보정하지 않아도 바로 쓸 수 있다(중립 기준 + 초기 이득). 보정하면 오차를 픽셀로 보고한다.
//
// 본체에서는 options.shareVideo로 돌린다. 카메라는 A의 eyeTracker가 열고, 여기서는 같은 <video>를
// 읽기만 한다. 물방울 표시 전용이며 Sample·점수에는 관여하지 않는다.

import {
  GAZE_MATH_VERSION, extractGazeFeatures, createGazeModel, createOneEuroFilter,
  createFixationSnap, createNeutralCollector, createBlinkGuard, createDriftMonitor, createOpennessBaseline
} from './gazeMath.js';

export const GAZE_TRACKER_VERSION = 'gaze-tracker/1.0.0';

const MODEL_OPTIONS = Object.freeze({
  runningMode: 'VIDEO',
  numFaces: 1,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false   // 머리 자세는 landmark에서 직접 뽑는다. 행렬은 진단용일 뿐이라 끈다
});

const CONSTRAINTS = Object.freeze({
  audio: false,
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }
});

const DEFAULTS = Object.freeze({
  shareVideo: false,       // true면 카메라를 직접 열거나 닫지 않고, 이미 재생 중인 videoElement를 읽기만 한다
  orders: Object.freeze(['linear']),   // 보정 자세에서는 복잡한 모형이 나아 보여도, 읽을 때 자세·눈꺼풀이 달라지면 멀리 빗나가기 쉽다
  // 깜빡임은 두 기준값으로 걸러 떨림을 막는다(히스테리시스).
  // 눈꺼풀이 내려오는 동안 홍채 지표가 눈꺼풀에 끌려가므로, '감음'을 알아차렸을 때는
  // 이미 몇 프레임 어긋난 좌표를 내보낸 뒤다. 그래서 감기 시작 preBlinkMs 전의 좌표로 되감는다.
  blinkEnter: 0.34,        // 열린 기준 대비 이만큼 감기면 깜빡임 시작으로 본다
  blinkExit: 0.18,         // 이만큼 돌아오면 깜빡임이 끝난 것으로 본다
  preBlinkMs: 140,         // 깜빡임 중 붙들 좌표를 얼마나 거슬러 올라가 고를지
  maxBlinkMs: 600,         // 이보다 오래 감겨 있으면 깜빡임이 아니라 '가늘게 뜬 상태'로 본다
  postBlinkMs: 250,        // 다시 뜬 뒤에도 이만큼은 세로를 붙든다(가로는 따라간다). 눈꺼풀이 덜 올라가 홍채가 아래로 읽힌다
  minOpenness: 0.012,      // 눈 높이/두 눈 거리. 이보다 작으면 홍채를 믿지 않는다
  minFaceScale: 0.05,      // 두 눈 거리 / 영상 폭. 너무 멀면 잡음이 커진다
  neutralSamples: 24,
  filterX: { minCutoff: 1.1, beta: 0.55, dCutoff: 1.0 },
  filterY: { minCutoff: 0.9, beta: 0.45, dCutoff: 1.0 },   // 세로가 더 흔들려 조금 더 눌러 준다
  fixation: { windowMs: 180, dispersion: 0.022 },
  snapToFixation: true,
  holdMsOnInvalid: 600     // 깜빡임·검출 실패가 짧으면 마지막 좌표를 유지한다
});

const reasonText = (r) => ({
  no_face: '얼굴이 보이지 않아요',
  multiple_faces: '얼굴이 둘 이상이에요',
  landmarks_unusable: '눈을 찾지 못했어요',
  blink: '눈을 감았어요',
  eye_too_narrow: '눈이 가려졌어요',
  face_too_far: '카메라에서 너무 멀어요',
  warming_up: '중앙 기준을 잡는 중이에요',
  not_running: '카메라가 꺼져 있어요'
}[r] ?? '눈을 찾는 중');

export { reasonText as gazeReasonText };

/**
 * @param videoElement  카메라 미리보기 <video> (화면에 안 보여도 된다)
 * @param wasmBaseUrl   MediaPipe wasm 폴더
 * @param modelAssetUrl face_landmarker.task
 * @param onGaze        프레임마다 호출. 아래 payload 참고
 * @param onError       {code, message, recoverable}
 * @param onStatus      {running, …} 상태가 바뀔 때
 * @param viewport      () => {width, height}. 기본값은 window 뷰포트
 */
export async function createGazeTracker({
  videoElement, wasmBaseUrl, modelAssetUrl,
  onGaze, onError, onStatus, viewport, options = {}
} = {}) {
  if (!videoElement) throw new Error('videoElement가 필요합니다.');
  if (typeof onGaze !== 'function') throw new Error('onGaze가 필요합니다.');

  const cfg = { ...DEFAULTS, ...options };
  const report = (code, message, recoverable = false) => onError?.({ code, message, recoverable });
  const getViewport = typeof viewport === 'function'
    ? viewport
    : () => ({ width: window.innerWidth, height: window.innerHeight });

  // GPU 위임을 먼저 시도하고 안 되면 CPU로 내려간다.
  // 기존 구현은 CPU로 못박혀 있었고, 추론이 프레임 시간을 거의 다 먹는다.
  let landmarker, delegate = null, delegateFallback = null;
  try {
    const { FaceLandmarker, FilesetResolver } = await import(
      new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href);
    const vision = await FilesetResolver.forVisionTasks(String(wasmBaseUrl).replace(/\/$/, ''));
    for (const want of options.delegate ? [options.delegate] : ['GPU', 'CPU']) {
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          ...MODEL_OPTIONS,
          baseOptions: { modelAssetPath: modelAssetUrl, delegate: want }
        });
        delegate = want;
        break;
      } catch (e) {
        delegateFallback = `${want} 실패: ${e.message}`;
        if (want === 'CPU') throw e;
      }
    }
  } catch (e) {
    report('model_init_failed', `모델·WASM 초기화 실패: ${e.message}`);
    throw e;
  }

  const model = createGazeModel();
  const filterX = createOneEuroFilter(cfg.filterX);
  const filterY = createOneEuroFilter(cfg.filterY);
  const fixation = createFixationSnap(cfg.fixation);
  let neutralCollector = createNeutralCollector(cfg.neutralSamples);

  let destroyed = false, running = false, starting = null, generation = 0, raf = null, stream = null;
  let t0 = 0, seq = 0, modelClock = -1, lastMediaTime = null;
  let frames = 0, invalidFrames = 0, fpsTimes = [];
  const opennessBaseline = createOpennessBaseline();
  const blinkGuard = createBlinkGuard({
    enter: cfg.blinkEnter, exit: cfg.blinkExit, preBlinkMs: cfg.preBlinkMs, maxBlinkMs: cfg.maxBlinkMs, settleMs: cfg.postBlinkMs
  });
  const drift = createDriftMonitor();
  let reseedTo = null;               // 깜빡임이 끝난 뒤 필터를 다시 앉힐 자리
  let anchoring = null;              // 재중심 중이면 {samples:[]}
  let lastValid = null;              // 마지막 유효 좌표 {xPx, yPx, xNorm, yNorm, tMs}
  let lastFeatures = null;
  let trackSettings = null;
  let needNeutral = true;
  let collecting = null;             // 보정 수집 중이면 {targets:[], samples:[]}

  // 결과를 곁에서 듣는 사람들(정확도 시험 등). onGaze는 주 소비자 하나로 둔다.
  const taps = new Set();
  function emit(payload) {
    onGaze(payload);
    for (const fn of taps) {
      try { fn(payload); } catch (e) { report('tap_failed', `시선 구독자 오류: ${e.message}`, true); }
    }
  }

  const emitStatus = () => onStatus?.({
    running, calibrated: model.calibrated, awaitingNeutral: needNeutral,
    neutralProgress: neutralCollector.count
  });

  function schedule(g) {
    if (running && !destroyed && g === generation) {
      raf = videoElement.requestVideoFrameCallback(() => tick(g));
    }
  }

  function resetSignals() {
    filterX.reset(); filterY.reset(); fixation.reset();
    neutralCollector.reset();
    opennessBaseline.reset(); lastValid = null; lastFeatures = null;
    blinkGuard.reset(); reseedTo = null; anchoring = null; drift.reset();
    needNeutral = true; lastMediaTime = null; fpsTimes = [];
  }

  function emitInvalid(tMs, reason, override = null) {
    invalidFrames++;
    const base = override ?? lastValid;
    const hold = base && tMs - base.tMs <= cfg.holdMsOnInvalid ? base : null;
    emit({
      tMs, seq: seq++, valid: false, reason, reasonText: reasonText(reason),
      held: !!hold,
      xPx: hold?.xPx ?? null, yPx: hold?.yPx ?? null,
      xNorm: hold?.xNorm ?? null, yNorm: hold?.yNorm ?? null,
      rawXNorm: null, rawYNorm: null,
      confidence: 0, blink: reason === 'blink', fixating: false,
      calibrated: model.calibrated, features: lastFeatures, fps: estimateFps()
    });
  }

  function estimateFps() {
    return fpsTimes.length > 1
      ? ((fpsTimes.length - 1) * 1000) / (fpsTimes.at(-1) - fpsTimes[0])
      : null;
  }

  function tick(g) {
    raf = null;
    if (!running || destroyed || g !== generation) return;
    if (videoElement.readyState < 2) { schedule(g); return; }

    const tMs = performance.now() - t0;
    modelClock = Math.max(performance.now(), modelClock + 0.001);  // 모델 시각은 단조 증가여야 한다

    let result;
    try {
      result = landmarker.detectForVideo(videoElement, modelClock);
    } catch (e) {
      report('inference_failed', `측정 중 오류: ${e.message}`, true);
      void stop();
      return;
    }
    if (!running || destroyed || g !== generation) return;

    fpsTimes.push(tMs);
    if (fpsTimes.length > 60) fpsTimes.shift();
    frames++;

    try {
      processFrame(result, tMs);
    } catch (e) {
      // 소비자(화면·기록) 쪽 오류로 카메라를 끄지 않는다.
      report('consumer_failed', `시선 결과 처리 중 오류: ${e.message}`, true);
    } finally {
      schedule(g);
    }
  }

  function processFrame(result, tMs) {
    const faces = result.faceLandmarks ?? [];
    if (!faces.length) { emitInvalid(tMs, 'no_face'); return; }
    if (faces.length > 1) { emitInvalid(tMs, 'multiple_faces'); return; }

    const w = videoElement.videoWidth, h = videoElement.videoHeight;
    const f = extractGazeFeatures(faces[0], w, h, result.facialTransformationMatrixes?.[0]?.data ?? null);
    if (!f) { emitInvalid(tMs, 'landmarks_unusable'); return; }
    lastFeatures = f;

    // ── 깜빡임 처리 ──
    // 눈꺼풀이 내려오는 동안 홍채 지표가 눈꺼풀을 따라 끌려 내려간다. 그대로 쓰면
    // "감았다"고 판정하기 직전 두어 프레임이 엉뚱한 곳을 가리켜 포인터가 튄다.
    // 그래서 ① 두 기준값으로 걸러 떨림을 막고 ② 감기 시작 전의 좌표로 되감아 붙든다.
    const closed = opennessBaseline.closure(tMs, f.openness);
    const blink = blinkGuard.update(closed, tMs);
    if (blink.timedOut) opennessBaseline.reset();   // 깜빡임이 아니라 눈꺼풀이 내려온 새 상태다. 바로 다시 '감음'으로 보지 않게 한다
    if (blink.ended) {
      // 다시 뜰 때도 필터가 깜빡임 중의 값에서 출발해 휙 끌려가지 않도록 자리를 다시 잡는다
      filterX.reset(); filterY.reset(); fixation.reset();
      reseedTo = blink.hold ?? lastValid;
    }
    if (blink.blinking) { emitInvalid(tMs, 'blink', blink.hold ?? lastValid); return; }
    // 다시 뜬 직후(settling): 눈꺼풀이 덜 올라가 홍채가 '아래로'만 끌린다. 세로는 감기 전 자리에 두고
    // 가로는 바로 따른다 — 깜빡이며 줄 처음으로 돌아가는 움직임을 늦추지 않는다.
    // 이 프레임은 보정 표본·치우침 맞춤·드리프트에는 넣지 않는다.
    const settleY = blink.settling ? (blink.hold ?? lastValid)?.yNorm ?? null : null;
    if (f.openness < cfg.minOpenness) { emitInvalid(tMs, 'eye_too_narrow'); return; }
    if (f.faceScale < cfg.minFaceScale) { emitInvalid(tMs, 'face_too_far'); return; }

    // 중립 기준: 처음 몇 프레임을 모아 "화면 중앙을 보던 자세"로 둔다.
    // 실시간으로 범위를 재추정하지 않는다 — 그러면 어디를 봐도 포인터가 화면 전체를 쓸어 버린다.
    if (needNeutral) {
      neutralCollector.push(f);
      if (!neutralCollector.ready) { emitInvalid(tMs, 'warming_up'); return; }
      model.setNeutral(neutralCollector.result());
      needNeutral = false;
      drift.anchorNow();          // 기준점이 없으면 드리프트를 볼 수 없다
      emitStatus();
    }

    const pred = model.predictNorm(f);
    if (!pred || ![pred.x, pred.y].every(Number.isFinite)) { emitInvalid(tMs, 'landmarks_unusable'); return; }

    // 깜빡임이 막 끝났으면 필터를 감기 직전 자리에 앉히고 시작한다 (튀지 않게)
    if (reseedTo) {
      filterX.filter(reseedTo.xNorm, tMs - 1);
      filterY.filter(reseedTo.yNorm, tMs - 1);
      reseedTo = null;
    }
    const sx = filterX.filter(pred.x, tMs);
    const sy = filterY.filter(settleY ?? pred.y, tMs);
    const snapped = cfg.snapToFixation ? fixation.push(sx, sy, tMs) : { x: sx, y: sy, fixating: false };

    const { width, height } = getViewport();
    const xNorm = snapped.x, yNorm = snapped.y;
    const inside = xNorm >= 0 && xNorm <= 1 && yNorm >= 0 && yNorm <= 1;
    const xPx = Math.min(width, Math.max(0, xNorm * width));
    const yPx = Math.min(height, Math.max(0, yNorm * height));

    // 믿음 정도: 두 눈 다 보이는지, 충분히 떴는지, 가까운지, 보정했는지를 곱한다.
    const confidence = Math.max(0, Math.min(1,
      (f.monocular ? 0.6 : 1) *
      (1 - closed) *
      Math.min(1, f.faceScale / 0.12) *
      (model.calibrated ? 1 : 0.7)));

    lastValid = { xPx, yPx, xNorm, yNorm, tMs };
    blinkGuard.push(lastValid);
    const settling = settleY !== null;
    if (!settling) {
      drift.push(f, tMs);
      if (anchoring) anchoring.samples.push({ tMs, x: pred.x, y: pred.y });
      if (collecting) collecting.samples.push({ tMs, features: f, nx: null, ny: null });
    }

    emit({
      tMs, seq: seq++, valid: true, reason: settling ? 'post_blink' : null, reasonText: null, held: false,
      xPx, yPx, xNorm, yNorm,
      rawXNorm: pred.x, rawYNorm: pred.y,
      offscreen: !inside,
      confidence, blink: false, fixating: snapped.fixating,
      calibrated: pred.calibrated, features: f, fps: estimateFps(),
      viewport: { width, height },
      // 진단 전용 참조(복사하지 않는다. 다음 프레임에 덮일 수 있으니 바로 쓰고 버릴 것)
      landmarks: faces[0]
    });
  }

  function cleanup() {
    if (raf !== null) { try { videoElement.cancelVideoFrameCallback(raf); } catch { /* 이미 끝난 콜백 */ } }
    raf = null;
    if (cfg.shareVideo) return;        // 영상은 주인이 정리한다
    if (stream) for (const t of stream.getTracks()) { t.onended = null; t.stop(); }
    stream = null;
    try { videoElement.pause(); } catch { /* 재생 전 */ }
    videoElement.srcObject = null;
  }

  async function stop() {
    running = false;
    generation++;
    collecting = null;
    cleanup();
    resetSignals();
    emitStatus();
  }

  async function openCamera(g) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('localhost 또는 HTTPS에서 카메라를 사용하세요.');
    }
    const acquired = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    if (destroyed || g !== generation) { acquired.getTracks().forEach((t) => t.stop()); throw new Error('시작 요청이 취소됐습니다.'); }
    stream = acquired;
    videoElement.srcObject = acquired;
    videoElement.muted = true;
    videoElement.playsInline = true;
    await videoElement.play();
    if (destroyed || g !== generation) throw new Error('시작 요청이 취소됐습니다.');
    const settings = acquired.getVideoTracks()[0]?.getSettings() ?? null;
    if (settings) { const { deviceId, groupId, ...rest } = settings; trackSettings = rest; }
    for (const t of acquired.getVideoTracks()) {
      t.onended = () => {
        if (g === generation) {
          report('camera_lost', '카메라 연결이 끊어졌습니다. 다시 시작하세요.', true);
          void stop();
        }
      };
    }
  }

  function start() {
    if (destroyed) return Promise.reject(new Error('destroy된 추적기는 다시 쓸 수 없습니다.'));
    if (running) return Promise.resolve();
    if (starting) return starting;
    const g = ++generation;
    resetSignals();
    seq = 0; frames = 0; invalidFrames = 0;
    starting = (async () => {
      try {
        if (typeof videoElement.requestVideoFrameCallback !== 'function') {
          throw new Error('새 영상 프레임 알림(requestVideoFrameCallback)이 필요합니다. 최신 Chrome에서 실행하세요.');
        }
        if (!cfg.shareVideo) await openCamera(g);
        t0 = performance.now();
        modelClock = performance.now();
        running = true;
        emitStatus();
        schedule(g);
      } catch (e) {
        if (g === generation) {
          cleanup();
          running = false;
          const message = e.name === 'NotAllowedError'
            ? '카메라 권한을 허용하세요. Chrome과 macOS 권한을 확인하세요.'
            : e.message;
          report('camera_start_failed', message);
          emitStatus();
        }
        throw e;
      }
    })().finally(() => { starting = null; });
    return starting;
  }

  /** 지금 자세를 "화면 중앙" 기준으로 다시 잡는다. 보정 결과는 건드리지 않는다. */
  function recenter() {
    neutralCollector = createNeutralCollector(cfg.neutralSamples);
    needNeutral = true;
    filterX.reset(); filterY.reset(); fixation.reset();
    emitStatus();
  }

  /**
   * 아는 한 점을 보는 동안의 예측을 모아 **치우침만** 바로잡는다.
   * 회귀 모형(기울기)은 건드리지 않는다 — 보정은 그대로 두고 밀린 만큼만 되민다.
   * 보정한 뒤 자세가 바뀌거나 눈꺼풀이 처져 좌표가 통째로 흘러내릴 때 쓴다.
   */
  async function recenterTo(nx = 0.5, ny = 0.5, { durationMs = 1100, settleMs = 300 } = {}) {
    if (!running) return { ok: false, reason: 'not_running' };
    anchoring = { samples: [] };
    await new Promise((r) => setTimeout(r, durationMs));
    const got = anchoring?.samples ?? [];
    anchoring = null;
    const t0 = got.length ? got[0].tMs + settleMs : 0;
    const kept = got.filter((s) => s.tMs >= t0);
    if (kept.length < 3) return { ok: false, reason: 'not_enough_samples', samples: kept.length };
    const mid = (sel) => {
      const s = kept.map(sel).sort((a, b) => a - b);
      return s[s.length >> 1];
    };
    // 치우침을 더하기 전의 예측이 아니라 '지금 치우침이 반영된' 예측을 기준으로 민다
    const r = model.anchorTo({ predictedX: mid((s) => s.x), predictedY: mid((s) => s.y), nx, ny });
    if (r.ok) {
      filterX.reset(); filterY.reset(); fixation.reset();
      drift.anchorNow();
      emitStatus();
    }
    return { ...r, samples: kept.length };
  }

  const calibration = {
    /** 한 목표점을 ms 동안 응시하며 표본을 모은다. 분해능이 떨어지는 처음 200ms는 버린다. */
    async collectPoint({ nx, ny, point, durationMs = 1100, settleMs = 250 }) {
      if (!running) throw new Error('카메라를 먼저 켜세요.');
      if (![nx, ny].every(Number.isFinite)) throw new Error('목표 좌표가 필요합니다.');
      // 호출마다 자기 묶음을 쓴다. 앞선 수집이 취소돼 늦게 끝나도 새 수집을 지우지 않는다.
      const mine = { samples: [] };
      collecting = mine;
      await new Promise((r) => setTimeout(r, durationMs));
      if (collecting === mine) collecting = null;
      const picked = mine.samples;
      const start = picked.length ? picked[0].tMs + settleMs : 0;
      const kept = picked.filter((s) => s.tMs >= start)
        .map((s) => ({ features: s.features, nx, ny, point }));
      return kept;
    },
    /** 모은 표본으로 모형을 맞춘다. leave-one-out 오차를 픽셀로 돌려준다. */
    fit(samples) {
      const { width, height } = getViewport();
      const r = model.fit(samples, { width, height, orders: cfg.orders });
      if (r.ok) {
        model.clearOffset();           // 새 보정은 치우침 없이 시작한다
        filterX.reset(); filterY.reset(); fixation.reset();
        drift.anchorNow();             // 이때의 자세·눈꺼풀을 드리프트 기준점으로 잡는다
        emitStatus();
      }
      return r;
    },
    /**
     * 빠른 보정: 몇 점의 대표 특징으로 부호와 크기만 직접 잰다.
     * 회귀 모형은 만들지 않는다 — 보정 전 모드의 짐작값을 실제 측정값으로 바꾸는 용도.
     */
    quickFit(pairs) {
      const r = model.fitGainsFromSpan(pairs);
      if (r.ok) {
        filterX.reset(); filterY.reset(); fixation.reset();
        drift.anchorNow();
        emitStatus();
      }
      return r;
    },
    clear() { model.clearFit(); filterX.reset(); filterY.reset(); fixation.reset(); emitStatus(); },
    /** 방금 한 보정이 더 나쁘면 직전 보정으로 되돌린다. */
    restorePrevious() {
      const r = model.restorePrevious();
      if (r.ok) { filterX.reset(); filterY.reset(); fixation.reset(); emitStatus(); }
      return r;
    },
    get hasPrevious() { return model.hasPrevious; },
    get fit_() { return model.getFit(); }
  };

  return {
    start, stop, recenter, recenterTo, calibration,
    /** 보정 기준점 대비 지금 신호가 얼마나 밀렸는지. 드리프트 원인을 가리는 데 쓴다. */
    getDrift() { return drift.delta(); },
    anchorDrift() { return drift.anchorNow(); },
    getOffset() { return model.getOffset(); },
    clearOffset() { model.clearOffset(); filterX.reset(); filterY.reset(); fixation.reset(); },
    /** 결과를 곁에서 듣는다. 돌려주는 함수를 부르면 해지된다. */
    tap(fn) {
      if (typeof fn !== 'function') return () => {};
      taps.add(fn);
      return () => taps.delete(fn);
    },
    get running() { return running; },
    get calibrated() { return model.calibrated; },
    setGains(g) { model.setGains(g); },
    getGains() { return model.getGains(); },
    /** 좌우('x')·상하('y')를 통째로 뒤집는다. 보정 전 모드에서 방향이 반대로 느껴질 때. */
    flip(axis) {
      const g = model.flip(axis === 'y' ? 'y' : 'x');
      filterX.reset(); filterY.reset(); fixation.reset();
      return g;
    },
    setOption(k, v) { cfg[k] = v; },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      await stop();
      try { landmarker.close(); } catch { /* 이미 닫힘 */ }
    },
    getDiagnostics() {
      return {
        trackerVersion: GAZE_TRACKER_VERSION,
        mathVersion: GAZE_MATH_VERSION,
        mock: false,
        running, destroyed,
        videoWidth: videoElement.videoWidth || null,
        videoHeight: videoElement.videoHeight || null,
        requestedConstraints: CONSTRAINTS,
        actualTrackSettings: trackSettings,
        delegate,
        delegateFallback,
        framesProcessed: frames,
        invalidFrames,
        validRatio: frames ? (frames - invalidFrames) / frames : null,
        estimatedFps: estimateFps(),
        blinking: blinkGuard.blinking,
        offset: model.getOffset(),
        drift: drift.delta(),
        headPoseEnabled: true,
        headPoseObserved: lastFeatures?.hasHeadPose ?? null,
        calibrated: model.calibrated,
        calibration: model.getFit(),
        neutral: model.getNeutral(),
        gains: model.getGains(),
        options: cfg,
        modelOptions: MODEL_OPTIONS,
        lastFeatures: lastFeatures ? { ...lastFeatures, eyes: { ...lastFeatures.eyes } } : null
      };
    }
  };
}
