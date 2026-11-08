// A 소유. 인과적(미래 프레임을 사용하지 않는) 줄바꿈 후보 검출기.
// 화면 오른쪽으로 진행한 뒤 왼쪽으로 돌아오는 수평 이동을 찾는다.
// 수직 위치·실제 줄 번호·문장 이해는 확인하지 않는다.
import { CONTRACT_VERSION, EVENT_TYPES, validateSample } from './contracts.js';
import { missingDetectorKeys } from './config.js';
export const IS_MOCK = false;
export const ALGORITHM_VERSION = 'return-sweep/0.1.0-pilot2';

export function createMovementDetector({config = {}} = {}) {
  const c = {...config}, missing = missingDetectorKeys(c), errors=[];
  for(const k of ['minAmplitudeX','minDurationMs','maxDurationMs','refractoryMs','maxFrameGapMs'])
    if(!Number.isFinite(c[k]) || c[k]<=0) errors.push(k);
  if(![-1,1].includes(c.directionSign))errors.push('directionSign');
  if(c.minDurationMs>c.maxDurationMs)errors.push('durationOrder');
  if(!Number.isFinite(c.smoothingWindowMs)||c.smoothingWindowMs<0)errors.push('smoothingWindowMs');
  if(typeof c.detectorVersion!=='string'||!c.detectorVersion)errors.push('detectorVersion');
  const configured=missing.length===0&&errors.length===0;
  let context=null,lastT=null,buffer=[],valley=null,peak=null,armed=false,lastEmit=-Infinity;
  let returnStart=null;
  let eventsEmitted=0,breaks=0,lastBreakReason=null,lastEvent=null;
  const counters=new Map();
  function clear(reason){
    buffer=[];valley=null;peak=null;armed=false;lastT=null;lastEmit=-Infinity;returnStart=null;
    breaks++;lastBreakReason=reason;
  }
  function seed(x,t){returnStart=null;valley={x,t};peak={x,t};armed=false;}
  return {
    push({sample:s,pageId,segmentId}={}){
      if(!configured)return [];
      if(!s||validateSample(s).length||!s.valid||
         !Number.isInteger(pageId)||pageId<1||typeof segmentId!=='string'||!segmentId||
         typeof s.sessionId!=='string'||!s.sessionId||
         ![s.leftIrisX,s.rightIrisX].every(v=>Number.isFinite(v)&&v>=0&&v<=1)){
        clear('invalid_sample_or_context');return [];
      }
      const key=JSON.stringify([s.sessionId,pageId,segmentId]);
      if(key!==context){clear('context_change');context=key;}
      if(lastT!==null&&(s.tMs<=lastT||s.tMs-lastT>c.maxFrameGapMs)){
        clear('timestamp_or_gap');
      }
      const previousT=lastT;lastT=s.tMs;
      const raw=c.directionSign*(s.leftIrisX+s.rightIrisX)/2;
      buffer.push({x:raw,t:s.tMs});
      buffer=buffer.filter(p=>s.tMs-p.t<=c.smoothingWindowMs);
      const xs=buffer.map(p=>p.x).sort((a,b)=>a-b),n=xs.length;
      const x=n%2?xs[(n-1)/2]:(xs[n/2-1]+xs[n/2])/2;
      if(!valley){seed(x,s.tMs);return [];}
      if(s.tMs-lastEmit<c.refractoryMs){seed(x,s.tMs);return [];}
      if(!armed){
        if(x<=valley.x){valley={x,t:s.tMs};peak={x,t:s.tMs};}
        if(x>peak.x)peak={x,t:s.tMs};
        if(x-valley.x>=c.minAmplitudeX&&s.tMs-valley.t>=c.minDurationMs){
          armed=true;peak={x,t:s.tMs};
        }
        return [];
      }
      if(x>=peak.x){peak={x,t:s.tMs};returnStart=null;return [];}
      const amplitude=peak.x-x;
      // 최고점에서 머무른 시간을 복귀 이동 시간에 포함하지 않는다.
      if(returnStart===null){
        if(amplitude<c.minAmplitudeX*.2)return [];
        returnStart=previousT??s.tMs;
      }
      const duration=s.tMs-returnStart;
      if(duration>c.maxDurationMs){seed(x,s.tMs);return [];}
      if(amplitude<c.minAmplitudeX||duration<c.minDurationMs)return [];
      const count=(counters.get(s.sessionId)||0)+1;counters.set(s.sessionId,count);
      const event={contractVersion:CONTRACT_VERSION,sessionId:s.sessionId,
        eventId:s.sessionId+':event:'+count,pageId,segmentId,tMs:s.tMs,
        type:EVENT_TYPES.RETURN_SWEEP_CANDIDATE,amplitudeX:amplitude,
        durationMs:duration,detectorVersion:c.detectorVersion};
      lastEmit=s.tMs;eventsEmitted++;lastEvent={...event};seed(x,s.tMs);
      return [event];
    },
    // reset은 구간 이력만 지우며 같은 세션의 eventId를 재사용하지 않는다.
    reset(){clear('explicit_reset');context=null;},
    getDiagnostics(){return {mock:false,algorithmVersion:ALGORITHM_VERSION,
      configured,missingKeys:missing,configErrors:[...new Set(errors)],
      config:{...c},eventsEmitted,historyBreaks:breaks,lastBreakReason,lastEvent,
      requiresPriorRightwardExcursion:true,returnOnsetFraction:0.2,durationDefinition:'from first meaningful leftward change, excludes preceding dwell',verticalMovementChecked:false,
      readingAccuracyValidated:false};}
  };
}
