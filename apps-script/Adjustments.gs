/** Signed cuts adjust the blended valuation, not source forecasts or market ranks. */
function adjustmentEntries_(rows,players) {
  const entries=rows.map(row=>{
    const [name,cut]=row;
    if(!name&&cut==='')return {player:null,cut:0,message:''};
    const match=resolvePlayerName_(name,players);
    if(!match.player)return {player:null,cut:0,message:match.message||'Enter a player name'};
    if(cut!==''&&(typeof cut!=='number'||!Number.isFinite(cut)||cut>1))return {player:match.player,cut:0,message:'Enter a percentage ≤100%; negative boosts'};
    return {player:match.player,cut:cut===''?0:cut,message:'Matched'};
  });
  const counts=new Map();entries.forEach(e=>{if(e.player)counts.set(e.player.id,(counts.get(e.player.id)||0)+1);});
  entries.forEach(e=>{if(e.player&&counts.get(e.player.id)>1)e.message='Duplicate player';});
  return entries;
}
function ensureAdjustments_() {
  const s=table_('Adjustments',['Player','Cut','Notes','Status','Base FP','Adjusted FP'],[]);
  const players=SpreadsheetApp.getActive().getSheetByName('Players');
  s.getRange(1,2).setNote('Positive cuts reduce projections: 25% retains 75%. Negative cuts boost projections: -25% gives 125%. Blank or 0% means no adjustment. Cuts cannot exceed 100%. Then Draft > Refresh board to update PAR and PAN.');
  s.getRange(1,5).setNote('Original blended fantasy points at the last board refresh. Source projections and Dom rank are not changed by personal cuts.');
  s.getRange(1,6).setNote('Base FP × (1 − Cut). Updated on Refresh board; clear the cut and refresh to restore the original projection.');
  s.getRange(2,1,s.getMaxRows()-1,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(players.getRange(2,2,Math.max(1,players.getLastRow()-1),1),true).setAllowInvalid(true).build());
  s.getRange(2,2,s.getMaxRows()-1,1).setNumberFormat('0%').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberLessThanOrEqualTo(1).setAllowInvalid(true).build());
  s.getRange(2,5,s.getMaxRows()-1,2).setNumberFormat('0.0');
  s.setColumnWidth(1,190);s.setColumnWidth(2,65);s.setColumnWidth(3,260);s.setColumnWidth(4,210);s.setColumnWidths(5,2,100);
}
function checkAdjustments_() {
  const s=SpreadsheetApp.getActive().getSheetByName('Adjustments');if(!s||s.getLastRow()<2)return;
  const players=rows_('Players').map(r=>({id:r[0],name:r[1]}));
  const values=s.getRange(2,1,s.getLastRow()-1,2).getValues();
  const entries=adjustmentEntries_(values,players);
  s.getRange(2,1,entries.length,1).setValues(entries.map((e,i)=>[e.player?e.player.name:values[i][0]]));
  s.getRange(2,4,entries.length,1).setValues(entries.map(e=>[e.message])).setBackgrounds(entries.map(e=>[e.message&&e.message!=='Matched'?'#f4cccc':'#ffffff']));
}
function applyProjectionCuts_(players) {
  const s=SpreadsheetApp.getActive().getSheetByName('Adjustments');if(!s||s.getLastRow()<2)return;
  const entries=adjustmentEntries_(s.getRange(2,1,s.getLastRow()-1,2).getValues(),players);
  const invalid=entries.find(e=>e.message&&e.message!=='Matched');
  if(invalid)throw Error('Adjustments: '+invalid.message+'; correct the highlighted row and refresh');
  entries.forEach(e=>{if(e.player)e.player.projectionCut=e.cut;});
}
function showAdjustmentPoints_(players,c) {
  const s=SpreadsheetApp.getActive().getSheetByName('Adjustments');if(!s||s.getLastRow()<2)return;
  const entries=adjustmentEntries_(s.getRange(2,1,s.getLastRow()-1,2).getValues(),players);
  s.getRange(2,5,entries.length,2).setValues(entries.map(e=>e.player?[scorePlayer(e.player,c),projectedPoints_(e.player,c)]:['','']));
}
