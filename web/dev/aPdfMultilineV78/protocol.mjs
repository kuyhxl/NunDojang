import {buildLayouts} from './layouts.mjs';
import {SAMPLE_COLUMNS as BASE_COLUMNS,numericResult,csv} from './measurement-record.mjs';
export {numericResult,csv};
export const VERSION='nundojang-pdf-horizontal/0.7.8';
export const UI_REVISION='click-or-space/2';
export const REGION_POLICY='coarse-content-regions/0.1.0';
export const SOURCE='webeyetrack-private/75fbd2f5-pilot.4';
export let CONTENT=Object.freeze([]),CONTENT_PAGES=Object.freeze([]),PAGES=Object.freeze([]),PDF_MODEL=null;
export let TEST_MODE='complete';
export function configurePdfModel(model,{testMode='complete'}={}){
 if(!model?.supported||!model.views?.length)throw new Error('측정 가능한 PDF를 먼저 불러와 주세요.');
 if(!['complete','missing-unit'].includes(testMode))throw new Error('알 수 없는 시험 종류입니다.');
 if(testMode==='missing-unit'&&(model.views.length!==2||model.views.some(v=>v.units.some(u=>u.isPadding))))throw new Error('이번 누락 시험은 두 묶음에 글 두 개씩인 시험 PDF를 사용합니다. 시험 PDF 불러오기를 눌러 주세요.');
 TEST_MODE=testMode;PDF_MODEL=model;CONTENT=model.views[0].units;CONTENT_PAGES=model.views.map(v=>v.units);PAGES=model.pages;
 const first=model.views[0];
 if(model.sourcePageCount!==2||model.views.length!==2||model.views.some(v=>v.units.length!==2||v.units.some(u=>u.lineCount!==4||u.isPadding)))throw new Error('이번 연결 시험은 두 쪽·각 쪽 양쪽 네 줄인 시험 PDF를 사용합니다. 두 쪽 시험 PDF 불러오기를 눌러 주세요.');
 const second=model.views[1];
 TRIALS=[
 {id:'P1-BOTH',pageId:first.pageId,layoutId:first.id,startMode:'prepared',instruction:'첫 번째 시험입니다. 준비점 뒤에 1쪽 글이 나타납니다. 왼쪽 네 줄 한 번 → 오른쪽 네 줄 한 번 읽으세요.',reportedSequence:['left','right'],expectedContentIds:first.units.map(u=>u.id)},
 {id:'P1-REPEAT-LEFT',pageId:first.pageId,layoutId:first.id,startMode:'prepared',instruction:'두 번째 시험입니다. 같은 1쪽의 왼쪽 네 줄만 두 번 읽으세요. 오른쪽은 읽거나 바라보지 않습니다. 2쪽은 아직 읽지 않았습니다.',reportedSequence:['left','left'],expectedContentIds:[first.units[0].id]},
 {id:'P2-LEFT-ONLY',pageId:second.pageId,layoutId:second.id,startMode:'prepared',instruction:'세 번째 시험입니다. 새로 나온 2쪽의 왼쪽 네 줄만 두 번 읽으세요. 오른쪽은 읽거나 바라보지 않습니다.',reportedSequence:['left','left'],expectedContentIds:[second.units[0].id]},
 {id:'P2-RIGHT-ONLY',pageId:second.pageId,layoutId:second.id,startMode:'prepared',startSlot:'right',instruction:'네 번째 시험입니다. 이번 준비점은 오른쪽 첫머리에 나옵니다. 2쪽의 오른쪽 네 줄만 한 번 읽으세요. 왼쪽은 읽지 않습니다.',reportedSequence:['right'],expectedContentIds:[second.units[1].id]}
 ];


}
export const SETTINGS=Object.freeze({prepareMs:3000,calibrationStageMs:6000,settleMs:1500,calibrationFramesPerPoint:8,calibrationSpacingMs:350,
 checkStageMs:3000,checkSettleMs:1000,maxResultAgeMs:250,trialMaxMs:90000,trialMinMs:500,
 roiPaddingCssPx:40,medianWindow:3,maxGapMs:250,anchorDwellMs:120,anchorMinSamples:2,
 presenceDwellMs:400,presenceMinSamples:5,minSweepMs:600,maxSweepMs:12000,leftThird:1/3,rightThird:2/3,
 maxOutOfRegionMs:180,minimumValidCoverage:.75,minViewportWidth:1340,minViewportHeight:680});
