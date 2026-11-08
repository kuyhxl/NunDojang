// A 소유: 동일 세션은 시간 원점·seq 유지. 새 기록에서만 초기화.
import { DEFAULT_CONFIG, resolveAssetUrls } from '../modules/config.js';
import { validateSample, validateEvent } from '../modules/contracts.js';
import { createEyeTracker, IS_MOCK } from '../modules/eyeTracker.js';
import { samplesCsv, eventsCsv, download } from '../modules/logExport.js';
import { createMovementDetector, ALGORITHM_VERSION } from '../modules/movementDetector.js';
import { VERTICAL_VERSION, verticalProtocol, fitVertical, evaluateVertical, predictVertical } from './verticalPilot.js';
// A 점검 화면 전용 제안값. C 소유 공통 config에는 적용하지 않는다.
const PILOT_CONFIG=Object.freeze({detectorVersion:ALGORITHM_VERSION,directionSign:-1,
  maxFrameGapMs:200,minAmplitudeX:0.03,minDurationMs:40,maxDurationMs:400,
  refractoryMs:500,smoothingWindowMs:60});
let detector=null, events=[], eventErrors=0;
let calibrationProfile=null, calibrationSteps=[], calibrationStepStart=null;
let referenceDetector=null, referenceEvents=[];
const CALIBRATION_TARGETS=['center','left','right','center','left','right'];
function calibratedMode(){return ['reading_calibrated','center_calibrated','linecheck_calibrated','posture_calibrated','vertical_calibration','vertical_validation'].includes($('testMode').value);}
function isVertical(){return ['vertical_calibration','vertical_validation'].includes(trial?.mode);}
function isReading(){return ['reading','linecheck'].includes(trial?.mode)||isVertical();}
function exportPrefix(){return trial?.calibrationApplied?'calibrated-'+trial.mode:trial?.mode??'samples';}
const $ = id => document.getElementById(id), urls = resolveAssetUrls(DEFAULT_CONFIG);
const LIMIT = 20000;
let tracker = null, busy = false, active = false, operation = 0;
let trial = null;
let sessionId, sessionT0, samples = [], validCount = 0, lastDraw = -Infinity, contractErrors = 0;
let faceFrames=[], qualitySummary=null, lastReceivedAt=null, healthTimer=null;
// 원래 10줄은 비교 조건으로 보존한다. C 모듈은 가져다 쓰며 수정하지 않는다.
const originalLines=Array.from(document.querySelectorAll('#readingText .line'),e=>e.textContent);
let selectedLayout='legacy', preparedLayout=null;
let verticalFrames=[],verticalProfile=null;
function fresh() {
  if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}
  faceFrames=[];lastReceivedAt=null;verticalFrames=[];
  $('verticalDot').hidden=true;
  qualitySummary={activeSamples:0,validEyeSamples:0,invalidReasons:{},frameGapsOver200Ms:0,
    maxFrameGapMs:0,geometrySamples:0,comparableSamples:0,changedGeometrySamples:0,stages:{}};
  trial = null;events=[];eventErrors=0;referenceEvents=[];calibrationSteps=[];calibrationStepStart=null;
  referenceDetector=createMovementDetector({config:PILOT_CONFIG});
  detector=createMovementDetector({config:PILOT_CONFIG});
  $('calibrationBox').hidden=true;
  $('eventCount').textContent='줄바꿈 후보 0개';$('eventList').textContent='아직 후보가 없습니다.';
  sessionId = `A-${crypto.randomUUID()}`; sessionT0 = performance.now(); samples = []; validCount = 0; contractErrors = 0; lastDraw = -Infinity;
  $('values').textContent = '측정값 없음'; $('stats').textContent = '저장된 샘플 0개';
  $('phase').textContent='시작 전'; $('readingText').hidden=true; $('target').hidden=false;
  for (const id of ['irisGraph','earGraph']) $(id).getContext('2d').clearRect(0,0,$(id).width,$(id).height);
  renderQuality();
}
fresh();
const number = v => Number.isFinite(v) ? v.toFixed(3) : '—';
function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function buttons() {
  $('startBtn').disabled = busy || active; $('stopBtn').disabled = !active && !busy;
  $('testMode').disabled=busy||active; $('finishBtn').disabled=!(active&&trial?.phase==='active'&&trial?.mode==='reading');
  $('newBtn').disabled = busy || active; $('dlBtn').disabled = samples.length === 0 || busy; $('eventsBtn').disabled=samples.length===0||busy;
  $('layoutMode').disabled=busy||active||samples.length>0;
  $('layoutPreviewBtn').disabled=busy||active||samples.length>0;
}
function diagnostics({includeFrameRecords=true}={}) {
  return { sessionId, sessionT0, mode: IS_MOCK ? 'mock' : 'real', sampleCount: samples.length,
    contractErrors, camera: tracker?.getDiagnostics() ?? null, measuredDirectionSign: -1,
    directionEvidence: '사용자 좌우 보기 1회씩에서 확인. config는 변경하지 않음',
    test: trial ? structuredClone(trial) : null,
    lineReview:trial?.mode==='linecheck'?reviewLineIntervals(trial.lineMarkers??[],samples,events):null, devVersion:'a-dev/0.8.0',
    verticalPilot:{version:VERTICAL_VERSION,diagnosticOnly:true,frameCount:verticalFrames.length,
      frameRecords:includeFrameRecords?structuredClone(verticalFrames):undefined,
      profileAvailable:verticalProfile?.accepted??false,result:trial?.verticalResult??null,
      limitations:'eye-axis v and experimental relative Y only; no validated screen gaze/line identity; does not change Sample or scoring'},
    measurementQuality:{schemaVersion:'a-quality/0.1.0',diagnosticOnly:true,
      policy:faceChangePolicy(),reference:trial?.calibrationSnapshot?.faceReference??null,
      summary:structuredClone(qualitySummary),frameCount:faceFrames.length,
      frameRecords:includeFrameRecords?structuredClone(faceFrames):undefined,
      frameRecordsIncluded:includeFrameRecords,
      limitations:'2D eye-corner geometry; no absolute distance, 3D head pose, compensation or candidate filtering'},
    calibration:trial?.calibrationSnapshot??null, calibrationSteps:structuredClone(calibrationSteps),
    calibrationProfileAvailable:calibrationProfile?.accepted??false,
    displayLayout:preparedLayout?structuredClone(preparedLayout):null,
    referenceFixedConfig:PILOT_CONFIG,referenceFixedEventCount:referenceEvents.length,
    referenceFixedEvents:structuredClone(referenceEvents), viewport: {width:innerWidth,height:innerHeight,devicePixelRatio},
    readingLayout:readingLineBoxes(),
    blinkCount: null, movementDetectorImplemented: true, detector:detector.getDiagnostics(), pilotConfigOnly:true, eventCount:events.length,eventContractErrors:eventErrors, runtimeValidation: '실행 여부와 정독/줄바꿈 정확도 검증은 별도' };
}
async function stop(message = '중지했습니다. 세 파일을 저장한 뒤 새 기록으로 시작하세요.') {
  if(trial && !trial.ended) {trial.ended=true;trial.phase='interrupted';trial.endTMs=samples.at(-1)?.tMs??null;trial.endReason=message;}
  active = false;
  $('verticalDot').hidden=true;
  if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}
  detector.reset(); referenceDetector.reset(); await tracker?.stop(); buttons(); status(message);renderQuality();
  $('diag').textContent=JSON.stringify(diagnostics({includeFrameRecords:false}),null,2);
}
function draw(canvas, rows, keys, maxY) {
  const ctx = canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h); ctx.font='12px system-ui';
  for (let j=0;j<=4;j++) { const y=12+(h-30)*j/4; ctx.strokeStyle='#3e4a5c'; ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(w-10,y);ctx.stroke();ctx.fillStyle='#c2ccde';ctx.fillText((maxY*(1-j/4)).toFixed(2),2,y+4); }
  if (!rows.length) return;
  const end=rows.at(-1).tMs, start=Math.max(0,end-10000);
  keys.forEach((key,k) => {
    ctx.strokeStyle=['#74bbff','#ffc579'][k]; ctx.lineWidth=1.6;ctx.beginPath();let pen=false, prev=null;
    for (const s of rows) {
      if (s.tMs < start) continue;
      const v=s[key], ok=Number.isFinite(v) && (!key.includes('Iris') || s.valid);
      if (!ok) {pen=false;prev=null;continue;}
      if (prev!==null && s.tMs-prev>DEFAULT_CONFIG.maxFrameGapMs) pen=false;
      const x=42+(s.tMs-start)/10000*(w-52),y=12+(1-v/maxY)*(h-30);
      if (!pen) ctx.moveTo(x,y);else ctx.lineTo(x,y);pen=true;prev=s.tMs;
    }
    ctx.stroke();
  });
  ctx.fillStyle='#c2ccde';ctx.fillText(`${(start/1000).toFixed(1)}초`,42,h-2);ctx.fillText(`${(end/1000).toFixed(1)}초`,w-70,h-2);
}
function sample(s) {
  const problems=validateSample(s);
  if (problems.length) {contractErrors++;void stop(`공통 형식 오류: ${problems.join(', ')}`);return;}
  if (s.sessionId!==sessionId) return;
  samples.push({ documentId:'dev',pageId:1,segmentId:sessionId,...s });
  updateTrial(s);
  recordQuality(s);
  recordVertical(s);
  // 준비 시간과 종료 뒤는 검출하지 않는다. dev의 가상 페이지는 1이다.
  if(active && trial?.phase==='active' && !trial.ended && trial.mode!=='calibration'&&!isVertical()){
    const args={sample:s,pageId:1,segmentId:sessionId};
    const found=detector.push(args);
    referenceEvents.push(...referenceDetector.push(args));
    for(const e of found){
      const errors=validateEvent(e);
      if(errors.length){eventErrors++;void stop('사건 형식 오류: '+errors.join(', '));break;}
      events.push({documentId:'dev',...e});
    }
    $('eventCount').textContent='줄바꿈 후보 '+events.length+'개 · 기존 고정 기준 '+referenceEvents.length+'개 · 읽은 줄 수로 확정하지 않습니다.';
    $('eventList').textContent=events.slice(-15).map(e=>
      ((e.tMs-trial.activeStartTMs)/1000).toFixed(2)+'초 / 이동 크기 '+e.amplitudeX.toFixed(3)+' / '+e.durationMs.toFixed(0)+'ms').join('\n')||'아직 후보가 없습니다.';
  }
  if (s.valid) validCount++;
  if (s.tMs-lastDraw>=100) {
    lastDraw=s.tMs;
    const recent=samples.slice(-1000);
    draw($('irisGraph'),recent,['leftIrisX','rightIrisX'],1);
    draw($('earGraph'),recent,['leftEar','rightEar'],0.5);
    $('values').textContent=`왼눈 x ${number(s.leftIrisX)} / 오른눈 x ${number(s.rightIrisX)} · 왼눈 EAR ${number(s.leftEar)} / 오른눈 EAR ${number(s.rightEar)} · ${s.valid?'값 사용 가능':`무효: ${s.invalidReason}`}`;
    $('stats').textContent=`샘플 ${samples.length}개 · 유효 프레임 ${validCount}개 (시간 비율 아님) · ${IS_MOCK?'MOCK':'실제 카메라'} · 깜빡임 횟수 미설정`;
    renderQuality();
    $('diag').textContent=JSON.stringify(diagnostics({includeFrameRecords:false}),null,2);
  }
  $('dlBtn').disabled=false;
  if (samples.length>=LIMIT) void stop('기록 한도에 도달했습니다. CSV를 저장한 뒤 새 기록을 시작하세요.');
}
$('startBtn').onclick=async () => {
  if (busy || active) return;
  if(trial?.ended){status('이 시험은 종료됐습니다. 세 파일을 저장하고 새 기록을 누르세요.');return;}
  if (samples.length>=LIMIT) {status('먼저 CSV 저장 후 새 기록을 누르세요.');return;}
  const op=++operation; busy=true;buttons();status('모델을 준비하고 카메라 권한을 요청합니다…');
  try {
    await prepareLayout();
    if(op!==operation)return;
    if(calibratedMode()&&(!calibrationProfile?.accepted||
      calibrationProfile.viewport.width!==innerWidth||calibrationProfile.viewport.height!==innerHeight||
      calibrationProfile.viewport.devicePixelRatio!==devicePixelRatio||
      calibrationProfile.layoutSignature!==preparedLayout.signature)){
      throw new Error('먼저 같은 글 배치·창 크기·배율·머리 위치에서 0번 좌우 기준을 새로 측정하세요.');
    }
    if($('testMode').value==='posture_calibrated'&&!calibrationProfile?.faceReference)
      throw new Error('자세 비교 기준이 없습니다. 이 버전에서 좌우 기준 측정을 새로 해 주세요.');
    if($('testMode').value.startsWith('vertical_')&&preparedLayout.mode!=='viewer')
      throw new Error('상하 시험은 글 배치를 뷰어 참조 규격으로 선택한 뒤 0번부터 진행하세요.');
    if($('testMode').value==='vertical_validation'&&(!verticalProfile?.accepted||
      verticalProfile.layoutSignature!==preparedLayout.signature||verticalProfile.sourceCalibrationSession!==calibrationProfile.sessionId))
      throw new Error('같은 자세·배치의 7번 상하 기준을 먼저 측정해 주세요.');
    if (!tracker) tracker=await createEyeTracker({videoElement:$('video'),wasmBaseUrl:urls.wasmBaseUrl,modelAssetUrl:urls.modelAssetUrl,onSample:sample,
      onError:e=>{if(trial&&!trial.ended){trial.ended=true;trial.phase='interrupted';trial.endTMs=samples.at(-1)?.tMs??null;trial.endReason='camera_error';} detector.reset();referenceDetector.reset();active=false;if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}status(`${e.code}: ${e.message}`,true);buttons();renderQuality();}});
    // 준비 중 사용자가 중지를 눌렀으면 시작하지 않음.
    if (op!==operation) return;
    if(!trial) trial={schemaVersion:'nundojang-dev-trial/1.0.0',mode:$('testMode').value.replace('_calibrated',''),calibrationApplied:calibratedMode(),calibrationSnapshot:calibratedMode()?structuredClone(calibrationProfile):null,phase:'waiting',firstSampleTMs:null,activeStartTMs:null,endTMs:null,ended:false,endReason:null,
      expectedCenterDurationMs:15000,preparationMs:3000,readingTextId:'morning-10lines/v1',lineMarkers:[],observedBehaviorConfirmed:false,
      expectedLineCount:preparedLayout.lineCount,expectedReturnCount:Math.max(0,preparedLayout.lineCount-1),
      layoutSnapshot:structuredClone(preparedLayout),layoutSignature:preparedLayout.signature};
    if(isVertical()){
      trial.verticalProtocol=verticalProtocol(preparedLayout,trial.mode==='vertical_calibration'?'calibration':'validation');
      trial.verticalModelSnapshot=trial.mode==='vertical_validation'?structuredClone(verticalProfile):null;
      if(trial.mode==='vertical_calibration')verticalProfile=null;
    }
    if(trial.mode==='posture')trial.postureProtocol={version:'a-posture-check/0.1.0',durationMs:20000,
      instructions:'중앙 +를 보며 얼굴 전체를 편안한 범위에서 옆으로 이동. 지시 단계는 실제 수행을 확인한 정답이 아님.',
      stages:postureStages()};
    if(trial.calibrationApplied)detector=createMovementDetector({config:{...PILOT_CONFIG,
      directionSign:trial.calibrationSnapshot.directionSign,minAmplitudeX:trial.calibrationSnapshot.minAmplitudeX,
      detectorVersion:ALGORITHM_VERSION+'+calibration/0.2.0'}});
    trial.layoutVersion=preparedLayout.layoutVersion;trial.calibrationTargetWidth=preparedLayout.targetWidth;
    $('readingText').hidden=true;$('calibrationBox').hidden=true;$('target').hidden=false;
    if(trial.mode==='calibration'){
      calibrationProfile=null;verticalProfile=null;$('profileStatus').textContent='새 좌우 기준 측정 중입니다.';
    }
    await tracker.start({sessionId,sessionT0});if(op!==operation)return;active=true;
    lastReceivedAt=performance.now();
    healthTimer=setInterval(()=>{if(active)renderQuality();},250);
    $('taskCard').scrollIntoView({block:'start',behavior:'instant'});
    status('시험 상자를 보세요. 머리를 편안하게 고정하고 그래프는 보지 마세요.');
  } catch(e) {active=false;if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}renderQuality();status(`시작 실패: ${e.message}`,true);}
  finally {busy=false;buttons();}
};
$('stopBtn').onclick=async()=>{operation++;await stop();};
$('newBtn').onclick=()=>{
  if (samples.length && !confirm('CSV·events CSV·진단 JSON을 모두 저장했나요? 현재 메모리 기록을 비우고 새 세션을 시작합니다.'))return;
  fresh();buttons();status('새 기록을 준비했습니다. 측정 시작을 누르세요.');
};
$('dlBtn').onclick=()=>download(`${exportPrefix()}-${sessionId}.csv`,samplesCsv(samples),'text/csv');
$('eventsBtn').onclick=()=>download(`${exportPrefix()}-events-${sessionId}.csv`,eventsCsv(events),'text/csv');
$('diagBtn').onclick=()=>download(`${exportPrefix()}-diagnostics-${sessionId}.json`,JSON.stringify(diagnostics(),null,2),'application/json');
document.addEventListener('visibilitychange',()=>{if(document.hidden && (active||busy)){operation++;void stop('다른 탭으로 이동해 측정을 중지했습니다. 새 기록으로 다시 시작하세요.');}});
window.addEventListener('pagehide',()=>{void tracker?.destroy();});
buttons();

