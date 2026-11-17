import test from 'node:test';
import assert from 'node:assert/strict';
import {HorizontalDetector,rebindDetector} from '../../detector.mjs';
import {pageLedger,previewGate} from '../../page-ledger.mjs';
import {checkpointWithFallback} from '../../anchors.mjs';
import {createReadingNavigation} from '../../navigation.mjs';
import {HorizontalRun} from '../../runner.mjs';
import {configurePdfModel,makePlan,TRIALS,SETTINGS,SAMPLE_COLUMNS} from '../../protocol.mjs';
const viewport={width:1440,height:783,dpr:2,scale:1,visualWidth:1440,visualHeight:783};
const ids=['p1-left','p1-right','p2-left','p2-right'];
const contents=ids.map((id,i)=>({id,slot:i%2?'right':'left',text:'synthetic line\n'.repeat(4).trim(),lineCount:4,requiredSweeps:4,sourcePage:i<2?1:2}));
const model={supported:true,sourcePageCount:2,documentId:'SYNTHETIC-DOCUMENT',views:[{id:'normal',pageId:'p1',units:contents.slice(0,2)},{id:'p2-b1',pageId:'p2',units:contents.slice(2)}],pages:[{id:'p1',label:'page1',contentIds:ids.slice(0,2)},{id:'p2',label:'page2',contentIds:ids.slice(2)}]};
const geometry=[{contentId:ids[0],slot:'left',x0:100,x1:600,y:399.5},{contentId:ids[1],slot:'right',x0:844,x1:1344,y:399.5}];
function plan(){configurePdfModel(model);return makePlan(viewport,geometry);}
function anchors(p){return {ready:true,units:p.units.map(u=>({...u,ready:true,leftCut:u.x0+160,rightCut:u.x0+340}))};}
function feedDetector(det,start=0,frame=0,n=4){let t=start;for(let k=0;k<n;k++)for(const x of [150,350,550])for(let i=0;i<4;i++)det.consume({frameId:++frame,tMs:t+=100,x,valid:true});return {t,frame};}
test('same-area repeats retain page/content identity; cannot fill another page',()=>{const p=plan(),fit=anchors(p);let d=new HorizontalDetector(p.units.map(u=>({...u,anchorLeftX:u.x0+160,anchorRightX:u.x0+340})));feedDetector(d,0,0,8);assert.equal(d.snapshot().trialSweepCounts[ids[0]],8);assert.deepEqual(pageLedger(p.pages,d.documentSeen).pages.map(p=>p.observedCount),[1,0]);});
test('unknown content IDs make the registry invalid',()=>{const p=plan();assert.equal(pageLedger(p.pages,new Set(['not-a-page'])).valid,false);});
test('duplicate frame IDs and backward timestamps grant no event',()=>{const p=plan(),d=new HorizontalDetector(p.units);d.consume({frameId:2,tMs:200,x:150,valid:true});for(const row of [{frameId:2,tMs:300},{frameId:3,tMs:100}])assert.equal(d.consume({...row,x:550,valid:true}).events.length,0);assert.deepEqual(d.snapshot().trialSweepCounts,{});});
test('rebind preserves document evidence and resets trial fragments',()=>{const p=plan(),d=new HorizontalDetector(p.units);feedDetector(d);const next=rebindDetector(d,p.layouts['p2-b1'],SETTINGS);assert.deepEqual(next.snapshot().trialSweepCounts,{});assert.ok(next.documentSeen.has(ids[0]));assert.equal(next.active,null);});
test('checkpoint fallback is per slot, and failure on both slots is explicit',()=>{const p=plan(),a=anchors(p),bad={...a,ready:false,units:a.units.map(u=>({...u,ready:false}))};assert.equal(checkpointWithFallback(bad,a).ready,false);const partial={...bad,units:[a.units[0],bad.units[1]]};const r=checkpointWithFallback(partial,a);assert.equal(r.ready,true);assert.equal(r.unitSources.right,'initial_six_points_fallback');});
test('click and Space navigation exclude repeat keys',()=>{let count=0;const n=createReadingNavigation({state:()=> 'instruction',clock:()=>1000,beginTrial:()=>{count++;return true;},finishTrial:()=>false});const e={code:'Space',preventDefault(){}};n.keydown(e);n.keydown({...e,repeat:true});n.keyup(e);assert.equal(count,1);});
test('prepared start grants no evidence, four trials use distinct page IDs, right marker is on right',()=>{
 const p=plan(),fit=anchors(p);let now=0,frame=0;
 const r=new HorizontalRun({clock:()=>now,viewport:()=>viewport});r.origin=0;r.plan=p;r.baseline=viewport;r.personalAnchors=fit;r.checkpointReady=true;
 const wanted=[[2,0],[2,0],[2,1],[2,2]];
 for(let i=0;i<4;i++){
  r.state='instruction';r.trialIndex=i;r.activeCheckpointFit={...fit,forTrialId:TRIALS[i].id};assert.equal(r.startTrial(),true);assert.equal(r.stage.target.x,i===3?856:112);const prior=JSON.stringify(r.checkpointDetector?.snapshot().documentCreditedCounts??{});
  for(let j=0;j<20;j++){now+=100;const c=r.context(++frame,now/1000);const out=r.receive({faceDetected:true,eyeState:'open',filtered:[0,0],adaptCalls:1,featureFitCalls:1},c);assert.equal(out.row.phase,'start_ready');assert.equal(out.row.checkpointDetectorState,undefined);assert.equal(out.accepted,false);r.tick();}
  assert.equal(r.state,'trial');assert.deepEqual(r.checkpointDetector.snapshot().trialSweepCounts,{});assert.equal(JSON.stringify(r.checkpointDetector.snapshot().documentCreditedCounts),prior);
  const actions=i===0?[['left',4],['right',4]]:i===3?[['right',4]]:[['left',8]];
  for(const [slot,n]of actions){const u=p.layouts[TRIALS[i].layoutId].find(u=>u.slot===slot);for(let k=0;k<n;k++)for(const x of [u.x0+50,u.x0+250,u.x0+450])for(let a=0;a<4;a++){now+=100;const c=r.context(++frame,now/1000);r.receive({faceDetected:true,eyeState:'open',filtered:[x/1440-.5,0],adaptCalls:1,featureFitCalls:1},c);}}
  assert.equal(r.endTrial(),true);assert.deepEqual(r.pageObservation().checkpoint.pages.map(p=>p.observedCount),wanted[i]);
 }
 assert.equal(r.trialResults.length,4);assert.equal(r.stage.checkTiming,'after');assert.equal(r.previewGate().enabled,false);assert.ok(SAMPLE_COLUMNS.includes('startMode'));
});
test('preview eligibility requires valid measurement state and every page',()=>{const p=plan(),full=pageLedger(p.pages,ids);const good={completed:true,ledger:full,anchorsReady:true,modelValid:true,layoutValid:true};assert.equal(previewGate(good).enabled,true);for(const key of ['completed','anchorsReady','modelValid','layoutValid'])assert.equal(previewGate({...good,[key]:false}).enabled,false);assert.equal(previewGate({...good,ledger:pageLedger(p.pages,ids.slice(0,3))}).enabled,false);});
