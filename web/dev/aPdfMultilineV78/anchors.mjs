import {intervalQuality,median,mad} from './core/math.mjs';
export const ANCHOR_POLICY=Object.freeze({version:'personal-horizontal-anchors/0.1.0',minValidCoverage:.70,minSamples:8,minStepCssPx:24,noiseFactor:2,source:'six pre-reading point windows only;fixed before trials'});
export const withAnchors=(units,fit)=>units.map(u=>({...u,anchorLeftX:fit.units.find(a=>a.contentId===u.contentId).leftCut,anchorRightX:fit.units.find(a=>a.contentId===u.contentId).rightCut}));
export function fitPersonalAnchors(samples,visits,units){return fitHorizontalAnchors(samples,visits,units,'before');}
// The second fit is a diagnostic comparison. Only the six immediately preceding
// checkpoint windows may be used; never train on reading samples or outcomes.
export function fitCheckpointAnchors(samples,visits,units){return fitHorizontalAnchors(samples,visits,units,'between');}
export function checkpointWithFallback(checkpoint,personal){
 if(!personal?.ready||!checkpoint?.units||!personal?.units)throw new Error('기준점 점검 결과가 필요합니다.');
 const rawUnits=checkpoint.units,unitSources={},units=rawUnits.map(u=>{
  const prior=personal.units.find(p=>p.contentId===u.contentId);
  if(!prior?.ready)throw new Error('처음 개인 기준이 없는 영역이 있습니다.');
  unitSources[u.slot]=u.ready?'latest_six_points':'initial_six_points_fallback';
  return u.ready?u:prior;
 });
 const anyUpdated=rawUnits.some(u=>u.ready);
 return {...checkpoint,rawReady:checkpoint.ready,rawUnits,ready:anyUpdated&&units.every(u=>u.ready),anyUpdated,units,unitSources,
  reason:anyUpdated?null:'no_region_passed_checkpoint_quality'};
}
function fitHorizontalAnchors(samples,visits,units,timing){
 const windows=visits.filter(v=>v.phase==='position_check'&&v.checkTiming===timing);
 const inputFrameIds=[],points=windows.map(v=>{
  const rs=samples.filter(r=>r.phase==='position_check'&&r.layoutCondition===timing&&r.targetOnsetMs===v.onsetMs&&r.captureTMs>=v.analysisStartMs&&r.captureTMs<v.analysisEndMs);
  inputFrameIds.push(...rs.map(r=>r.frameId));const good=rs.filter(r=>r.trackingValid&&Number.isFinite(r.gazeXCssPx));
  const quality=intervalQuality(rs.map(r=>({...r,tMs:r.captureTMs,sourceValid:r.trackingValid,diagnosticsLinked:true,eyeGeometryAvailable:true})),v.analysisStartMs,v.analysisEndMs,'gazeXCssPx');
  return {id:v.id,contentId:v.contentId,f:v.f,onsetMs:v.onsetMs,medianX:median(good.map(r=>r.gazeXCssPx)),madX:mad(good.map(r=>r.gazeXCssPx)),validFrames:good.length,coverage:quality.coverage,
   usable:quality.coverage>=ANCHOR_POLICY.minValidCoverage&&good.length>=ANCHOR_POLICY.minSamples};
 });
 const result=units.map(u=>{
  const p=points.filter(p=>p.contentId===u.contentId).sort((a,b)=>a.f-b.f),m=p.map(x=>x.medianX),noise=p.length===3?Math.max(...p.map(x=>x.madX??Infinity)):Infinity;
  const required=Math.max(ANCHOR_POLICY.minStepCssPx,ANCHOR_POLICY.noiseFactor*noise),separation=p.length===3?Math.min(m[1]-m[0],m[2]-m[1]):null;
  const ready=p.length===3&&p.every(x=>x.usable&&Number.isFinite(x.medianX))&&m.every(x=>x>=u.regionMinX&&x<=u.regionMaxX)&&separation>required;
  return {contentId:u.contentId,slot:u.slot,ready,pointIds:p.map(x=>x.id),pointMedians:m,noiseMAD:noise,minimumSeparation:separation,requiredSeparation:required,leftCut:ready?(m[0]+m[1])/2:null,rightCut:ready?(m[1]+m[2])/2:null,reason:ready?null:'point_quality_order_or_separation'};
 });
 const ready=windows.length===6&&result.length===2&&result.every(x=>x.ready);
 return {policy:timing==='before'?ANCHOR_POLICY:{...ANCHOR_POLICY,version:'checkpoint-horizontal-anchors/0.1.0',source:'latest six between-trial point windows only;probe thresholds only'},ready,points,units:result,inputFrameIds:[...new Set(inputFrameIds)],reason:ready?null:timing==='before'?'personal_anchors_not_ready':'checkpoint_anchors_not_ready'};
}
export function freezeTree(o){if(o&&typeof o==='object'){for(const v of Object.values(o))freezeTree(v);Object.freeze(o);}return o;}