function previewTrial() {
  if($('testMode').value.startsWith('vertical_')){
    $('taskTitle').textContent=$('testMode').value==='vertical_calibration'?'상하 기준 수집 · 약 30초':'별도 위치에서 상하 확인 · 약 39초';
    $('taskHint').textContent='실제 본문 안에서 움직이는 파란 점만 보세요. 글을 읽는 시험이 아닙니다. 편안한 자세로 머리는 유지하고 눈은 자연스럽게 깜빡이세요. 자동 종료됩니다.';return;
  }
  if($('testMode').value==='posture_calibrated'){
    $('taskTitle').textContent='자세 변화 점검 · 20초';
    $('taskHint').textContent='중앙 +를 계속 보세요. 처음 자세 → 얼굴을 조금 왼쪽 → 조금 오른쪽 → 처음 자세를 각 5초씩 안내합니다. 고개를 크게 돌리지 말고 상체와 함께 얼굴 전체를 편안한 범위에서 옆으로 옮기세요. 눈은 자연스럽게 깜빡이세요. 자동 종료됩니다.';return;
  }
  if($('testMode').value==='linecheck_calibrated'){
    $('taskTitle').textContent='줄별 시점 기록 시험';
    $('taskHint').textContent='각 줄을 다 읽고 다음 줄로 눈을 옮기기 직전에 스페이스바를 한 번 누르세요. 현재 배치의 마지막 줄 입력에 자동 종료됩니다. 눈은 글에 두고 키보드나 기록 숫자는 보지 마세요.';return;
  }
  if($('testMode').value==='calibration'){
    $('taskTitle').textContent='좌우 기준 측정 · 약 18초';
    $('taskHint').textContent='준비 3초 뒤 파란 +만 보세요. 중앙·왼쪽·오른쪽을 두 번 반복합니다. 머리는 고정하고 눈만 자연스럽게 옮기세요. 자동 종료됩니다.';return;
  }
  $('taskTitle').textContent=$('testMode').value.startsWith('center')?'중앙 응시 시험':'자연스럽게 글 읽기 시험';
  $('taskHint').textContent=$('testMode').value.startsWith('center')?'준비 3초 뒤 +를 15초간 봅니다. 자연스럽게 눈을 깜빡이세요. 자동 종료됩니다.':'준비 3초 뒤 글이 나타납니다. 위에서 아래로 한 번만 평소처럼 읽고, 마지막 줄까지 읽은 뒤 시선을 옮기지 말고 스페이스바를 누르세요. 종료 버튼도 사용할 수 있습니다. 일부러 눈을 크게 돌리지 마세요.';
}
function completeTrial(reason,endTMs=samples.at(-1)?.tMs??null) {
  if(!trial || trial.ended)return;
  trial.ended=true;trial.phase='completed';trial.endTMs=endTMs;trial.endReason=reason;
  $('phase').textContent='시험 종료 · CSV·events CSV·진단 JSON을 각각 저장하세요.';
  void stop('시험이 끝났습니다. 세 파일을 저장한 다음 새 기록을 시작하세요.');
}
function updateTrial(s) {
  if(!trial || trial.ended)return;
  trial.firstSampleTMs ??= s.tMs;
  const elapsed=s.tMs-trial.firstSampleTMs;
  if(elapsed<3000){trial.phase='preparation';$('phase').textContent=`준비 ${Math.max(1,Math.ceil((3000-elapsed)/1000))}초 · +를 보세요`;return;}
  if(trial.activeStartTMs===null){
    trial.activeStartTMs=s.tMs;trial.phase='active';
    $('readingText').hidden=!isReading();$('target').hidden=!['center','posture'].includes(trial.mode);$('calibrationBox').hidden=trial.mode!=='calibration';
    const area=isReading()?readingBounds():$(trial.mode==='calibration'?'calibrationBox':'target').getBoundingClientRect();
    trial.taskBounds={left:area.left,right:area.right,width:area.width,centerX:(area.left+area.right)/2,viewportCenterX:document.documentElement.clientWidth/2};
    if(!Number.isFinite(trial.taskBounds.centerX)||Math.abs(trial.taskBounds.centerX-trial.taskBounds.viewportCenterX)>3){
      void stop('시험 영역이 화면 중앙에 맞지 않습니다. 창 배치를 확인하고 상황을 알려주세요.');return;
    }
    if(trial.mode==='calibration' && $('calibrationBox').getBoundingClientRect().bottom>innerHeight-60){
      void stop('표적 상자가 모두 보이지 않습니다. 창 높이를 늘린 뒤 새 기록으로 다시 시작하세요.');return;
    }
    if(trial.mode==='posture' && $('target').getBoundingClientRect().bottom>innerHeight-60){
      void stop('자세 점검 표적이 모두 보이지 않습니다. 창 높이를 늘린 뒤 새 기록으로 다시 시작하세요.');return;
    }
    if(isReading() && Array.from(document.querySelectorAll('#readingText .line')).some(e=>e.scrollWidth>e.clientWidth+2)){
      if(preparedLayout.mode==='legacy'){
      void stop('글이 화면 폭을 넘습니다. 브라우저 창을 넓힌 뒤 새 기록으로 다시 시작하세요.');return;
      }
    }
    if(isReading() && $('readingText').getBoundingClientRect().bottom>innerHeight-60){
      void stop('글 전체가 보이지 않습니다. 브라우저 창 높이를 늘리거나 화면 배율을 줄인 뒤 새 기록으로 다시 시작하세요.');return;
    }
    buttons();
  }
  const activeMs=s.tMs-trial.activeStartTMs;
  if(isVertical()){
    const protocol=trial.verticalProtocol;
    if(activeMs>=protocol.durationMs){finishVertical();completeTrial('vertical_protocol_completed');$('verticalDot').hidden=true;return;}
    const stage=protocol.stages[Math.floor(activeMs/protocol.stageMs)];
    if(trial.verticalStage?.index!==stage.index){
      const rect=$('viewerCanvas').getBoundingClientRect();
      trial.verticalStage={...stage,targetViewportX:rect.left+stage.x,targetViewportY:rect.top+stage.y};
      $('verticalDot').style.left=stage.x+'px';$('verticalDot').style.top=stage.y+'px';
    }
    $('verticalDot').hidden=false;
    $('phase').textContent='파란 점만 보세요 · '+(stage.index+1)+'/'+protocol.stages.length+' · '+Math.max(0,Math.ceil((stage.endMs-activeMs)/1000))+'초';
    return;
  }
  if(trial.mode==='calibration'){updateCalibration(s);return;}
  if(trial.mode==='posture'){
    const stage=postureStages()[Math.min(3,Math.floor(activeMs/5000))];
    trial.postureStage={...stage};
    $('phase').textContent=stage.instruction+' · 남은 시간 '+Math.max(0,Math.ceil((stage.endMs-activeMs)/1000))+'초';
    if(activeMs>=20000)completeTrial('posture_timer_completed');
    return;
  }
  if(trial.mode==='center'){
    $('phase').textContent=`+를 계속 보세요 · 남은 시간 ${Math.max(0,Math.ceil((15000-activeMs)/1000))}초`;
    if(activeMs>=15000)completeTrial('center_timer_completed');
  }else{
    $('phase').textContent=trial.mode==='linecheck'?'각 줄 끝에서 스페이스바 한 번 · 기록 '+trial.lineMarkers.length+'/'+trial.expectedLineCount:'위에서 아래로 평소처럼 한 번 읽으세요. 마지막 줄을 읽은 뒤 시선을 유지하고 스페이스바를 누르세요.';
    if(activeMs>=90000){void stop('읽기 시험 제한 90초가 지났습니다. 기록을 저장하고 상황을 알려주세요.');}
  }
}
$('testMode').onchange=previewTrial;
$('layoutMode').onchange=()=>{
  if(busy||active||samples.length){$('layoutMode').value=selectedLayout;status('세 파일을 저장하고 새 기록을 누른 뒤 글 배치를 바꾸세요.',true);return;}
  selectedLayout=$('layoutMode').value;
  calibrationProfile=null;verticalProfile=null;preparedLayout=null;
  $('profileStatus').textContent='글 배치를 바꿔 좌우 기준을 비웠습니다. 새 배치에서 0번부터 시작하세요.';
  $('layoutStatus').textContent='새 배치를 선택했습니다. 글 배치 미리보기를 눌러 읽기 편한지 확인하세요.';
  $('readingText').hidden=true;$('target').hidden=false;$('calibrationBox').hidden=true;
};
$('layoutPreviewBtn').onclick=async()=>{
  if(busy||active||samples.length)return;
  const op=++operation;busy=true;buttons();
  try{
    await prepareLayout();if(op!==operation)return;
    $('readingText').hidden=false;$('target').hidden=true;$('calibrationBox').hidden=true;
    $('phase').textContent='글 배치 미리보기 · 아직 측정하지 않습니다.';
    $('taskCard').scrollIntoView({block:'start',behavior:'instant'});
    status('카메라는 켜지 않았습니다. 글이 편안하게 보이는지 확인한 뒤 0번 좌우 기준을 측정하세요.');
  }catch(e){status('미리보기 실패: '+e.message,true);}
  finally{busy=false;buttons();}
};
$('finishBtn').onclick=()=>{if(active&&trial?.phase==='active'&&trial.mode==='reading')completeTrial('user_reported_reading_complete');};
window.addEventListener('resize',()=>{calibrationProfile=null;verticalProfile=null;$('profileStatus').textContent='창 크기가 바뀌어 좌우·상하 기준을 비웠습니다.';if(active||busy){operation++;void stop('창 크기가 바뀌어 시험을 중지했습니다. 새 기록으로 다시 시작하세요.');}});
previewTrial();

