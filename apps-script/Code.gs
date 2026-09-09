function onOpen() {
  SpreadsheetApp.getUi().createMenu('Draft').addItem('Set up sheet','setupDraftSheet')
    .addItem('Refresh board','refreshBoard').addItem('Draft selected player','draftSelectedPlayer')
    .addItem('Undo last pick','undoLastPick').addItem('Import ESPN snapshot','importEspnSnapshot').addToUi();
}
function migrateReplacementSettings_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  const old=s.getDataRange().getValues();
  for(let r=old.length-1;r>=1;r--)if(['simulations','nextAlternatives','adpSigma'].includes(old[r][0]))s.deleteRow(r+1);
  const existing=rows_('Settings');
  for(let i=existing.length-1;i>=0;i--) if(existing[i][0]==='replacementF') {
    // Locate actual sheet row, including any blank rows in the input table.
    const values=s.getDataRange().getValues();
    for(let r=values.length-1;r>=1;r--) if(values[r][0]==='replacementF') s.deleteRow(r+1);
  }
  const guide=SpreadsheetApp.getActive().getSheetByName('Guide');
  if(guide) {
    const rows=guide.getDataRange().getValues();
    rows.forEach(r=>{
      if(r[0]==='Replacement assumptions')r[1]='Replacement ranks calibrated by comparing last year’s draft with contemporaneous rankings. Adjust ranks in Settings.';
      if(r[0]==='PAR')r[1]='Season points minus positional replacement points derived from ranks in Settings. Defaults: C32 LW32 RW32 D32 G20. Multi-position forwards use their highest PAR.';
      if(r[0]==='PAN')r[1]='Positional PAR minus the expected best available PAR after a fixed 22-selection wait. Expected best includes every player’s chance of surviving, including the candidate. PAN stays fixed-gap even at consecutive own picks.';
      if(r[0]==='Uncertainty')r[1]='sADP = 50/50 ESPN ADP and default rank, times the positional multiplier. Draft uncertainty is max(adpSigmaFloor, adpSigmaRate × sADP): defaults 4 picks and 18%. F=1, D=0.81, G=0.77.';
      if(r[0]==='Keepers')r[1]='Type names only. Keepers are removed from availability; no team, round cost, or reserved draft pick is needed.';
    });
    guide.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  }
  const keys=new Set(rows_('Settings').map(r=>r[0]));
  for(const key of ['espnRankWeight','multiplierF','multiplierD','multiplierG','panGap','highlightCount','youngAgeMax','adpSigmaFloor','adpSigmaRate'])if(!keys.has(key))s.appendRow([key,DEFAULTS[key]]);
  ['C','LW','RW'].forEach(pos=>{const key='replacement'+pos;if(!keys.has(key)) s.appendRow([key,DEFAULTS[key]]);});
  // Apply the requested calibration once per sheet; later user edits remain editable.
  const properties=PropertiesService.getDocumentProperties();
  const migration='replacementRanks20260908';
  if(properties.getProperty(migration)!=='applied') {
    const ranks={replacementC:32,replacementLW:32,replacementRW:32,replacementD:32,replacementG:20};
    s.getDataRange().getValues().forEach((row,i)=>{
      if(Object.prototype.hasOwnProperty.call(ranks,row[0]))s.getRange(i+1,2).setValue(ranks[row[0]]);
    });
    properties.setProperty(migration,'applied');
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
function setupDraftSheet() {
  table_('Settings',['Setting','Value'],Object.entries(DEFAULTS));
  table_('Players',['ID','Player','Team','Group','Source POS','ESPN POS','ESPN ADP','ESPN source / date'],PROJECTION_DATA.map(p=>[p.id,p.name,p.team,p.group,p.sourcePos,'','','']));
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
  table_('Projections',['ID','Source','Weight',...stats],PROJECTION_DATA.map(p=>[p.id,p.source,p.weight,...stats.map(k=>p.stats[k]===undefined?'':p.stats[k])]));
  table_('Keepers',['Player','Name check'],[]);
  ensureNameSheets_();
  table_('Draft Log',['Pick','Team draft slot','Player ID','Player','Time'],[]);
  table_('Board',['Fantasy hockey draft'],[]);
  table_('Guide',['Topic','Details'],[
    ['Scoring','D bonus applies per G+A; SHP bonus is additional to regular G/A points.'],
    ['Use','Edit inputs, then Draft > Refresh board. Select one board player cell and run draft macro.'],
    ['ESPN','Paste ESPN eligibility and ADP in Players, with source/date. Yahoo POS stays separate.'],
    ['PAR','Season points minus positional replacement points derived from ranks in Settings: C32 LW32 RW32 D32 G20. Multi-position forwards use their highest PAR.'],
    ['Replacement assumptions','Replacement ranks calibrated from last year’s draft and rankings. Adjust ranks in Settings.'],
    ['PAN','Positional PAR minus the expected best available PAR after 22 selections. Expected best includes every player’s survival chance, including the candidate; multi-position players use their highest eligible PAN.'],
    ['Uncertainty','Conditional normal survival around sADP. Standard deviation is max(adpSigmaFloor, adpSigmaRate × sADP), defaulting to 4 picks or 18% of rank. Missing sADP in an eligible pool leaves PAN blank.'],
    ['Keepers','Up to 2 per team; use draft slot 1–12 and cost round 1–16. Add all keepers before drafting.'],
    ['Shortcuts','Extensions > Macros > Manage macros. Draft = 1; Undo = 2. Check the shortcut displayed on your Mac.'],
    ['Provenance','The Athletic workbook: The List cached season totals. Source KEEP? flags and fantasy scores are not imported.'],
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
  if(c.multiplierF<=0||c.multiplierD<=0||c.multiplierG<=0||c.espnRankWeight<0||c.espnRankWeight>1||c.draftSlot>c.teams||c.adpSigmaFloor<=0||c.adpSigmaRate<=0||c.parTop<=0||c.parTop>1||c.adpBottom<=0||c.adpBottom>1) throw Error('Settings out of range');
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'], grouped=new Map();
  rows_('Projections').forEach(r=>{
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
function refreshBoard() {withLock_(()=>{migrateReplacementSettings_();ensureEspnRanks_();addProjectionNames_();ensureNameSheets_();checkNames_();renderBoard_(inputs_());});}
function draftSelectedPlayer() {
  const range=SpreadsheetApp.getActiveRange();
  if(!range||range.getSheet().getName()!=='Board'||range.getRow()<4||range.getNumRows()!==1||range.getNumColumns()!==1) throw Error('Select one player cell on Board');
  const block=Math.floor((range.getColumn()-1)/10), offset=(range.getColumn()-1)%10;
  if(block>2||offset>7) throw Error('Select a player cell');
  const row=range.getSheet().getRange(range.getRow(),block*10+1,1,9).getValues()[0];
  const id=row[8], name=row[0];
  if(!id) throw Error('Select a player');
  withLock_(()=>{
    const c=Object.fromEntries(rows_('Settings').map(r=>[r[0],Number(r[1])]));
    const players=rows_('Players').map(r=>({id:r[0],name:r[1]}));
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
