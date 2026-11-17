// Only user input routing. No observation or score is granted by this controller.
export function createReadingNavigation({state,finishTrial,beginTrial,clock=()=>performance.now(),debounceMs=250}){
 let held=false,handled=false,lastAccepted=-Infinity;
 function activate(expected,action,method){if(state()!==expected||clock()-lastAccepted<debounceMs)return false;const ok=action(method)===true;if(ok)lastAccepted=clock();return ok;}
 const next=(method='click')=>activate('trial',finishTrial,method),begin=(method='click')=>activate('instruction',beginTrial,method);
 const isSpace=e=>e.code==='Space'||e.key===' '||e.key==='Spacebar';
 function keydown(e){
  if(!isSpace(e)||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  if(!['trial','instruction'].includes(state()))return;
  e.preventDefault?.();handled=true;
  if(held||e.repeat)return;held=true;
  if(state()==='trial')next('space');else begin('space');
 }
 function keyup(e){if(!isSpace(e))return;if(handled)e.preventDefault?.();held=false;handled=false;}
 function reset(){held=false;handled=false;}
 return {next,begin,keydown,keyup,reset};
}
