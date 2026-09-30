/** Read the two existing league builds without modifying either draft deployment. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function readLeague(dir,yahoo){
  const c={};vm.createContext(c);
  for(const file of [...(yahoo?['LeagueConfig']:[]),'Engine','ProjectionData','SecondaryProjectionData',yahoo?'YahooData':'EspnData'])
    vm.runInContext(fs.readFileSync(path.join(root,dir,file+'.gs'),'utf8'),c);
  vm.runInContext('this.data=PROJECTION_DATA;this.secondary=SECONDARY_PROJECTION_DATA;this.config=DEFAULTS;this.market='+(yahoo?'YAHOO_DATA':'ESPN_DATA'),c);
  const weights=yahoo?Object.fromEntries(Object.entries(c.leagueConfig_().projectionWeightSettings).map(([source,key])=>[source,c.config[key]])):
    {'The Athletic':12,DtZ:6,LineupExperts:6,'Apples & Ginos Blake':4,'Apples & Ginos Nate':4,'Steve Laidlaw':3,'Scott Cullen':2};
  if(!yahoo)vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Espn.gs'),'utf8'),c);
  const market=new Map(yahoo?c.market.matches.map(p=>[p.id,p]):c.data.map(p=>[p.id,c.matchEspn_(p.name,c.market.players)]));
  const sources=new Map();
  for(const p of [...c.data,...c.secondary]){if(!sources.has(p.id))sources.set(p.id,[]);sources.get(p.id).push(p);}
  const players=c.data.map(p=>{
    const stats={};
    for(const stat of c.projectionStats_()){
      const rows=sources.get(p.id).filter(s=>Number.isFinite(s.stats[stat])&&weights[s.source]>0);
      if(rows.length)stats[stat]=rows.reduce((n,s)=>n+s.stats[stat]*weights[s.source],0)/rows.reduce((n,s)=>n+weights[s.source],0);
    }
    const m=market.get(p.id);
    return {...p,stats,points:c.scorePlayer({...p,stats},c.config),pos:m?.pos||p.sourcePos,team:m?.team||p.team,provisional:!m?.pos};
  });
  return {players,weights};
}
function managementData(){
  const espn=readLeague('apps-script',false),yahoo=readLeague('build/yahoo',true);
  const e=new Map(espn.players.map(p=>[p.id,p]));
  const aliases={'T.B':'TB','N.J':'NJ','L.A':'LA','S.J':'SJ','STL':'STL','MON':'MTL','NAS':'NSH','VEG':'VGK','WAS':'WSH'};
  const players=yahoo.players.map(y=>{
    const p=e.get(y.id);if(!p)throw Error('Missing ESPN player '+y.name);
    return {id:y.id,name:y.name,team:aliases[y.team]||y.team,age:y.age,group:y.group,espnPos:p.pos,yahooPos:y.pos,
      espnPoints:p.points,yahooPoints:y.points,espnGp:p.stats.GP,yahooGp:y.stats.GP};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  if(new Set(players.map(p=>p.name.toLowerCase())).size!==players.length)throw Error('Ambiguous names');
  return {players,weights:{ESPN:espn.weights,Yahoo:yahoo.weights}};
}
module.exports={managementData};
