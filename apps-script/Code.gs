function onOpen() {
  SpreadsheetApp.getUi().createMenu('Draft').addItem('Set up sheet','setupDraftSheet')
    .addItem('Refresh board','refreshBoard').addItem('Draft selected player','draftSelectedPlayer')
    .addItem('Undo last pick','undoLastPick').addToUi();
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
    ['PAR','Season points minus fixed group replacement baseline. Default ranks: F121 D49 G25.'],
    ['Replacement assumptions','12 teams: 7 F, 3 D, 1 G starters; bench 3 F / 1 D / 1 G. IR excluded. Adjust ranks in Settings.'],
    ['PAN','Hypothetical take-now points minus simulated mean of top 3 same-group options at next own non-keeper pick. Not a positional roster optimizer.'],
    ['Uncertainty','ADP plus normal noise in pick units; sigma 12 is a tunable assumption, not fitted data. All available players need ESPN ADP for PAN.'],
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
  for(const k of ['teams','draftSlot','rounds','simulations','nextAlternatives']) if(!Number.isInteger(c[k])||c[k]<1) throw Error('Invalid setting '+k);
  if(c.draftSlot>c.teams||c.simulations>1000||c.adpSigma<0||c.parTop<=0||c.parTop>1||c.adpBottom<=0||c.adpBottom>1) throw Error('Settings out of range');
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
    return {id:r[0],name:r[1],team:r[2],group:r[3],pos:r[5]||'—',adp:r[6]===''?null:r[6],stats:blended};
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
function refreshBoard() {withLock_(()=>{ensureNameSheets_();checkNames_();renderBoard_(inputs_());});}
function renderBoard_({c,players,state}) {
  const result=evaluate(players,c,state), s=SpreadsheetApp.getActive().getSheetByName('Board');
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();
  s.clear(); s.showColumns(1,s.getMaxColumns()); s.setConditionalFormatRules([]);
  const size=Math.max(10,...['F','D','G'].map(g=>result.available.filter(p=>p.group===g).length))+4;
  if(s.getMaxRows()<size) s.insertRowsAfter(s.getMaxRows(),size-s.getMaxRows());
  if(s.getMaxColumns()<26) s.insertColumnsAfter(s.getMaxColumns(),26-s.getMaxColumns());
  s.getRange('A1:Z1').merge(); s.getRange('A2:Z2').merge();
  s.getRange('A1').setValue(state.current>c.teams*c.rounds?'Draft complete':'Pick '+state.current+' · Team '+ownerAt(state.current,c.teams)+' · Next own pick '+(state.next||'none'));
  s.getRange('A2').setValue('Purple: top '+c.parTop*100+'% PAR · Blue: lowest '+c.adpBottom*100+'% ESPN ADP · '+(result.panReady?'PAN active':'PAN unavailable: missing ESPN ADP or no next pick'));
  const rules=[], pars=result.available.map(p=>p.par).sort((a,b)=>b-a), adps=result.available.map(p=>p.adp).filter(v=>v!==null).sort((a,b)=>a-b);
  const parCut=pars[Math.max(0,Math.ceil(pars.length*c.parTop)-1)], adpCut=adps[Math.max(0,Math.ceil(adps.length*c.adpBottom)-1)];
  ['F','D','G'].forEach((g,i)=>{
    const col=1+i*9, group=result.available.filter(p=>p.group===g).sort((a,b)=>b.par-a.par||a.name.localeCompare(b.name));
    s.getRange(3,col).setValue(['Forwards','Defensemen','Goalies'][i]);
    s.getRange(4,col,1,8).setValues([['Player','POS','Tm','Points','PAR','ADP','PAN','ID']]);
    if(group.length) {
      s.getRange(5,col,group.length,8).setValues(group.map(p=>[p.name,p.pos,p.team,p.points,p.par,p.adp===null?'':p.adp,p.pan===null?'':p.pan,p.id]));
      s.getRange(5,col+3,group.length,4).setNumberFormat('0');
      if(parCut!==undefined) rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(parCut).setBackground('#b4a7d6').setRanges([s.getRange(5,col+4,group.length,1)]).build());
      if(adpCut!==undefined) rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER('+['F','O','X'][i]+'5),'+['F','O','X'][i]+'5<='+adpCut+')').setBackground('#9fc5e8').setRanges([s.getRange(5,col+5,group.length,1)]).build());
    }
    s.setColumnWidth(col,154);s.setColumnWidth(col+1,54);s.setColumnWidth(col+2,34);
    s.setColumnWidths(col+3,4,43);s.hideColumns(col+3);s.hideColumns(col+7);
    if(g!=='F') s.hideColumns(col+1);
    if(i<2)s.setColumnWidth(col+8,12);
    s.getRange(3,col,2,7).setBackground('#ffffff').setFontColor('#111111').setFontWeight('bold');
    s.getRange(4,col,Math.max(1,group.length+1),7).setBorder(true,true,true,true,true,false,'#cccccc',SpreadsheetApp.BorderStyle.SOLID);
  });
  s.setConditionalFormatRules(rules);highlightNames_();s.setFrozenRows(4);s.setHiddenGridlines(true);
  s.getRange(1,1,size,26).setFontFamily('Arial').setFontSize(10);
  s.getRange(1,1,size,26).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  s.setRowHeights(5,size-4,21);
}
function draftSelectedPlayer() {
  // Capture identity before locking/repainting so a moved row cannot select a different player.
  const range=SpreadsheetApp.getActiveRange();
  if(!range||range.getSheet().getName()!=='Board'||range.getRow()<5||range.getNumRows()!==1||range.getNumColumns()!==1) throw Error('Select one player cell on Board');
  const block=Math.floor((range.getColumn()-1)/9), offset=(range.getColumn()-1)%9;
  if(block>2||offset>6) throw Error('Select a player cell');
  const id=range.getSheet().getRange(range.getRow(),block*9+8).getValue();
  withLock_(()=>{
    const input=inputs_(), p=input.players.find(x=>x.id===id);
    if(!p||input.state.removed.has(id)) throw Error('Player is unavailable; refresh the board');
    if(input.state.current>input.c.teams*input.c.rounds) throw Error('Draft is complete');
    SpreadsheetApp.getActive().getSheetByName('Draft Log').appendRow([input.state.current,ownerAt(input.state.current,input.c.teams),id,p.name,new Date()]);
    renderBoard_(inputs_());
  });
}
function undoLastPick() {
  withLock_(()=>{
    const s=SpreadsheetApp.getActive().getSheetByName('Draft Log');
    if(s.getLastRow()>1) s.deleteRow(s.getLastRow());
    renderBoard_(inputs_());
  });
}
