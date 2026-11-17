import {SETTINGS} from './protocol.mjs';
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?(b[Math.floor((b.length-1)/2)]+b[Math.ceil((b.length-1)/2)])/2:null;};
// Deliberately has no instructed target, trial type, expected order, or Y input.
export class HorizontalDetector{
 constructor(units,config=SETTINGS){if(units.length!==2||units.some(u=>![u.x0,u.x1,u.regionMinX,u.regionMaxX].every(Number.isFinite)||u.regionMinX>u.x0||u.regionMaxX<u.x1||u.regionMinX<0)||new Set(units.map(u=>u.contentId)).size!==2)throw new Error('내용 영역과 글자 영역을 구분한 두 글의 배치가 필요합니다.');const sorted=[...units].sort((a,b)=>a.regionMinX-b.regionMinX);if(sorted[0].regionMaxX>=sorted[1].regionMinX)throw new Error('두 내용 영역은 겹칠 수 없습니다.');if(units.some(u=>(u.anchorLeftX!==undefined||u.anchorRightX!==undefined)&&(![u.anchorLeftX,u.anchorRightX].every(Number.isFinite)||u.anchorLeftX>=u.anchorRightX||u.anchorLeftX<u.regionMinX||u.anchorRightX>u.regionMaxX)))throw new Error('개인 기준의 순서나 범위가 올바르지 않습니다.');this.units=units.map(u=>({...u}));this.config={...config};this.lastFrame=-1;this.lastT=-Infinity;this.documentSeen=new Set();this.documentCounts=new Map();this.clearTrial();}
 clearTrial(){this.regionSeen=new Set();this.trialCounts=new Map();this.sweepSeen=new Set();this.history=[];this.active=null;this.outsideSince=null;this.lastValidT=null;this.previousValid=false;}
 clearCandidate(){this.active=null;this.history=[];this.outsideSince=null;this.lastValidT=null;this.previousValid=false;}
 reset(){this.clearTrial();}
 push({frameId,tMs,x,valid}){
  const events=[];const out={events,contentId:null,slot:null,segment:null,x:null,state:'unknown'};
  if(!Number.isFinite(frameId)||frameId<=this.lastFrame||!Number.isFinite(tMs)||tMs<=this.lastT)return {...out,state:'duplicate_or_nonmonotonic'};
  const gap=tMs-this.lastT;this.lastFrame=frameId;this.lastT=tMs;
  if(gap>this.config.maxGapMs)this.clearCandidate();
  if(!valid||!Number.isFinite(x)){
   this.history=[];if(this.lastValidT!==null&&tMs-this.lastValidT>this.config.maxGapMs)this.clearCandidate();
   return {...out,state:'invalid'};
  }
  this.history.push(x);if(this.history.length>this.config.medianWindow)this.history.shift();
  const sx=median(this.history);out.x=sx;
  const matches=this.units.filter(u=>sx>=u.regionMinX&&sx<=u.regionMaxX);
  if(matches.length!==1){
   this.previousValid=false;
   if(this.outsideSince===null)this.outsideSince=tMs;
   if(tMs-this.outsideSince>=this.config.maxOutOfRegionMs)this.clearCandidate();
   return {...out,state:'outside_or_ambiguous'};
  }
  this.outsideSince=null;const u=matches[0],q=(sx-u.x0)/(u.x1-u.x0),personal=Number.isFinite(u.anchorLeftX)&&Number.isFinite(u.anchorRightX),segment=personal?(sx<=u.anchorLeftX?'left':sx>=u.anchorRightX?'right':'middle'):(q<=this.config.leftThird?'left':q>=this.config.rightThird?'right':'middle');
  Object.assign(out,{contentId:u.contentId,slot:u.slot,segment,state:'region'});
  if(!this.active||this.active.id!==u.contentId){this.active={id:u.contentId,slot:u.slot,regionStart:tMs,regionValidMs:0,frames:0,state:'idle',segment:null,segmentStart:tMs,segmentFrames:0};this.history=[x];this.lastValidT=null;this.previousValid=false;}
  const a=this.active,dt=this.lastValidT===null?0:tMs-this.lastValidT;
  const consecutive=dt>0&&dt<=this.config.maxGapMs&&gap<=this.config.maxGapMs;
  // A missing/invalid frame contributes no valid duration.
  const adjacent=consecutive&&this.previousValid===true;
  if(adjacent)a.regionValidMs+=dt;a.frames++;
  if(!this.regionSeen.has(a.id)&&a.regionValidMs>=this.config.presenceDwellMs&&a.frames>=this.config.presenceMinSamples){this.regionSeen.add(a.id);events.push({type:'region_observed',contentId:a.id,slot:a.slot});}
  if(a.sweepStart!==undefined&&tMs-a.sweepStart>this.config.maxSweepMs){a.state='idle';delete a.sweepStart;}
  if(segment!==a.segment||!adjacent){a.segment=segment;a.segmentStart=tMs;a.segmentFrames=1;}else a.segmentFrames++;
  const dwellMs=segment==='right'?(this.config.endDwellMs??this.config.anchorDwellMs):this.config.anchorDwellMs,minimumSamples=segment==='right'?(this.config.endMinSamples??this.config.anchorMinSamples):this.config.anchorMinSamples;
  const held=tMs-a.segmentStart>=dwellMs&&a.segmentFrames>=minimumSamples;
  // Brief endpoint uses two actual current filtered coordinates, never a median carried over after departure.
  const endCut=personal?u.anchorRightX:u.x0+(u.x1-u.x0)*this.config.rightThird,currentAtEnd=x>=endCut&&x>=u.regionMinX&&x<=u.regionMaxX;
  if(!currentAtEnd){a.endStart=null;a.endFrames=0;}else if(!adjacent||a.endStart==null){a.endStart=tMs;a.endFrames=1;}else a.endFrames++;
  const endHeld=this.config.endUsesCurrentX?currentAtEnd&&a.endFrames>=minimumSamples&&tMs-a.endStart>=dwellMs:held;
  if(segment==='left'&&held&&a.state==='idle'){
   a.state='left';a.sweepStart=a.segmentStart;a.sweepValidMs=tMs-a.segmentStart;a.sweepFrames=a.segmentFrames;
  }else if(a.sweepStart!==undefined&&a.state!=='idle'){
   if(adjacent)a.sweepValidMs+=dt;a.sweepFrames++;
   if(segment==='middle'&&a.state==='left')a.state='middle';
   if(segment==='left'&&held&&a.state==='middle'){
    a.state='left';a.sweepStart=a.segmentStart;a.sweepValidMs=tMs-a.segmentStart;a.sweepFrames=a.segmentFrames;
   }
   if(segment==='right'&&endHeld&&a.state==='middle'){
    const duration=tMs-a.sweepStart,coverage=duration>0?a.sweepValidMs/duration:0;
    if(duration>=this.config.minSweepMs&&duration<=this.config.maxSweepMs&&coverage>=this.config.minimumValidCoverage){
     const required=Math.max(1,u.requiredSweeps??1),count=(this.trialCounts.get(a.id)??0)+1;this.trialCounts.set(a.id,count);const before=this.documentCounts.get(a.id)??0,credited=Math.min(required,before+1);this.documentCounts.set(a.id,credited);const repeat=count>1,newDocument=!this.documentSeen.has(a.id)&&credited>=required;
     if(count>=required)this.sweepSeen.add(a.id);if(credited>=required)this.documentSeen.add(a.id);events.push({type:repeat?'repeat_sweep_observed':'sweep_observed',contentId:a.id,slot:a.slot,startMs:a.sweepStart,endMs:tMs,durationMs:duration,validCoverage:coverage,newInTrial:count===required,newInDocument:newDocument,rawSweepOrdinal:count,requiredSweeps:required,creditedSweeps:credited,criterionMet:credited>=required});
     a.state='idle';delete a.sweepStart;
    }
   }
  }
  this.lastValidT=tMs;this.previousValid=true;out.state=a.state;return out;
 }
 consume(row){if(!row.valid)this.previousValid=false;return this.push(row);}
 snapshot(){return {trialSweepCounts:Object.fromEntries(this.trialCounts),documentCreditedCounts:Object.fromEntries(this.documentCounts),regionObservedIds:[...this.regionSeen],sweepObservedIds:[...this.sweepSeen],documentSweepObservedIds:[...this.documentSeen]};}
}

// Rebind only between trials. Preserve document IDs and global frame ordering, never candidate fragments.
export function rebindDetector(previous,units,config){
 const next=new HorizontalDetector(units,config);
 if(previous){next.documentSeen=new Set(previous.documentSeen);next.documentCounts=new Map(previous.documentCounts);next.lastFrame=previous.lastFrame;next.lastT=previous.lastT;}
 return next;
}
