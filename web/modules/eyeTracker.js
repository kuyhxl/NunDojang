// A 소유 · 실제 카메라 측정 1차. 공개 계약 gazegate-contract/1.1.0 유지.
import { CONTRACT_VERSION } from './contracts.js';
export const IS_MOCK = false;
const VERSION = 'a-measurement/0.4.2';
const OPTIONS = { runningMode: 'VIDEO', numFaces: 1,
  minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5, outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false };
const CONSTRAINTS = { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' } };
// left/right는 사용자 기준입니다. 분석 영상은 반전하지 않습니다.
const EYES = { left: [362, 385, 387, 263, 373, 380, 473], right: [33, 160, 158, 133, 153, 144, 468] };
const MIN_EAR = 0.10; // 초기 눈 검출 품질 기준. 깜빡임 횟수 판정 기준은 아닙니다.

// 진단 전용: 홍채가 아닌 두 눈의 바깥 눈꼬리(33, 263)를 사용한다.
// 영상 픽셀 좌표. 눈꼬리 간격은 실제 얼굴 크기/거리(cm)가 아니며 3D 자세도 아니다.
export function measureFaceGeometry(points, w, h) {
  const a=points?.[33], b=points?.[263];
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||
    [a,b].some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return null;
  const dx=(b.x-a.x)*w, dy=(b.y-a.y)*h;
  if(dx<2)return null;
  return {centerXPx:(a.x+b.x)*w/2,centerYPx:(a.y+b.y)*h/2,
    eyeSpanPx:Math.hypot(dx,dy),rollDeg:Math.atan2(dy,dx)*180/Math.PI,
    videoWidth:w,videoHeight:h};
}

function eyeValues(points, ids, w, h) {
  const ps = ids.map(i => points[i]);
  if (ps.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { x: null, ear: null };
  const [a,b,c,d,e,f,iris] = ps;
  const dist = (p,q) => Math.hypot((p.x-q.x)*w, (p.y-q.y)*h);
  const width = dist(a,d), dx = Math.abs(a.x-d.x);
  if (width < 2 || dx*w < 2) return { x: null, ear: null };
  const ear = (dist(b,f)+dist(c,e))/(2*width);
  const x = (iris.x-Math.min(a.x,d.x))/dx;
  return { x: Number.isFinite(x) ? x : null, ear: Number.isFinite(ear) ? ear : null };
}
// 진단 전용. 눈꼬리를 잇는 축과 그 수직축에 홍채를 투영한다.
// v는 영상에서 아래 방향이 양수이며 눈 너비로 나눈 무차원 값이다.
// 화면 시선 좌표가 아니며 yaw/pitch나 3D 머리 자세를 보정하지 않는다.
export function measureEyeGeometry(points,w,h){
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return null;
  const result={version:'eye-axis-2d/0.2.0',diagnosticOnly:true};
  for(const name of ['left','right']){
    const ids=EYES[name];let a=points?.[ids[0]],b=points?.[ids[3]],i=points?.[ids[6]];
    if([a,b,i].some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return null;
    if(a.x>b.x)[a,b]=[b,a];
    const dx=(b.x-a.x)*w,dy=(b.y-a.y)*h,ix=(i.x-a.x)*w,iy=(i.y-a.y)*h,den=dx*dx+dy*dy;
    if(den<4)return null;
    result[name]={u:(ix*dx+iy*dy)/den,v:(iy*dx-ix*dy)/den,eyeWidthPx:Math.sqrt(den)};
    // 기존 u/v를 유지하고 같은 프레임의 눈꺼풀 기준을 진단용으로 추가합니다.
    const lidIds=[ids[1],ids[2],ids[4],ids[5]],ps=lidIds.map(id=>points?.[id]);
    if(ps.some(p=>!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))){
      result[name].lids=null;
    }else{
      const projected=ps.map(p=>{const x=(p.x-a.x)*w,y=(p.y-a.y)*h;
        return {u:(x*dx+y*dy)/den,v:(y*dx-x*dy)/den};});
      const upperV=(projected[0].v+projected[1].v)/2;
      const lowerV=(projected[2].v+projected[3].v)/2;
      const midV=(upperV+lowerV)/2,gapV=lowerV-upperV,gapPx=gapV*Math.sqrt(den);
      const usable=Number.isFinite(gapPx)&&gapPx>=2;
      result[name].lids={landmarkIds:lidIds,pointsEyeAxes:projected,upperV,lowerV,midV,gapV,gapPx,
        irisMinusMidV:result[name].v-midV,
        irisFraction:gapV>1e-12?(result[name].v-upperV)/gapV:null,
        usable,reason:usable?null:'lid_gap_too_small_or_reversed'};
    }
  }
  result.meanV=(result.left.v+result.right.v)/2;
  const lids=[result.left.lids,result.right.lids];
  result.meanLidCenteredV=lids.every(l=>l?.usable)?(lids[0].irisMinusMidV+lids[1].irisMinusMidV)/2:null;
  result.meanLidFraction=lids.every(l=>l?.usable&&Number.isFinite(l.irisFraction))?(lids[0].irisFraction+lids[1].irisFraction)/2:null;
  return result;
}
function signals(points, w, h) {
  const left = eyeValues(points, EYES.left, w, h), right = eyeValues(points, EYES.right, w, h);
  const ok = [left,right].every(e => e.x !== null && e.x >= 0 && e.x <= 1 && e.ear !== null && e.ear >= MIN_EAR);
  return { valid: ok, leftIrisX: ok ? left.x : null, rightIrisX: ok ? right.x : null,
    leftIrisY: null, rightIrisY: null, leftEar: left.ear, rightEar: right.ear,
    headMotion: null, invalidReason: ok ? null : 'eye_unreliable' };
}

export async function createEyeTracker({ videoElement, wasmBaseUrl, modelAssetUrl, onSample, onError }) {
  if (!videoElement || typeof onSample !== 'function') throw new Error('videoElement와 onSample이 필요합니다.');
  const report = (code, message, recoverable = false) => onError?.({ code, message, recoverable });
  let model;
  try {
    const { FaceLandmarker, FilesetResolver } = await import(new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href);
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl.replace(/\/$/, ''));
    model = await FaceLandmarker.createFromOptions(vision, { ...OPTIONS, baseOptions: { modelAssetPath: modelAssetUrl, delegate: 'CPU' } });
  } catch (e) { report('model_init_failed', `모델·WASM 초기화 실패: ${e.message}`); throw e; }
  let destroyed = false, running = false, generation = 0, raf = null, stream = null, starting = null;
  let sessionId = null, sessionT0 = null, seq = 0, frames = 0, lastSampleT = -1, lastMediaT = null;
  let firstT = null, latestT = null, modelT = -1, fpsTimes = [];
  let videoWidth = null, videoHeight = null, trackSettings = null;
  let callbackCount = 0, duplicateFramesSkipped = 0, presentationGaps = 0, lastPresented = null;
  let lastVideoFrame = null, lastFrameDiagnostics = null;
  let sampleCallbackErrors = 0;
  function schedule(g) {
    if (running && !destroyed && g === generation)
      raf = videoElement.requestVideoFrameCallback((_now, metadata) => tick(g, metadata));
  }
  const cleanup = () => {
    if (raf !== null) videoElement.cancelVideoFrameCallback(raf);
    raf = null;
    if (stream) { for (const t of stream.getTracks()) { t.onended = null; t.stop(); } }
    stream = null; videoElement.pause(); videoElement.srcObject = null;
  };
  async function stop() { running = false; generation++; cleanup(); }
  function tick(g, metadata) {
    raf = null;
    if (!running || destroyed || g !== generation) return;
    callbackCount++;
    const mediaT = metadata?.mediaTime, presented = metadata?.presentedFrames;
    if (!Number.isFinite(mediaT) || (lastMediaT !== null && mediaT <= lastMediaT)) {
      duplicateFramesSkipped++; schedule(g); return;
    }
    if (Number.isFinite(presented)) {
      if (lastPresented !== null && presented > lastPresented + 1) presentationGaps += presented-lastPresented-1;
      lastPresented = presented;
    }
    lastMediaT = mediaT;
    lastVideoFrame = { mediaTime: mediaT, presentedFrames: presented ?? null,
      width: metadata?.width ?? null, height: metadata?.height ?? null };
    if (videoElement.readyState >= 2) {
      const frameNow = performance.now(), tMs = frameNow-sessionT0;
      if (!Number.isFinite(tMs) || tMs < 0 || tMs <= lastSampleT) {
        report('timestamp_error', '시각이 증가하지 않습니다. 측정을 중지합니다.'); void stop(); return;
      }
      // 모델 시각은 객체 수명 동안 증가, Sample은 호출자가 정한 세션 원점 사용.
      modelT = Math.max(frameNow, modelT+0.001);
      let sample;
      try {
        const result = model.detectForVideo(videoElement, modelT);
        if (!running || destroyed || g !== generation) return;
        const faces = result.faceLandmarks ?? [];
        const values = faces.length ? signals(faces[0], videoElement.videoWidth, videoElement.videoHeight) : {
          valid: false, leftIrisX: null, rightIrisX: null, leftIrisY: null, rightIrisY: null,
          leftEar: null, rightEar: null, headMotion: null, invalidReason: 'no_face' };
        // Sample 출력 전에 갱신하여 dev 화면이 동일 seq/tMs로 진단을 연결할 수 있게 한다.
        // EyeSample의 키·유효성·headMotion 값 및 후보 검출 입력은 바꾸지 않는다.
        lastFrameDiagnostics={sessionId,seq,tMs,
          faceGeometry:faces.length?measureFaceGeometry(faces[0],videoElement.videoWidth,videoElement.videoHeight):null,
          eyeGeometry:faces.length&&values.valid?measureEyeGeometry(faces[0],videoElement.videoWidth,videoElement.videoHeight):null};
        fpsTimes.push(tMs); if(fpsTimes.length>60)fpsTimes.shift();
        frames++; firstT ??= tMs; latestT = tMs; lastSampleT = tMs;
        sample={ contractVersion: CONTRACT_VERSION, source: 'mediapipe_iris', sessionId, seq: seq++, tMs, ...values };
      } catch (e) { report('inference_failed', `측정 중 오류: ${e.message}`); void stop(); return; }
      // 소비자(화면/저장) 코드 오류를 추론 실패로 보고하거나 카메라를 끄지 않는다.
      // 오류는 호출자/브라우저에 전달하고 다음 프레임 예약은 보장한다.
      try { onSample(sample); }
      catch (e) { sampleCallbackErrors++; throw e; }
      finally { schedule(g); }
      return;
    }
    schedule(g);
  }
  function start(opts) {
    if (destroyed) return Promise.reject(new Error('destroy된 측정기는 다시 쓸 수 없습니다.'));
    if (!opts || typeof opts.sessionId !== 'string' || !opts.sessionId || !Number.isFinite(opts.sessionT0) || opts.sessionT0 > performance.now()) return Promise.reject(new Error('유효한 sessionId·sessionT0가 필요합니다.'));
    if (running || starting) {
      if (opts.sessionId !== sessionId || opts.sessionT0 !== sessionT0) return Promise.reject(new Error('다른 세션으로 바꾸기 전에 중지하세요.'));
      return starting ?? Promise.resolve();
    }
    if (opts.sessionId === sessionId && opts.sessionT0 !== sessionT0) return Promise.reject(new Error('같은 세션의 시간 원점을 바꿀 수 없습니다.'));
    if (opts.sessionId !== sessionId) { seq = 0; frames = 0; lastSampleT = -1; firstT = null; latestT = null; callbackCount = 0; duplicateFramesSkipped = 0; presentationGaps = 0; sampleCallbackErrors=0; }
    sessionId = opts.sessionId; sessionT0 = opts.sessionT0; lastMediaT = null; lastPresented = null; lastVideoFrame = null; lastFrameDiagnostics=null; fpsTimes = [];
    const g = ++generation;
    starting = (async () => {
      try {
        if (typeof videoElement.requestVideoFrameCallback !== 'function' || typeof videoElement.cancelVideoFrameCallback !== 'function') throw new Error('새 영상 프레임 알림 기능이 필요합니다. 최신 Chrome에서 실행하세요.');
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('localhost 또는 HTTPS에서 카메라를 사용하세요.');
        const acquired = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (destroyed || g !== generation) { acquired.getTracks().forEach(t => t.stop()); throw new Error('시작 요청이 취소됐습니다.'); }
        stream = acquired; videoElement.srcObject = acquired; videoElement.muted = true; videoElement.playsInline = true;
        await videoElement.play();
        if (destroyed || g !== generation) throw new Error('시작 요청이 취소됐습니다.');
        videoWidth = videoElement.videoWidth || null; videoHeight = videoElement.videoHeight || null;
        trackSettings = acquired.getVideoTracks()[0]?.getSettings() ?? null;
        if(trackSettings) { const {deviceId, groupId, ...rest}=trackSettings; trackSettings=rest; }
        for (const t of acquired.getVideoTracks()) t.onended = () => { if (g === generation) { report('camera_lost', '카메라 연결이 끊어졌습니다. 다시 시작하세요.', true); void stop(); } };
        running = true; schedule(g);
      } catch (e) {
        if (g === generation) { cleanup(); running = false;
          const message = e.name === 'NotAllowedError' ? '카메라 권한을 허용하세요. Chrome과 macOS 권한을 확인하세요.' : e.message;
          report('camera_start_failed', message); }
        throw e;
      }
    })().finally(() => { starting = null; });
    return starting;
  }
  return { start, stop,
    async destroy() { if (destroyed) return; destroyed = true; await stop(); model.close(); },
    getDiagnostics() {
      return { mock: false, trackerVersion: VERSION, implementationRevision:'pr9-fixes/0.1.0',sampleCallbackErrors,
        running, destroyed, videoWidth, videoHeight,
        requestedConstraints: CONSTRAINTS, actualTrackSettings: trackSettings, framesProcessed: frames,
        frameScheduler: 'requestVideoFrameCallback', callbackCount, duplicateFramesSkipped,
        presentationFramesNotObserved: presentationGaps, lastVideoFrame,
        lastFrameDiagnostics:lastFrameDiagnostics?{...lastFrameDiagnostics,
          faceGeometry:lastFrameDiagnostics.faceGeometry?{...lastFrameDiagnostics.faceGeometry}:null,
          eyeGeometry:lastFrameDiagnostics.eyeGeometry?structuredClone(lastFrameDiagnostics.eyeGeometry):null}:null,
        eyeGeometryVersion:'eye-axis-2d/0.2.0',eyeGeometryDiagnosticOnly:true,
        eyelidGeometryVersion:'eye-lids-reference/0.1.0',eyelidGeometryDiagnosticOnly:true,
        faceGeometryVersion:'eye-corners-2d/0.1.0',faceGeometryLandmarks:[33,263],
        faceGeometryDiagnosticOnly:true,
        estimatedFps: fpsTimes.length>1 ? (fpsTimes.length-1)*1000/(fpsTimes.at(-1)-fpsTimes[0]) : null,
        packageVersion: '0.10.32', modelVersion: 'face_landmarker/float16/1', delegate: 'CPU',
        options: OPTIONS, eyeQualityMinEar: MIN_EAR, headMotionImplemented: false,
        multipleFacesChecked: false, directionSign: null, detectionValidated: false };
    }
  };
}
