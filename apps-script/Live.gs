/** Pure custom function; edits to its input ranges recalculate the draft state. */
function FH_STATE(settings,keepers,log,identities) {
  const c=Object.fromEntries(settings.filter(r=>r[0]).map(r=>[r[0],Number(r[1])]));
  const players=identities.filter(r=>r[0]).map(r=>({id:r[0],name:r[1]}));
  const kept=keepers.filter(r=>r[0]).map(r=>{
    const match=resolvePlayerName_(r[0],players);if(!match.player)throw Error('Unknown keeper: '+r[0]);
    return {id:match.player.id,team:r[1],round:r[2]};
  });
  const state=draftState(c,kept,log.filter(r=>r[0]).map(r=>({pick:r[0],id:r[2]})),new Set(players.map(p=>p.id)));
  return [[state.current,state.next||'',state.opponents]];
}
/** PAN recalculates independently; drafting never waits for this simulation. */
function FH_PAN(data,settings,state) {
  const c=Object.fromEntries(settings.filter(r=>r[0]).map(r=>[r[0],Number(r[1])]));
  const available=data.filter(r=>r[0]&&r[5]===true).map(r=>({name:r[0],points:r[1],adp:r[2]===''?null:r[2],id:r[3],group:r[4],pan:null}));
  const result=calculatePan_(available,c,{current:state[0][0],next:state[0][1]||null,opponents:state[0][2]});
  const pan=new Map(result.available.map(p=>[p.id,p.pan]));
  return data.map(r=>[pan.get(r[3])==null?'':pan.get(r[3])]);
}
function renderBoard_({c,players,state}) {
  const ss=SpreadsheetApp.getActive(), s=ss.getSheetByName('Board');
  // Score and rank once per explicit refresh; draft availability stays formula-driven.
  const result=evaluate(players,c,{...state,removed:new Set(),next:null});
  const model=table_('Board Data',['Player','POS','Tm','Points','PAR','ADP','PAN','ID','Group','Available','', 'Current pick','Next own pick','Intervening picks'],[]);
  model.clearContents();
  const n=players.length,last=n+1;
  if(model.getMaxRows()<last)model.insertRowsAfter(model.getMaxRows(),last-model.getMaxRows());
  model.getRange(1,1,1,14).setValues([['Player','POS','Tm','Points','PAR','ADP','PAN','ID','Group','Available','','Current pick','Next own pick','Intervening picks']]);
  model.getRange(2,1,n,9).setValues(result.available.map(p=>[p.name,p.pos+(p.provisional&&p.group==='F'?'*':''),p.team,p.points,p.par===null?'':p.par,p.adp===null?'':p.adp,'',p.id,p.group]));
  model.getRange(2,10,n,1).setFormulas(result.available.map((p,i)=>{
    const r=i+2;return ['=AND(COUNTIF(\'Draft Log\'!C$2:C,H'+r+')=0,COUNTIF(Keepers!A$2:A,A'+r+')=0,COUNTIF(Keepers!A$2:A,H'+r+')=0)'];
  }));
  model.getRange('L2').setFormula('=FH_STATE(Settings!A2:B100,Keepers!A2:C100,\'Draft Log\'!A2:E1000,Players!A2:B'+last+')');
  model.getRange('G2').setFormula('=FH_PAN(HSTACK(A2:A'+last+',D2:D'+last+',F2:F'+last+',H2:J'+last+'),Settings!A2:B100,L2:N2)');
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();s.clear();s.showRows(1,s.getMaxRows());s.showColumns(1,s.getMaxColumns());
  if(s.getMaxRows()<n+3)s.insertRowsAfter(s.getMaxRows(),n+3-s.getMaxRows());
  s.getRange('A1:Z1').merge().setFormula('="Pick "&\'Board Data\'!L2&" · Next own pick "&IF(\'Board Data\'!M2="","none",\'Board Data\'!M2)');
  const rules=[],parRanges=[];
  ['F','D','G'].forEach((g,i)=>{
    const col=1+i*9,nameCol=['A','J','S'][i],adpCol=['F','O','X'][i];
    s.getRange(2,col).setValue(['Forwards','Defensemen','Goalies'][i]);
    s.getRange(3,col,1,8).setValues([['Player','POS','Tm','Points','PAR','ADP','PAN','ID']]);
    s.getRange(4,col).setFormula('=IFNA(SORT(FILTER(\'Board Data\'!A2:F'+last+',\'Board Data\'!I2:I'+last+'="'+g+'",\'Board Data\'!J2:J'+last+'=TRUE),5,FALSE,4,FALSE),"")');
    s.getRange(4,col+7).setFormula('=ARRAYFORMULA(IF('+nameCol+'4:'+nameCol+(n+3)+'="","",XLOOKUP('+nameCol+'4:'+nameCol+(n+3)+',\'Board Data\'!A2:A'+last+',\'Board Data\'!H2:H'+last+',"")))');
    s.getRange(4,col+6).setFormula('=ARRAYFORMULA(IF('+nameCol+'4:'+nameCol+(n+3)+'="","",XLOOKUP('+nameCol+'4:'+nameCol+(n+3)+',\'Board Data\'!A2:A'+last+',\'Board Data\'!G2:G'+last+',"")))');
    s.setColumnWidth(col,154);s.setColumnWidth(col+1,54);s.setColumnWidth(col+2,34);s.setColumnWidths(col+3,4,43);
    s.hideColumns(col+3);s.hideColumns(col+7);if(g!=='F')s.hideColumns(col+1);if(i<2)s.setColumnWidth(col+8,12);
    s.getRange(2,col,2,7).setFontWeight('bold');s.getRange(4,col+3,n,4).setNumberFormat('0');
    parRanges.push(s.getRange(4,col+4,n,1));
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER('+adpCol+'4),'+adpCol+'4<=IFERROR(PERCENTILE(FILTER(INDIRECT("\'Board Data\'!F2:F'+last+'"),INDIRECT("\'Board Data\'!J2:J'+last+'")=TRUE,ISNUMBER(INDIRECT("\'Board Data\'!F2:F'+last+'"))),'+c.adpBottom+'),0))').setBackground('#9fc5e8').setRanges([s.getRange(4,col+5,n,1)]).build());
    // Rules follow formula-spilled names, including after log deletion and undo.
    [['B','#eeeeee'],['A','#fce5cd']].forEach(([letter,color])=>rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND('+nameCol+'4<>"",COUNTIF(INDIRECT("Targets!'+letter+'2:'+letter+'"),'+nameCol+'4)>0)').setBackground(color).setRanges([s.getRange(4,col,n,1)]).build()));
  });
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,String(100*(1-c.parTop))).setGradientMaxpoint('#8e7cc3').setRanges(parRanges).build());
  s.setConditionalFormatRules(rules);s.setFrozenRows(3);s.setHiddenGridlines(true);
  s.getRange(1,1,n+3,26).setFontFamily('Arial').setFontSize(10).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);s.setRowHeights(4,n,21);
  model.hideSheet();
}
