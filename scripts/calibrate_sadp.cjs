// Compare cumulative D/G demand using the current pool, not historical player ADP accuracy.
// Usage: node scripts/calibrate_sadp.cjs PRIVATE_HISTORY.json [ESPN.json] [D rank] [G rank] [F points]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx={};vm.createContext(ctx);
for(const file of ['Engine','Espn'])vm.runInContext(fs.readFileSync(path.join(root,'apps-script',file+'.gs'),'utf8'),ctx);
vm.runInContext('this.defaults=DEFAULTS;',ctx);
const history=JSON.parse(fs.readFileSync(process.argv[2]));
const snapshot=JSON.parse(fs.readFileSync(process.argv[3]||path.join(root,'data/processed/espn.json')));
const c={...ctx.defaults,replacementD:Number(process.argv[4]||40),replacementG:Number(process.argv[5]||20),replacementFPoints:Number(process.argv[6]||161),espnRankWeight:.2,domRankWeight:.3};
const athletic=JSON.parse(fs.readFileSync(path.join(root,'data/processed/athletic.json'))).players;
const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
const ranks=ctx.domProjectionRanks_(athletic,athletic.map(p=>[p.id,'The Athletic',1,...stats.map(k=>p.stats[k]??'')]),c);
const domByEspn=new Map();
for(const p of athletic){const e=ctx.matchEspn_(p.name,snapshot.players);if(e)domByEspn.set(e.id,ranks.get(p.id));}
const pool=snapshot.players.map(p=>({id:p.id,group:p.pos==='G'?'G':p.pos==='D'?'D':'F',base:ctx.smartAdpBase_(p.adp,p.rank,domByEspn.get(p.id),c)})).filter(p=>p.base!==null);
const targets=Array.from({length:9},(_,i)=>['D','G'].map(g=>history.filter(p=>p.group===g&&p.pick<=(i+1)*12).length));
function evaluate(d,g,eg=1){
 const sorted=pool.map(p=>({...p,value:p.base*(p.group==='D'?d:p.group==='G'?g*Math.pow(p.base/50,eg-1):1)})).sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
 const counts=targets.map((_,i)=>['D','G'].map(group=>sorted.slice(0,(i+1)*12).filter(p=>p.group===group).length));
 return {multiplierD:d,multiplierG:g,exponentG:eg,counts,error:counts.reduce((s,r,i)=>s+r.reduce((t,x,j)=>t+(x-targets[i][j])**2,0),0)};
}
let best=null;
for(let di=40;di<=160;di+=2)for(let gi=40;gi<=160;gi+=2){
 const trial=evaluate(di/100,gi/100),distance=Math.log(di/100)**2+Math.log(gi/100)**2;
 if(!best||trial.error<best.error||(trial.error===best.error&&distance<best.distance))best={...trial,distance};
}
console.log(JSON.stringify({snapshot:snapshot.retrievedAt,assumptions:{replacementFPoints:c.replacementFPoints,replacementD:c.replacementD,replacementG:c.replacementG,power:-2,weights:{espnRank:.2,adp:.5,dom:.3},poolSize:pool.length,domRanksMatched:domByEspn.size},targetCounts:targets,neutral:evaluate(1,1),oldCorrections:evaluate(.86,.65,1.235),fittedLinear:best},null,2));
