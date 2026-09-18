const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('apps-script/Engine.gs','utf8')+'\n'+fs.readFileSync('apps-script/Compare.gs','utf8')+'\nthis.config=DEFAULTS;',ctx);
test('source comparison scores defense bonus, fills missing stats, and leaves absent sources blank',()=>{
  const p={id:'d',name:'Defenseman',team:'T',pos:'D',group:'D',stats:{G:20,A:40,BLK:100,PIM:30,SHP:2}};
  const rows=[['d','Full',3,82,20,40,100,30,2],['d','Partial',1,82,25,35,110,'',''],['other','Absent',1],['d','Disabled',0,82,99,99,99,99,99]];
  const result=ctx.projectionComparison_([p],ctx.config,rows);
  assert.equal(result.sources.length,3);
  const out=result.rows[0];
  assert.equal(out.totals[0],186);
  assert.equal(out.totals[1],196.5);
  assert.equal(out.totals[2],'');
  assert.equal(out.notes[1],'Blended estimate used for missing PIM, SHP');
});
test('filled source totals preserve the weighted category blend and goalie scoring',()=>{
  const p={id:'g',name:'Goalie',pos:'G',group:'G',stats:{W:32,SO:4,GA:150,SV:1500}};
  const rows=[['g','A',3,60,'','','','','',30,4,150,1500],['g','B',1,60,'','','','','',38,'','','']];
  const out=ctx.projectionComparison_([p],ctx.config,rows).rows[0];
  assert.equal(out.points,206);
  assert.equal((out.totals[0]*3+out.totals[1])/4,out.points);
  assert.equal(out.notes[1],'Blended estimate used for missing SO, GA, SV');
});
