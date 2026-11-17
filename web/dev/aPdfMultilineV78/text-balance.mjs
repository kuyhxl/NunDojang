// Content-preserving display partitioning, not a gaze detector or reading score.
export function balancedRanges(text,measure,maxWidth,minWidth=200,fallbackCuts=[]){
 const chars=Array.from(text),n=chars.length;if(!n)return [];
 const cuts=new Set([0,n,...fallbackCuts]);for(let i=1;i<n;i++)if(/\s/.test(chars[i-1])&&!/\s/.test(chars[i]))cuts.add(i);
 const positions=[...cuts].filter(i=>i>=0&&i<=n).sort((a,b)=>a-b),asText=(a,z)=>chars.slice(a,z).join('').replace(/\s+/g,' ').trim();
 const whole=measure(asText(0,n));if(whole<=maxWidth)return [{start:0,end:n,text:asText(0,n)}];
 const edges=positions.map(()=>[]);
 for(let i=0;i<positions.length-1;i++)for(let j=i+1;j<positions.length;j++){
  const value=asText(positions[i],positions[j]),w=measure(value);if(w>maxWidth)break;if(w>=minWidth)edges[i].push({j,w});
 }
 const firstK=Math.max(2,Math.ceil(whole/maxWidth)),lastK=Math.min(80,positions.length-1,Math.floor(whole/minWidth)+1),last=positions.length-1;
 for(let count=firstK;count<=lastK;count++){
  const target=whole/count,dp=Array.from({length:count+1},()=>new Map());dp[0].set(0,{cost:0,from:null});
  for(let k=0;k<count;k++)for(const [i,v]of dp[k])for(const edge of edges[i]){
   const cost=v.cost+(edge.w-target)**2,old=dp[k+1].get(edge.j);if(!old||cost<old.cost)dp[k+1].set(edge.j,{cost,from:i});
  }
  if(!dp[count].has(last))continue;
  const ranges=[];let at=last;for(let k=count;k>0;k--){const prior=dp[k].get(at).from;ranges.push({start:positions[prior],end:positions[at],text:asText(positions[prior],positions[at])});at=prior;}
  ranges.reverse();return ranges;
 }
 return null; // Keep unsupported status rather than discard a short tail.
}
