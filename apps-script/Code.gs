function boardHeaders_() {return ['Player','POS','Tm','Age','Rk','ADP','DomRk','sADP','coefV','PAR','PAN','ID'];}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Draft').addItem('Set up sheet','setupDraftSheet')
    .addItem('Refresh board','refreshBoard').addItem('Draft selected player','draftSelectedPlayer')
    .addItem('Undo last pick','undoLastPick').addItem('Import ESPN snapshot','importEspnSnapshot').addToUi();
}
function migrateForwardReplacement_(sheet, properties) {
  const rows=sheet.getDataRange().getValues();
  const values=Object.fromEntries(rows.slice(1).map(r=>[r[0],r[1]]));
  if(!properties.getProperty('panForwardReplacementRanks')) {
    const ranks={C:40,LW:36,RW:36};
    for(const pos of Object.keys(ranks)) {
      const value=values['replacement'+pos];
      if(value!==undefined) {
        if(!Number.isInteger(value)||value<1)throw Error('Invalid PAN replacement rank for '+pos);
        ranks[pos]=value;
      }
    }
    properties.setProperty('panForwardReplacementRanks',JSON.stringify(ranks));
  }
  for(let r=rows.length-1;r>=1;r--)if(/^replacement(C|LW|RW|F)$/.test(String(rows[r][0])))sheet.deleteRow(r+1);
  if(!Object.prototype.hasOwnProperty.call(values,'replacementFPoints'))sheet.appendRow(['replacementFPoints',DEFAULTS.replacementFPoints]);
}
function migrateReplacementSettings_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  const old=s.getDataRange().getValues();
  for(let r=old.length-1;r>=1;r--)if(['simulations','nextAlternatives','adpSigma'].includes(old[r][0]))s.deleteRow(r+1);
  migrateForwardReplacement_(s,PropertiesService.getDocumentProperties());
  const guide=SpreadsheetApp.getActive().getSheetByName('Guide');
  if(guide) {
    const rows=guide.getDataRange().getValues();
    rows.forEach(r=>{
      if(r[0]==='Replacement assumptions')r[1]='Replacement ranks calibrated by comparing last year’s draft with contemporaneous rankings. Adjust ranks in Settings.';
      if(r[0]==='PAR')r[1]='Forward PAR is season points minus replacementFPoints (initially 161). D/G still use replacement ranks. PAN uses one shared forward pool.';
      if(r[0]==='PAN')r[1]='Group PAR minus the expected best available PAR after a fixed 22-selection wait; one shared F pool, separate D and G pools. Expected best includes every player’s chance of surviving, including the candidate. PAN stays fixed-gap even at consecutive own picks.';
      if(r[0]==='Uncertainty')r[1]='sADP = ESPN rank^0.2 × ESPN ADP^0.4 × Dom PAR rank^0.4, before optional position adjustments. Dom uses his own stats and D/G replacement points with the shared forward baseline.';
      if(r[0]==='Keepers')r[1]='Type names only. Keepers are removed from availability; no team, round cost, or reserved draft pick is needed.';
      if(r[0]==='Projections')r[1]='Weight parts: Athletic 12; DtZ and LineupExperts 6 each; Blake and Nate 4 each; Laidlaw 3; Cullen 2. Each stat renormalizes over sources that supply it; blank is not zero.';
      if(r[0]==='Provenance')r[1]='Athletic, DtZ, LineupExperts, Scott Cullen, Steve Laidlaw, and both Apples & Ginos season projections are blended. ESPN rank and ADP remain draft-timing inputs.';
    });
    guide.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  }
  const keys=new Set(rows_('Settings').map(r=>r[0]));
  for(const key of ['domRankWeight','espnRankWeight','multiplierF','multiplierD','multiplierG','exponentF','exponentD','exponentG','curvePivot','panGap','highlightCount','youngAgeMax','adpSigmaFloor','adpSigmaRate'])if(!keys.has(key))s.appendRow([key,DEFAULTS[key]]);
  const properties=PropertiesService.getDocumentProperties();
  const sadpMigration='weightedGeometricSadp20260908';
  if(properties.getProperty(sadpMigration)!=='applied') {
    const values={espnRankWeight:0.25,multiplierF:1,multiplierD:0.85,multiplierG:0.81};
    s.getDataRange().getValues().forEach((row,i)=>{
      if(Object.prototype.hasOwnProperty.call(values,row[0]))s.getRange(i+1,2).setValue(values[row[0]]);
    });
    properties.setProperty(sadpMigration,'applied');
  }
  const curveMigration='goalieSadpCurve20260909';
  if(properties.getProperty(curveMigration)!=='applied') {
    const values={multiplierD:0.86,multiplierG:0.65,exponentF:1,exponentD:1,exponentG:1.235,curvePivot:50};
    s.getDataRange().getValues().forEach((row,i)=>{
      if(Object.prototype.hasOwnProperty.call(values,row[0]))s.getRange(i+1,2).setValue(values[row[0]]);
    });
    properties.setProperty(curveMigration,'applied');
  }

  const parBlendMigration='domParDirectBlend20260919';
  if(properties.getProperty(parBlendMigration)!=='applied') {
    const values={espnRankWeight:0.2,domRankWeight:0.4,multiplierF:1,multiplierD:1,multiplierG:1,exponentF:1,exponentD:1,exponentG:1};
    s.getDataRange().getValues().forEach((row,i)=>{
      if(Object.prototype.hasOwnProperty.call(values,row[0]))s.getRange(i+1,2).setValue(values[row[0]]);
    });
    properties.setProperty(parBlendMigration,'applied');
  }

}
function table_(name, headers, rows) {
  const ss=SpreadsheetApp.getActive();
  if(ss.getSheetByName(name)) return ss.getSheetByName(name);
  const s=ss.insertSheet(name);
  s.getRange(1,1,1,headers.length).setValues([headers]).setBackground('#17364d').setFontColor('#ffffff').setFontWeight('bold');
  if(rows.length) s.getRange(2,1,rows.length,headers.length).setValues(rows);
  s.setFrozenRows(1); s.autoResizeColumns(1,headers.length); return s;
}
function projectionRow_(p) {
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
  return [p.id,p.source,p.weight,...stats.map(k=>p.stats[k]===undefined?'':p.stats[k])];
}
function ensureSecondaryProjections_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Projections');
  // Retire the duplicate source, batching contiguous rows from the bottom up.
  const old=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,3).getValues():[];
  for(let i=old.length-1;i>=0;i--) {
    if(old[i][1]!=='Hashtag Hockey')continue;
    const end=i;while(i>0&&old[i-1][1]==='Hashtag Hockey')i--;
    s.deleteRows(i+2,end-i+1);
  }
  const existing=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,3).getValues():[];
  const seen=new Set(existing.map(r=>r[0]+'|'+r[1]));
  const additional=SECONDARY_PROJECTION_DATA.filter(p=>!seen.has(p.id+'|'+p.source)).map(projectionRow_);
  if(additional.length) {
    const last=s.getLastRow(), needed=last+additional.length;
    if(s.getMaxRows()<needed)s.insertRowsAfter(s.getMaxRows(),needed-s.getMaxRows());
    s.getRange(last+1,1,additional.length,13).setValues(additional);
  }
  const properties=PropertiesService.getDocumentProperties(), marker='projectionBlendEightSourcesV2_20260917';
  if(properties.getProperty(marker)!=='applied') {
    const weights={'The Athletic':12,'DtZ':6,'LineupExperts':6,'Scott Cullen':2,
      'Steve Laidlaw':3,'Apples & Ginos Blake':4,'Apples & Ginos Nate':4};
    const values=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,3).getValues():[];
    if(values.length)s.getRange(2,3,values.length,1).setValues(values.map(r=>[
      Object.prototype.hasOwnProperty.call(weights,r[1])?weights[r[1]]:r[2]
    ]));
    properties.setProperty(marker,'applied');
  }
}
function setupDraftSheet() {
  table_('Settings',['Setting','Value'],Object.entries(DEFAULTS));
  table_('Players',['ID','Player','Team','Group','Source POS','ESPN POS','ESPN ADP','ESPN source / date'],PROJECTION_DATA.map(p=>[p.id,p.name,p.team,p.group,p.sourcePos,'','','']));
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
  table_('Projections',['ID','Source','Weight',...stats],PROJECTION_DATA.map(projectionRow_));
  table_('Keepers',['Player','Name check'],[]);
  ensureNameSheets_();
  table_('Draft Log',['Pick','Team draft slot','Player ID','Player','Time'],[]);
  table_('Board',['Fantasy hockey draft'],[]);
  table_('Guide',['Topic','Details'],[
    ['Scoring','D bonus applies per G+A; SHP bonus is additional to regular G/A points.'],
    ['Use','Edit inputs, then Draft > Refresh board. Select one board player cell and run draft macro.'],
    ['ESPN','Paste ESPN eligibility and ADP in Players, with source/date. Yahoo POS stays separate.'],
    ['PAR','Forward PAR is season points minus replacementFPoints (initially 161). D/G still use replacement ranks. PAN uses one shared forward pool.'],
    ['Replacement assumptions','Replacement ranks calibrated from last year’s draft and rankings. Adjust ranks in Settings.'],
    ['PAN','Group PAR minus expected best available PAR after 22 selections. All forwards share one pool; D and G have separate pools. Expected best includes the candidate’s survival chance.'],
    ['Uncertainty','sADP geometrically blends ESPN rank (20%), ESPN ADP (40%), and Dom-only PAR rank (40%), before optional positional adjustments. Conditional-normal uncertainty is max(4 picks, 18% of sADP).'],
    ['Keepers','Up to 2 per team; use draft slot 1–12 and cost round 1–16. Add all keepers before drafting.'],
    ['Shortcuts','Extensions > Macros > Manage macros. Draft = 1; Undo = 2. Check the shortcut displayed on your Mac.'],
    ['Provenance','Athletic, DtZ, LineupExperts, Scott Cullen, Steve Laidlaw, and both Apples & Ginos season projections are blended. ESPN rank and ADP remain draft-timing inputs.'],
    ['Projections','Weight parts: Athletic 12; DtZ and LineupExperts 6 each; Blake and Nate 4 each; Laidlaw 3; Cullen 2. Each stat renormalizes over sources that supply it; blank is not zero.'],
    ['Eligibility reference','https://support.espn.com/hc/en-us/articles/360054126392-Position-Eligibility'],
    ['Macros reference','https://developers.google.com/apps-script/guides/sheets/macros']
  ]).setColumnWidth(2,760);
  refreshBoard();
}
function rows_(name) {return SpreadsheetApp.getActive().getSheetByName(name).getDataRange().getValues().slice(1).filter(r=>r[0]!=='');}
function inputs_() {
  const c=Object.fromEntries(rows_('Settings').map(r=>[r[0],Number(r[1])]));
  for(const k of Object.keys(DEFAULTS)) if(!Number.isFinite(c[k])) throw Error('Invalid setting '+k);
  for(const k of ['teams','draftSlot','rounds','panGap','highlightCount','youngAgeMax']) if(!Number.isInteger(c[k])||c[k]<1) throw Error('Invalid setting '+k);
  if(c.multiplierF<=0||c.multiplierD<=0||c.multiplierG<=0||c.exponentF<=0||c.exponentD<=0||c.exponentG<=0||c.curvePivot<=0||c.espnRankWeight<0||c.espnRankWeight>1||c.draftSlot>c.teams||c.adpSigmaFloor<=0||c.adpSigmaRate<=0||c.parTop<=0||c.parTop>1||c.adpBottom<=0||c.adpBottom>1) throw Error('Settings out of range');
  if(c.domRankWeight<0||c.domRankWeight>1||c.domRankWeight+c.espnRankWeight>1)throw Error('Dom and ESPN rank weights must be nonnegative and sum to at most 1; ADP gets the remainder');
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'], grouped=new Map();
  const projectionRows=rows_('Projections');
  projectionRows.forEach(r=>{
    if(typeof r[2]!=='number'||r[2]<0) throw Error('Invalid projection weight');
    if(r[2]===0) return;
    if(!grouped.has(r[0])) grouped.set(r[0],[]);
    grouped.get(r[0]).push(r);
  });
  const ages=new Map(PROJECTION_DATA.map(p=>[p.id,p.age]));
  const players=rows_('Players').map(r=>{
    if(!['F','D','G'].includes(r[3])) throw Error('Invalid group for '+r[1]);
    const sources=grouped.get(r[0]); if(!sources) throw Error('Missing projections for '+r[1]);
    const blended={};
    stats.forEach((k,i)=>{
      const valid=sources.filter(s=>typeof s[i+3]==='number'&&Number.isFinite(s[i+3]));
      if(valid.length) blended[k]=valid.reduce((a,s)=>a+s[i+3]*s[2],0)/valid.reduce((a,s)=>a+s[2],0);
    });
    if(r[6]!==''&&(typeof r[6]!=='number'||r[6]<=0)) throw Error('Invalid ESPN ADP for '+r[1]);
    return {id:r[0],name:r[1],team:r[2],age:ages.get(r[0])==null?'':ages.get(r[0]),group:r[3],pos:r[5]||r[4]||'—',provisional:!r[5],adp:r[6]===''?null:r[6],espnRank:typeof r[8]==='number'&&r[8]>0?r[8]:null,stats:blended};
  });
  const domRanks=domProjectionRanks_(players,projectionRows,c);
  players.forEach(p=>{p.domRank=domRanks.get(p.id)||null;});
  const ids=new Set(players.map(p=>p.id)); if(ids.size!==players.length) throw Error('Duplicate player ID');
  const keepers=rows_('Keepers').map(r=>{
    const match=resolvePlayerName_(r[0],players);
    if(!match.player) throw Error('Keeper '+r[0]+': '+match.message);
    return {id:match.player.id};
  });
  const log=rows_('Draft Log').map(r=>({pick:r[0],id:r[2]}));
  return {c,players,state:draftState(c,keepers,log,ids)};
}
function withLock_(fn) {const lock=LockService.getDocumentLock();lock.waitLock(10000);try{return fn();}finally{lock.releaseLock();}}
function draftIdentities_() {
  const cache=CacheService.getDocumentCache(),key='draftPlayerIdentitiesV1';
  const saved=cache.get(key);if(saved)return JSON.parse(saved);
  const s=SpreadsheetApp.getActive().getSheetByName('Players');
  const players=s.getRange(2,1,s.getLastRow()-1,2).getValues().filter(r=>r[0]).map(r=>({id:r[0],name:r[1]}));
  cache.put(key,JSON.stringify(players),21600);return players;
}
function refreshBoard() {withLock_(()=>{migrateReplacementSettings_();ensureEspnRanks_();ensureSecondaryProjections_();addProjectionNames_();ensureNameSheets_();checkNames_();const input=inputs_();renderProjectionComparison_(input);renderBoard_(input);});}
function draftSelectedPlayer() {
  const range=SpreadsheetApp.getActiveRange();
  if(!range||range.getSheet().getName()!=='Board'||range.getRow()<4||range.getNumRows()!==1||range.getNumColumns()!==1) throw Error('Select one player cell on Board');
  // Cache the rendered layout, so adding hidden columns does not slow each pick.
  const cache=CacheService.getDocumentCache(),key='draftBoardHeadersV1';
  let headers=JSON.parse(cache.get(key)||'null');
  if(!headers) {
    const row=range.getSheet().getRange(3,1,1,range.getSheet().getLastColumn()).getValues()[0];
    const end=row.indexOf('ID');if(end<0)throw Error('Refresh board before drafting');
    headers=row.slice(0,end+1);cache.put(key,JSON.stringify(headers),21600);
  }
  const stride=headers.length+1,block=Math.floor((range.getColumn()-1)/stride),offset=(range.getColumn()-1)%stride;
  if(block>2||offset>=headers.indexOf('ID')) throw Error('Select a player cell');
  const row=range.getSheet().getRange(range.getRow(),block*stride+1,1,headers.length).getValues()[0];
  const id=row[headers.indexOf('ID')], name=row[0];
  if(!id) throw Error('Select a player');
  withLock_(()=>{
    const c=Object.fromEntries(rows_('Settings').map(r=>[r[0],Number(r[1])]));
    const players=draftIdentities_();
    const keepers=rows_('Keepers').map(r=>{const m=resolvePlayerName_(r[0],players);if(!m.player)throw Error('Unknown keeper: '+r[0]);return {id:m.player.id};});
    const log=rows_('Draft Log').map(r=>({pick:r[0],id:r[2]}));
    const state=draftState(c,keepers,log,new Set(players.map(p=>p.id)));
    if(state.removed.has(id)) throw Error('Player is already drafted or kept');
    if(state.current>state.limit) throw Error('Draft complete');
    SpreadsheetApp.getActive().getSheetByName('Draft Log').appendRow([state.current,ownerAt(state.current,c.teams),id,name,new Date()]);
  });
}
function undoLastPick() {
  withLock_(()=>{const s=SpreadsheetApp.getActive().getSheetByName('Draft Log');if(s.getLastRow()>1)s.deleteRow(s.getLastRow());});
}

function addProjectionNames_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Projections');
  const headers=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  let col=headers.indexOf('Player')+1;
  if(!col) col=headers.length+1;
  s.getRange(1,col).setValue('Player').setFontWeight('bold');
  if(s.getLastRow()>1) s.getRange(2,col,s.getLastRow()-1,1).setFormulas(Array.from({length:s.getLastRow()-1},(_,i)=>['=IFNA(XLOOKUP(A'+(i+2)+',Players!A$2:A,Players!B$2:B),"Unknown player ID")']));
  s.setColumnWidth(col,185);
}
