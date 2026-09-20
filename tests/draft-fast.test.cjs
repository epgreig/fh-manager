const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('repeated draft calls reuse identities but always reread log and keepers',()=>{
 const cache=new Map([['draftBoardHeadersV1',JSON.stringify(['Player','POS','Tm','Age','espn','ADP','Dom','sADP','sRk','coefV','PAR','PAN','ID'])]]),log=[],keepers=[];let playerReads=0;
 const selected=['Player A','','','','','','','','','','','','a'];
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
 selected[0]='Player B';selected[12]='b';keepers.push(['Player B']);
 assert.throws(()=>ctx.draftSelectedPlayer(),/already drafted or kept/);
 assert.equal(log.length,1);
});

test('draft macro resolves each group after cache expiry with old and expanded layouts',()=>{
 for(const headers of [
  ['Player','POS','Tm','Age','Rk','sADP','PAR','PAN','ID'],
  ['Player','POS','Tm','Age','espn','ADP','Dom','sADP','sRk','coefV','PAR','PAN','ID']
 ])for(let group=0;group<3;group++) {
  const cache=new Map(),log=[],start=1+group*(headers.length+1),selected=Array(headers.length).fill('');
  selected[0]='Player A';selected[headers.indexOf('ID')]='a';
  const board={getName:()=> 'Board',getLastColumn:()=>3*(headers.length+1)-1,getRange:(r,col,n,width)=>({getValues:()=>{
   if(r===3)return [[...headers,'',...headers,'',...headers]];
   assert.equal(col,start);assert.equal(width,headers.length);return [selected];
  }})};
  const ctx={CacheService:{getDocumentCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
   SpreadsheetApp:{getActiveRange:()=>({getSheet:()=>board,getRow:()=>4,getColumn:()=>start+headers.indexOf('PAR'),getNumRows:()=>1,getNumColumns:()=>1}),
   getActive:()=>({getSheetByName:()=>({appendRow:r=>log.push(r)})})}};
  vm.createContext(ctx);for(const f of ['Engine','Code'])vm.runInContext(fs.readFileSync('apps-script/'+f+'.gs','utf8'),ctx);
  ctx.withLock_=fn=>fn();ctx.draftIdentities_=()=>[{id:'a',name:'Player A'}];
  ctx.rows_=n=>n==='Settings'?[['teams',12],['rounds',16],['draftSlot',1],['panGap',22]]:[];
  ctx.draftSelectedPlayer();assert.equal(log[0][2],'a');
 }
});
