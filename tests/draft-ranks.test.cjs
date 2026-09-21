const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);
for(const name of ['Engine','DraftRanks'])vm.runInContext(fs.readFileSync('apps-script/'+name+'.gs','utf8'),ctx);
vm.runInContext('this.config=DEFAULTS;',ctx);
const players=['z','a','b','keeper','unknown'].map((id,i)=>({id,name:id,group:i%2?'F':'D',adp:i===4?null:i===3?1:10,espnRank:null,domRank:null}));
test('pre-draft rank includes logged picks, excludes keepers, and breaks ties by ID',()=>{
 const result=ctx.draftRankSnapshot_(players,ctx.config,[{id:'keeper'}]);
 const ranks=Object.fromEntries(result.map(p=>[p.id,p.rank]));
 assert.deepEqual(ranks,{keeper:null,a:1,b:2,z:3,unknown:null});
});
test('snapshot survives refresh and input changes; explicit rebuild replaces it',()=>{
 const data=[];
 const sheet={getMaxRows:()=>1000,getLastRow:()=>data.length,clearContents:()=>{data.length=0;},setColumnWidth(){},setColumnWidths(){},getRange(row,col,n=1,m=1){
  if(typeof row==='string'){const match=/([A-Z]+)(\d+)/.exec(row);col=match[1].charCodeAt(0)-64;row=Number(match[2]);}
  const range={getValue:()=>data[row-1]?.[col-1]??'',getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
   setValue:v=>{data[row-1]??=[];data[row-1][col-1]=v;return range;},setValues:values=>{values.forEach((r,i)=>{data[row-1+i]??=[];r.forEach((v,j)=>data[row-1+i][col-1+j]=v);});return range;},setNumberFormat:()=>range};return range;
 }};
 ctx.table_=()=>sheet;
 const input={players:players.map(p=>({...p})),c:ctx.config,keepers:[{id:'keeper'}],state:{removed:new Set(['a','keeper']),current:26}};
 ctx.ensureDraftRanks_(input);
 assert.equal(input.players.find(p=>p.id==='a').smartRank,1);
 const before=input.players.map(p=>p.smartRank);
 input.players.find(p=>p.id==='z').adp=1;input.keepers=[];input.state.current=1;
 ctx.ensureDraftRanks_(input);assert.deepEqual(input.players.map(p=>p.smartRank),before);
 ctx.ensureDraftRanks_(input,true);
 assert.equal(input.players.find(p=>p.id==='keeper').smartRank,1);
 assert.equal(input.players.find(p=>p.id==='z').smartRank,2);
});
