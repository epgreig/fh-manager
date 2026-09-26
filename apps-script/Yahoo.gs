/** Yahoo-only entry points; excluded from the ESPN build. */
function ensureYahooSettings_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  const properties=PropertiesService.getDocumentProperties(), marker='yahooXRank701515_20260924';
  if(properties.getProperty(marker)!=='applied') {
    const values=s.getDataRange().getValues();
    for(const name of ['platformRankWeight','domRankWeight']) {
      const row=values.findIndex(r=>r[0]===name);
      if(row>=0)s.getRange(row+1,2).setValue(0.15);else s.appendRow([name,0.15]);
    }
    const players=SpreadsheetApp.getActive().getSheetByName('Players');
    const ranks=new Map(YAHOO_DATA.matches.map(p=>[p.id,p.rank]));
    const ids=players.getRange(2,1,players.getLastRow()-1,1).getValues();
    players.getRange(2,9,ids.length,1).setValues(ids.map(r=>[ranks.get(r[0])??'']));
    ensureYahooRanks_();
    properties.setProperty(marker,'applied');
  }
  migrateYahooForwardReplacement_(s,properties);
  const keys=new Set(rows_('Settings').map(r=>r[0]));
  for(const [key,value] of Object.entries(DEFAULTS))if(!keys.has(settingName_(key)))s.appendRow([settingName_(key),value]);
  s.getDataRange().getValues().forEach((r,i)=>{
    if(/^replacement(F|D|G)$/.test(r[0]))s.getRange(i+1,1).setNote(leagueConfig_().replacementNote);
    if(/^projectionWeight/.test(r[0]))s.getRange(i+1,1).setNote('Projection blend parts, not percentages. Edit then Refresh board. Overrides this source’s Weight column in Projections for Yahoo only; missing categories renormalize. Zero excludes the source.');
    if(r[0]==='platformRankWeight')s.getRange(i+1,1).setNote('Yahoo XRank weight. Defaults: 70% ADP, 15% Yahoo XRank, 15% Dom; p=-2. Missing components renormalize over those available.');
    if(r[0]==='domRankWeight')s.getRange(i+1,1).setNote('Dom-only league PAR rank weight. Yahoo ADP receives the remaining weight (default 70%).');
  });
}
function initializeYahoo_() {
  const ss=SpreadsheetApp.getActive(),guide=ss.getSheetByName('Guide');
  const entries=[
    ['League',leagueConfig_().name+' · 14 teams · pick 8 · no keepers'],
    ['Roster','2 C, 2 LW, 2 RW, 4 D, 1 G, 5 bench; 1 IR and 1 IR+. No FLEX. 16 draft selections per team.'],
    ['Scoring','G 15; A 10; +/- 1; PIM 1; SOG 1; HIT 1; BLK 1. Additional SHG 15 and SHA 10. No D bonus. Goalies: W 10, GA -5, SV 1, SO 10.'],
    ['Replacement',leagueConfig_().replacementNote+' Baselines include drafted players. Configure ranks in Settings; replacement points appear in column C.'],
    ['PAR','Shared F replacement pool (rank 110), separate D and G. PAR and Dom-only PAR use this shared forward baseline. Board POS retains actual eligibility.'],
    ['PAN','Expected best available PAR in the shared F pool after panGap selections. D and G use their own pools. Each player occurs once.'],
    ['Draft order','Power mean p=-2: 70% Yahoo ADP, 15% Yahoo XRank from the supplied CSV, 15% Dom-only league PAR rank. Missing components renormalize. Frozen sRk is rebuilt on Refresh board, then stays fixed while drafting.'],
    ['Projections','Source weights are editable in Settings: Dom 8, DtZ 6, LineupExperts 6, Blake 4, Nate 4, Laidlaw 3, Cullen 3 by default. Missing categories renormalize over sources that provide them; missing is not zero.'],
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
  // Repair the old name-only XRank match without overwriting other player edits.
  const properties=PropertiesService.getDocumentProperties(),marker='yahooPetterssonIdentity_20260925';
  if(properties.getProperty(marker)!=='applied') {
    const ids=s.getRange(2,1,s.getLastRow()-1,1).getValues();
    const row=ids.findIndex(r=>r[0]==='8ba1b0f57f5a5446');
    if(row>=0)s.getRange(row+2,9).setValue('');
    properties.setProperty(marker,'applied');
  }

  s.getRange(1,9).setValue('Yahoo XRank').setNote('User-provided Yahoo Ranks.csv. Players outside the CSV remain blank; available components renormalize.');
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
  s.getRange(1,6,1,4).setValues([['Yahoo POS','Yahoo ADP','Yahoo source / date','Yahoo XRank']]);
  s.getRange(2,6,values.length,4).setValues(values);
  const audit=table_('Yahoo Import',['Player','Result'],[]);audit.clearContents();
  if(audit.getMaxRows()<report.length+1)audit.insertRowsAfter(audit.getMaxRows(),report.length+1-audit.getMaxRows());
  audit.getRange(1,1,report.length+1,2).setValues([['Player','Result'],...report]);audit.autoResizeColumns(1,2);
  ensureYahooRanks_();
}
function importYahooSnapshot() {withLock_(writeYahooSnapshot_);refreshBoard();}

function migrateYahooForwardReplacement_(sheet,properties) {
  const marker='yahooSharedF110_20260924';
  if(properties.getProperty(marker)==='applied')return;
  const rows=sheet.getDataRange().getValues();
  for(let r=rows.length-1;r>=1;r--)if(/^replacement(C|LW|RW)$/.test(rows[r][0]))sheet.deleteRow(r+1);
  const current=sheet.getDataRange().getValues(),row=current.findIndex(r=>r[0]==='replacementF');
  if(row<0)sheet.appendRow(['replacementF',110]);else sheet.getRange(row+1,2).setValue(110);
  properties.setProperty(marker,'applied');
}

function yahooProjectionWeightRows_(rows,c) {
  const mapping=leagueConfig_().projectionWeightSettings;
  for(const name of Object.values(mapping))if(!Number.isFinite(c[name])||c[name]<0)throw Error('Invalid nonnegative projection weight: '+name);
  if(!Object.values(mapping).some(name=>c[name]>0))throw Error('At least one projection source must have positive weight');
  return rows.map(r=>[mapping[r[1]] ? c[mapping[r[1]]] : r[2]]);
}
function syncYahooProjectionWeights_() {
  const ss=SpreadsheetApp.getActive(),sheet=ss.getSheetByName('Projections');
  importUpdatedYahooDom_(sheet);
  ss.getSheetByName('Settings').autoResizeColumn(1);
  const guide=ss.getSheetByName('Guide');
  if(guide){const row=guide.getDataRange().getValues().findIndex(r=>r[0]==='Projections');if(row>=0)guide.getRange(row+1,2).setValue('Projection weights are controlled by the projectionWeight settings. Edit parts in Settings, then Refresh board. Missing categories renormalize over sources that supply them.');}
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues();
  const weights=yahooProjectionWeightRows_(rows,configFromSettings_(rows_('Settings')));
  if(rows.some((r,i)=>r[2]!==weights[i][0]))sheet.getRange(2,3,weights.length,1).setValues(weights);
}

// A deployed workbook revision is imported once. Refresh never reads local raw files.
function updatedYahooDomRows_(rows,data) {
  const map=new Map(data.map(p=>[p.id,p])),seen=new Set(),stats=projectionStats_();
  const result=rows.map(row=>{
    if(row[1]!=='The Athletic')return row.slice();
    const p=map.get(row[0]);
    if(!p||seen.has(row[0]))throw Error('Dom import identity mismatch: '+row[0]);
    seen.add(row[0]);const next=row.slice();
    stats.forEach((k,i)=>next[i+3]=p.stats[k]??'');return next;
  });
  if(seen.size!==map.size)throw Error('Dom import player count changed; review identities before import');
  return result;
}
function importUpdatedYahooDom_(sheet) {
  const properties=PropertiesService.getDocumentProperties();
  if(!YAHOO_DATA.domRevision||properties.getProperty('yahooDomRevision')===YAHOO_DATA.domRevision)return;
  const range=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn());
  const updated=updatedYahooDomRows_(range.getValues(),PROJECTION_DATA);
  range.setValues(updated);
  properties.setProperty('yahooDomRevision',YAHOO_DATA.domRevision);
}