// 표시 규격 비교의 첫 단계: C 코드에서 추출한 고정 참조의 글꼴·줄 나눔·캔버스 그리기를 사용한다.
// A 시험은 중앙 배치를 유지한다. 제품의 오른쪽 패널 좌표를 재현했다고 주장하지 않는다.
async function prepareLayout(){
  const mode=$('layoutMode').value;
  const lines=Array.from(document.querySelectorAll('#readingText .line'));
  $('readingText').classList.toggle('viewer-layout',mode==='viewer');
  $('viewerCanvas').hidden=mode!=='viewer';
  for(const line of lines)line.hidden=mode==='viewer';
  await document.fonts.ready;
  let spec;
  if(mode==='legacy'){
    const font=getComputedStyle($('readingText')),ctx=$('irisGraph').getContext('2d');
    ctx.font=font.fontSize+' '+font.fontFamily;
    const width=Math.ceil(Math.max(...originalLines.map(t=>ctx.measureText(t).width)))+2;
    if(!Number.isFinite(width)||width<100||width>$('taskCard').clientWidth-48)
      throw new Error('본문과 기준 표적을 배치할 수 없습니다. 창을 넓히세요.');
    $('taskCard').style.setProperty('--reading-width',width+'px');
    $('calibrationBox').style.height='290px';$('calibrationDot').style.top='110px';
    spec={mode,layoutVersion:'centered-text/1.0.0',fontPx:parseFloat(font.fontSize),
      lineHeightPx:parseFloat(font.lineHeight)||34,fontFamily:font.fontFamily,
      targetWidth:width,lineCount:originalLines.length,textLines:[...originalLines],
      renderer:'legacy_dom',fontLoaded:null,lineBoxes:null};
  }else if(mode==='viewer'){
    let reflow;
    try{reflow=await import('./viewerLayoutReference.js');}
    catch(e){throw new Error('A 시험용 viewerLayoutReference.js를 읽지 못했습니다. 새 파일이 web/dev에 들어갔는지 확인해 주세요.');}
    const opts={...reflow.REFLOW};
    for(const k of ['fontPx','lineHeightPx','columnPx','linesPerPage','padTopPx','padBottomPx'])
      if(!Number.isFinite(opts[k])||opts[k]<=0)throw new Error('뷰어 표시 설정이 올바르지 않습니다: '+k);
    const fontUrl=urls.reflowFontUrl??urls.sealFontUrl;
    if(!fontUrl)throw new Error('기존 설정의 글꼴 경로를 찾지 못했습니다.');
    if(!await reflow.loadReflowFont(fontUrl))
      throw new Error('뷰어 글꼴을 불러오지 못했습니다. 준비된 글꼴 파일을 확인해 주세요. 시스템 글꼴로 대신 시험하지 않습니다.');
    const surfaceWidth=opts.columnPx+48;
    if(surfaceWidth>$('taskCard').clientWidth-48)
      throw new Error('뷰어 본문 폭을 줄이지 않고 보여주려면 브라우저 창을 넓혀야 합니다.');
    $('taskCard').style.setProperty('--reading-width',opts.columnPx+'px');
    $('taskCard').style.setProperty('--reading-surface-width',surfaceWidth+'px');
    const measure=reflow.createMeasure(opts);
    const textLines=reflow.wrapText(originalLines.join(' '),measure,opts.columnPx);
    if(textLines.length<2||textLines.length>opts.linesPerPage)
      throw new Error('이 글이 뷰어 한 쪽에 들어가지 않습니다. 임의로 자르지 않았습니다. 현재 줄 수: '+textLines.length);
    const boxes=reflow.drawPage($('viewerCanvas'),textLines.map(text=>({kind:'p',text})),opts);
    const surfaceHeight=opts.padTopPx+opts.linesPerPage*opts.lineHeightPx+opts.padBottomPx;
    $('calibrationBox').style.height=surfaceHeight+'px';
    $('calibrationDot').style.top=(opts.padTopPx+textLines.length*opts.lineHeightPx/2-35)+'px';
    spec={mode,layoutVersion:'a-viewer-typography/0.1.0',targetWidth:opts.columnPx,
      fontPx:opts.fontPx,lineHeightPx:opts.lineHeightPx,fontFamily:opts.fontFamily,fontLoaded:true,
      lineCount:textLines.length,textLines,lineBoxes:boxes.map((b,i)=>({...b,inkWidthPx:measure(textLines[i])})),
      surfaceWidth,surfaceHeight,renderer:'shared_reflow_drawPage',reflowSettings:opts,
      referenceCommit:'7ea3987fcd2df3ba1e9d0bff2e833b362c90c15e',referenceMode:'frozen_A_reference_not_live_product',
      runtimeModuleUrl:new URL('./viewerLayoutReference.js',import.meta.url).href};
  }else throw new Error('알 수 없는 글 배치입니다.');
  spec.positionPolicy='centered_A_screen_not_product_pane';
  spec.sourceTextId='morning-10lines/v1';
  spec.signature=JSON.stringify({mode:spec.mode,layoutVersion:spec.layoutVersion,
    fontPx:spec.fontPx,lineHeightPx:spec.lineHeightPx,fontFamily:spec.fontFamily,
    targetWidth:spec.targetWidth,textLines:spec.textLines,reflowSettings:spec.reflowSettings??null});
  preparedLayout=spec;
  $('layoutStatus').textContent=(mode==='legacy'?'기존 시험 배치':'뷰어 참조 규격')+
    ' · 글자 '+spec.fontPx+'px · 줄 간격 '+spec.lineHeightPx+'px · 기준 폭 '+spec.targetWidth+
    'px · 본문 '+spec.lineCount+'줄 / 한 번씩 내려 읽을 때 줄 사이 이동 '+(spec.lineCount-1)+'회'+
    ' · 실제 읽은 줄 수를 판정한 값이 아닙니다.';
  return spec;
}
function readingBounds(){
  if(preparedLayout?.mode!=='viewer')return $('readingText').getBoundingClientRect();
  const canvas=$('viewerCanvas').getBoundingClientRect(),boxes=preparedLayout.lineBoxes;
  return {left:canvas.left+boxes[0].left,right:canvas.left+boxes[0].left+preparedLayout.targetWidth,
    width:preparedLayout.targetWidth,top:canvas.top+boxes[0].top,
    bottom:canvas.top+boxes.at(-1).top+boxes.at(-1).height};
}
function readingLineBoxes(){
  if(preparedLayout?.mode==='viewer'){
    const canvas=$('viewerCanvas').getBoundingClientRect();
    return preparedLayout.lineBoxes.map((b,i)=>({line:i+1,left:canvas.left+b.left,top:canvas.top+b.top,
      width:b.width,height:b.height,inkWidthPx:b.inkWidthPx,
      coordinates:'viewport_css_px_at_export; hidden reading surface has no usable position'}));
  }
  return Array.from(document.querySelectorAll('#readingText .line'),e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
}

// 종료 버튼을 보기 위한 추가 시선 이동을 줄이는 점검 화면 전용 단축키.
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!e.repeat&&active&&trial?.phase==='active'&&trial.mode==='linecheck'){
    e.preventDefault();const tMs=performance.now()-sessionT0;
    if(tMs<(trial.lineMarkers.at(-1)?.tMs??trial.activeStartTMs)+300)return;
    trial.lineMarkers.push({reportedLine:trial.lineMarkers.length+1,tMs,lastSampleTMs:samples.at(-1)?.tMs??null,source:'user_space_before_next_line'});
    if(trial.lineMarkers.length===trial.expectedLineCount)completeTrial('user_reported_all_line_ends',tMs);
    else $('phase').textContent='줄 끝 기록 '+trial.lineMarkers.length+'/'+trial.expectedLineCount+' · 다음 줄을 읽으세요.';
    return;
  }
  if(e.code==='Space'&&!e.repeat&&active&&trial?.phase==='active'&&trial.mode==='reading'){
    e.preventDefault();completeTrial('user_reported_reading_complete_keyboard');
  }
});

