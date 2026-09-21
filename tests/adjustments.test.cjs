const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);
for(const file of ['Engine','Names','Adjustments','Compare'])vm.runInContext(fs.readFileSync('apps-script/'+file+'.gs','utf8'),ctx);
vm.runInContext('this.config={...DEFAULTS,replacementG:2};',ctx);
const goalie={id:'g',name:'Connor Hellebuyck',group:'G',stats:{W:32,SO:4,GA:150,SV:1500}};
test('projection cuts reduce blended valuation once and preserve source projections',()=>{
 const cut={...goalie,projectionCut:.25},other={...goalie,id:'other',name:'Other goalie',stats:{W:30,SO:4,GA:150,SV:1400}};
 assert.equal(ctx.scorePlayer(cut,ctx.config),206);
 assert.equal(ctx.projectedPoints_(cut,ctx.config),154.5);
 const result=ctx.evaluate([cut,other],ctx.config,{removed:new Set()});
 assert.equal(result.baselines.G,154.5);
 assert.equal(result.available.find(p=>p.id==='g').points,154.5);
 assert.equal(result.available.find(p=>p.id==='g').par,0);
 assert.equal(ctx.projectedPoints_(cut,ctx.config),154.5); // no compounding
 assert.equal(ctx.projectedPoints_({...cut,projectionCut:0},ctx.config),206);
 assert.equal(ctx.projectedPoints_({...cut,projectionCut:1},ctx.config),0);
 const rows=[['g','The Athletic',12,60,'','','','','',32,4,150,1500]];
 const comparison=ctx.projectionComparison_([cut],ctx.config,rows).rows[0];
 assert.equal(comparison.points,206);assert.equal(comparison.totals[0],206);
 const config={...ctx.config,replacementG:1};
 assert.equal(ctx.domProjectionRanks_([cut],rows,config).get('g'),ctx.domProjectionRanks_([goalie],rows,config).get('g'));
});
test('adjustment inputs match names, reject invalid or duplicate entries, and allow clearing cuts',()=>{
 const rows=[[' connor hellebuyck ',.25]],players=[goalie];
 const entry=ctx.adjustmentEntries_(rows,players)[0];
 assert.equal(entry.player.id,'g');assert.equal(entry.cut,.25);assert.equal(entry.message,'Matched');
 for(const cut of [-.1,25,'25%',NaN])assert.match(ctx.adjustmentEntries_([['Connor Hellebuyck',cut]],players)[0].message,/0% to 100%/);
 assert.equal(ctx.adjustmentEntries_([['Connor Hellebuyck','']],players)[0].cut,0);
 assert.equal(ctx.adjustmentEntries_([['','']],players)[0].message,'');
 assert.equal(ctx.adjustmentEntries_([['',.25]],players)[0].message,'Enter a player name');
 assert.equal(ctx.adjustmentEntries_([['Conor Hellebuyck',.25]],players)[0].message,'Name not found');
 assert.ok(ctx.adjustmentEntries_([['Connor Hellebuyck',.25],['g',.1]],players).every(e=>e.message==='Duplicate player'));
});
