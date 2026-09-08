const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Espn.gs','utf8'),ctx);
test('snapshot matches every projection player uniquely with compatible eligibility',()=>{
 const espn=JSON.parse(fs.readFileSync('data/processed/espn.json')).players;
 const projections=JSON.parse(fs.readFileSync('data/processed/athletic.json')).players;
 const ids=new Set();
 for(const p of projections){const e=ctx.matchEspn_(p.name,espn);assert.ok(e,p.name);assert.ok(!ids.has(e.id),p.name);ids.add(e.id);assert.ok(e.adp>0);assert.ok(p.group==='F'?/C|LW|RW/.test(e.pos):e.pos===p.group,p.name);}
 assert.equal(ctx.matchEspn_('Unknown Person',espn),null);
 assert.equal(ctx.matchEspn_('Nathan MacKinnon',espn).rank,1);
 assert.ok(espn.some(p=>p.rank===null));
});

test('refresh backfills missing ranks in legacy Players sheets without replacing existing inputs',()=>{
 const rows=[['a','Nathan MacKinnon','','','','',2,'',''],['b','Connor McDavid','','','','',2,'',99],['c','Unknown Person','','','','',230,'','']];
 const writes=[];
 ctx.ESPN_DATA=JSON.parse(fs.readFileSync('data/processed/espn.json'));
 ctx.SpreadsheetApp={getActive:()=>({getSheetByName:()=>({
  getLastRow:()=>4,
  getRange:(...range)=>({getValues:()=>rows,setValue:value=>writes.push({range,value}),setValues:values=>writes.push({range,values})})
 })})};
 ctx.ensureEspnRanks_();
 assert.deepEqual(JSON.parse(JSON.stringify(writes[1])),{range:[2,9,3,1],values:[[1],[99],['']]});
 assert.equal(rows[0][6],2);
 assert.match(fs.readFileSync('apps-script/Code.gs','utf8'),/function refreshBoard\(\).*ensureEspnRanks_\(\)/);
});
