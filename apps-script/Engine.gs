const DEFAULTS = {
  teams:12, draftSlot:1, rounds:16, G:3, A:1.5, BLK:0.3, PIM:0.5, SHP:1.5,
  defenseBonus:0.3, W:1.5, SO:2, GA:-1, SV:0.2,
  replacementC:49, replacementLW:37, replacementRW:37, replacementD:49, replacementG:25,
  parTop:0.15, adpBottom:0.10, adpSigma:12, simulations:150, nextAlternatives:3
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
  const occupied = new Set(), removed = new Set(), counts = {};
  keepers.forEach(k => {
    if (!ids.has(k.id) || removed.has(k.id)) throw Error('Unknown or duplicate keeper: '+k.id);
    if (!Number.isInteger(k.team)||k.team<1||k.team>c.teams||!Number.isInteger(k.round)||k.round<1||k.round>c.rounds) throw Error('Invalid keeper team or round');
    const pick=keeperPick(k.round,k.team,c.teams);
    if(occupied.has(pick)) throw Error('Two keepers cost the same pick');
    counts[k.team]=(counts[k.team]||0)+1;
    if(counts[k.team]>2) throw Error('Maximum two keepers per team');
    occupied.add(pick); removed.add(k.id);
  });
  let current=1;
  const advance=()=>{while(occupied.has(current)) current++;};
  advance();
  log.forEach(x=>{
    if(x.pick!==current || !ids.has(x.id) || removed.has(x.id)) throw Error('Draft log conflicts with keeper settings or has duplicate picks');
    removed.add(x.id); current++; advance();
  });
  let next=current+1;
  while(next<=c.teams*c.rounds && (occupied.has(next)||ownerAt(next,c.teams)!==c.draftSlot)) next++;
  let opponents=0;
  for(let p=current+1;p<next;p++) if(!occupied.has(p)) opponents++;
  return {current,next:next<=c.teams*c.rounds?next:null,opponents,removed};
}
function seededRandom(seed) {return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+0.5)/4294967296;};}
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
  return calculatePan_(available,c,state,baselines);
}
function calculatePan_(available,c,state,baselines={}) {
  // Missing ESPN ADP disables PAN instead of silently inserting another site's ADP.
  if(!state.next || available.some(p=>!Number.isFinite(p.adp)||p.adp<=0)) return {available,baselines,panReady:false};
  const random=seededRandom(2027+state.current), sums=new Map(available.map(p=>[p.id,0])), counts=new Map();
  for(let sim=0;sim<c.simulations;sim++) {
    const order=available.map(p=>({p,key:p.adp+c.adpSigma*Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random())})).sort((a,b)=>a.key-b.key);
    const indices=new Map(order.map((v,i)=>[v.p.id,i]));
    const byPoints=[...available].sort((a,b)=>b.points-a.points);
    for(const candidate of available) {
      // Taking a player now removes them before intervening selections.
      const cut=state.opponents+(indices.get(candidate.id)<state.opponents?1:0);
      const alternatives=[];
      for(const p of byPoints) {
        if(p.group===candidate.group && p.id!==candidate.id && indices.get(p.id)>=cut) alternatives.push(p.points);
        if(alternatives.length===c.nextAlternatives) break;
      }
      if(alternatives.length) {
        sums.set(candidate.id,sums.get(candidate.id)+alternatives.reduce((a,b)=>a+b,0)/alternatives.length);
        counts.set(candidate.id,(counts.get(candidate.id)||0)+1);
      }
    }
  }
  available.forEach(p=>{if(counts.get(p.id)===c.simulations) p.pan=p.points-sums.get(p.id)/c.simulations;});
  return {available,baselines,panReady:true};
}
if(typeof module!=='undefined') module.exports={DEFAULTS,scorePlayer,ownerAt,keeperPick,draftState,evaluate};
