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
  CacheService.getDocumentCache().put('draftPlayerIdentitiesV1',JSON.stringify(players.map(p=>({id:p.id,name:p.name}))),21600);
  const ss=SpreadsheetApp.getActive(), s=ss.getSheetByName('Board');
  const headers=boardHeaders_(),stride=headers.length+1,boardWidth=3*stride-1;
  const index=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const identities=ss.getSheetByName('Players');
  identities.getRange(1,10).setValue('Dom rank (league PAR)').setNote('Rank by The Athletic projections alone under current Settings scoring minus replacement points. F uses replacementFPoints; D/G use Dom-only points at their configured ranks. Includes kept/drafted players.');
  identities.getRange(2,10,players.length,1).setValues(players.map(p=>[p.domRank==null?'':p.domRank]));
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
  // Native formulas avoid another Apps Script execution after every logged pick.
  model.getRange('L2').setFormula('=COUNTA(\'Draft Log\'!A2:A1000)+1');
  model.getRange('N2').setFormula('=XLOOKUP("panGap",Settings!A2:A100,Settings!B2:B100)');
  const kept='SUMPRODUCT(--((COUNTIF(Keepers!A$2:A1000,A2:A'+last+')+COUNTIF(Keepers!A$2:A1000,H2:H'+last+'))>0))';
  model.getRange('M2').setFormula('=IFERROR(LET(teams,XLOOKUP("teams",Settings!A2:A100,Settings!B2:B100),slot,XLOOKUP("draftSlot",Settings!A2:A100,Settings!B2:B100),lim,teams*XLOOKUP("rounds",Settings!A2:A100,Settings!B2:B100)-'+kept+',picks,SEQUENCE(MAX(1,lim-L2),1,L2+1),owners,IF(MOD(INT((picks-1)/teams),2)=0,MOD(picks-1,teams)+1,teams-MOD(picks-1,teams)),INDEX(FILTER(picks,(picks<=lim)*(owners=slot)),1)),"")');
  buildPanFormulas_(model,result.available,result.baselines,c);
  if(model.getMaxColumns()<26)model.insertColumnsAfter(model.getMaxColumns(),26-model.getMaxColumns());
  model.getRange('Z1').setValue('Relative SD');
  model.getRange(2,26,n,1).setFormulas(result.available.map((p,i)=>{
    const name='A'+(i+2),names="'Projection Comparison'!A$3:A$"+(n+2);
    const count="XLOOKUP("+name+','+names+",'Projection Comparison'!H$3:H$"+(n+2)+')';
    const relative="XLOOKUP("+name+','+names+",'Projection Comparison'!F$3:F$"+(n+2)+')';
    return ['=IFNA(IF('+count+'<='+(p.group==='G'?2:5)+',"",'+relative+'),"")'];
  }));
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();s.clear();s.showRows(1,s.getMaxRows());s.showColumns(1,s.getMaxColumns());
  if(s.getMaxColumns()<boardWidth)s.insertColumnsAfter(s.getMaxColumns(),boardWidth-s.getMaxColumns());
  if(s.getMaxRows()<n+3)s.insertRowsAfter(s.getMaxRows(),n+3-s.getMaxRows());
  s.getRange(1,1,1,boardWidth).merge().setFormula('="Selection "&\'Board Data\'!L2&" · PAN: "&\'Board Data\'!N2&" selections ahead"');
  const rules=[],parRanges=[],rankRanges=[],smartRanges=[],panRanges=[];
  ['F','D','G'].forEach((g,i)=>{
    const col=1+i*stride,nameCol=panColumn_(col);
    s.getRange(2,col).setValue(['Forwards','Defensemen','Goalies'][i]);
    s.getRange(3,col,1,headers.length).setValues([headers]);
    const modelColumns={Player:'A',POS:'B',Tm:'C',Age:'T',espn:'Q',ADP:'F',Dom:'X',sADP:'R',sRk:'AA',coefV:'Z',PAR:'E'};
    const source='HSTACK('+headers.slice(0,index.PAR+1).map(h=>"'Board Data'!"+modelColumns[h]+'2:'+modelColumns[h]+last).join(',')+')';
    s.getRange(4,col).setFormula('=IFNA(SORT(FILTER('+source+',\'Board Data\'!I2:I'+last+'="'+g+'",\'Board Data\'!J2:J'+last+'=TRUE),'+(index.PAR+1)+',FALSE,'+(index.sRk+1)+',TRUE),"")');
    [['ID','H'],['PAN','G']].forEach(([header,modelCol])=>{
      s.getRange(4,col+index[header]).setFormula('=ARRAYFORMULA(IF('+nameCol+'4:'+nameCol+(n+3)+'="","",XLOOKUP('+nameCol+'4:'+nameCol+(n+3)+',\'Board Data\'!A2:A'+last+',\'Board Data\'!'+modelCol+'2:'+modelCol+last+',"")))');
    });
    const widths={Player:145,POS:46,Tm:32,Age:28,espn:38,ADP:38,Dom:45,sADP:42,sRk:42,coefV:45,PAR:40,PAN:40};
    headers.filter(h=>h!=='ID').forEach(h=>s.setColumnWidth(col+index[h],widths[h]));
    s.hideColumns(col+index.ID);s.hideColumns(col+index.espn,4);
    if(g!=='F')s.hideColumns(col+index.POS);if(i<2)s.setColumnWidth(col+headers.length,10);
    s.getRange(2,col,2,headers.length-1).setFontWeight('bold');s.getRange(4,col+index.Age,n,headers.length-index.Age-1).setNumberFormat('0');
    s.getRange(4,col+index.coefV,n,1).setNumberFormat('0%');
    const ageCol=panColumn_(col+index.Age);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER('+ageCol+'4),'+ageCol+'4<=XLOOKUP("youngAgeMax",INDIRECT("Settings!A2:A100"),INDIRECT("Settings!B2:B100")))').setBackground('#fff2cc').setRanges([s.getRange(4,col+index.Age,n,1)]).build());
    parRanges.push(s.getRange(4,col+index.PAR,n,1));
    ['espn','ADP','Dom'].forEach(h=>rankRanges.push(s.getRange(4,col+index[h],n,1)));
    smartRanges.push(s.getRange(4,col+index.sRk,n,1));panRanges.push(s.getRange(4,col+index.PAN,n,1));
    [['B','#eeeeee'],['A','#fce5cd']].forEach(([letter,color])=>rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND('+nameCol+'4<>"",COUNTIF(INDIRECT("Targets!'+letter+'2:'+letter+'"),'+nameCol+'4)>0)').setBackground(color).setRanges([s.getRange(4,col,n,1)]).build()));
  });
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,String(100*(1-c.parTop))).setGradientMaxpoint('#8e7cc3').setRanges(parRanges).build());
  const remaining=result.available.filter(p=>!state.removed.has(p.id));
  const percent=count=>String(Math.min(100,100*c.highlightCount/Math.max(1,count-1)));
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#f4cccc').setGradientMaxpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,percent(remaining.reduce((count,p)=>count+[p.espnRank,p.adp,p.domRank].filter(v=>Number.isFinite(v)&&v>0).length,0)/3)).setRanges(rankRanges).build());
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#6fa8dc').setGradientMaxpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,percent(remaining.filter(p=>smartAdpBase_(p.adp,p.espnRank,p.domRank,c)!==null).length)).setRanges(smartRanges).build());
  rules.unshift(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff',SpreadsheetApp.InterpolationType.PERCENTILE,String(100*(1-c.panTop))).setGradientMaxpoint('#6aa84f').setRanges(panRanges).build());
  s.setConditionalFormatRules(rules);s.setFrozenRows(3);s.setHiddenGridlines(true);
  s.getRange(1,1,n+3,boardWidth).setFontFamily('Arial').setFontSize(10).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);s.setRowHeights(4,n,21);
  CacheService.getDocumentCache().put('draftBoardHeadersV1',JSON.stringify(headers),21600);
  model.hideSheet();
}

function showReplacementLevels_(baselines) {
  const s=SpreadsheetApp.getActive().getSheetByName('Settings');
  s.getRange(1,3).setValue('Replacement points').setBackground('#17364d').setFontColor('#ffffff').setFontWeight('bold');
  s.getRange(1,3).setNote('Forward PAR uses replacementFPoints directly. D/G points are calculated from their ranks on Refresh board, including drafted players and keepers.');
  s.getDataRange().getValues().forEach((row,i)=>{
    const match=/^replacement(FPoints|D|G)$/.exec(String(row[0]));
    if(!match)return;
    const value=baselines[match[1]==='FPoints'?'F':match[1]];
    s.getRange(i+1,3).setValue(value==null?'Unavailable':value).setNumberFormat('0.0');
  });
  s.setColumnWidth(3,155);
}
