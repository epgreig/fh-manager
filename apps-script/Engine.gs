const DEFAULTS = {
  teams:12, draftSlot:1, rounds:16, G:3, A:1.5, BLK:0.3, PIM:0.5, SHP:1.5,
  defenseBonus:0.3, W:1.5, SO:2, GA:-1, SV:0.2,
  replacementF:80, replacementD:35, replacementG:20,
  parTop:0.02, panTop:0.02, adpBottom:0.10, adpSigmaFloor:4, adpSigmaRate:0.18, espnRankWeight:0.2,
  multiplierF:1, multiplierD:1, multiplierG:1, exponentF:1, exponentD:1, exponentG:1, curvePivot:50,
  panGap:22, highlightCount:12, youngAgeMax:23, domRankWeight:0.3,
  ...(leagueConfig_().defaults||{})
};
if(leagueConfig_().positionalForwards)delete DEFAULTS.replacementF;
// Function declarations are hoisted across Apps Script files; no file-order dependency.
function leagueConfig_() {return typeof leagueProfile_==='undefined'?{platform:'ESPN',keepers:true}:leagueProfile_();}
function settingName_(key) {return leagueConfig_().platform==='Yahoo'&&key==='espnRankWeight'?'platformRankWeight':key;}
function configFromSettings_(rows) {return Object.fromEntries(rows.filter(r=>r[0]).map(r=>[r[0]==='platformRankWeight'?'espnRankWeight':r[0],Number(r[1])]));}
function projectionStats_() {return ['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV',...(leagueConfig_().extraStats||[])];}
function scoredStats_(p,c) {
  const keys=p.group==='G'?['W','SO','GA','SV']:['G','A','BLK','PIM','SHP',...(leagueConfig_().extraStats||[])];
  return keys.filter(k=>c[k]!==0);
}
function replacementPositions_() {return leagueConfig_().positionalForwards?['C','LW','RW','D','G']:['F','D','G'];}
function playerPositions_(p) {
  if(p.group!=='F'||!leagueConfig_().positionalForwards)return [p.group];
  return [...new Set(String(p.pos||p.sourcePos||'').split(',').map(s=>s.trim()))].filter(pos=>['C','LW','RW'].includes(pos));
}
function replacementBaselines_(players,c) {
  return Object.fromEntries(replacementPositions_().map(pos=>{
    const rank=c['replacement'+pos];
    if(!Number.isInteger(rank)||rank<1)throw Error('Replacement rank must be a positive integer: '+pos);
    const pool=players.filter(p=>playerPositions_(p).includes(pos)).sort((a,b)=>b.points-a.points);
    return [pos,pool.length>=rank?pool[rank-1].points:null];
  }));
}
function playerPar_(p,baselines) {
  const values=playerPositions_(p).map(pos=>baselines[pos]).filter(Number.isFinite);
  return values.length?p.points-Math.min(...values):null;
}
function domProjectionRanks_(players, rows, c) {
  const columns=projectionStats_();
  const source=new Map(rows.filter(r=>r[1]==='The Athletic').map(r=>[r[0],r]));
  const ranked=players.flatMap(p=>{
    const row=source.get(p.id);if(!row)return [];
    const stats=Object.fromEntries(columns.map((k,i)=>[k,row[i+3]]));
    const required=scoredStats_(p,c);
    if(!required.every(k=>typeof stats[k]==='number'&&Number.isFinite(stats[k])))return [];
    return [{...p,points:scorePlayer({...p,stats},c)}];
  });
  const baselines=replacementBaselines_(ranked,c);
  const byValue=ranked.map(p=>({...p,par:playerPar_(p,baselines)})).filter(p=>Number.isFinite(p.par))
    .sort((a,b)=>b.par-a.par||a.id.localeCompare(b.id));
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
  const keys = scoredStats_(p,c);
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
  const baselines=replacementBaselines_(all,c);
  const available=all.filter(p=>!state.removed.has(p.id)).map(p=>{
    return {...p,par:playerPar_(p,baselines),pan:null};
  });
  return {available,baselines};
}
if(typeof module!=='undefined') module.exports={DEFAULTS,scorePlayer,ownerAt,keeperPick,draftState,evaluate};