function updateCalibration(s){
  const index=calibrationSteps.length;
  if(index>=CALIBRATION_TARGETS.length)return;
  calibrationStepStart??=s.tMs;
  const age=s.tMs-calibrationStepStart,label=CALIBRATION_TARGETS[index];
  const display={center:'중앙',left:'왼쪽',right:'오른쪽'};
  $('phase').textContent=display[label]+'의 파란 +를 보세요 · '+(index+1)+'/6 · '+Math.max(0,Math.ceil((3000-age)/1000))+'초';
  $('calibrationDot').style.left={center:'50%',left:'0%',right:'100%'}[label];
  trial.calibrationStage??={label,startTMs:s.tMs,values:[],timestamps:[],total:0};
  const stage=trial.calibrationStage;
  if(age>=1000&&age<3000){
    stage.total++;
    if(s.valid){stage.values.push((s.leftIrisX+s.rightIrisX)/2);stage.timestamps.push(s.tMs);}
  }
  if(age>=3000){
    calibrationSteps.push({...stage,endTMs:s.tMs});trial.calibrationStage=null;calibrationStepStart=s.tMs;
    if(calibrationSteps.length===6){
      const result=evaluateCalibration(calibrationSteps);
      result.faceReference=result.accepted?buildFaceReference(faceFrames,sessionId):null;
      result.sessionId=sessionId;result.viewport={width:innerWidth,height:innerHeight,devicePixelRatio};
      result.targetWidth=trial.calibrationTargetWidth;result.layoutVersion=trial.layoutVersion;result.taskBounds=structuredClone(trial.taskBounds);
      result.layoutSignature=trial.layoutSignature;result.displayLayout=structuredClone(trial.layoutSnapshot);
      trial.calibrationSnapshot=structuredClone(result);calibrationProfile=result.accepted?result:null;
      $('profileStatus').textContent=result.accepted?
        '좌우 기준 측정 통과(효과 검증 전) · 제안 이동 크기 '+result.minAmplitudeX.toFixed(4)+' · 같은 자세·창에서만 사용'+(result.faceReference?' · 자세 비교 기준 기록됨':' · 자세 비교 기준 기록 부족'):
        '좌우 기준 측정 실패: '+result.reasons.join(', ')+' · 자동으로 고정 기준을 대신 적용하지 않습니다.';
      completeTrial(result.accepted?'calibration_measurement_accepted':'calibration_measurement_rejected');
    }else{
      const next=CALIBRATION_TARGETS[calibrationSteps.length];
      $('calibrationDot').style.left={center:'50%',left:'0%',right:'100%'}[next];
      $('phase').textContent=display[next]+'의 파란 +를 보세요 · '+(calibrationSteps.length+1)+'/6';
    }
  }
}
// 읽기 결과나 후보 수를 입력받지 않는 개발용 산식. 계수는 아직 검증 전이다.
export function evaluateCalibration(steps){
  const qualityPolicy={version:'a-calibration-quality/0.2.0',minValidSamples:24,minValidRatio:.8,minValidSpanMs:1200,maxValidGapMs:300,maxHalfDriftFraction:.15,maxCenterRepeatFraction:.2};
  const reasons=[],median=v=>{const a=[...v].sort((x,y)=>x-y),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;};
  const summary=steps.map(s=>({label:s.label,count:s.values.length,total:s.total,
    firstHalfMedian:median(s.values.slice(0,Math.floor(s.values.length/2))),
    secondHalfMedian:median(s.values.slice(Math.floor(s.values.length/2))),
    maxValidGapMs:Math.max(0,...(s.timestamps??[]).slice(1).map((t,i)=>t-s.timestamps[i])),
    median:median(s.values),noiseSigma:s.values.length?1.4826*median(s.values.map(v=>Math.abs(v-median(s.values)))):null}));
  if(steps.length!==6||summary.some((s,i)=>s.label!==CALIBRATION_TARGETS[i]))reasons.push('단계 누락');
  if(summary.some(s=>s.count<24||s.total===0||s.count/s.total<.8||!Number.isFinite(s.median)))reasons.push('유효 측정 부족');
  if(steps.some(s=>{const t=s.timestamps??[];return t.length<2||t.at(-1)-t[0]<1200||t.some((v,i)=>i&&(v<=t[i-1]||v-t[i-1]>300));}))reasons.push('측정 시간/연속성 부족');
  if(reasons.length)return {schemaVersion:'a-calibration/0.2.0',qualityPolicy,accepted:false,reasons,summary};
  const differences=[summary[2].median-summary[1].median,summary[5].median-summary[4].median];
  const spans=differences.map(Math.abs),span=median(spans),directionSign=Math.sign(differences[0]);
  const noiseSigma=Math.max(summary[0].noiseSigma,summary[3].noiseSigma);
  if(!directionSign||Math.sign(differences[1])!==directionSign)reasons.push('좌우 방향 불일치');
  if(Math.min(...spans)<.02)reasons.push('좌우 차이 부족');
  if(Math.abs(spans[0]-spans[1])/Math.max(span,.000001)>.4)reasons.push('반복 측정 폭 불일치');
  for(const k of [0,3])if(summary[k].median<Math.min(summary[k+1].median,summary[k+2].median)||summary[k].median>Math.max(summary[k+1].median,summary[k+2].median))reasons.push('중앙 위치 불일치');
  // 흔들림에 맞춰 기준을 높여 통과시키지 않고, 불안정한 기준은 다시 측정한다.
  for(const [i,part] of summary.entries()){
    if(Math.abs(part.secondHalfMedian-part.firstHalfMedian)>.15*span)reasons.push((i+1)+'번째 '+part.label+' 위치가 측정 중 변함');
  }
  if(Math.abs(summary[0].median-summary[3].median)>.2*span)reasons.push('중앙 재측정 위치 불일치');
  if(4*noiseSigma>.35*span)reasons.push('중앙 흔들림이 커서 기준 재측정 필요');
  const minAmplitudeX=Math.max(.008,.35*span,4*noiseSigma);
  if(minAmplitudeX>=.8*span||minAmplitudeX>.15)reasons.push('신호와 흔들림 구분 부족');
  return {schemaVersion:'a-calibration/0.2.0',qualityPolicy,accepted:reasons.length===0,reasons,summary,
    span,noiseSigma,directionSign,minAmplitudeX,formula:'max(0.008, 0.35 * span, 4 * centerNoiseSigma)',
    effectValidated:false,headMotionCorrected:false,absoluteDistanceMeasured:false};
}

