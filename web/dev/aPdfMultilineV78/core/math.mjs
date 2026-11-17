// SPDX-License-Identifier: GPL-3.0-or-later
export const finite=Number.isFinite;
export function median(xs){const a=xs.filter(finite).sort((a,b)=>a-b),n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:null;}
export function mad(xs){const m=median(xs);return m===null?null:median(xs.filter(finite).map(x=>Math.abs(x-m)));}
export function intervalQuality(rows,start,end,key){
 const all=rows.filter(r=>r.tMs>=start&&r.tMs<end).sort((a,b)=>a.tMs-b.tMs);
 const good=r=>r.sourceValid===true&&r.diagnosticsLinked===true&&r.eyeGeometryAvailable===true&&finite(r[key]);
 const usable=all.filter(good);let validMs=0,maxGapMs=0;
 for(let i=1;i<all.length;i++){const dt=all[i].tMs-all[i-1].tMs;maxGapMs=Math.max(maxGapMs,dt);if(dt>0&&dt<=200&&good(all[i-1])&&good(all[i]))validMs+=dt;}
 const span=end-start,coverage=span>0?validMs/span:0;
 return {median:median(usable.map(r=>r[key])),mad:mad(usable.map(r=>r[key])),validFrames:usable.length,callbacks:all.length,validMs,coverage,maxGapMs,
  usable:usable.length>=6&&coverage>=.70};
}
// The same frozen scale is used for local and global reference arms.
// Calibration labels are training labels; test labels never enter this function.
export function fitLocalRule({up,upReference,down,downReference,centers}){
 if(![up,upReference,down,downReference,...centers].every(x=>x?.usable))return {ready:false,reason:'calibration_quality'};
 const dUp=up.median-upReference.median,dDown=down.median-downReference.median;
 const sign=Math.sign(dDown-dUp),noise=Math.max(...centers.map(x=>x.mad)),amp=Math.min(Math.abs(dUp),Math.abs(dDown));
 const threshold=Math.max(3*noise,.5*amp);
 const ready=sign!==0&&sign*dUp<0&&sign*dDown>0&&amp>0&&threshold<amp;
 return {ready,reason:ready?null:'calibration_separation',sign,threshold,dUp,dDown,noise,
  globalReference:median(centers.map(x=>x.median)),rule:'threshold=max(3*center MAD,0.5*min(calibration up/down magnitude)); frozen before test'};
}
export function predict(rule,probe,reference){
 if(!rule?.ready)return {prediction:'unknown',reason:rule?.reason??'no_calibration',delta:null};
 if(!probe?.usable||!reference?.usable)return {prediction:'unknown',reason:'window_quality',delta:null};
 const delta=rule.sign*(probe.median-reference.median);
 return {prediction:delta < -rule.threshold?'up':delta>rule.threshold?'down':'center',reason:null,delta};
}
export function summarizePredictions(rows){
 const out={trials:rows.length,classifiable:0,unknown:0,correct:0,falseMovement:0,missedMovement:0,wrongDirection:0};
 for(const r of rows){if(r.prediction==='unknown'){out.unknown++;continue;}out.classifiable++;
  if(r.prediction===r.expected)out.correct++;
  else if(r.expected==='center')out.falseMovement++;
  else if(r.prediction==='center')out.missedMovement++;
  else out.wrongDirection++;
 }
 return out;
}
export function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
 else if(c==='"'){if(field)throw new Error('CSV quote inside unquoted field');quoted=true;}
 else if(c===','){row.push(field);field='';}
 else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';}
 else field+=c;}
 if(quoted)throw new Error('CSV contains unterminated quotation');
 if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)return [];
 const headers=rows.shift();if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV columns');
 return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV row ${i+2} width mismatch`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export const asNumber=x=>x===''||x===null||x===undefined?null:Number.isFinite(Number(x))?Number(x):null;
export function toCsv(rows,columns){const cell=x=>{const s=x===undefined||x===null?'':String(x);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};return '\uFEFF'+[columns.join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';}