// Experimental comparison, selected after reviewing v0.5.3. Not an established optimal threshold.
export const PROBE_SETTINGS=Object.freeze({...SETTINGS,anchorDwellMs:60,anchorMinSamples:2});
export const BRIEF_END_SETTINGS=Object.freeze({...SETTINGS,endDwellMs:50,endMinSamples:2,endUsesCurrentX:true});
export let TRIALS=Object.freeze([]);
export function validateLayout(viewport,units){
 if(viewport.width<1340||viewport.height<680)throw new Error('Chrome 창 안쪽 크기를 최소 1340×680으로 넓혀 주세요.');
 if(units.length!==2||new Set(units.map(u=>u.contentId)).size!==2)throw new Error('서로 다른 두 내용의 배치가 필요합니다.');
 const sorted=[...units].sort((a,b)=>a.x0-b.x0);
 for(const u of units)if(![u.x0,u.x1,u.y].every(Number.isFinite)||u.x1-u.x0<200||u.x0<30||u.x1>viewport.width-30||u.y<50||u.y>viewport.height-50)throw new Error('글 배치 범위가 맞지 않습니다. 확대 배율을 100%로 맞춰 주세요.');
 if(sorted[1].x0-sorted[0].x1<2*SETTINGS.roiPaddingCssPx+80)throw new Error('두 글 사이의 가로 여유가 부족합니다.');
 if(Math.abs(units[0].y-units[1].y)>2)throw new Error('두 글의 높이가 맞지 않습니다.');
 return true;
}
// Text geometry defines scan thirds. Separate, wider bounds define content identity.
export function contentRegions(width,units){
 if(!Number.isFinite(width)||width<=0||units.length!==2)throw new Error('가로 영역 계산에 화면 크기와 두 글이 필요합니다.');
 const sorted=[...units].sort((a,b)=>a.x0-b.x0),gap=sorted[1].x0-sorted[0].x1;
 if(gap<160)throw new Error('두 글의 가로 간격이 부족합니다.');
 const center=(sorted[0].x1+sorted[1].x0)/2,buttonWidth=Math.min(180,gap-104),neutralHalf=buttonWidth/2+12;
 return units.map(u=>({...u,regionMinX:u.contentId===sorted[0].contentId?0:center+neutralHalf,
  regionMaxX:u.contentId===sorted[0].contentId?center-neutralHalf:width}));
}
export function makePlan(viewport,units){
 validateLayout(viewport,units);units=contentRegions(viewport.width,units);if(!PDF_MODEL)throw new Error('PDF를 먼저 불러와 주세요.');const layouts=Object.fromEntries(PDF_MODEL.views.map(v=>[v.id,buildLayouts(units,v.units).normal]));units=layouts.normal;const left=Math.min(...units.map(u=>u.x0))-10,right=Math.max(...units.map(u=>u.x1))+10,y=units[0].y;
 const order=[4,0,8,2,6,1,7,3,5];
 const calibration=order.map((n,index)=>({id:'H'+n,index,phase:'calibration',target:{x:left+(right-left)*n/8,y},durationMs:6000}));
 const check=units.flatMap(u=>[.15,.5,.85].map((f,i)=>({id:u.slot+'-check-'+i,slot:u.slot,contentId:u.contentId,f,target:{x:u.x0+(u.x1-u.x0)*f,y},phase:'position_check',durationMs:3000})));
 // Revisit the same positions at the end to expose drift without refitting.
 const checkBetween=check.map(x=>({...x,id:x.id+'-between'}));
 const checkAfter=check.map(x=>({...x,id:x.id+'-after'}));
 return {diagnosticOnly:true,checkpointPolicy:'same six targets before/between/after;model frozen;checkpoint detector refits horizontal cuts using only preceding six-point check',testMode:TEST_MODE,documentId:PDF_MODEL.documentId,documentMetadata:PDF_MODEL,pages:PAGES,primaryObservationPolicy:'personal120ms',gatePolicy:'each-region-separate-sweep-quota;test-only;not-reading-percent',evidencePolicy:{version:'multiline-region/0.1.0',quota:'ceil(displayedLineCount*0.8)',meaning:'horizontal sweep count only, NOT unique lines read',withinRegionRereadingDetectable:false},layouts,layoutPolicy:'fixed-physical-slot/content-ID-rebinding/0.1.0',regionPolicy:REGION_POLICY,neutralGap:{x0:units.find(u=>u.regionMinX===0).regionMaxX,x1:units.find(u=>u.regionMaxX===viewport.width).regionMinX},manualControl:{kind:'click_or_space',keys:['Space'],debounceMs:250,label:'다음',horizontalCorridor:'gap between text observation regions',clickGrantsObservation:false},center:{x:(left+right)/2,y},units:units.map(x=>({...x})),calibration,check,checkBetween,checkAfter,trials:TRIALS,calibrationAxis:'horizontal_only_at_text_height',core:'unchanged v0.4 model/worker',automaticDisplayMs:153000};
}
export const SAMPLE_COLUMNS=[...BASE_COLUMNS,'trialId','captureState','decodedContentId','decodedSlot','segment','smoothedXCssPx','detectorState','trialRegionCount','trialSweepCount','documentSweepCount','personalSegment','personalDetectorState','personalTrialSweepCount','personalDocumentSweepCount','briefEndSegment','briefEndDetectorState','briefEndTrialSweepCount','briefEndDocumentSweepCount','pageId','probeSegment','probeDetectorState','probeTrialSweepCount','probeDocumentSweepCount','checkpointSegment','checkpointDetectorState','checkpointTrialSweepCount','checkpointDocumentSweepCount','checkpointProbeSegment','checkpointProbeDetectorState','checkpointProbeTrialSweepCount','checkpointProbeDocumentSweepCount','startMode'];
export const EVENT_COLUMNS=['schemaVersion','sessionId','event','tMs','phase','stageIndex','targetId','detail'];
