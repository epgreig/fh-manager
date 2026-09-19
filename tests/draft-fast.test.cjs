const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('repeated draft calls reuse identities but always reread log and keepers',()=>{
 const cache=new Map(),log=[],keepers=[];let playerReads=0;
 const selected=['Player A','','','','','','','','a'];
 const board={getName:()=> 'Board',getRange:()=>({getValues:()=>[selected]})};
 const playerSheet={getLastRow:()=>3,getRange:()=>({getValues:()=>{playerReads++;return [['a','Player A'],['b','Player B']];}})};
 const ctx={CacheService:{getDocumentCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
  SpreadsheetApp:{getActiveRange:()=>({getSheet:()=>board,getRow:()=>4,getColumn:()=>1,getNumRows:()=>1,getNumColumns:()=>1}),
   getActive:()=>({getSheetByName:n=>n==='Players'?playerSheet:{appendRow:r=>log.push(r)}})}};
 vm.createContext(ctx);for(const f of ['Engine','Names','Code'])vm.runInContext(fs.readFileSync('apps-script/'+f+'.gs','utf8'),ctx);
 ctx.withLock_=fn=>fn();ctx.rows_=name=>{
  if(name==='Settings')return [['teams',12],['rounds',16],['draftSlot',1],['panGap',22]];
  if(name==='Keepers')return keepers;
  if(name==='Draft Log')return log;
  throw Error('Unexpected full table read: '+name);
 };
 ctx.draftSelectedPlayer();assert.equal(log[0][0],1);
 assert.throws(()=>ctx.draftSelectedPlayer(),/already drafted/);
 log.length=0;ctx.draftSelectedPlayer();assert.equal(log[0][0],1);
 assert.equal(playerReads,1);
 selected[0]='Player B';selected[8]='b';keepers.push(['Player B']);
 assert.throws(()=>ctx.draftSelectedPlayer(),/already drafted or kept/);
 assert.equal(log.length,1);
});
