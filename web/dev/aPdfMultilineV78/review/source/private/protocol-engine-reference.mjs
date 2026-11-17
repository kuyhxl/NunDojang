import {encodeFeatures} from '../../web/dev/aPdfHorizontalV6/ridge.mjs';
// A(민서) isolated WebEyeTrack feasibility pilot. No product contract changes.
export const VERSION='nundojang-webeyetrack-pilot/0.4.0';
export const SOURCE='webeyetrack-private/75fbd2f5-pilot.4';
export const SETTINGS=Object.freeze({prepareMs:3000,stageMs:4000,calibrationStageMs:6000,settleMs:1500,calibrationFramesPerPoint:8,
 calibrationTrainingPerPoint:6,calibrationCheckPerPoint:2,
 calibrationSpacingMs:350,maxResultAgeMs:250,minProcessedFps:10,minValidFraction:.70,minFreshSamples:8,
 rowPitchCssPx:130,rowBandCssPx:130/3,minPassVisits:10,minPassPerRow:3,p90ErrorLimitCssPx:65,
 calibrationSteps:1,calibrationLearningRate:1e-5});
export const SPACING_CONDITIONS=Object.freeze({
 near130:{rowPitchCssPx:130,rowBandCssPx:130/3,p90ErrorLimitCssPx:65},
 wide260:{rowPitchCssPx:260,rowBandCssPx:260/3,p90ErrorLimitCssPx:130}
});
export function makePlan(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1000||height<720)throw new Error('Chrome 창 안쪽 크기를 최소1000×720으로 넓혀 주세요.');
 const center={x:width/2,y:height/2+27},at=(x,y)=>({x:center.x+x,y:center.y+y});
 const calibration=[['C',0,0],['UL',-220,-290],['DR',220,290],['UR',220,-290],['DL',-220,290],['U',0,-290],['D',0,290],['L',-220,0],['R',220,0]];
 const order=['C','NUL','WDR','NML','WUR','NDL','WMR','NDR','WUL','C',
  'WDL','NUR','WML','NMR','WDR','NUL','WMR','NDL','C',
  'NUR','WDL','NMR','WML','NDR','WUR','NML','WUL','C'];
 return {center,rows:[center.y-130,center.y,center.y+130],calibrationExtentCssPx:290,
  spacingConditions:Object.fromEntries(Object.entries(SPACING_CONDITIONS).map(([id,c])=>[id,{...c,rows:[center.y-c.rowPitchCssPx,center.y,center.y+c.rowPitchCssPx]}])),
  calibration:calibration.map(([id,x,y],index)=>({id,index,phase:'calibration',layoutCondition:'calibration',target:at(x,y),durationMs:6000})),
  validation:order.map((id,index)=>{
   if(id==='C')return {id,index,phase:'center_control',layoutCondition:'center',expectedRow:'middle',target:center,durationMs:4000};
   const layoutCondition=id[0]==='N'?'near130':'wide260',loc=id.slice(1),pitch=SPACING_CONDITIONS[layoutCondition].rowPitchCssPx;
   return {id,index,phase:'validation',layoutCondition,expectedRow:loc[0]==='U'?'up':loc[0]==='D'?'down':'middle',
    target:at(loc.endsWith('L')?-150:150,loc[0]==='U'?-pitch:loc[0]==='D'?pitch:0),durationMs:4000};
  })};
}
export const SAMPLE_COLUMNS=['schemaVersion','source','sessionId','seq','frameId','captureTMs','resultTMs','mediaTimeSec','resultAgeMs','processingMs',
 'phase','stageIndex','targetId','layoutCondition','targetXCssPx','targetYCssPx','targetOnsetMs','analysisStartMs','analysisEndMs','settled',
 'faceDetected','eyeState','trackingValid','invalidReason','outsideViewport','networkNormX','networkNormY','filteredNormX','filteredNormY',
 'gazeXCssPx','gazeYCssPx','headX','headY','headZ','faceOriginX','faceOriginY','faceOriginZ','adaptCalls',
 'featureFitCalls','predictionMethod','eyeFeatureDimension','eyeFeaturesF32Base64','baselineTrackingValid','baselineInvalidReason','baselineOutsideViewport',
 'baselineNetworkNormX','baselineNetworkNormY','baselineFilteredNormX','baselineFilteredNormY','baselineGazeXCssPx','baselineGazeYCssPx','leftEAR','rightEAR','meanEAR'];
export const EVENT_COLUMNS=['schemaVersion','sessionId','event','tMs','phase','stageIndex','targetId','detail'];
export function numericResult(r,ctx,arrivalMs,viewport,paired=true){
 const pair=x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite);
 const age=arrivalMs-ctx.captureTMs;
 const reason=r.errorCode??(!r.faceDetected?'face_not_detected':r.eyeState!=='open'?'eyes_not_open':!pair(r.filtered)?'nonfinite_prediction':
  !Number.isFinite(age)||age<0?'invalid_result_time':age>SETTINGS.maxResultAgeMs?'result_stale':null);
 const valid=reason===null,n=r.network,f=r.filtered;
 const x=pair(f)?(f[0]+.5)*viewport.width:null,y=pair(f)?(f[1]+.5)*viewport.height:null;
 let extra={};
 if(paired){
  const b=numericResult({...r,network:r.baselineNetwork,filtered:r.baselineFiltered,errorCode:r.errorCode==='frame_processing_error'?r.errorCode:null},ctx,arrivalMs,viewport,false);
  extra={featureFitCalls:r.featureFitCalls??0,predictionMethod:r.primaryMethod??'unspecified',
   eyeFeatureDimension:Array.isArray(r.eyeFeatures)?r.eyeFeatures.length:null,eyeFeaturesF32Base64:encodeFeatures(r.eyeFeatures),
   baselineTrackingValid:b.trackingValid,baselineInvalidReason:b.invalidReason,baselineOutsideViewport:b.outsideViewport,
   baselineNetworkNormX:b.networkNormX,baselineNetworkNormY:b.networkNormY,baselineFilteredNormX:b.filteredNormX,baselineFilteredNormY:b.filteredNormY,
   baselineGazeXCssPx:b.gazeXCssPx,baselineGazeYCssPx:b.gazeYCssPx};
 }
 return {...extra,leftEAR:Number.isFinite(r.leftEAR)?r.leftEAR:null,rightEAR:Number.isFinite(r.rightEAR)?r.rightEAR:null,
 meanEAR:[r.leftEAR,r.rightEAR].every(Number.isFinite)?(r.leftEAR+r.rightEAR)/2:null,resultAgeMs:age,processingMs:r.processingMs??null,faceDetected:r.faceDetected===true,eyeState:r.eyeState??'unknown',trackingValid:valid,
 invalidReason:reason,outsideViewport:x!==null&&(x<0||x>viewport.width||y<0||y>viewport.height),
 networkNormX:pair(n)?n[0]:null,networkNormY:pair(n)?n[1]:null,filteredNormX:pair(f)?f[0]:null,filteredNormY:pair(f)?f[1]:null,
 gazeXCssPx:valid?x:null,gazeYCssPx:valid?y:null,
 headX:r.head?.[0]??null,headY:r.head?.[1]??null,headZ:r.head?.[2]??null,
 faceOriginX:r.origin?.[0]??null,faceOriginY:r.origin?.[1]??null,faceOriginZ:r.origin?.[2]??null,adaptCalls:r.adaptCalls??null};
}
export {toCsv as csv} from '../../web/dev/aPdfHorizontalV6/core/math.mjs';
