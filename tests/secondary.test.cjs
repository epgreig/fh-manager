const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');

test('secondary source import is idempotent and preserves later weight edits',()=>{
  const athletic=JSON.parse(fs.readFileSync('data/processed/athletic.json')).players;
  const secondary=JSON.parse(fs.readFileSync('data/processed/secondary-projections.json')).players;
  const ids=new Set(athletic.map(p=>p.id));
  assert.equal(secondary.length,966);
  assert.equal(new Set(secondary.map(p=>p.id+'|'+p.source)).size,secondary.length);
  assert.ok(secondary.every(p=>ids.has(p.id)));
  const mcdavid=athletic.find(p=>p.name==='Connor McDavid');
  const cullen=secondary.find(p=>p.id===mcdavid.id&&p.source==='Scott Cullen');
  assert.ok(cullen.stats.G>0);
  assert.equal(cullen.stats.SHP,undefined);
  const rows=[['ID','Source','Weight'],[mcdavid.id,'The Athletic',1]];
  const cells={getLastRow:()=>rows.length,getMaxRows:()=>2000,getRange:(r,c,n,m)=>({
    getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
    setValues:values=>values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v)})
  })};
  const properties=new Map();
  const ctx={SECONDARY_PROJECTION_DATA:secondary,
    SpreadsheetApp:{getActive:()=>({getSheetByName:()=>cells})},
    PropertiesService:{getDocumentProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
  ctx.ensureSecondaryProjections_();
  assert.equal(rows.length,968);
  assert.equal(rows[1][2],0.6);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Scott Cullen')[2],0.15);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Hashtag Hockey')[2],0.25);
  rows[1][2]=0.7;
  ctx.ensureSecondaryProjections_();
  assert.equal(rows.length,968);
  assert.equal(rows[1][2],0.7);
});
