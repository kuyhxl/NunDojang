import * as tf from '@tensorflow/tfjs';
import WebEyeTrack from './upstream/WebEyeTrack';
import {KalmanFilter2D} from './upstream/utils/filter';
import {SETTINGS} from './protocol-engine-reference.mjs';
import {selectRidge,predictRidge} from '../../web/dev/aHorizontalReadingV5/ridge.mjs';
const CHECK_INDICES=new Set([2,5]);
const median=(a:number[])=>{const s=[...a].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
const pair=(x:any)=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite)?[...x]:null;
const vector=(x:any,n:number)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);
export const UPSTREAM_COMMIT='75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c';
async function hashText(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function hashTensors(weights:tf.Tensor[]){
 const arrays=await Promise.all(weights.map(t=>t.data()));
 if(arrays.some(a=>Array.from(a).some(x=>!Number.isFinite(x))))throw new Error('모델 값에 유효하지 않은 수치가 있습니다.');
 const bytes=new Uint8Array(arrays.reduce((n,a)=>n+a.byteLength,0));let offset=0;
 for(const a of arrays){bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),offset);offset+=a.byteLength;}
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export class PilotEngine{
 core:WebEyeTrack;state='cold';adaptCalls=0;featureFitCalls=0;bank=new Map<string,any[]>();last:any=null;freeze:any=null;encoderBefore='';runtime:any=null;
 ridge:any=null;ridgeFilter=new KalmanFilter2D();featureDimension=512;
 constructor(){this.core=new WebEyeTrack(9,60);}
 async initialize(baseUrl:string){
  try{const ok=await tf.setBackend('webgl');await tf.ready();if(!ok||tf.getBackend()!=='webgl')throw new Error('WebGL backend unavailable');}
  catch(e){throw new Error('이 Chrome에서 GPU 모델 실행을 준비하지 못했습니다. Esc로 중단하고 세 파일을 저장해 주세요. ('+String(e)+')');}
  await this.core.initialize(baseUrl);
  const model=this.core.getModelForAudit();
  const warm=tf.tidy(()=>(this.core as any).blazeGaze.predictWithFeatures(tf.zeros([1,128,512,3]),tf.zeros([1,3]),tf.tensor2d([[0,0,60]])));
  try{const p=Array.from(await warm.prediction.data()),f=Array.from(await warm.features.data());
   if(p.length!==2||f.length!==512||![...p,...f].every(Number.isFinite))throw new Error('공개 모델의 눈 특징 또는 출력 형식이 맞지 않습니다.');
  }finally{tf.dispose([warm.prediction,warm.features]);}
  this.encoderBefore=await hashTensors(model.getLayer('cnn_encoder').getWeights());this.state='collecting';
  this.runtime={upstreamCommit:UPSTREAM_COMMIT,privateRevision:'pilot.4',tensorflowVersion:tf.version.tfjs,tfBackend:tf.getBackend(),backendFallback:null,
   modelInputs:model.inputs.map(x=>x.shape),faceLandmarkerRuntime:'0.10.18',eyeFeatureDimension:512,ridgeInputDimension:518,
   primary:'frozen-eye-features+head+origin -> regularized personal mapping',pairedBaseline:'v0.2.0 network+affine+one adaptation step',singleEncoderPerFrame:true};
  return this.runtime;
 }
 async step(frame:ImageData,frameId:number,captureTMs:number){
  if(!['collecting','frozen'].includes(this.state))throw new Error('모델이 측정 가능한 상태가 아닙니다.');
  const tic=performance.now();let r:any;
  try{r=await this.core.step(frame,captureTMs);}catch(error){this.last=null;return {faceDetected:false,eyeState:'unknown',network:null,filtered:null,head:null,origin:null,
   processingMs:performance.now()-tic,adaptCalls:this.adaptCalls,featureFitCalls:this.featureFitCalls,errorCode:'frame_processing_error',errorMessage:String((error as any)?.message??error)};}
  const face=Array.isArray(r.facialLandmarks)&&r.facialLandmarks.length>0,open=face&&r.gazeState==='open';
  this.last={frameId,captureTMs,result:r};
  const eye=open&&vector(r.eyeFeatures,this.featureDimension)?[...r.eyeFeatures]:null;
  const baselineNetwork=open?pair(r.networkNormPog):null,baselineFiltered=open?pair(r.unclippedNormPog):null;
  let network=baselineNetwork,filtered=baselineFiltered,errorCode:string|null=null;
  if(open&&!eye)errorCode='eye_features_unavailable';
  if(this.ridge){
   if(open&&eye&&vector(r.headVector,3)&&vector(r.faceOrigin3D,3)){
    try{network=predictRidge(this.ridge,[...eye,...r.headVector,...r.faceOrigin3D]);filtered=[...this.ridgeFilter.step(network!)];}
    catch{network=filtered=null;errorCode='feature_mapping_error';}
   }else{network=filtered=null;}
  }
  return {faceDetected:face,eyeState:r.gazeState??'unknown',leftEAR:r.leftEAR??null,rightEAR:r.rightEAR??null,network,filtered,baselineNetwork,baselineFiltered,eyeFeatures:eye,
   head:face?r.headVector:null,origin:face?r.faceOrigin3D:null,processingMs:performance.now()-tic,adaptCalls:this.adaptCalls,
   featureFitCalls:this.featureFitCalls,primaryMethod:this.ridge?'feature_ridge':'initial_network',...(errorCode?{errorCode}: {})};
 }
 accept(frameId:number,target:{id:string,normX:number,normY:number}){
  if(this.state!=='collecting')throw new Error('평가 중 준비 자료를 추가할 수 없습니다.');
  const row=this.last;if(!row||row.frameId!==frameId)throw new Error('준비 프레임 연결이 맞지 않습니다.');
  const r=row.result,prior=this.bank.get(target.id)??[];
  if(prior.some(x=>x.frameId===frameId))throw new Error('같은 준비 프레임이 중복되었습니다.');
  if(prior.length>=SETTINGS.calibrationFramesPerPoint)return {accepted:false,count:prior.length};
  if(prior.length&&row.captureTMs-prior.at(-1).captureTMs<SETTINGS.calibrationSpacingMs)return {accepted:false,count:prior.length};
  if(!r.facialLandmarks?.length||r.gazeState!=='open'||!vector(r.headVector,3)||!vector(r.faceOrigin3D,3)||!vector(r.eyeFeatures,512)||!pair(r.networkNormPog)||r.eyePatch.width!==512||r.eyePatch.height!==128)return {accepted:false,count:prior.length};
  if(![target.normX,target.normY].every(Number.isFinite)||Math.abs(target.normX)>.5||Math.abs(target.normY)>.5)throw new Error('준비점의 화면 좌표가 올바르지 않습니다.');
  const role=CHECK_INDICES.has(prior.length)?'same_fixation_check':'training';
  prior.push({frameId,captureTMs:row.captureTMs,role,targetId:target.id,eye:r.eyePatch,head:[...r.headVector],origin:[...r.faceOrigin3D],
   features:[...r.eyeFeatures,...r.headVector,...r.faceOrigin3D],before:[...r.networkNormPog],label:[target.normX,target.normY]});
  this.bank.set(target.id,prior);return {accepted:true,count:prior.length,role};
 }
 async hashes(){const model=this.core.getModelForAudit();const affine=this.core.getAffineForAudit();
  const baseline=await hashTensors([...model.getWeights(),...(affine?[affine]:[])]),ridge=this.ridge?await hashText(JSON.stringify(this.ridge)):null;
  return {baseline,ridge,combined:await hashText(baseline+'|'+ridge)};
 }
 async adapt(expectedIds:string[],viewport:{width:number,height:number}){
  if(this.state!=='collecting'||this.adaptCalls!==0||this.featureFitCalls!==0)throw new Error('개인 기준 조정은 한 번만 가능합니다.');
  if(!viewport||![viewport.width,viewport.height].every(x=>Number.isFinite(x)&&x>0))throw new Error('화면 크기가 유효하지 않습니다.');
  const missing=expectedIds.map(id=>({id,count:this.bank.get(id)?.length??0})).filter(x=>x.count!==8);
  if(expectedIds.length!==9||new Set(expectedIds).size!==9||missing.length)throw new Error('기준점의 정상 기록이 부족합니다: '+missing.map(x=>`${x.id} ${x.count}/8`).join(', '));
  const all=expectedIds.flatMap(id=>this.bank.get(id)!),training=all.filter(x=>x.role==='training');
  if(training.length!==54||all.length!==72)throw new Error('기준 자료 구성이 올바르지 않습니다.');
  this.state='adapting';const started=performance.now(),model=this.core.getModelForAudit();
  const selected=selectRidge(training,viewport);this.ridge=selected.model;this.featureFitCalls++;
  // Both methods receive the same54 preparation frames. No evaluation label reaches this worker.
  this.adaptCalls++;await this.core.adapt(training.map(x=>x.eye),training.map(x=>x.head),training.map(x=>x.origin),training.map(x=>x.label),1,1e-5,'calib');
  if(this.encoderBefore!==await hashTensors(model.getLayer('cnn_encoder').getWeights()))throw new Error('고정할 눈 영상 모델이 변경됐습니다.');
  const frozen=await this.hashes(),records=[];
  for(const r of all){const after=predictRidge(this.ridge,r.features),baselineAfter=await this.core.predictCalibration(r.eye,r.head,r.origin);
   records.push({targetId:r.targetId,frameId:r.frameId,captureTMs:r.captureTMs,role:r.role,targetNormX:r.label[0],targetNormY:r.label[1],
    beforeNormX:r.before[0],beforeNormY:r.before[1],afterNormX:after[0],afterNormY:after[1],baselineAfterNormX:baselineAfter[0],baselineAfterNormY:baselineAfter[1]});}
  if((await this.hashes()).combined!==frozen.combined)throw new Error('준비 자료 점검 중 모델이 변경됐습니다.');
  const summary=expectedIds.flatMap(id=>['training','same_fixation_check'].map(role=>{
   const a=records.filter(x=>x.targetId===id&&x.role===role);return {targetId:id,role,count:a.length,
    beforeMedianAbsYCssPx:median(a.map(x=>Math.abs(x.beforeNormY-x.targetNormY)*viewport.height)),
    afterMedianAbsYCssPx:median(a.map(x=>Math.abs(x.afterNormY-x.targetNormY)*viewport.height)),
    baselineAfterMedianAbsYCssPx:median(a.map(x=>Math.abs(x.baselineAfterNormY-x.targetNormY)*viewport.height)),
    afterMedianAbsXCssPx:median(a.map(x=>Math.abs(x.afterNormX-x.targetNormX)*viewport.width))};}));
  this.core.resetFilter();this.ridgeFilter=new KalmanFilter2D();this.state='frozen';
  this.freeze={modelHash:frozen.combined,baselineModelHash:frozen.baseline,ridgeModelHash:frozen.ridge,encoderUnchanged:true,adaptCalls:1,featureFitCalls:1,
   calibrationPoints:9,calibrationFrames:54,collectedCalibrationFrames:72,checkCalibrationFrames:18,calibrationCalculationMs:performance.now()-started,
   learningRate:1e-5,steps:1,primary:'feature ridge, post-Kalman before clipping',frozen:true,featureSelection:selected.selection,
   calibrationDiagnostics:{viewport,records,summary,method:'both methods before temporal filtering;no learning during diagnostics',
    checkMeaning:'same fixation reserved frames, not independent sessions;selection uses training54 only'}};
  this.core.releaseCalibrationData();this.bank.clear();this.last=null;return this.freeze;
 }
 async audit(){if(!this.freeze)return {frozen:false,adaptCalls:this.adaptCalls,featureFitCalls:this.featureFitCalls,modelUnchanged:false};
  const h=await this.hashes();return {frozen:true,adaptCalls:this.adaptCalls,featureFitCalls:this.featureFitCalls,modelHash:h.combined,
   modelUnchanged:h.combined===this.freeze.modelHash,baselineUnchanged:h.baseline===this.freeze.baselineModelHash,ridgeUnchanged:h.ridge===this.freeze.ridgeModelHash,
   encoderUnchanged:await hashTensors(this.core.getModelForAudit().getLayer('cnn_encoder').getWeights())===this.encoderBefore};
 }
 close(){this.state='closed';this.bank.clear();this.last=null;this.ridge=null;try{this.core.close();}catch{}}
}