// 사용자 키 입력은 근사 시점이며 실제 시선/문장 이해의 정답이 아니다.
export function reviewLineIntervals(markers,rows,events){
  return markers.slice(0,-1).map((m,i)=>{
    const next=markers[i+1],segment=rows.filter(s=>s.tMs>=m.tMs&&s.tMs<next.tMs);
    const found=events.filter(e=>e.tMs>=m.tMs&&e.tMs<next.tMs);
    return {fromReportedLine:m.reportedLine,toReportedLine:next.reportedLine,
      startTMs:m.tMs,endTMs:next.tMs,sampleCount:segment.length,
      invalidSampleCount:segment.filter(s=>!s.valid).length,
      maxSampleGapMs:Math.max(0,...segment.slice(1).map((s,k)=>s.tMs-segment[k].tMs)),
      eventIds:found.map(e=>e.eventId),candidateCount:found.length,
      interpretation:'approximate user-marked interval; not gaze ground truth'};
  });
}

// 아래 값은 진단 표시를 위한 초기 경계값이다. 검증된 머리 움직임 판정 기준이 아니다.
export function faceChangePolicy(){
  return {version:'a-face-change/0.1.0',maxCenterShiftEyeSpans:.15,
    maxEyeSpanChangeFraction:.15,maxRollChangeDeg:8,staleAfterMs:500,
    diagnosticOnly:true,effectValidated:false};
}
export function postureStages(){
  return [
    {key:'still',startMs:0,endMs:5000,instruction:'처음의 편안한 자세를 유지하세요'},
    {key:'move_left',startMs:5000,endMs:10000,instruction:'얼굴 전체를 조금 왼쪽으로 옮겨 유지하세요'},
    {key:'move_right',startMs:10000,endMs:15000,instruction:'얼굴 전체를 조금 오른쪽으로 옮겨 유지하세요'},
    {key:'return',startMs:15000,endMs:20000,instruction:'처음 자세로 돌아와 유지하세요'}
  ];
}
function usableGeometry(g){
  return !!g&&['centerXPx','centerYPx','eyeSpanPx','rollDeg','videoWidth','videoHeight'].every(k=>Number.isFinite(g[k]))&&g.eyeSpanPx>0&&g.videoWidth>0&&g.videoHeight>0;
}
export function buildFaceReference(rows,sourceSessionId){
  const usable=rows.filter(r=>r.inActiveWindow&&r.eyeValid&&usableGeometry(r.faceGeometry));
  if(usable.length<60||usable.at(-1).tMs-usable[0].tMs<2000)return null;
  const {videoWidth,videoHeight}=usable[0].faceGeometry;
  if(usable.some(r=>r.faceGeometry.videoWidth!==videoWidth||r.faceGeometry.videoHeight!==videoHeight))return null;
  const median=values=>{const v=[...values].sort((a,b)=>a-b),n=v.length;return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2;};
  const result={schemaVersion:'a-face-reference/0.1.0',sourceSessionId,sampleCount:usable.length,
    startTMs:usable[0].tMs,endTMs:usable.at(-1).tMs,videoWidth,videoHeight,
    method:'coordinate-wise median of valid active calibration frames',diagnosticOnly:true};
  for(const key of ['centerXPx','centerYPx','eyeSpanPx','rollDeg'])result[key]=median(usable.map(r=>r.faceGeometry[key]));
  return result;
}
export function compareFaceGeometry(current,reference){
  if(!usableGeometry(current))return {available:false,reason:'geometry_unavailable'};
  if(!usableGeometry(reference))return {available:false,reason:'reference_unavailable'};
  if(current.videoWidth!==reference.videoWidth||current.videoHeight!==reference.videoHeight)return {available:false,reason:'video_size_changed'};
  const policy=faceChangePolicy();
  const shiftX=(current.centerXPx-reference.centerXPx)/reference.eyeSpanPx;
  const shiftY=(current.centerYPx-reference.centerYPx)/reference.eyeSpanPx;
  const spanChange=current.eyeSpanPx/reference.eyeSpanPx-1;
  const rollChange=current.rollDeg-reference.rollDeg;
  const flags=[];
  if(Math.hypot(shiftX,shiftY)>policy.maxCenterShiftEyeSpans)flags.push('position_changed');
  if(Math.abs(spanChange)>policy.maxEyeSpanChangeFraction)flags.push('eye_span_changed');
  if(Math.abs(rollChange)>policy.maxRollChangeDeg)flags.push('roll_changed');
  return {available:true,shiftXEyeSpans:shiftX,shiftYEyeSpans:shiftY,
    eyeSpanChangeFraction:spanChange,rollChangeDeg:rollChange,changed:flags.length>0,flags};
}
function recordQuality(s){
  lastReceivedAt=performance.now();
  const cameraFrame=tracker?.getDiagnostics()?.lastFrameDiagnostics;
  const matched=cameraFrame?.sessionId===s.sessionId&&cameraFrame.seq===s.seq&&cameraFrame.tMs===s.tMs;
  const faceGeometry=matched&&usableGeometry(cameraFrame.faceGeometry)?{...cameraFrame.faceGeometry}:null;
  const eyeGeometry=matched&&cameraFrame.eyeGeometry?structuredClone(cameraFrame.eyeGeometry):null;
  const inActiveWindow=trial?.activeStartTMs!=null&&s.tMs>=trial.activeStartTMs&&(trial.endTMs===null||s.tMs<trial.endTMs);
  const comparison=compareFaceGeometry(faceGeometry,trial?.calibrationSnapshot?.faceReference);
  const previous=faceFrames.at(-1);
  const row={seq:s.seq,tMs:s.tMs,inActiveWindow,stage:trial?.verticalStage?.key??trial?.postureStage?.key??trial?.calibrationStage?.label??trial?.phase??'waiting',
    eyeValid:s.valid,invalidReason:s.invalidReason,frameGapMs:previous?s.tMs-previous.tMs:null,
    geometryMatchedToSample:matched,faceGeometry,eyeGeometry,comparison};
  faceFrames.push(row);
  if(!inActiveWindow)return;
  qualitySummary.activeSamples++;
  if(s.valid)qualitySummary.validEyeSamples++;
  else qualitySummary.invalidReasons[s.invalidReason]=(qualitySummary.invalidReasons[s.invalidReason]??0)+1;
  if(row.frameGapMs!==null){qualitySummary.maxFrameGapMs=Math.max(qualitySummary.maxFrameGapMs,row.frameGapMs);if(row.frameGapMs>200)qualitySummary.frameGapsOver200Ms++;}
  if(faceGeometry)qualitySummary.geometrySamples++;
  if(comparison.available)qualitySummary.comparableSamples++;
  if(comparison.changed)qualitySummary.changedGeometrySamples++;
  const stage=qualitySummary.stages[row.stage]??={samples:0,validEyeSamples:0,geometrySamples:0,comparableSamples:0,changedGeometrySamples:0};
  stage.samples++;if(s.valid)stage.validEyeSamples++;if(faceGeometry)stage.geometrySamples++;
  if(comparison.available)stage.comparableSamples++;if(comparison.changed)stage.changedGeometrySamples++;
}
function renderQuality(){
  const last=faceFrames.at(-1),q=qualitySummary;
  const stale=active&&lastReceivedAt!==null&&performance.now()-lastReceivedAt>faceChangePolicy().staleAfterMs;
  const prefix=active?'측정 중':'측정 종료 · 마지막 기록';
  const reasonNames={no_face:'얼굴을 찾지 못했습니다',eye_unreliable:'양쪽 눈 위치를 안정적으로 기록하지 못했습니다',multiple_faces:'복수 얼굴',head_motion:'머리 움직임',timestamp_error:'시각 이상'};
  $('qualityPanel').dataset.state=stale?'warning':!last?'idle':last.comparison.changed?'warning':!last.eyeValid?'unavailable':'observing';
  $('qualityStatus').textContent=stale?'새 카메라 기록이 0.5초 넘게 들어오지 않고 있습니다. 아래 수치는 마지막 기록입니다.':!last?(active?'첫 기록을 기다리고 있습니다.':'측정 전입니다.'):prefix+' · '+(last.comparison.changed?'기준 때와 얼굴 위치·간격·기울기 차이가 있습니다.':'측정 상태를 기록하고 있습니다.');
  $('qualityEyes').textContent=!last?'눈: 아직 기록이 없습니다.':'눈: '+(last.eyeValid?'양쪽 홍채 위치 기록 가능':(reasonNames[last.invalidReason]??last.invalidReason??'측정 불가'))+' · 눈 감김 여부를 확정한 표시는 아닙니다.';
  const c=last?.comparison;
  $('qualityFace').textContent=!last?'얼굴 위치: 좌우 기준 측정을 마치면 비교할 수 있습니다.':
    !last.faceGeometry?'얼굴 위치: 이번 프레임에서는 기준점을 얻지 못했습니다.':
    !c.available?(c.reason==='video_size_changed'?'얼굴 위치: 영상 크기가 바뀌어 비교할 수 없습니다. 새 좌우 기준 측정이 필요합니다.':'얼굴 위치: 기준 수집 중이거나 비교 기준이 없습니다.'):
    c.changed?'얼굴 위치: 개발용 경계값을 넘었습니다. 후보 계산은 그대로 유지됩니다.':'얼굴 위치: 현재 프레임은 개발용 경계값 이내입니다. 정확한 자세를 보장하는 뜻은 아닙니다.';
  $('qualityNumbers').textContent=c?.available?
    '위치 변화(기준 눈꼬리 간격 대비): x '+(100*c.shiftXEyeSpans).toFixed(1)+'%, y '+(100*c.shiftYEyeSpans).toFixed(1)+'% · 눈꼬리 간격 변화 '+(100*c.eyeSpanChangeFraction).toFixed(1)+'% · 화면 안 기울기 변화 '+c.rollChangeDeg.toFixed(1)+'°':
    '위치 변화 — / 눈꼬리 간격 변화 — / 기울기 변화 —';
  $('qualityStats').textContent='시험 구간 샘플 '+(q?.activeSamples??0)+'개 · 눈 위치 유효 '+(q?.validEyeSamples??0)+'개 · 200ms 초과 기록 간격 '+(q?.frameGapsOver200Ms??0)+'회 · 자세 비교 가능 '+(q?.comparableSamples??0)+'개 / 경계값 초과 '+(q?.changedGeometrySamples??0)+'개 (시간 비율 아님)';
}

