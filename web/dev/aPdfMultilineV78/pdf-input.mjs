import {itemsToLines,linesToParagraphs,findImages} from './reference-c/reflow.mjs';
import {balancedRanges} from './text-balance.mjs';
export const PDF_POLICY='pdf-source-page/codepoint-range/multiline-regions/0.3.0';
const clean=s=>s.normalize('NFC').replace(/[ \t\u00a0]+/g,' ').trim();
export function splitPageTextGreedy(text,measure,maxWidth,minWidth=200){
 const chars=Array.from(text),ranges=[];let start=0;
 while(start<chars.length){
  while(start<chars.length&&/\s/.test(chars[start]))start++;
  if(start===chars.length)break;
  let end=start;
  while(end<chars.length&&measure(chars.slice(start,end+1).join('').replace(/\s+/g,' '))<=maxWidth)end++;
  if(end===start)throw new Error('한 글자의 폭이 읽기 영역을 넘습니다.');
  const paragraph=[];for(let k=start;k<end;k++)if(chars[k]==='\n'&&measure(chars.slice(start,k).join(''))>=minWidth)paragraph.push(k);
  if(paragraph.length)end=paragraph[0];
  else if(end<chars.length){let cut=end;while(cut>start&&!/\s/.test(chars[cut]))cut--;if(cut>start&&measure(chars.slice(start,cut).join(''))>=minWidth)end=cut;}
  ranges.push({start,end});start=end;
 }
 // A short final piece is merged or balanced with its predecessor when possible.
 if(ranges.length>1){const last=ranges.at(-1),prev=ranges.at(-2),asText=(s,e)=>chars.slice(s,e).join('').replace(/\s+/g,' ').trim();
  if(measure(asText(last.start,last.end))<minWidth){
   if(measure(asText(prev.start,last.end))<=maxWidth){prev.end=last.end;ranges.pop();}
   else{let best=null;for(let k=prev.start+1;k<last.end;k++){if(!/\s/.test(chars[k]))continue;const a=measure(asText(prev.start,k)),b=measure(asText(k,last.end));if(a>=minWidth&&b>=minWidth&&a<=maxWidth&&b<=maxWidth&&(!best||Math.abs(a-b)<best.diff))best={k,diff:Math.abs(a-b)};}if(best){prev.end=best.k;last.start=best.k;}}
  }
 }
 const units=ranges.map(r=>({...r,text:chars.slice(r.start,r.end).join('').replace(/\s+/g,' ').trim()}));
 if(units.map(u=>u.text).join('').replace(/\s/g,'')!==text.replace(/\s/g,''))throw new Error('추출 글과 분할 글의 연결이 일치하지 않습니다.');
 return units;
}
export function splitPageText(text,measure,maxWidth,minWidth=200){
 if(Array.from(text).length>5000)throw new Error('이번 시험은 한 원본 페이지의 추출 본문5000자 이하를 사용합니다.');
 const greedy=splitPageTextGreedy(text,measure,maxWidth,minWidth),widths=greedy.map(p=>measure(p.text));
 if(greedy.length<2||Math.min(...widths)>=Math.max(minWidth,Math.max(...widths)*.85))return greedy;
 const balanced=balancedRanges(text,measure,maxWidth,minWidth,greedy.flatMap(p=>[p.start,p.end]));
 if(!balanced)return greedy;
 if(balanced.map(p=>p.text).join('').replace(/\s/g,'')!==text.replace(/\s/g,''))throw new Error('균형 분할 뒤 본문 연결이 일치하지 않습니다.');
 return balanced;
}
export async function modelFromPdfDocument(pdfDoc,{fileSha256,fileName,measure,maxWidth,pdfjsOps,displayStyle=null}){
 if(pdfDoc.numPages>20)throw new Error('이번 시험본은 원본20쪽 이하 PDF를 사용합니다.');
 const sourcePages=[],views=[],pages=[],issues=[];
 for(let n=1;n<=pdfDoc.numPages;n++){
  const page=await pdfDoc.getPage(n),vp=page.getViewport({scale:1}),tc=await page.getTextContent();
  const lines=itemsToLines(tc.items,vp.height);
  if(lines.some(l=>l.row))issues.push(`원본${n}쪽: 표 영역이 있어 이번 측정 범위를 벗어납니다.`);
  const images=await findImages(page,pdfjsOps,vp.width,vp.height);if(images.length)issues.push(`원본${n}쪽: 그림 영역이 있어 이번 측정 범위를 벗어납니다.`);
  const left=lines.filter(l=>l.x1<vp.width/2-5),right=lines.filter(l=>l.x0>vp.width/2+5),aligned=ls=>ls.some(a=>ls.filter(b=>Math.abs(a.x0-b.x0)<2).length>=2);
  if(aligned(left)&&aligned(right))issues.push(`원본${n}쪽: 두 단 배치는 이번 시험에서 지원하지 않습니다.`);
  const paras=linesToParagraphs(lines,vp.width),text=paras.map(p=>clean(p.text)).filter(Boolean).join('\n');
  if(!text){issues.push(`원본${n}쪽: 선택 가능한 본문 텍스트가 없습니다.`);continue;}
  const rawLines=lines.map(l=>clean(l.t)).filter(Boolean); const selected=rawLines.every(t=>measure(t)>=200&&measure(t)<=maxWidth)?rawLines:null; const parts=selected?(()=>{let offset=0;return selected.map(t=>{const at=text.indexOf(t,offset);if(at<0)throw new Error('원본 줄과 추출 본문 연결을 확인할 수 없습니다.');offset=at+t.length;return {start:Array.from(text.slice(0,at)).length,end:Array.from(text.slice(0,offset)).length,text:t};});})():splitPageText(text,measure,maxWidth); if(parts.map(u=>u.text).join('').replace(/\s/g,'')!==text.replace(/\s/g,''))throw new Error('표시 줄과 원문 연결이 일치하지 않습니다.'); const blocks=[];for(let k=0;k<parts.length;k+=4){const a=parts.slice(k,k+4);blocks.push({start:a[0].start,end:a.at(-1).end,text:a.map(x=>x.text).join('\n'),lines:a.map(x=>({...x})),lineCount:a.length,requiredSweeps:Math.ceil(a.length*.8)});} const pageId='p'+n;
  const units=blocks.map(u=>({id:`${fileSha256}:p${n}:cp${u.start}-${u.end}`,text:u.text,lines:u.lines,lineCount:u.lineCount,requiredSweeps:u.requiredSweeps,sourcePage:n,sourceStart:u.start,sourceEnd:u.end}));
  units.forEach(u=>{if(u.lines.some(l=>measure(l.text)<200))issues.push(`원본${n}쪽: 너무 짧은 글 조각이 있어 현재 기준으로 측정하기 어렵습니다.`);});
  pages.push({id:pageId,label:`원본 ${n}쪽`,contentIds:units.map(u=>u.id)});sourcePages.push({sourcePage:n,text,units,extractedLineCount:lines.length,extractedParagraphCount:paras.length});
  for(let k=0;k<units.length;k+=2){
   const pair=units.slice(k,k+2).map((u,i)=>({...u,slot:i?'right':'left'}));
   if(pair.length===1)pair.push({id:`${fileSha256}:p${n}:padding`,text:'',slot:'right',isPadding:true,sourcePage:n});
   views.push({id:views.length?'p'+n+'-b'+(k/2+1):'normal',pageId,sourcePage:n,bundleIndex:k/2+1,units:pair});
  }
 }
 if(views.length&&views.every(v=>v.units[1].isPadding))issues.push('양쪽 기준을 준비할 만큼의 본문 길이가 부족합니다.');
 if(!views.length)throw new Error('측정할 본문을 찾지 못했습니다.');
 const widths=sourcePages.flatMap(p=>p.units.map(u=>Math.max(...u.lines.map(l=>measure(l.text)))));
 if(Math.min(...widths)<Math.max(...widths)*.85)issues.push('글 조각의 길이 차이가 큽니다. 이번 고정 위치 기준 시험은 길이가 비슷한 글 조각만 지원합니다.');
 if(views.length>40)issues.push('이번 첫 연결 시험은40묶음 이하 문서를 사용합니다.');
 const definition=JSON.stringify({policy:PDF_POLICY,maxWidth,displayStyle,pages:sourcePages.map(p=>({sourcePage:p.sourcePage,text:p.text,ranges:p.units.map(u=>[u.sourceStart,u.sourceEnd])}))}),definitionHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(definition)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 return {displayStyle,definitionHash,policyVersion:PDF_POLICY,fileName,fileSha256,documentId:`${fileSha256}:${definitionHash}`,maxWidth,sourcePageCount:pdfDoc.numPages,sourcePages,pages,views,issues:[...new Set(issues)],supported:issues.length===0};
}
export async function loadPdfFile(file,{measure,maxWidth,pdfjs=null,displayStyle=null}={}){
 if(file.size>20*1024*1024)throw new Error('이번 시험은20MB 이하 PDF를 사용합니다.');
 const bytes=new Uint8Array(await file.arrayBuffer()),hashBytes=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),fileSha256=[...hashBytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 const lib=pdfjs??await import('./vendor/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const assetDir=rel=>{const u=new URL(rel,import.meta.url);return typeof process!=='undefined'&&process.versions?.node?decodeURIComponent(u.pathname):u.href;};
 const task=lib.getDocument({data:bytes,cMapUrl:assetDir('./vendor/pdfjs/cmaps/'),cMapPacked:true,standardFontDataUrl:assetDir('./vendor/pdfjs/standard_fonts/'),isEvalSupported:false});
 let doc;try{doc=await task.promise;return await modelFromPdfDocument(doc,{fileSha256,fileName:file.name,measure,maxWidth,pdfjsOps:lib.OPS,displayStyle});}finally{if(doc)await doc.destroy();else await task.destroy?.();}
}
