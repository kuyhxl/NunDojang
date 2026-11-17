// SPDX-License-Identifier: GPL-3.0-or-later
// The target uses innerWidth/innerHeight. Visual viewport width can change
// with scrollbar visibility and is retained for diagnostics, not exact equality.
export const VIEWPORT_CHECK_VERSION='layout-viewport/0.1.0';
export function viewportDifferences(before,after){
 const differences=[];
 for(const key of ['width','height','dpr','scale']){
  const fallback=(key==='dpr'||key==='scale')?1:NaN;
  const a=before?.[key]??fallback,b=after?.[key]??fallback;
  const tolerance=(key==='width'||key==='height')?0.5:1e-6;
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0||Math.abs(a-b)>tolerance)
   differences.push({key,before:Number.isFinite(a)?a:null,after:Number.isFinite(b)?b:null});
 }
 return differences;
}
