function onOpen() {
  SpreadsheetApp.getUi().createMenu('Draft').addItem('Set up sheet','setupDraftSheet')
    .addItem('Refresh board','refreshBoard').addItem('Draft selected player','draftSelectedPlayer')
    .addItem('Undo last pick','undoLastPick').addItem('Import ESPN snapshot','importEspnSnapshot').addToUi();
}
function migrateReplacementSettings_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  const old=s.getDataRange().getValues();
  for(let r=old.length-1;r>=1;r--)if(['simulations','nextAlternatives'].includes(old[r][0]))s.deleteRow(r+1);
  const existing=rows_('Settings');
  for(let i=existing.length-1;i>=0;i--) if(existing[i][0]==='replacementF') {
    // Locate actual sheet row, including any blank rows in the input table.
    const values=s.getDataRange().getValues();
    for(let r=values.length-1;r>=1;r--) if(values[r][0]==='replacementF') s.deleteRow(r+1);
  }
  const guide=SpreadsheetApp.getActive().getSheetByName('Guide');
  if(guide) {
    const rows=guide.getDataRange().getValues();
    rows.forEach(r=>{if(r[0]==='PAN')r[1]='P(gone) × (positional PAR − expected best alternative PAR). Actual intervening non-keeper picks; candidate excluded; highest eligible PAN for multi-position players.';
      if(r[0]==='Uncertainty')r[1]='Conditional normal survival from ESPN ADP, with adpSigma in picks. No simulations. Zero intervening picks gives zero PAN. Missing ADP in a relevant pool leaves PAN blank.';});
    guide.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  }
  const keys=new Set(rows_('Settings').map(r=>r[0]));
  ['C','LW','RW'].forEach(pos=>{const key='replacement'+pos;if(!keys.has(key)) s.appendRow([key,DEFAULTS[key]]);});
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
  table_('Keepers',['Player','Team draft slot','Cost round','Name check'],[]);
  ensureNameSheets_();
  table_('Draft Log',['Pick','Team draft slot','Player ID','Player','Time'],[]);
  table_('Board',['Fantasy hockey draft'],[]);
  table_('Guide',['Topic','Details'],[
    ['Scoring','D bonus applies per G+A; SHP bonus is additional to regular G/A points.'],
    ['Use','Edit inputs, then Draft > Refresh board. Select one board player cell and run draft macro.'],
    ['ESPN','Paste ESPN eligibility and ADP in Players, with source/date. Yahoo POS stays separate.'],
    ['PAR','Season points minus positional replacement points derived from ranks in Settings: C49 LW37 RW37 D49 G25. Multi-position forwards use their highest PAR.'],
    ['Replacement assumptions','12 teams: 7 F, 3 D, 1 G starters; bench 3 F / 1 D / 1 G. IR excluded. Adjust ranks in Settings.'],
    ['PAN','P(gone) × (positional PAR − expected best alternative PAR). Uses actual intervening non-keeper picks; excludes the candidate; best eligible PAN for multi-position players.'],
    ['Uncertainty','Conditional normal survival around ESPN ADP; adpSigma is a positive standard deviation in picks. Zero intervening picks means zero PAN. Missing ADP in an eligible pool leaves PAN blank.'],
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
  for(const k of ['teams','draftSlot','rounds']) if(!Number.isInteger(c[k])||c[k]<1) throw Error('Invalid setting '+k);
  if(c.draftSlot>c.teams||c.adpSigma<=0||c.parTop<=0||c.parTop>1||c.adpBottom<=0||c.adpBottom>1) throw Error('Settings out of range');
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'], grouped=new Map();
  rows_('Projections').forEach(r=>{
    if(typeof r[2]!=='number'||r[2]<0) throw Error('Invalid projection weight');
    if(r[2]===0) return;
    if(!grouped.has(r[0])) grouped.set(r[0],[]);
    grouped.get(r[0]).push(r);
  });
  const players=rows_('Players').map(r=>{
    if(!['F','D','G'].includes(r[3])) throw Error('Invalid group for '+r[1]);
    const sources=grouped.get(r[0]); if(!sources) throw Error('Missing projections for '+r[1]);
    const blended={};
    stats.forEach((k,i)=>{
      const valid=sources.filter(s=>typeof s[i+3]==='number'&&Number.isFinite(s[i+3]));
      if(valid.length) blended[k]=valid.reduce((a,s)=>a+s[i+3]*s[2],0)/valid.reduce((a,s)=>a+s[2],0);
    });
    if(r[6]!==''&&(typeof r[6]!=='number'||r[6]<=0)) throw Error('Invalid ESPN ADP for '+r[1]);
    return {id:r[0],name:r[1],team:r[2],group:r[3],pos:r[5]||r[4]||'—',provisional:!r[5],adp:r[6]===''?null:r[6],stats:blended};
  });
  const ids=new Set(players.map(p=>p.id)); if(ids.size!==players.length) throw Error('Duplicate player ID');
  const keepers=rows_('Keepers').map(r=>{
    const match=resolvePlayerName_(r[0],players);
    if(!match.player) throw Error('Keeper '+r[0]+': '+match.message);
    return {id:match.player.id,team:r[1],round:r[2]};
  });
  const log=rows_('Draft Log').map(r=>({pick:r[0],id:r[2]}));
  return {c,players,state:draftState(c,keepers,log,ids)};
}
function withLock_(fn) {const lock=LockService.getDocumentLock();lock.waitLock(10000);try{return fn();}finally{lock.releaseLock();}}
function refreshBoard() {withLock_(()=>{migrateReplacementSettings_();addProjectionNames_();ensureNameSheets_();checkNames_();renderBoard_(inputs_());});}
function draftSelectedPlayer() {
  const range=SpreadsheetApp.getActiveRange();
  if(!range||range.getSheet().getName()!=='Board'||range.getRow()<4||range.getNumRows()!==1||range.getNumColumns()!==1) throw Error('Select one player cell on Board');
  const block=Math.floor((range.getColumn()-1)/9), offset=(range.getColumn()-1)%9;
  if(block>2||offset>6) throw Error('Select a player cell');
  const row=range.getSheet().getRange(range.getRow(),block*9+1,1,8).getValues()[0];
  const id=row[7], name=row[0];
  if(!id) throw Error('Select a player');
  withLock_(()=>{
    const c=Object.fromEntries(rows_('Settings').map(r=>[r[0],Number(r[1])]));
    const players=rows_('Players').map(r=>({id:r[0],name:r[1]}));
    const keepers=rows_('Keepers').map(r=>{const m=resolvePlayerName_(r[0],players);if(!m.player)throw Error('Unknown keeper: '+r[0]);return {id:m.player.id,team:r[1],round:r[2]};});
    const log=rows_('Draft Log').map(r=>({pick:r[0],id:r[2]}));
    const state=draftState(c,keepers,log,new Set(players.map(p=>p.id)));
    if(state.removed.has(id)) throw Error('Player is already drafted or kept');
    if(state.current>c.teams*c.rounds) throw Error('Draft complete');
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