function recordVertical(s){
  if(!active||!isVertical()||trial.phase!=='active'||trial.ended)return;
  const f=faceFrames.at(-1),stage=trial.verticalStage;
  if(!stage||f?.seq!==s.seq||f.tMs!==s.tMs)return;
  const age=s.tMs-trial.activeStartTMs-stage.startMs;
  const geometry=f.eyeGeometry;
  const prediction=predictVertical(s.valid?geometry?.meanV:null,trial.verticalModelSnapshot?.model);
  verticalFrames.push({seq:s.seq,tMs:s.tMs,stageIndex:stage.index,targetKey:stage.key,
    targetRelativeY:stage.y,targetViewportX:stage.targetViewportX,targetViewportY:stage.targetViewportY,
    expectedRegion:stage.expectedRegion,settled:age>=trial.verticalProtocol.settleMs,
    eyeValid:s.valid,meanV:geometry?.meanV??null,leftV:geometry?.left?.v??null,rightV:geometry?.right?.v??null,
    faceChanged:f.comparison.available?f.comparison.changed:null,prediction});
}
function finishVertical(){
  if(trial.mode==='vertical_calibration'){
    const result=fitVertical(verticalFrames,trial.verticalProtocol);
    result.sourceSessionId=sessionId;result.sourceCalibrationSession=trial.calibrationSnapshot.sessionId;
    result.layoutSignature=trial.layoutSignature;
    trial.verticalResult=result;verticalProfile=result.accepted?structuredClone(result):null;
    $('verticalStatus').textContent=result.accepted?
      '상하 기준 계산 가능 · 정확도 검증은 아직입니다. 세 파일 저장 후 새 기록 → 8번으로 확인하세요.':
      '상하 기준을 계산하기 어렵습니다: '+result.reasons.join(', ')+' · 반복하지 말고 세 파일을 보내주세요.';
  }else{
    trial.verticalResult=evaluateVertical(verticalFrames,trial.verticalProtocol,trial.verticalModelSnapshot);
    const r=trial.verticalResult;
    $('verticalStatus').textContent='상하 확인 종료 · 앞/뒤 표적 방문 '+r.scoredVisits+'회 중 안내와 일치 '+r.matchedVisits+
      ', 반대쪽 '+r.wrongVisits+', 판단 불가 '+r.unknownVisits+' · 경계 표적 '+r.boundaryVisits+'회는 별도 분석. 실제 시선 정답 정확도가 아닙니다.';
  }
}
