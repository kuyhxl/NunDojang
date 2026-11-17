// Frozen feature-to-gaze mapping. Candidate selection sees preparation training rows only.
export const RIDGE_POLICY=Object.freeze({version:'eye-feature-ridge/0.1.0',lambdas:[.0001,.001,.01,.1,1,10],stdFloor:.0001,
 selection:'leave-one-calibration-target-out;mean squared2D CSS error;larger lambda on ties',expectedTraining:54,expectedTargets:9});
const finite=a=>Array.isArray(a)&&a.length>0&&a.every(Number.isFinite);
function solveSPD(a,b){
 const n=a.length,l=Array.from({length:n},()=>Array(n).fill(0));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let s=a[i][j];for(let k=0;k<j;k++)s-=l[i][k]*l[j][k];
  if(i===j){if(!(s>0)||!Number.isFinite(s))throw new Error('개인 기준 행렬 계산이 불안정합니다.');l[i][j]=Math.sqrt(s);}else l[i][j]=s/l[j][j];
 }
 const out=Array.from({length:n},()=>[0,0]);
 for(let c=0;c<2;c++){
  const y=Array(n).fill(0);for(let i=0;i<n;i++){let s=b[i][c];for(let k=0;k<i;k++)s-=l[i][k]*y[k];y[i]=s/l[i][i];}
  for(let i=n-1;i>=0;i--){let s=y[i];for(let k=i+1;k<n;k++)s-=l[k][i]*out[k][c];out[i][c]=s/l[i][i];}
 }
 return out;
}
export function fitRidge(rows,lambda){
 if(!Array.isArray(rows)||rows.length<4||!(lambda>0)||!Number.isFinite(lambda))throw new Error('개인 기준 학습 입력이 부족합니다.');
 const p=rows[0]?.features?.length,n=rows.length;
 if(!p||rows.some(r=>!finite(r.features)||r.features.length!==p||!finite(r.label)||r.label.length!==2))throw new Error('눈 특징 자료가 유효하지 않습니다.');
 const mean=Array(p).fill(0),scale=Array(p).fill(0),bias=[0,0],norm=Math.sqrt(p);
 for(const r of rows){for(let j=0;j<p;j++)mean[j]+=r.features[j]/n;bias[0]+=r.label[0]/n;bias[1]+=r.label[1]/n;}
 for(const r of rows)for(let j=0;j<p;j++)scale[j]+=(r.features[j]-mean[j])**2/n;
 for(let j=0;j<p;j++)scale[j]=Math.max(Math.sqrt(scale[j]),RIDGE_POLICY.stdFloor)*norm;
 const z=rows.map(r=>r.features.map((v,j)=>(v-mean[j])/scale[j]));
 const k=Array.from({length:n},()=>Array(n).fill(0));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=i===j?lambda:0;for(let d=0;d<p;d++)s+=z[i][d]*z[j][d];k[i][j]=k[j][i]=s;}
 const alpha=solveSPD(k,rows.map(r=>[r.label[0]-bias[0],r.label[1]-bias[1]]));
 const weights=Array.from({length:p},()=>[0,0]);for(let j=0;j<p;j++)for(let i=0;i<n;i++){weights[j][0]+=z[i][j]*alpha[i][0];weights[j][1]+=z[i][j]*alpha[i][1];}
 const model={version:RIDGE_POLICY.version,dimension:p,lambda,mean,scale,bias,weights};
 if(![...mean,...scale,...bias,...weights.flat()].every(Number.isFinite))throw new Error('개인 기준 계산에서 유효하지 않은 수치가 나왔습니다.');
 return model;
}
export function predictRidge(model,features){
 if(!finite(features)||features.length!==model.dimension)throw new Error('개인 기준 예측용 눈 특징이 유효하지 않습니다.');
 const y=[...model.bias];for(let j=0;j<features.length;j++){const z=(features[j]-model.mean[j])/model.scale[j];y[0]+=z*model.weights[j][0];y[1]+=z*model.weights[j][1];}
 if(!y.every(Number.isFinite))throw new Error('개인 기준 예측값이 유효하지 않습니다.');return y;
}
export function selectRidge(training,viewport){
 if(training.length!==RIDGE_POLICY.expectedTraining||training.some(r=>r.role!=='training'))throw new Error('개인 기준 선택에는 조정용54개만 사용합니다.');
 const ids=[...new Set(training.map(r=>r.targetId))];if(ids.length!==9||ids.some(id=>training.filter(r=>r.targetId===id).length!==6))throw new Error('개인 기준9점 구성이 올바르지 않습니다.');
 if(!viewport||![viewport.width,viewport.height].every(x=>Number.isFinite(x)&&x>0))throw new Error('화면 크기가 유효하지 않습니다.');
 const candidates=RIDGE_POLICY.lambdas.map(lambda=>{
  let squared=0,absY=0,count=0;const folds=[];
  for(const id of ids){
   const train=training.filter(r=>r.targetId!==id),test=training.filter(r=>r.targetId===id),model=fitRidge(train,lambda);let fold=0;
   for(const r of test){const p=predictRidge(model,r.features),dx=(p[0]-r.label[0])*viewport.width,dy=(p[1]-r.label[1])*viewport.height;
    fold+=dx*dx+dy*dy;absY+=Math.abs(dy);count++;}
   squared+=fold;folds.push({targetId:id,trainingFrames:train.length,omittedFrames:test.length,meanSquaredCssError:fold/test.length});
  }
  return {lambda,meanSquaredCssError:squared/count,meanAbsYCssPx:absY/count,frames:count,folds};
 });
 let best=candidates[0];for(const c of candidates.slice(1))if(c.meanSquaredCssError<=best.meanSquaredCssError+1e-9)best=c;
 return {model:fitRidge(training,best.lambda),selection:{policy:RIDGE_POLICY,trainingFrames:training.length,trainingTargets:ids,selectedLambda:best.lambda,candidates,
  heldOutCheckUsed:false,separateEvaluationUsed:false}};
}
export function encodeFeatures(values){
 if(!finite(values))return null;const bytes=new Uint8Array(values.length*4),dv=new DataView(bytes.buffer);
 values.forEach((v,i)=>dv.setFloat32(i*4,v,true));return btoa(String.fromCharCode(...bytes));
}
export function decodeFeatures(text){
 if(!text)return null;const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));if(bytes.length%4)throw new Error('눈 특징 기록 길이가 올바르지 않습니다.');
 const dv=new DataView(bytes.buffer);const out=Array.from({length:bytes.length/4},(_,i)=>dv.getFloat32(i*4,true));if(!finite(out))throw new Error('눈 특징 기록에 유효하지 않은 수치가 있습니다.');return out;
}
