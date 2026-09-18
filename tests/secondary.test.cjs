const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');

test('secondary source import is idempotent and preserves later weight edits',()=>{
  const athletic=JSON.parse(fs.readFileSync('data/processed/athletic.json')).players;
  const secondary=JSON.parse(fs.readFileSync('data/processed/secondary-projections.json')).players;
  const ids=new Set(athletic.map(p=>p.id));
  assert.equal(secondary.length,2993);
  assert.equal(new Set(secondary.map(p=>p.id+'|'+p.source)).size,secondary.length);
  assert.ok(secondary.every(p=>ids.has(p.id)));
  const mcdavid=athletic.find(p=>p.name==='Connor McDavid');
  const cullen=secondary.find(p=>p.id===mcdavid.id&&p.source==='Scott Cullen');
  assert.ok(cullen.stats.G>0);
  assert.equal(cullen.stats.SHP,undefined);
  const lineup=secondary.find(p=>p.id===mcdavid.id&&p.source==='LineupExperts');
  assert.deepEqual(lineup.stats,{GP:82,G:41,A:89,BLK:30,PIM:41});
  assert.equal(lineup.weight,5);
  const dtz=secondary.find(p=>p.id===mcdavid.id&&p.source==='DtZ');
  assert.deepEqual(dtz.stats,{GP:79,G:39,A:84,BLK:36,PIM:33,SHP:1});
  assert.equal(dtz.weight,5);
  const hellebuyck=athletic.find(p=>p.name==='Connor Hellebuyck');
  assert.deepEqual(secondary.find(p=>p.id===hellebuyck.id&&p.source==='DtZ').stats,
    {GP:61,W:33,SO:4,GA:157,SV:1540});
  assert.ok(!secondary.some(p=>p.id===hellebuyck.id&&p.source==='LineupExperts'));
  const laidlaw=secondary.filter(p=>p.source==='Steve Laidlaw');
  assert.equal(laidlaw.length,337);
  assert.ok(laidlaw.every(p=>Object.keys(p.stats).sort().join(',')==='A,BLK,G,GP'));
  assert.equal(laidlaw.find(p=>p.id===mcdavid.id).stats.G,40);
  assert.equal(laidlaw.find(p=>p.id===mcdavid.id).stats.PIM,undefined);
  assert.ok(athletic.slice(0,60).filter(p=>p.group!=='G').every(p=>laidlaw.some(x=>x.id===p.id)));
  for(const author of ['Blake','Nate']) {
    const source='Apples & Ginos '+author;
    const own=secondary.filter(p=>p.source===source);
    assert.ok(own.length>=370);
    const sourceIds=new Set(own.map(p=>p.id));
    assert.ok(athletic.slice(0,150).filter(p=>p.group!=='G').every(p=>sourceIds.has(p.id)));
    assert.ok(own.every(p=>Object.keys(p.stats).sort().join(',')==='A,BLK,G,GP,PIM'));
    assert.equal(own.find(p=>p.id===mcdavid.id).stats.G,author==='Blake'?45.1:43.4);
    const csv=fs.readFileSync(`data/raw/Apples & Ginos 2026-27 NHL Skater Projections - ${author}'s Projections.csv`,'utf8');
    const first150=csv.split(/\r?\n/).slice(7,157).map(line=>line.split(',')[0]);
    const athleticKeys=new Set(athletic.map(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')));
    assert.ok(first150.every(name=>{
      const reviewed=name==='Egor Chinakhov'?'Yegor Chinakhov':name;
      return athleticKeys.has(reviewed.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''));
    }));
  }
  const rows=[['ID','Source','Weight'],[mcdavid.id,'The Athletic',1]];
  const cells={getLastRow:()=>rows.length,getMaxRows:()=>3000,getRange:(r,c,n,m)=>({
    getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
    setValues:values=>values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v)})
  })};
  const properties=new Map();
  const ctx={SECONDARY_PROJECTION_DATA:secondary,
    SpreadsheetApp:{getActive:()=>({getSheetByName:()=>cells})},
    PropertiesService:{getDocumentProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
  ctx.ensureSecondaryProjections_();
  assert.equal(rows.length,2995);
  assert.equal(rows[1][2],15);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Scott Cullen')[2],2);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Hashtag Hockey')[2],2);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Apples & Ginos Blake')[2],3);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Apples & Ginos Nate')[2],3);
  assert.equal(rows.find(r=>r[0]===mcdavid.id&&r[1]==='Steve Laidlaw')[2],3);
  rows[1][2]=0.7;
  ctx.ensureSecondaryProjections_();
  assert.equal(rows.length,2995);
  assert.equal(rows[1][2],0.7);
});

test('requested eight-source weights apply once and later edits persist',()=>{
  const secondary=JSON.parse(fs.readFileSync('data/processed/secondary-projections.json')).players;
  const id=secondary.find(p=>p.source==='Apples & Ginos Blake').id;
  function refresh(initial) {
    const rows=[['ID','Source','Weight'],[id,'The Athletic',initial.athletic],
      [id,'Hashtag Hockey',initial.hashtag],[id,'Scott Cullen',initial.cullen]];
    const cells={getLastRow:()=>rows.length,getMaxRows:()=>3000,getRange:(r,c,n,m)=>({
      getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
      setValues:values=>values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v)})
    })};
    const props=new Map([['projectionBlend20260916','applied']]);
    const ctx={SECONDARY_PROJECTION_DATA:secondary,
      SpreadsheetApp:{getActive:()=>({getSheetByName:()=>cells})},
      PropertiesService:{getDocumentProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})}};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
    ctx.ensureSecondaryProjections_();
    const migrated=rows.slice(1,4).map(r=>r[2]);
    rows[1][2]=0.7;
    ctx.ensureSecondaryProjections_();
    return [migrated,rows[1][2]];
  }
  assert.deepEqual(refresh({athletic:0.60,hashtag:0.25,cullen:0.15}),[[15,2,2],0.7]);
  assert.deepEqual(refresh({athletic:0.70,hashtag:0.25,cullen:0.15}),[[15,2,2],0.7]);
});
