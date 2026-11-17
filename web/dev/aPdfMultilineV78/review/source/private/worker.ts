import {PilotEngine} from './engine';
const engine=new PilotEngine();let chain=Promise.resolve();
self.onmessage=(e:MessageEvent)=>{
 const {id,type,payload}=e.data;
 chain=chain.then(async()=>{
  let result;
  if(type==='init')result=await engine.initialize(payload.baseUrl);
  else if(type==='step')result=await engine.step(payload.frame,payload.frameId,payload.captureTMs);
  else if(type==='accept')result=engine.accept(payload.frameId,payload.target);
  else if(type==='adapt')result=await engine.adapt(payload.targetIds,payload.viewport);
  else if(type==='audit')result=await engine.audit();
  else if(type==='close'){engine.close();result={closed:true};}
  else throw new Error('알 수 없는 작업 요청입니다.');
  self.postMessage({id,result});
 }).catch(error=>{self.postMessage({id,error:{message:String(error?.message??error),phase:engine.state}});});
};
