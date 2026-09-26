const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const profile=JSON.parse(fs.readFileSync('leagues/yahoo.json'));
function context(yahoo=true){const ctx=yahoo?{leagueProfile_:()=>profile}:{};vm.createContext(ctx);for(const file of ['Engine','Code','Pan','Compare','DraftRanks'])vm.runInContext(fs.readFileSync('apps-script/'+file+'.gs','utf8'),ctx);vm.runInContext('this.c=DEFAULTS',ctx);return ctx;}
test('Yahoo league scores every category and stacks shorthanded bonuses',()=>{
 const ctx=context();
 assert.equal(ctx.c.teams,14);assert.equal(ctx.c.panGap,13);assert.equal(ctx.c.defenseBonus,0);
 assert.equal(ctx.c.replacementF,110);
 const stats={G:1,A:1,SOG:3,HIT:2,BLK:4,PIM:2,PLUS_MINUS:-1,SHG:1,SHA:1};
 assert.equal(ctx.scorePlayer({name:'F',group:'F',stats},ctx.c),60);
 assert.equal(ctx.scorePlayer({name:'D',group:'D',stats},ctx.c),60);
 assert.equal(ctx.scorePlayer({name:'G',group:'G',stats:{W:1,SO:1,GA:2,SV:30}},ctx.c),40);
 assert.throws(()=>ctx.scorePlayer({name:'F',group:'F',stats:{...stats,HIT:undefined}},ctx.c),/missing HIT/);
 assert.equal(ctx.ownerAt(8,14),8);assert.equal(ctx.ownerAt(21,14),8);assert.equal(ctx.ownerAt(36,14),8);
});
test('Yahoo forwards share one replacement pool despite multiple eligibility',()=>{
 const ctx=context(), c={...ctx.c,replacementF:2};
 const players=[{id:'a',group:'F',pos:'C,LW',points:100},{id:'b',group:'F',pos:'RW',points:80},{id:'c',group:'F',pos:'C',points:70}];
 const baselines=ctx.replacementBaselines_(players,c);
 assert.equal(baselines.F,80);assert.equal(ctx.playerPar_(players[0],baselines),20);
 assert.equal(JSON.stringify(ctx.playerPositions_(players[0])),'["F"]');
 assert.equal(JSON.stringify(ctx.replacementPositions_()),'["F","D","G"]');
});
test('shared engine preserves ESPN scores, replacement points, Dom ranks and draft ranks',()=>{
 const old={};vm.createContext(old);
 for(const file of ['Engine','DraftRanks'])vm.runInContext(cp.execFileSync('git',['show','espn-draft-2026-stable:apps-script/'+file+'.gs'],{encoding:'utf8'}),old);
 vm.runInContext('this.c=DEFAULTS',old);
 const ctx=context(false),players=JSON.parse(fs.readFileSync('data/processed/athletic.json')).players.map(p=>({...p,pos:p.sourcePos,adp:50}));
 const rows=players.map(p=>[p.id,'The Athletic',12,...ctx.projectionStats_().map(k=>p.stats[k]??'')]);
 const state={removed:new Set(players.slice(0,22).map(p=>p.id))};
 assert.equal(JSON.stringify(ctx.evaluate(players,ctx.c,state)),JSON.stringify(old.evaluate(players,old.c,state)));
 assert.equal(JSON.stringify([...ctx.domProjectionRanks_(players,rows,ctx.c)]),JSON.stringify([...old.domProjectionRanks_(players,rows,old.c)]));
 assert.equal(JSON.stringify(ctx.draftRankSnapshot_(players,ctx.c,[])),JSON.stringify(old.draftRankSnapshot_(players,old.c,[])));
});
test('Yahoo build has complete matching and independent league settings',()=>{
 const ctx=context();
 for(const file of ['ProjectionData','SecondaryProjectionData','YahooData'])vm.runInContext(fs.readFileSync('build/yahoo/'+file+'.gs','utf8'),ctx);
 vm.runInContext('this.data=PROJECTION_DATA;this.secondary=SECONDARY_PROJECTION_DATA;this.yahoo=YAHOO_DATA',ctx);
 assert.equal(ctx.yahoo.matches.length,ctx.data.length);
 assert.equal(ctx.yahoo.season,2026);assert.ok(ctx.yahoo.matches.every(p=>p.pos));
 assert.equal(ctx.c.espnRankWeight,0.15);assert.equal(ctx.c.domRankWeight,0.15);
 assert.ok(ctx.yahoo.matches.filter(p=>p.rank>0).length>=200);
 assert.equal(ctx.yahoo.matches.find(p=>p.name==='Connor McDavid').rank,1);
 assert.ok(!fs.existsSync('build/yahoo/EspnData.gs'));
 const stats=ctx.projectionStats_(),weights=new Map([...ctx.data,...ctx.secondary].map(p=>[p.id+'|'+p.source,p]));
 const rows=[...weights.values()].map(p=>[p.id,p.source,p.weight,...stats.map(k=>p.stats[k]??'')]);
 const market=new Map(ctx.yahoo.matches.map(p=>[p.id,p]));
 const players=ctx.data.map(p=>{
   const sources=[...weights.values()].filter(s=>s.id===p.id),blend={};
   for(const stat of stats){const present=sources.filter(s=>Number.isFinite(s.stats[stat]));if(present.length)blend[stat]=present.reduce((sum,s)=>sum+s.stats[stat]*s.weight,0)/present.reduce((sum,s)=>sum+s.weight,0);}
   return {...p,pos:market.get(p.id).pos,adp:market.get(p.id).adp,espnRank:market.get(p.id).rank,stats:blend};
 });
 const dom=ctx.domProjectionRanks_(players,rows,ctx.c);assert.equal(dom.size,players.length);
 players.forEach(p=>p.domRank=dom.get(p.id));
 const result=ctx.evaluate(players,ctx.c,{removed:new Set()});
 assert.ok(result.available.every(p=>Number.isFinite(p.points)&&Number.isFinite(p.par)));
 const draft=ctx.draftRankSnapshot_(players,ctx.c,[]);assert.equal(new Set(draft.map(p=>p.rank)).size,players.length);
 assert.ok(draft.every(p=>Number.isFinite(p.blend)));
 const totals=ctx.projectionComparison_(players,ctx.c,rows);assert.equal(totals.sources.length,7);
});
test('Yahoo rank migration applies once without resetting later weights or ADP',()=>{
 const ctx=context(),settings=[['Setting','Value'],...Object.entries(ctx.c).map(([k,v])=>[ctx.settingName_(k),v])];
 settings.find(r=>r[0]==='platformRankWeight')[1]=0;settings.find(r=>r[0]==='domRankWeight')[1]=.375;
 let written,marker;const settingsSheet={getDataRange:()=>({getValues:()=>settings}),appendRow:r=>settings.push(r),getRange:(r,c)=>({setValue:v=>settings[r-1][c-1]=v,setNote(){}})};
 const players={getLastRow:()=>3,getRange:(r,c)=>{assert.ok(c===1||c===9);return {getValues:()=>[['a'],['b']],setValues:v=>written=v,setValue(){return this;},setNote(){}};}};
 ctx.PropertiesService={getDocumentProperties:()=>({getProperty:()=>marker,setProperty:(k,v)=>marker=v})};
 ctx.SpreadsheetApp={getActive:()=>({getSheetByName:n=>n==='Settings'?settingsSheet:players})};ctx.rows_=()=>settings.slice(1);ctx.YAHOO_DATA={matches:[{id:'a',rank:5}]};
 vm.runInContext(fs.readFileSync('apps-script/Yahoo.gs','utf8'),ctx);
 ctx.ensureYahooSettings_();assert.equal(JSON.stringify(written),'[[5],[""]]');
 assert.equal(settings.find(r=>r[0]==='platformRankWeight')[1],.15);
 settings.find(r=>r[0]==='domRankWeight')[1]=.25;written=null;ctx.ensureYahooSettings_();assert.equal(written,null);assert.equal(settings.find(r=>r[0]==='domRankWeight')[1],.25);
});
test('Yahoo shared-forward migration removes old settings and preserves later edits',()=>{
 const ctx=context();vm.runInContext(fs.readFileSync('apps-script/Yahoo.gs','utf8'),ctx);
 const rows=[['Setting','Value'],['replacementC',42],['replacementLW',42],['replacementRW',42],['replacementD',60],['replacementG',20]];
 let marker;const props={getProperty:()=>marker,setProperty:(k,v)=>marker=v};
 const s={getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),deleteRow:r=>rows.splice(r-1,1),appendRow:r=>rows.push(r),getRange:(r,c)=>({setValue:v=>rows[r-1][c-1]=v})};
 ctx.migrateYahooForwardReplacement_(s,props);
 assert.deepEqual(JSON.parse(JSON.stringify(rows.slice(1))),[['replacementD',60],['replacementG',20],['replacementF',110]]);
 rows[3][1]=120;ctx.migrateYahooForwardReplacement_(s,props);assert.equal(rows[3][1],120);
});
test('Yahoo source settings override row weights without changing stats',()=>{
 const ctx=context();vm.runInContext(fs.readFileSync('apps-script/Yahoo.gs','utf8'),ctx);
 const rows=[['a','The Athletic',12,10],['a','Scott Cullen',2,20],['a','DtZ',6,30]];
 assert.equal(JSON.stringify(ctx.yahooProjectionWeightRows_(rows,ctx.c)),'[[8],[3],[6]]');
 assert.equal(rows[0][2],12);assert.equal(rows[0][3],10);
 assert.equal(JSON.stringify(ctx.yahooProjectionWeightRows_(rows,{...ctx.c,projectionWeightDom:0})),'[[0],[3],[6]]');
 assert.throws(()=>ctx.yahooProjectionWeightRows_(rows,{...ctx.c,projectionWeightDom:-1}),/Invalid/);
 assert.equal(context(false).c.projectionWeightDom,undefined);
});
