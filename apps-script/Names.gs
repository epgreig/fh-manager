function resolvePlayerName_(value,players) {
  const key=String(value).trim().toLocaleLowerCase();
  if(!key) return {player:null,message:''};
  const matches=players.filter(p=>p.name.toLocaleLowerCase()===key||p.id===String(value).trim());
  return matches.length===1?{player:matches[0],message:'Matched'}:
    {player:null,message:matches.length?'Ambiguous name':'Name not found'};
}
function ensureNameSheets_() {
  table_('Targets',['Targets','Fades','Target name check','Fade name check'],[]);
  const ss=SpreadsheetApp.getActive(), keepers=ss.getSheetByName('Keepers');
  if(keepers) {
    // Preserve old optional keeper costs in a hidden archive before simplifying the input.
    if(keepers.getRange(1,2).getValue()==='Team draft slot') {
      if(!ss.getSheetByName('Keeper costs archive'))keepers.copyTo(ss).setName('Keeper costs archive').hideSheet();
      keepers.getRange(1,2,keepers.getMaxRows(),3).clearContent().clearDataValidations();
    }
    keepers.getRange(1,1,1,2).setValues([['Player','Name check']]);
  }
  const source=ss.getSheetByName('Players');
  const validation=SpreadsheetApp.newDataValidation().requireValueInRange(source.getRange(2,2,Math.max(1,source.getLastRow()-1),1),true).setAllowInvalid(true).build();
  const targets=ss.getSheetByName('Targets');
  targets.getRange(2,1,targets.getMaxRows()-1,2).setDataValidation(validation);
  targets.setColumnWidths(1,2,190);targets.setColumnWidths(3,2,180);
  if(keepers) {keepers.getRange(2,1,keepers.getMaxRows()-1,1).setDataValidation(validation);keepers.setColumnWidth(1,190);keepers.setColumnWidth(2,180);}
}
function checkNames_() {
  const players=rows_('Players').map(r=>({id:r[0],name:r[1]}));
  const ss=SpreadsheetApp.getActive();
  ['Targets','Keepers'].forEach(name=>{
    const s=ss.getSheetByName(name);if(!s||s.getLastRow()<2) return;
    const n=s.getLastRow()-1, count=name==='Targets'?2:1, values=s.getRange(2,1,n,count).getValues();
    const checks=[],backgrounds=[];
    values.forEach(row=>{
      const messages=[],colors=[];
      row.forEach((value,i)=>{
        const match=resolvePlayerName_(value,players);
        if(match.player) row[i]=match.player.name;
        messages.push(match.message);colors.push(match.message&&!match.player?'#f4cccc':'#ffffff');
      });checks.push(messages);backgrounds.push(colors);
    });
    s.getRange(2,1,n,count).setValues(values).setBackgrounds(backgrounds);
    s.getRange(2,name==='Targets'?3:2,n,count).setValues(checks);
  });
}
function onEdit(e) {
  if(!e||!e.range) return;
  const name=e.range.getSheet().getName();
  if(!['Targets','Keepers'].includes(name)) return;
  withLock_(()=>{checkNames_();});
}
