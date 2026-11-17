// Uses only observed stable content IDs and registry. No instructed outcomes or click state.
export function pageLedger(pages,observedIds){
 const entries=Array.isArray(pages)?pages:[],seen=new Set(observedIds??[]),all=entries.flatMap(p=>p.contentIds??[]),known=new Set(all),issues=[];
 if(!entries.length||entries.some(p=>!p.id||!Array.isArray(p.contentIds)||!p.contentIds.length)||new Set(entries.map(p=>p.id)).size!==entries.length||known.size!==all.length)issues.push('invalid_registry');
 const unknownIds=[...seen].filter(id=>!known.has(id));if(unknownIds.length)issues.push('unknown_content');
 const summary=entries.map(p=>{const observed=(p.contentIds??[]).filter(id=>seen.has(id));return {pageId:p.id,label:p.label,observedIds:observed,observedCount:observed.length,requiredCount:p.contentIds?.length??0,criteriaMet:!!p.contentIds?.length&&observed.length===p.contentIds.length};});
 return {pages:summary,unknownIds,valid:issues.length===0,issues,allPagesMeetCriteria:issues.length===0&&summary.length>0&&summary.every(p=>p.criteriaMet),meaning:'required horizontal observation units;not actual read fraction'};
}
export function previewGate({completed,ledger,anchorsReady,modelValid,layoutValid}){
 return {enabled:completed===true&&ledger?.valid===true&&ledger?.allPagesMeetCriteria===true&&anchorsReady===true&&modelValid===true&&layoutValid===true,kind:'test-only-button-no-signature',ledger,completed:completed===true,anchorsReady:anchorsReady===true,modelValid:modelValid===true,layoutValid:layoutValid===true};
}
