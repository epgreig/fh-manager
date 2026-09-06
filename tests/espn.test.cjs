const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Espn.gs','utf8'),ctx);
test('snapshot matches every projection player uniquely with compatible eligibility',()=>{
 const espn=JSON.parse(fs.readFileSync('data/processed/espn.json')).players;
 const projections=JSON.parse(fs.readFileSync('data/processed/athletic.json')).players;
 const ids=new Set();
 for(const p of projections){const e=ctx.matchEspn_(p.name,espn);assert.ok(e,p.name);assert.ok(!ids.has(e.id),p.name);ids.add(e.id);assert.ok(e.adp>0);assert.ok(p.group==='F'?/C|LW|RW/.test(e.pos):e.pos===p.group,p.name);}
 assert.equal(ctx.matchEspn_('Unknown Person',espn),null);
});
