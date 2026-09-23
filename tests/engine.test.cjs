const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync('apps-script/Engine.gs','utf8'),context);
const {DEFAULTS:c,scorePlayer,ownerAt,keeperPick,draftState,evaluate}=context.module.exports;
test('custom scoring includes defense and shorthanded bonuses',()=>{
 assert.equal(scorePlayer({name:'D',group:'D',stats:{G:10,A:20,BLK:100,PIM:40,SHP:2}},c),122);
 assert.equal(scorePlayer({name:'G',group:'G',stats:{W:30,SO:5,GA:120,SV:1500}},c),235);
});
test('names-only keepers exclude players without reserving picks',()=>{
 assert.equal(ownerAt(12,12),12);assert.equal(ownerAt(13,12),12);assert.equal(ownerAt(24,12),1);
 const ids=new Set(['k','a']);
 const state=draftState(c,[{id:'k'}],[],ids);
 assert.equal(state.current,1);assert.equal(state.next,24);assert.equal(state.opponents,22);assert.ok(state.removed.has('k'));
 assert.equal(draftState(c,[{id:'k'}],[{pick:3,id:'a'}],ids).current,2);
 assert.throws(()=>draftState(c,[{id:'unknown'}],[],ids));
});
test('fixed PAN wait stays 22 at consecutive own selections',()=>{
 const ids=new Set(Array.from({length:24},(_,i)=>String(i)));
 const log=Array.from({length:23},(_,i)=>({pick:i+1,id:String(i)}));
 const state=draftState(c,[],log,ids);
 assert.equal(state.current,24);assert.equal(state.next,25);assert.equal(state.opponents,22);
});
const skater={G:10,A:0,BLK:0,PIM:0,SHP:0};
function pool(){return ['F','D','G'].flatMap(group=>[1,2,3,4].map(i=>({id:group+i,name:group+i,group,pos:group==='F'?'C,LW,RW':group,adp:i*3,stats:group==='G'?{W:10-i,SO:0,GA:0,SV:0}:{...skater,G:10-i}})));}
test('replacement remains fixed after draft',()=>{
 const cfg={...c,replacementF:3,replacementD:3,replacementG:3};
 const p=pool();p[0].adp=null;
 const x=evaluate(p,cfg,{removed:new Set(['F2']),current:1,next:24,opponents:2});
 assert.equal(x.baselines.F,21);assert.equal(x.available.length,11);
 const state=draftState(cfg,[{id:'F1'},{id:'D1'}],[{pick:1,id:'F2'},{pick:2,id:'D2'}],new Set(p.map(x=>x.id)));
 const after=evaluate(p,cfg,state),before=evaluate(p,cfg,{removed:new Set()});
 assert.deepEqual(after.baselines,before.baselines);
 assert.equal(after.available.length,8);
});
test('shared forward baseline does not depend on forward eligibility',()=>{
 const p=pool();p.find(x=>x.id==='F1').pos='C,LW';p.find(x=>x.id==='F2').pos='C';p.find(x=>x.id==='F3').pos='LW';p.find(x=>x.id==='F4').pos='RW';
 const cfg={...c,replacementF:3,replacementD:3,replacementG:3};
 const x=evaluate(p,cfg,{removed:new Set(),current:1,next:null});
 assert.equal(x.baselines.F,21);assert.equal(x.baselines.C,undefined);
 assert.equal(x.available.find(p=>p.id==='F1').par,6);
 p[0].pos='';const missing=evaluate(p,cfg,{removed:new Set(),current:1,next:null});
 assert.equal(missing.available.find(p=>p.id==='F1').par,6);
 assert.equal(missing.baselines.F,21);
 const changed=evaluate(p,{...cfg,replacementF:4},{removed:new Set()});
 assert.equal(changed.available.find(p=>p.id==='F1').par,9);
 for(const pos of ['D','G'])assert.equal(changed.baselines[pos],missing.baselines[pos]);
});
test('forward replacement rank validates inputs and leaves undersized pools unavailable',()=>{
 assert.equal(c.replacementF,80);assert.equal(c.replacementD,35);
 assert.equal(evaluate(pool(),c,{removed:new Set()}).baselines.F,null);
 for(const rank of [0,-1,1.5,NaN])assert.throws(()=>evaluate(pool(),{...c,replacementF:rank},{removed:new Set()}),/Replacement rank must be a positive integer/);
});
