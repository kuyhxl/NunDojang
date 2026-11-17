// Physical slot geometry is separate from content identity. No task answers enter these helpers.
export function buildLayouts(referenceUnits,contents){
 const forOrder=order=>referenceUnits.map(u=>{const c=order[u.slot==='left'?0:1],m=u.geometryMeasurements?.find(g=>g.contentId===c.id);return {...u,contentId:c.id,text:c.text,lineCount:c.lineCount,requiredSweeps:c.requiredSweeps,lines:c.lines,isPadding:c.isPadding===true,sourcePage:c.sourcePage??null,sourceStart:c.sourceStart??null,sourceEnd:c.sourceEnd??null,actualTextX0:m?.x0??u.x0,actualTextX1:m?.x1??u.x1};});
 return {normal:forOrder(contents),swapped:forOrder([...contents].reverse())};
}
export function unitsForTrial(plan,trialId){const trial=plan.trials.find(t=>t.id===trialId);if(!trial)throw new Error('회차 배치를 찾을 수 없습니다.');const units=plan.layouts?.[trial.layoutId??'normal']??plan.units;if(!Array.isArray(units)||units.length!==2)throw new Error('두 글의 배치가 필요합니다.');return units;}
export function anchorsForLayout(units,fit){if(!fit?.ready)throw new Error('개인 기준 준비가 필요합니다.');return units.map(u=>{const a=fit.units.find(a=>a.slot===u.slot);if(!a?.ready)throw new Error('해당 화면 위치의 개인 기준이 없습니다.');return {...u,anchorLeftX:a.leftCut,anchorRightX:a.rightCut};});}
