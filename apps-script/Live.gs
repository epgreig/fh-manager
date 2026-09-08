/** Pure custom function; edits to its input ranges recalculate the draft state. */
function FH_STATE(settings,keepers,log,identities) {
  const c=Object.fromEntries(settings.filter(r=>r[0]).map(r=>[r[0],Number(r[1])]));
  const players=identities.filter(r=>r[0]).map(r=>({id:r[0],name:r[1]}));
  const kept=keepers.filter(r=>r[0]).map(r=>{
    const match=resolvePlayerName_(r[0],players);if(!match.player)throw Error('Unknown keeper: '+r[0]);
    return {id:match.player.id};
  });
  const state=draftState(c,kept,log.filter(r=>r[0]).map(r=>({pick:r[0],id:r[2]})),new Set(players.map(p=>p.id)));
  return [[state.current,state.next||'',state.opponents]];
}
function renderBoard_({c,players,state}) {
  const ss=SpreadsheetApp.getActive(), s=ss.getSheetByName('Board');
  // Score and rank once per explicit refresh; draft availability stays formula-driven.
  const result=evaluate(players,c,{...state,removed:new Set(),next:null});
  showReplacementLevels_(result.baselines);
  const model=table_('Board Data',['Player','POS','Tm','Points','PAR','ADP','PAN','ID','Group','Available','', 'Current pick','Next own pick','PAN wait (selections)'],[]);
  model.clearContents();
  const n=players.length,last=n+1;
  if(model.getMaxRows()<last)model.insertRowsAfter(model.getMaxRows(),last-model.getMaxRows());
  model.getRange(1,1,1,14).setValues([['Player','POS','Tm','Points','PAR','ADP','PAN','ID','Group','Available','','Current pick','Next own pick','PAN wait (selections)']]);
  model.getRange(2,1,n,9).setValues(result.available.map(p=>[p.name,p.pos+(p.provisional&&p.group==='F'?'*':''),p.team,p.points,p.par===null?'':p.par,p.adp===null?'':p.adp,'',p.id,p.group]));
  model.getRange(2,10,n,1).setFormulas(result.available.map((p,i)=>{
    const r=i+2;return ['=AND(COUNTIF(\'Draft Log\'!C$2:C,H'+r+')=0,COUNTIF(Keepers!A$2:A,A'+r+')=0,COUNTIF(Keepers!A$2:A,H'+r+')=0)'];
  }));
  model.getRange('L2').setFormula('=FH_STATE(Settings!A2:B100,Keepers!A2:A1000,\'Draft Log\'!A2:E1000,Players!A2:B'+last+')');
  buildPanFormulas_(model,result.available,result.baselines,c);
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();s.clear();s.showRows(1,s.getMaxRows());s.showColumns(1,s.getMaxColumns());
  if(s.getMaxColumns()<29)s.insertColumnsAfter(s.getMaxColumns(),29-s.getMaxColumns());
  if(s.getMaxRows()<n+3)s.insertRowsAfter(s.getMaxRows(),n+3-s.getMaxRows());
  s.getRange('A1:AC1').merge().setFormula('="Selection "&\'Board Data\'!L2&" · PAN: "&\'Board Data\'!N2&" selections ahead"');
  const rules=[],parRanges=[],rankRanges=[],smartRanges=[],panRanges=[];
  ['F','D','G'].forEach((g,i)=>{
    const col=1+i*10,nameCol=['A','K','U'][i];
    s.getRange(2,col).setValue(['Forwards','Defensemen','Goalies'][i]);
    s.getRange(3,col,1,9).setValues([['Player','POS','Tm','Age','Rk','sADP','PAR','PAN','ID']]);
    const source='HSTACK(\'Board Data\'!A2:C'+last+',\'Board Data\'!T2:T'+last+',\'Board Data\'!Q2:R'+last+',\'Board Data\'!E2:E'+last+')';
    s.getRange(4,col).setFormula('=IFNA(SORT(FILTER('+source+',\'Board Data\'!I2:I'+last+'="'+g+'",\'Board Data\'!J2:J'+last+'=TRUE),7,FALSE,6,TRUE),"")');
    s.getRange(4,col+8).setFormula('=ARRAYFORMULA(IF('+nameCol+'4:'+nameCol+(n+3)+'="","",XLOOKUP('+nameCol+'4:'+nameCol+(n+3)+',\'Board Data\'!A2:A'+last+',\'Board Data\'!H2:H'+last+',"")))');
    s.getRange(4,col+7).setFormula('=ARRAYFORMULA(IF('+nameCol+'4:'+nameCol+(n+3)+'="","",XLOOKUP('+nameCol+'4:'+nameCol+(n+3)+',\'Board Data\'!A2:A'+last+',\'Board Data\'!G2:G'+last+',"")))');
    [145,46,32,28,38,42,40,40].forEach((w,j)=>s.setColumnWidth(col+j,w));
    s.hideColumns(col+8);if(g!=='F')s.hideColumns(col+1);if(i<2)s.setColumnWidth(col+9,10);
    s.getRange(2,col,2,8).setFontWeight('bold');s.getRange(4,col+3,n,5).setNumberFormat('0');
    const ageCol=['D','N','X'][i];
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER('+ageCol+'4),'+ageCol+'4<=XLOOKUP("youngAgeMax",INDIRECT("Settings!A2:A100"),INDIRECT("Settings!B2:B100")))').setBackground('#fff2cc').setRanges([s.getRange(4,col+3,n,1)]).build());
    parRanges.push(s.getRange(4,col+6,n,1));rankRanges.push(s.getRange(4,col+4,n,1));smartRanges.push(s.getRange(4,col+5,n,1));panRanges.push(s.getRange(4,col+7,n,1));
    [['B','#eeeeee'],['A','#fce5cd']].forEach(([letter,color])=>rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND('+nameCol+'4<>"",COUNTIF(INDIRECT("Targets!'+letter+'2:'+letter+'"),'+nameCol+'4)>0)').setBackground(color).setRanges([s.getRange(4,col,n,1)]).build()));
  });
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,String(100*(1-c.parTop))).setGradientMaxpoint('#8e7cc3').setRanges(parRanges).build());
  const remaining=result.available.filter(p=>!state.removed.has(p.id));
  const percent=count=>String(Math.min(100,100*c.highlightCount/Math.max(1,count-1)));
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#e06666').setGradientMaxpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,percent(remaining.filter(p=>p.espnRank!=null).length)).setRanges(rankRanges).build());
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#6fa8dc').setGradientMaxpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,percent(remaining.filter(p=>p.adp!=null||p.espnRank!=null).length)).setRanges(smartRanges).build());
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.NUMBER,'0').setGradientMaxpoint('#6aa84f').setRanges(panRanges).build());
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(0).setBackground('#ffffff').setRanges(panRanges).build());
  s.setConditionalFormatRules(rules);s.setFrozenRows(3);s.setHiddenGridlines(true);
  s.getRange(1,1,n+3,29).setFontFamily('Arial').setFontSize(10).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);s.setRowHeights(4,n,21);
  model.hideSheet();
}

function showReplacementLevels_(baselines) {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  s.getRange(1,3).setValue('Replacement points').setBackground('#17364d').setFontColor('#ffffff').setFontWeight('bold');
  s.getRange(1,3).setNote('Calculated by Refresh board using the current scoring, projections and positional ranks. Includes drafted players and keepers so the PAR baseline stays fixed during the draft.');
  s.getDataRange().getValues().forEach((row,i)=>{
    const match=/^replacement(C|LW|RW|D|G)$/.exec(String(row[0]));
    if(!match)return;
    const value=baselines[match[1]];
    s.getRange(i+1,3).setValue(value==null?'Unavailable':value).setNumberFormat('0.0');
  });
  s.setColumnWidth(3,155);
}
