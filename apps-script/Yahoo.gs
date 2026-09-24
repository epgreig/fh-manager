/** Yahoo-only entry points; excluded from the ESPN build. */
function ensureYahooSettings_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  const keys=new Set(rows_('Settings').map(r=>r[0]));
  for(const [key,value] of Object.entries(DEFAULTS))if(!keys.has(settingName_(key)))s.appendRow([settingName_(key),value]);
  s.getDataRange().getValues().forEach((r,i)=>{
    if(/^replacement(C|LW|RW|D|G)$/.test(r[0]))s.getRange(i+1,1).setNote(leagueConfig_().replacementNote);
    if(r[0]==='platformRankWeight')s.getRange(i+1,1).setNote('Controls Yahoo rank in this sheet. Leave at 0 until a verified Yahoo rank source is available.');
    if(r[0]==='domRankWeight')s.getRange(i+1,1).setNote('Yahoo ADP gets the remaining weight. Initial 37.5% Dom / 62.5% ADP preserves the previous 30:50 ratio after removing unverified platform rank.');
  });
}
function initializeYahoo_() {
  const ss=SpreadsheetApp.getActive(),guide=ss.getSheetByName('Guide');
  const entries=[
    ['League',leagueConfig_().name+' · 14 teams · pick 8 · no keepers'],
    ['Roster','2 C, 2 LW, 2 RW, 4 D, 1 G, 5 bench; 1 IR and 1 IR+. No FLEX. 16 draft selections per team.'],
    ['Scoring','G 15; A 10; +/- 1; PIM 1; SOG 1; HIT 1; BLK 1. Additional SHG 15 and SHA 10. No D bonus. Goalies: W 10, GA -5, SV 1, SO 10.'],
    ['Replacement',leagueConfig_().replacementNote+' Baselines include drafted players. Configure ranks in Settings; replacement points appear in column C.'],
    ['PAR','Separate C/LW/RW/D/G replacement pools. Dual-eligible players use their best eligible PAR; one row per player on Board.'],
    ['PAN','Expected best available PAR at each eligible position after panGap selections; dual eligibility uses the best of those positional PAN values. Same player may be an alternative in multiple pools, never counted twice within a pool.'],
    ['Draft order','Power mean p=-2 of Yahoo ADP and Dom-only league PAR rank. Initial weights: 62.5% ADP / 37.5% Dom. Yahoo rank is blank until verified. Frozen sRk is rebuilt on Refresh board, then stays fixed while drafting.'],
    ['Projections','Athletic 12, DtZ 6, LineupExperts 6, Blake 4, Nate 4, Laidlaw 3, Cullen 2. Missing categories renormalize over sources that provide them; missing is not zero.'],
    ['Source comparison','Missing categories in individual source totals use the blended estimate, with cell notes. Relative SD measures disagreement, not outcome uncertainty.'],
    ['Yahoo data','Public Yahoo snapshot: '+YAHOO_DATA.retrievedAt+'. Import Yahoo snapshot updates eligibility/ADP, then refreshes. Unmatched players are flagged in Yahoo Import.'],
    ['Use','Select a Board player cell and use Draft selected player. Draft/undo update the log and formulas. Refresh also overwrites Board Snapshot with values.'],
    ['Shortcuts','Extensions > Macros > Manage macros. Draft = 1; Undo = 2. Use the shortcut shown by Google Sheets.'],
    ['Adjustments','Positive Cut reduces projections; negative Cut boosts them. Refresh to apply.'],
    ['Attribution','Fantasy data provided by Yahoo Fantasy. https://hockey.fantasysports.yahoo.com/hockey']
  ];
  guide.clearContents();guide.getRange(1,1,entries.length+1,2).setValues([['Topic','Details'],...entries]);
  guide.setColumnWidth(2,760);guide.getRange(2,2,entries.length,1).setWrap(true);
  if(rows_('Keepers').length===0)ss.getSheetByName('Keepers').hideSheet();
  writeYahooSnapshot_();
}
function ensureYahooRanks_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Players');
  s.getRange(1,9).setValue('Yahoo default rank').setNote('No verified default ranking in the public snapshot. Blank deliberately; no ESPN values are used.');
}
function writeYahooSnapshot_() {
  const ss=SpreadsheetApp.getActive(),s=ss.getSheetByName('Players');
  const rows=s.getRange(2,1,s.getLastRow()-1,9).getValues();
  const map=new Map(YAHOO_DATA.matches.map(p=>[p.id,p]));
  const report=[];
  const values=rows.map(r=>{
    const p=map.get(r[0]);
    if(!p){report.push([r[1],'No unique Yahoo match; source eligibility is provisional']);return ['','','',''];}
    report.push([r[1],p.adp===null?'Eligibility imported; no Yahoo ADP (Dom rank still available)':'Imported']);
    return [p.pos,p.adp??'','Yahoo '+YAHOO_DATA.season+' · '+YAHOO_DATA.retrievedAt,p.rank??''];
  });
  s.getRange(1,6,1,4).setValues([['Yahoo POS','Yahoo ADP','Yahoo source / date','Yahoo default rank']]);
  s.getRange(2,6,values.length,4).setValues(values);
  const audit=table_('Yahoo Import',['Player','Result'],[]);audit.clearContents();
  if(audit.getMaxRows()<report.length+1)audit.insertRowsAfter(audit.getMaxRows(),report.length+1-audit.getMaxRows());
  audit.getRange(1,1,report.length+1,2).setValues([['Player','Result'],...report]);audit.autoResizeColumns(1,2);
  ensureYahooRanks_();
}
function importYahooSnapshot() {withLock_(writeYahooSnapshot_);refreshBoard();}
