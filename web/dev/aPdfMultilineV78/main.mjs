import {loadPdfFile} from './pdf-input.mjs';
import {createReadingNavigation} from './navigation.mjs';
import {HorizontalRun} from './runner.mjs';
import {CONTENT,CONTENT_PAGES,TRIALS,configurePdfModel} from './protocol.mjs';
import {csv,SAMPLE_COLUMNS,EVENT_COLUMNS} from './protocol.mjs';
const $=id=>document.getElementById(id),video=$('camera');
const viewport=()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport?.scale??1,visualWidth:visualViewport?.width??null,visualHeight:visualViewport?.height??null});
const message=s=>{$('message').textContent=s;};
function readingStyle(){const s=getComputedStyle($('text-left'));return {fontSizeCssPx:parseFloat(s.fontSize),fontFamily:s.fontFamily,fontWeight:s.fontWeight,canvasFont:s.font||`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`};}

let loadedPdfModel=null;let run=null,bridge=null,stream=null,stopped=false,busy=false,pumping=false,rvfc=null,raf=null,frameId=0,lastMediaTime=null,readyInfo=null,finalizing=false;
const counts={presentedCallbacks:0,busyFramesSkipped:0,duplicateFramesSkipped:0,processedFrames:0};
class Bridge{
 constructor(){this.seq=0;this.pending=new Map();this.worker=new Worker(new URL('./pilot-worker.js',import.meta.url));this.closed=false;this.unresponsive=false;
  this.worker.onmessage=e=>{const p=this.pending.get(e.data.id);if(!p)return;this.pending.delete(e.data.id);clearTimeout(p.timer);e.data.error?p.reject(new Error(e.data.error.message)):p.resolve(e.data.result);};
  this.worker.onerror=e=>{this.unresponsive=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(e.message||'모델 작업 스레드 오류'));}this.pending.clear();if(run&&!run.end)run.finish(e.message||'모델 작업 스레드 오류');};}
 call(type,payload={},transfer=[]){if(this.closed)return Promise.reject(new Error('모델이 종료되었습니다.'));
  return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.unresponsive=true;this.pending.delete(id);reject(new Error(type==='adapt'?'개인 기준 계산이 60초 안에 끝나지 않았습니다.':'모델 응답 시간이 초과되었습니다.'));},type==='step'?15000:type==='audit'?10000:60000);
   this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,payload},transfer);});}
 close(){this.closed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('모델 종료'));}this.pending.clear();}
}
function disableInputs(){for(const id of ['prepare','distance','stable','height','pdfInput','samplePdf'])$(id).disabled=true;}
function stopCamera(){pumping=false;if(rvfc!==null)video.cancelVideoFrameCallback(rvfc);rvfc=null;
 if(stream){for(const track of stream.getTracks()){track.onended=null;track.stop();}stream=null;}video.pause();video.srcObject=null;}
