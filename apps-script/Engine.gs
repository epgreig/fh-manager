const DEFAULTS = {
  teams:12, draftSlot:1, rounds:16, G:3, A:1.5, BLK:0.3, PIM:0.5, SHP:1.5,
  defenseBonus:0.3, W:1.5, SO:2, GA:-1, SV:0.2,
  replacementFPoints:161, replacementD:32, replacementG:20,
  parTop:0.02, panTop:0.02, adpBottom:0.10, adpSigmaFloor:4, adpSigmaRate:0.18, espnRankWeight:0.2,
  multiplierF:1, multiplierD:1, multiplierG:1, exponentF:1, exponentD:1, exponentG:1, curvePivot:50,
  panGap:22, highlightCount:12, youngAgeMax:23, domRankWeight:0.3
};
function domProjectionRanks_(players, rows, c) {
  const columns=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
  const source=new Map(rows.filter(r=>r[1]==='The Athletic').map(r=>[r[0],r]));
  const ranked=players.flatMap(p=>{
    const row=source.get(p.id);if(!row)return [];
    const stats=Object.fromEntries(columns.map((k,i)=>[k,row[i+3]]));
    const required=p.group==='G'?['W','SO','GA','SV']:['G','A','BLK','PIM','SHP'];
    if(!required.every(k=>typeof stats[k]==='number'&&Number.isFinite(stats[k])))return [];
    return [{id:p.id,group:p.group,points:scorePlayer({...p,stats},c)}];
  });
  const baselines={F:c.replacementFPoints};
  for(const group of ['D','G']) {
    const pool=ranked.filter(p=>p.group===group).sort((a,b)=>b.points-a.points);
    const rank=c['replacement'+group];
    baselines[group]=Number.isInteger(rank)&&rank>0&&pool.length>=rank?pool[rank-1].points:null;
  }
  const byValue=ranked.filter(p=>Number.isFinite(baselines[p.group]))
    .map(p=>({...p,par:p.points-baselines[p.group]})).sort((a,b)=>b.par-a.par||a.id.localeCompare(b.id));
  const ranks=new Map();let rank=0;
  byValue.forEach((p,i)=>{if(i===0||p.par!==byValue[i-1].par)rank=i+1;ranks.set(p.id,rank);});
  return ranks;
}
function smartAdpBase_(adp,espnRank,domRank,c) {
  const inputs=[[adp,1-c.espnRankWeight-c.domRankWeight],[espnRank,c.espnRankWeight],[domRank,c.domRankWeight]];
  const valid=inputs.filter(([v,w])=>Number.isFinite(v)&&v>0&&w>0);
  const weight=valid.reduce((s,x)=>s+x[1],0);
  return weight?Math.pow(valid.reduce((s,[v,w])=>s+w*Math.pow(v,-2),0)/weight,-0.5):null;
}
function scorePlayer(p, c) {
  const keys = p.group === 'G' ? ['W','SO','GA','SV'] : ['G','A','BLK','PIM','SHP'];
  keys.forEach(k => {if (!Number.isFinite(p.stats[k])) throw Error(p.name+': missing '+k);});
  return keys.reduce((s,k) => s+p.stats[k]*c[k],0) +
    (p.group === 'D' ? c.defenseBonus*(p.stats.G+p.stats.A) : 0);
}
function projectedPoints_(p,c) {
  return scorePlayer(p,c)*(1-(p.projectionCut||0));
}
function ownerAt(pick, teams) {
  const round = Math.floor((pick-1)/teams)+1, slot=(pick-1)%teams+1;
  return round%2 ? slot : teams+1-slot;
}
function keeperPick(round, team, teams) {return (round-1)*teams+(round%2 ? team : teams+1-team);}
function draftState(c, keepers, log, ids) {
  const removed = new Set();
  keepers.forEach(k=>{
    if(!ids.has(k.id))throw Error('Unknown keeper: '+k.id);
    removed.add(k.id);
  });
  log.forEach(x=>{
    if(!ids.has(x.id))throw Error('Unknown drafted player: '+x.id);
    removed.add(x.id);
  });
  const current=log.length+1;
  let next=current+1;
  const limit=c.teams*c.rounds-new Set(keepers.map(k=>k.id)).size;
  while(next<=limit && ownerAt(next,c.teams)!==c.draftSlot)next++;
  return {current,next:next<=limit?next:null,opponents:c.panGap===undefined?22:c.panGap,removed,limit};
}

function evaluate(players,c,state) {
  const all=players.map(p=>({...p,points:projectedPoints_(p,c)}));
  const baselines={};
  ['D','G'].forEach(g=>{
    const ranked=all.filter(p=>p.group===g).sort((a,b)=>b.points-a.points);
    const rank=c['replacement'+g];
    if(!Number.isInteger(rank)||rank<1) throw Error('Replacement rank must be a positive integer: '+g);
    // An undersized positional pool leaves its replacement baseline unknown.
    baselines[g]=ranked.length>=rank?ranked[rank-1].points:null;
  });
  if(!Number.isFinite(c.replacementFPoints)||c.replacementFPoints<0)throw Error('Invalid forward replacement points');
  baselines.F=c.replacementFPoints;
  const available=all.filter(p=>!state.removed.has(p.id)).map(p=>{
    const baseline=baselines[p.group];
    return {...p,par:baseline===null?null:p.points-baseline,pan:null};
  });
  return {available,baselines};
}
if(typeof module!=='undefined') module.exports={DEFAULTS,scorePlayer,ownerAt,keeperPick,draftState,evaluate};
