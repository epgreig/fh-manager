const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Engine.gs','utf8')+'\nthis.c=DEFAULTS;',ctx);
test('Dom ranks compare source-only PAR with source-specific F/D/G replacement points',()=>{
 const players=[{id:'f',name:'F',group:'F'},{id:'f2',name:'F2',group:'F'},{id:'d',name:'D',group:'D'},{id:'g',name:'G',group:'G'},{id:'missing',group:'F'}];
 const rows=[['f','The Athletic',0,82,20,40,100,30,2],['d','The Athletic',12,82,20,40,100,30,2],
 ['g','The Athletic',12,60,'','','','','',32,4,150,1500],['f','DtZ',6,82,100,100,100,100,100],['f2','The Athletic',12,82,10,20,0,0,0]];
 const ranks=ctx.domProjectionRanks_(players,rows,{...ctx.c,replacementF:2,replacementD:1,replacementG:1});
 assert.equal(ranks.get('f'),1);assert.equal(ranks.get('d'),2);assert.equal(ranks.get('g'),2);
 assert.equal(ranks.has('missing'),false);
 const tie=ctx.domProjectionRanks_(players,rows,{...ctx.c,replacementD:1,replacementG:1,replacementF:1});
 assert.equal(tie.get('f'),1);assert.equal(tie.get('d'),1);assert.equal(tie.get('g'),1);assert.equal(tie.get('f2'),4);
 const missing=ctx.domProjectionRanks_(players,rows,ctx.c);
 assert.equal(missing.has('f'),false);assert.equal(missing.has('d'),false);assert.equal(missing.has('g'),false);
});
