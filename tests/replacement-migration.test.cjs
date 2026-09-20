const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('apps-script/Engine.gs','utf8')+'\n'+fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
test('shared forward migration preserves current PAN ranks and subsequent baseline edits',()=>{
  const rows=[['Setting','Value'],['replacementC',40],['replacementLW',36],['replacementRW',36],['replacementD',40],['replacementG',20]];
  const saved=new Map();
  const sheet={getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),deleteRow:n=>rows.splice(n-1,1),appendRow:r=>rows.push(r)};
  const props={getProperty:k=>saved.get(k),setProperty:(k,v)=>saved.set(k,v)};
  ctx.migrateForwardReplacement_(sheet,props);
  assert.deepEqual(JSON.parse(saved.get('panForwardReplacementRanks')),{C:40,LW:36,RW:36});
  assert.ok(!rows.some(r=>/^replacement(C|LW|RW)$/.test(r[0])));
  assert.equal(rows.find(r=>r[0]==='replacementFPoints')[1],161);
  assert.equal(rows.find(r=>r[0]==='replacementD')[1],40);
  rows.find(r=>r[0]==='replacementFPoints')[1]=165;
  ctx.migrateForwardReplacement_(sheet,props);
  assert.equal(rows.filter(r=>r[0]==='replacementFPoints').length,1);
  assert.equal(rows.find(r=>r[0]==='replacementFPoints')[1],165);
  assert.deepEqual(JSON.parse(saved.get('panForwardReplacementRanks')),{C:40,LW:36,RW:36});
});

test('PAR highlight migration applies 98th percentile once and preserves later edits',()=>{
  const rows=[['Setting','Value'],['parTop',0.01]],saved=new Map();
  const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:r=>({setValue:v=>rows[r-1][1]=v})};
  const props={getProperty:k=>saved.get(k),setProperty:(k,v)=>saved.set(k,v)};
  ctx.migrateParHighlight_(sheet,props);
  assert.equal(rows[1][1],0.02);
  rows[1][1]=0.05;ctx.migrateParHighlight_(sheet,props);
  assert.equal(rows[1][1],0.05);
});

test('power-mean migration sets equal weights once without changing positional adjustments',()=>{
 const rows=[['espnRankWeight',.2],['domRankWeight',.4],['multiplierG',.8]],saved=new Map();
 const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:r=>({setValue:v=>rows[r-1][1]=v})};
 const props={getProperty:k=>saved.get(k),setProperty:(k,v)=>saved.set(k,v)};
 ctx.migratePowerBlend_(sheet,props);
 assert.deepEqual(rows.map(r=>r[1]),[1/3,1/3,.8]);
 rows[0][1]=.25;ctx.migratePowerBlend_(sheet,props);assert.equal(rows[0][1],.25);
});
