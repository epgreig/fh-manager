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
test('snake turns and keeper costs',()=>{
 assert.equal(ownerAt(12,12),12);assert.equal(ownerAt(13,12),12);assert.equal(ownerAt(24,12),1);
 assert.equal(keeperPick(2,1,12),24);
 const state=draftState(c,[{id:'k',team:1,round:2}],[],new Set(['k']));
 assert.equal(state.next,25);assert.equal(state.opponents,22);
});
test('keepers skipped automatically and duplicate costs rejected',()=>{
 const ids=new Set(['a','b']);
 assert.equal(draftState(c,[{id:'a',team:1,round:1}],[],ids).current,2);
 assert.throws(()=>draftState(c,[{id:'a',team:1,round:1},{id:'b',team:1,round:1}],[],ids));
 assert.throws(()=>draftState(c,[],[{pick:1,id:'a'},{pick:2,id:'a'}],ids));
});
const skater={G:10,A:0,BLK:0,PIM:0,SHP:0};
function pool(){return ['F','D','G'].flatMap(group=>[1,2,3,4].map(i=>({id:group+i,name:group+i,group,adp:i*3,stats:group==='G'?{W:10-i,SO:0,GA:0,SV:0}:{...skater,G:10-i}})));}
test('replacement remains fixed after draft; missing ADP gates PAN',()=>{
 const cfg={...c,replacementF:3,replacementD:3,replacementG:3,simulations:2};
 const p=pool();p[0].adp=null;
 const x=evaluate(p,cfg,{removed:new Set(['F2']),current:1,next:24,opponents:2});
 assert.equal(x.baselines.F,21);assert.equal(x.panReady,false);assert.equal(x.available.length,11);
});
test('PAN zero-noise case removes candidate before opponent picks',()=>{
 const cfg={...c,replacementF:3,replacementD:3,replacementG:3,simulations:2,adpSigma:0,nextAlternatives:1};
 const x=evaluate(pool(),cfg,{removed:new Set(),current:1,next:3,opponents:1});
 assert.equal(x.available.find(p=>p.id==='F1').pan,3);
 assert.equal(x.panReady,true);
});
