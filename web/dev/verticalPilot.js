// A(민서) 전용. 화면 위치 추정 가능성을 확인하는 실험이며 읽기 판정에 쓰지 않는다.
export const VERTICAL_VERSION='a-vertical-pilot/0.1.0';
export const STAGE_MS=3000;
export const SETTLE_MS=1000;
const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y),n=b.length;return n?(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2):null;};
export function verticalProtocol(layout,kind){
  if(layout?.mode!=='viewer'||!layout.lineBoxes||layout.lineCount<6)
    throw new Error('상하 시험은 뷰어 참조 규격의 6줄 이상 본문에서 진행합니다.');
  const boxes=layout.lineBoxes,n=boxes.length;
  const cy=i=>boxes[i].top+boxes[i].height/2;
  const top=cy(0),bottom=cy(n-1),middle=(top+bottom)/2;
  const targets={upper:{y:top,expectedRegion:'upper'},center:{y:middle,expectedRegion:'boundary'},lower:{y:bottom,expectedRegion:'lower'},
    check_upper:{y:cy(1),expectedRegion:'upper'},check_lower:{y:cy(n-2),expectedRegion:'lower'},
    boundary_upper:{y:middle-layout.lineHeightPx/2,expectedRegion:'boundary'},
    boundary_lower:{y:middle+layout.lineHeightPx/2,expectedRegion:'boundary'}};
  const order=kind==='calibration'?['upper','center','lower','lower','upper','center','center','lower','upper']:
    ['check_lower','check_upper','boundary_upper','boundary_lower','check_upper','boundary_lower','check_lower','boundary_upper','boundary_lower','check_lower','boundary_upper','check_upper'];
  return {version:VERTICAL_VERSION,kind,durationMs:order.length*STAGE_MS,stageMs:STAGE_MS,settleMs:SETTLE_MS,
    bodyTop:boxes[0].top,bodyBottom:boxes.at(-1).top+boxes.at(-1).height,
    midY:middle,abstainHalfWidthPx:layout.lineHeightPx/2,
    positionPolicy:'actual_text_height_inside_centered_A_reference_canvas',
    groundTruth:'instructed target; actual fixation not independently verified',
    stages:order.map((key,index)=>({index,key,...targets[key],x:boxes[0].left+layout.targetWidth/2,
      startMs:index*STAGE_MS,endMs:(index+1)*STAGE_MS}))};
}
export function summarizeVisits(frames,protocol){
  return protocol.stages.map(stage=>{
    const rows=frames.filter(r=>r.stageIndex===stage.index&&r.settled);
    const usable=rows.filter(r=>r.eyeValid&&Number.isFinite(r.meanV));
    const v=median(usable.map(r=>r.meanV));
    return {stageIndex:stage.index,targetKey:stage.key,targetRelativeY:stage.y,expectedRegion:stage.expectedRegion,
      total:rows.length,usable:usable.length,validRatio:rows.length?usable.length/rows.length:0,
      medianV:v,noiseSigma:v===null?null:1.4826*median(usable.map(r=>Math.abs(r.meanV-v))),
      spanMs:usable.length>1?usable.at(-1).tMs-usable[0].tMs:0,
      maxGapMs:Math.max(0,...usable.slice(1).map((r,i)=>r.tMs-usable[i].tMs)),
      faceWarnings:usable.filter(r=>r.faceChanged).length};
  });
}
export function fitVertical(frames,protocol){
  if(protocol.kind!=='calibration')throw new Error('검증 표적으로 기준을 학습하지 않습니다.');
  const visits=summarizeVisits(frames,protocol),reasons=[];
  if(visits.some(v=>v.usable<24||v.validRatio<.7||v.spanMs<1000||v.maxGapMs>300))reasons.push('표적별 유효 기록/연속성 부족');
  const top=median(visits.filter(v=>v.targetKey==='upper').map(v=>v.medianV));
  const bottom=median(visits.filter(v=>v.targetKey==='lower').map(v=>v.medianV));
  const span=top===null||bottom===null?null:Math.abs(bottom-top);
  const noise=Math.max(0,...visits.map(v=>v.noiseSigma??Infinity));
  if(span===null||span<.002||span<4*noise)reasons.push('상하 변화와 잡음을 구분하기 어려움');
  const xs=visits.map(v=>v.medianV),ys=visits.map(v=>v.targetRelativeY);
  let slope=null,intercept=null;
  if(xs.every(Number.isFinite)){
    const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
    const den=xs.reduce((a,x)=>a+(x-mx)**2,0);
    if(den>1e-12){slope=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/den;intercept=my-slope*mx;}
  }
  if(!Number.isFinite(slope)||!Number.isFinite(intercept))reasons.push('상하 관계를 계산할 수 없음');
  return {version:VERTICAL_VERSION,accepted:reasons.length===0,reasons,visits,span,noiseSigma:noise,
    model:reasons.length?null:{feature:'mean_eye_axis_v',slope,intercept,midY:protocol.midY,
      abstainHalfWidthPx:protocol.abstainHalfWidthPx,bodyTop:protocol.bodyTop,bodyBottom:protocol.bodyBottom},
    policy:{minUsablePerVisit:24,minValidRatio:.7,minSpanMs:1000,maxGapMs:300,minSignalSpan:.002,minSpanNoiseRatio:4},
    interpretation:'fit availability only; not validated accuracy; experimental thresholds',
    screenMappingValidated:false};
}
// 검증 표적의 정답 라벨·좌표는 예측 함수에 전달하지 않는다.
export function predictVertical(meanV,model){
  if(!model||!Number.isFinite(meanV))return {region:'unknown',relativeY:null,reason:'no_measurement_or_model'};
  const relativeY=model.slope*meanV+model.intercept;
  if(!Number.isFinite(relativeY)||relativeY<model.bodyTop-26||relativeY>model.bodyBottom+26)
    return {region:'unknown',relativeY:Number.isFinite(relativeY)?relativeY:null,reason:'outside_reference_range'};
  const region=relativeY<model.midY-model.abstainHalfWidthPx?'upper':relativeY>model.midY+model.abstainHalfWidthPx?'lower':'unknown';
  return {region,relativeY,reason:region==='unknown'?'near_boundary':'experimental_estimate'};
}
export function evaluateVertical(frames,protocol,profile){
  const visits=summarizeVisits(frames,protocol).map(v=>({...v,prediction:predictVertical(v.medianV,profile?.model)}));
  const scored=visits.filter(v=>v.expectedRegion!=='boundary');
  return {version:VERTICAL_VERSION,visits,scoredVisits:scored.length,
    matchedVisits:scored.filter(v=>v.prediction.region===v.expectedRegion).length,
    wrongVisits:scored.filter(v=>v.prediction.region!=='unknown'&&v.prediction.region!==v.expectedRegion).length,
    unknownVisits:scored.filter(v=>v.prediction.region==='unknown').length,
    boundaryVisits:visits.filter(v=>v.expectedRegion==='boundary').length,
    interpretation:'visit medians at held-out instructed target positions; not true gaze accuracy; boundary visits reported separately'};
}