async function finish(end){
 if(finalizing)return;finalizing=true;stopped=true;if(raf!==null)cancelAnimationFrame(raf);stopCamera();
 $('anchorRetry').hidden=true;$('main').hidden=false;$('stage').hidden=$('waiting').hidden=$('board').hidden=$('instruction').hidden=$('finishTrial').hidden=true;$('downloads').hidden=false;disableInputs();$('start').disabled=true;
 message((end.completed?'검사가 끝났습니다.':'중단됐습니다.')+'\n기록과 모델 고정 상태를 정리합니다.');
 try{if(bridge&&run.frozen&&!bridge.unresponsive){while(busy&&!bridge.unresponsive)await new Promise(r=>setTimeout(r,20));
   if(bridge.unresponsive)throw new Error('모델 응답 중단으로 고정 상태 확인 불가');
   run.finalAudit=await bridge.call('audit');run.event('model_final_audit',run.finalAudit);}
  else run.finalAudit={frozen:false,modelUnchanged:false,reason:bridge?.unresponsive?'worker_unresponsive':'model_not_frozen'};}
 catch(e){run.finalAudit={modelUnchanged:false,error:String(e.message)};run.event('model_final_audit_failed',e.message);}
 finally{bridge?.close();}
 if(run.finalAudit&&end.completed&&(!run.finalAudit.modelUnchanged||run.finalAudit.adaptCalls!==1||run.finalAudit.featureFitCalls!==1||!run.finalAudit.ridgeUnchanged||!run.finalAudit.encoderUnchanged)){
  run.end.completed=false;run.end.reason='model_freeze_audit_failed';run.event('completion_rejected','모델 고정 확인 실패');
 }
 if(end.completed&&run.personalAnchors?.ready&&(!run.personalAudit().unchanged||!run.personalAudit().briefEndUnchanged||!run.personalAudit().layoutPlanUnchanged)){run.end.completed=false;run.end.reason='personal_anchor_audit_failed';}
 const gate=run.previewGate();$('previewGate').disabled=!gate.enabled;$('gateStatus').textContent=gate.enabled?'시험용 페이지 관찰 조건이 모였습니다. 조건 확인 버튼을 사용할 수 있습니다. 실제 서명은 저장하지 않습니다.':'이번은 위치 변화 진단 시험입니다. 서명 조건 확인 버튼은 사용하지 않습니다.';
 for(const b of document.querySelectorAll('[data-download]'))b.disabled=false;
 const countsText=(t,key)=>{const v=t[key];if(!v)return '측정 불가';const units=run.plan.layouts[t.layoutId];return units.map(u=>(u.slot==='left'?'왼쪽 ':'오른쪽 ')+(v.trialSweepCounts[u.contentId]??0)).join(' / ');};
 $('resultRows').textContent=run.trialResults.map(t=>`${t.trialId}\n최초 기준 120ms: ${countsText(t,'personalRegionEvidence')} · 최초 기준 60ms: ${countsText(t,'probeRegionEvidence')}\n중간 기준 120ms: ${countsText(t,'checkpointRegionEvidence')} · 중간 기준 60ms: ${countsText(t,'checkpointProbeRegionEvidence')}\n중간 기준 출처: ${JSON.stringify(t.checkpointUnitSources)}\n※이번 회차의 가로 이동 후보 수입니다. 누적값이나 고유 줄 수를 뜻하지 않습니다.`).join('\n\n');
 $('pageRows').textContent=run.pageObservation().checkpoint?.pages.map(p=>`${p.label}: 가로 이동 조건 충족 영역 ${p.observedCount}/${p.requiredCount}`).join(' · ')??'개인 기준 미확인';
 $('regionCounts').textContent=run.trialResults.map(t=>`${t.trialId}: 개인 기준 가로 이동 횟수 ${JSON.stringify(t.personalRegionEvidence?.trialSweepCounts??{})}`).join('\n');
 message(run.end.completed?`검사가 끝났습니다. ${run.samples.length}개 기록이 있습니다. 수행 확인을 선택한 뒤 세 파일을 저장해 주세요.`:
  `중단: ${run.end.reason==='personal_anchors_failed_after_two_attempts'?'개인별 기준 설정이 두 번 모두 통과되지 않았습니다. 읽기 시험은 시작하지 않았습니다.':run.end.reason==='personal_anchors_failed_user_saved'?'개인별 기준 실패 기록을 저장합니다. 읽기 시험은 시작하지 않았습니다.':run.end.reason}\n남아 있는 ${run.samples.length}개 기록과 진단을 세 파일로 저장해 주세요. 반복 실행은 하지 않으셔도 됩니다.`);
}
function measureLayout(){
 const nowStyle=readingStyle();if(loadedPdfModel?.displayStyle&&JSON.stringify(nowStyle)!==JSON.stringify(loadedPdfModel.displayStyle))throw new Error('PDF를 불러온 뒤 본문 글꼴 설정이 바뀌었습니다. 새로고침하고 다시 불러와 주세요.');
 $('board').hidden=false;$('board').style.visibility='hidden';
 try{
  const measured=[...CONTENT_PAGES,...CONTENT_PAGES.map(p=>[...p].reverse())].map(order=>order.map((c,i)=>{const slot=i?'right':'left',el=$('text-'+slot);el.textContent=c.text;const r=el.getBoundingClientRect(),card=el.parentElement.getBoundingClientRect();if(r.left<card.left+6||r.right>card.right-6)throw new Error('글이 잘립니다. 창을 넓혀 주세요.');return {contentId:c.id,slot,text:c.text,x0:r.left,x1:r.right,y:r.top+r.height/2};}));
  const units=CONTENT.map((c,i)=>{const slot=i?'right':'left',both=measured.map(m=>m[i]);return {contentId:c.id,slot,text:c.text,x0:Math.min(...both.map(r=>r.x0)),x1:Math.max(...both.map(r=>r.x1)),y:both[0].y,geometryMeasurements:both.map(r=>({contentId:r.contentId,x0:r.x0,x1:r.x1,y:r.y}))};});
  const sorted=[...units].sort((a,b)=>a.x0-b.x0),gap=sorted[1].x0-sorted[0].x1,button=$('finishTrial');
  if(gap<160)throw new Error('글 사이의 버튼 여유가 부족합니다. 창을 넓혀 주세요.');
  button.style.left=(sorted[0].x1+sorted[1].x0)/2+'px';button.style.width=Math.min(180,gap-104)+'px';
  return units;
 }finally{CONTENT.forEach(c=>{$('text-'+c.slot).textContent=c.text;});$('board').hidden=true;$('board').style.visibility='';}
}
function showStage(s){$('anchorRetry').hidden=true;document.body.append(video);Object.assign(video.style,{position:'fixed',left:'0',bottom:'0',width:'2px',height:'2px',pointerEvents:'none'});
 $('main').hidden=$('waiting').hidden=$('board').hidden=$('stage').hidden=$('instruction').hidden=$('finishTrial').hidden=true;
 if(s.phase==='anchor_retry'){$('anchorRetry').hidden=false;$('anchorRetryText').textContent=s.units.map(u=>(u.slot==='left'?'왼쪽':'오른쪽')+' 기준: '+(u.ready?'통과':'점별 측정값을 안정적으로 나누지 못함')).join(' · ');return;}
 if(s.phase==='instruction'){$('instruction').hidden=false;$('instructionText').textContent=s.instruction;$('trialNumber').textContent=`읽기 ${s.index+1}/${TRIALS.length}`;return;}
 if(s.phase==='trial'){const page=run.plan.pages.find(p=>p.id===TRIALS[s.index].pageId)?.label??TRIALS[s.index].pageId;$('slot-left').textContent=page+' · 왼쪽 글';$('slot-right').textContent=page+' · 오른쪽 글';for(const u of run.plan.layouts[run.activeLayoutId])$('text-'+u.slot).textContent=u.text;$('board').hidden=false;$('finishTrial').hidden=false;return;}
 $('stage').hidden=false;$('target').style.left=s.target.x+'px';$('target').style.top=s.target.y+'px';
}
async function adapt(){
 $('stage').hidden=$('board').hidden=$('instruction').hidden=$('finishTrial').hidden=true;$('waiting').hidden=false;
 try{while(busy&&!stopped)await new Promise(r=>setTimeout(r,20));if(stopped)return;
  const info=await bridge.call('adapt',{targetIds:run.plan.calibration.map(s=>s.id),viewport:{width:run.baseline.width,height:run.baseline.height}});if(!stopped)run.adapted(info);
 }catch(e){if(!run.end)run.finish(e.message);}
}
const canvas=document.createElement('canvas'),ctx2d=canvas.getContext('2d',{willReadFrequently:true});
function pump(){
 if(!pumping||stopped)return;
 rvfc=video.requestVideoFrameCallback(async(_t,meta)=>{
  rvfc=null;if(!pumping||stopped)return;counts.presentedCallbacks++;
  const fresh=Number.isFinite(meta.mediaTime)&&meta.mediaTime!==lastMediaTime;lastMediaTime=meta.mediaTime;
  if(!fresh)counts.duplicateFramesSkipped++;
  else if(busy||run?.state==='adapting')counts.busyFramesSkipped++;
  else if(bridge&&!['completed','interrupted','idle','preparing'].includes(run?.state)){
   busy=true;const id=++frameId,context=run.context(id,meta.mediaTime),captureTMs=context?.captureTMs??run.t();
   try{
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx2d.drawImage(video,0,0,canvas.width,canvas.height);
    const frame=ctx2d.getImageData(0,0,canvas.width,canvas.height);
    const result=await bridge.call('step',{frame,frameId:id,captureTMs},[frame.data.buffer]);counts.processedFrames++;
    const accepted=run.receive(result,context);
    if(!stopped&&run.state==='ready'&&!run.livePipelineReady){
     const valid=result.faceDetected&&result.eyeState==='open'&&Array.isArray(result.filtered)&&result.filtered.every(Number.isFinite)&&!result.errorCode&&run.t()-captureTMs<=250;
     if(valid){run.livePipelineReady=true;run.event('live_pipeline_ready');$('start').disabled=false;message('준비됐습니다. 안내를 읽은 뒤 기준 측정 시작을 누르세요.');}
     else message(result.errorCode?'실제 카메라 처리 중 오류가 있습니다. Esc로 중단하고 세 파일을 저장해 주세요.':
      !result.faceDetected?'얼굴을 찾는 중입니다. 카메라 화면에 얼굴이 보이도록 해 주세요. 계속 안 되면 Esc로 중단하고 세 파일을 저장합니다.':
      result.eyeState!=='open'?'눈이 보이는지 확인하는 중입니다. 편하게 정면을 봐 주세요.':'실제 카메라 모델 응답을 확인하는 중입니다. 잠시 기다려 주세요. 계속 안 되면 Esc로 중단하고 세 파일을 저장합니다.');
    }
    if(accepted.accepted&&!stopped){const info=await bridge.call('accept',{frameId:id,target:{id:context.targetId,
     normX:context.targetXCssPx/run.baseline.width-.5,normY:context.targetYCssPx/run.baseline.height-.5}});run.acceptedCalibration(context,info);}
   }catch(e){if(run&&!run.end)run.finish(e.message);}finally{busy=false;}
  }
  pump();
 });
}
function tick(){if(!run||run.end)return;if(!run.checkViewport())return;run.tick();if(!run.end)raf=requestAnimationFrame(tick);}
async function openPdf(file){
 if(run&&run.state!=='idle')return;
 $('prepare').disabled=true;$('samplePdf').disabled=true;$('pdfInput').disabled=true;message('PDF에서 글을 추출하고 원본 페이지와 연결하는 중입니다.');
 try{await document.fonts.ready;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const displayStyle=readingStyle();if(displayStyle.fontSizeCssPx!==16)throw new Error('본문 글씨가16px가 아닙니다. 새 시험 폴더와 확대 설정을 확인해 주세요.');ctx.font=displayStyle.canvasFont;
  const maxWidth=Math.min(520,(innerWidth-256)/2-30),measure=t=>ctx.measureText(t).width;
  loadedPdfModel=await loadPdfFile(file,{measure,maxWidth,displayStyle});
  $('pdfSummary').textContent=`${loadedPdfModel.fileName}: 원본 ${loadedPdfModel.sourcePageCount}쪽 · 관찰 단위 ${loadedPdfModel.pages.reduce((n,p)=>n+p.contentIds.length,0)}개 · 여러 줄 묶음 ${loadedPdfModel.views.length}개 · 본문 ${displayStyle.fontSizeCssPx}px · 시험 4회 (두 원본 페이지 연결)`;
  $('pdfPreview').textContent=loadedPdfModel.sourcePages.map(p=>`[원본 ${p.sourcePage}쪽]\n`+p.units.map(u=>u.text).join('\n')).join('\n\n');
  if(!loadedPdfModel.supported){message(loadedPdfModel.issues.join('\n'));return;}
  configurePdfModel(loadedPdfModel,{testMode:'complete'});$('prepare').disabled=false;message('PDF를 불러왔습니다. 아래 추출 글을 확인한 뒤 카메라·모델 준비를 누르세요.');
 }catch(e){loadedPdfModel=null;message('PDF 불러오기 실패: '+e.message);}
 finally{$('samplePdf').disabled=false;$('pdfInput').disabled=false;}
}
$('pdfInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await openPdf(f);e.target.value='';});
$('samplePdf').addEventListener('click',async()=>{$('samplePdf').disabled=true;$('pdfInput').disabled=true;$('prepare').disabled=true;try{const r=await fetch(new URL('./fixtures/application-two-pages.pdf',import.meta.url));if(!r.ok)throw new Error('시험 PDF를 찾지 못했습니다.');await openPdf(new File([await r.arrayBuffer()],'application-two-pages.pdf',{type:'application/pdf'}));}catch(e){message(e.message);$('samplePdf').disabled=false;$('pdfInput').disabled=false;}});
$('prepare').addEventListener('click',async()=>{
 if(run&&run.state!=='idle')return;if(!loadedPdfModel?.supported){message('PDF를 먼저 불러와 주세요.');return;}
 const candidate=new HorizontalRun({clock:()=>performance.now(),viewport,onStage:showStage,onAdapt:adapt,onFinish:finish});
 try{await document.fonts.ready;candidate.prepare({distanceCm:$('distance').value,stableSupport:$('stable').checked,comfortableHeight:$('height').checked},measureLayout());}
 catch(e){message(e.message);return;}run=candidate;disableInputs();message('카메라와 모델을 준비합니다. 처음에는 잠시 걸릴 수 있습니다. 권한 요청을 허용해 주세요.');
 try{
  if(!video.requestVideoFrameCallback)throw new Error('이 Chrome에서는 새 카메라 프레임 확인 기능을 사용할 수 없습니다.');
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30},facingMode:'user'}});
  if(stopped){stopCamera();return;}video.srcObject=stream;await video.play();
  const track=stream.getVideoTracks()[0];track.onended=()=>{if(!run.end)run.finish('카메라 연결이 종료됐습니다.');};
  bridge=new Bridge();readyInfo=await bridge.call('init',{baseUrl:new URL('./assets/',import.meta.url).href});
  if(stopped)return;const settings=track.getSettings();run.ready(readyInfo,{width:settings.width??video.videoWidth,height:settings.height??video.videoHeight,frameRate:settings.frameRate??null});
  if(!run.checkViewport())return;run.captureCounts=counts;message('모델을 불러왔습니다. 실제 카메라 입력이 처리되는지 확인합니다. 잠시 편하게 정면을 봐 주세요.');pumping=true;pump();tick();
 }catch(e){if(!run.end)run.finish(e.message);}
});
$('start').addEventListener('click',()=>{if(run?.start())$('start').disabled=true;});
$('previewGate').addEventListener('click',()=>{if(run?.previewGate().enabled){run.event('signature_preview_clicked',{actualSignatureSaved:false});$('gateStatus').textContent='시험용 활성화 동작을 확인했습니다. 실제 서명은 저장하지 않았습니다. 확인 후 세 파일을 저장해 주세요.';}});
const navigation=createReadingNavigation({clock:()=>performance.now(),state:()=>run?.state,finishTrial:method=>{if(run?.state!=='trial')return false;run.event('manual_next_'+method);return run.endTrial(method);},beginTrial:method=>{if(run?.state!=='instruction')return false;run.event('manual_begin_'+method);return run.startTrial();}});
$('retryAnchors').addEventListener('click',()=>{if(run?.retryAnchors())navigation.reset();});
$('saveAnchorFailure').addEventListener('click',()=>run?.finish('personal_anchors_failed_user_saved'));
$('beginTrial').addEventListener('click',()=>navigation.begin('click'));
$('finishTrial').addEventListener('click',()=>navigation.next('click'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&run&&!run.end){run.finish('사용자 Esc 중단');return;}navigation.keydown(e);});
document.addEventListener('keyup',navigation.keyup);
window.addEventListener('blur',navigation.reset);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&run&&!run.end)run.finish('탭 숨김');});
window.addEventListener('resize',()=>run?.checkViewport());
window.addEventListener('pagehide',()=>{if(run&&!run.end)run.finish('페이지 떠남');stopped=true;stopCamera();bridge?.close();});
for(const button of document.querySelectorAll('[data-download]'))button.addEventListener('click',()=>{
 if(!run)return;const x=run.export({actionsReported:$('performed').value,notes:$('notes').value,readability:$('readability').value});x.diagnostics.captureCounts={...counts};x.diagnostics.manualControlsAvailable=['click','Space'];
 const kind=button.dataset.download,text=kind==='diagnostics'?JSON.stringify(x.diagnostics,null,2):csv(x[kind],kind==='samples'?SAMPLE_COLUMNS:EVENT_COLUMNS);
 const blob=new Blob([text],{type:kind==='diagnostics'?'application/json':'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`pdf-horizontal-v7.8-${kind}-P01-${x.sessionId}.${kind==='diagnostics'?'json':'csv'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
