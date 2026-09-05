const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);for(const f of ['Engine','Names','Live'])vm.runInContext(fs.readFileSync('apps-script/'+f+'.gs','utf8'),ctx);
test('clearing log resets draft state while keeper picks stay occupied',()=>{
 const settings=[['teams',12],['draftSlot',1],['rounds',16]],ids=[['a','A'],['b','B']];
 assert.equal(ctx.FH_STATE(settings,[],[[1,1,'a']],ids)[0][0],2);
 assert.equal(ctx.FH_STATE(settings,[],[],ids)[0][0],1);
 assert.equal(ctx.FH_STATE(settings,[['A',1,1]],[],ids)[0][0],2);
});
test('missing ADP yields blank PAN without blocking board data',()=>{
 assert.equal(ctx.FH_PAN([['A',100,'','a','F',true]],[['simulations',2]],[[1,24,22]])[0][0],'');
});
