const DEFAULTS = {
  teams:12, draftSlot:1, rounds:16, G:3, A:1.5, BLK:0.3, PIM:0.5, SHP:1.5,
  defenseBonus:0.3, W:1.5, SO:2, GA:-1, SV:0.2,
  replacementC:49, replacementLW:37, replacementRW:37, replacementD:49, replacementG:25,
  parTop:0.15, adpBottom:0.10, adpSigma:12, espnRankWeight:0.5, multiplierF:1, multiplierD:0.81, multiplierG:0.77, panGap:22, highlightCount:12
};
function scorePlayer(p, c) {
  const keys = p.group === 'G' ? ['W','SO','GA','SV'] : ['G','A','BLK','PIM','SHP'];
  keys.forEach(k => {if (!Number.isFinite(p.stats[k])) throw Error(p.name+': missing '+k);});
  return keys.reduce((s,k) => s+p.stats[k]*c[k],0) +
    (p.group === 'D' ? c.defenseBonus*(p.stats.G+p.stats.A) : 0);
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
  const all=players.map(p=>({...p,points:scorePlayer(p,c)}));
  const baselines={};
  const positions=p=>p.group==='F'?String(p.pos||'').toUpperCase().split(/[,/\s]+/).filter(x=>['C','LW','RW'].includes(x)):[p.group];
  ['C','LW','RW','D','G'].forEach(g=>{
    const ranked=all.filter(p=>positions(p).includes(g)).sort((a,b)=>b.points-a.points);
    const rank=c['replacement'+g];
    if(!Number.isInteger(rank)||rank<1) throw Error('Replacement rank must be a positive integer: '+g);
    // Insufficient verified eligibility leaves a baseline unknown, never substitutes Yahoo positions.
    baselines[g]=ranked.length>=rank?ranked[rank-1].points:null;
  });
  const available=all.filter(p=>!state.removed.has(p.id)).map(p=>{
    const eligible=positions(p), values=eligible.map(g=>baselines[g]);
    const baseline=eligible.length&&values.every(v=>v!==null)?Math.min(...values):null;
    return {...p,par:baseline===null?null:p.points-baseline,pan:null};
  });
  return {available,baselines};
}
if(typeof module!=='undefined') module.exports={DEFAULTS,scorePlayer,ownerAt,keeperPick,draftState,evaluate};
