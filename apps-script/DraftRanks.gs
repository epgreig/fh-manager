function draftRankSnapshot_(players,c,keepers) {
  const kept=new Set(keepers.map(k=>k.id));
  const rows=players.map(p=>{
    const base=smartAdpBase_(p.adp,p.espnRank,p.domRank,c);
    const blend=base===null?null:base*c['multiplier'+p.group]*Math.pow(base/c.curvePivot,c['exponent'+p.group]-1);
    return {id:p.id,name:p.name,group:p.group,blend,kept:kept.has(p.id),rank:null};
  }).sort((a,b)=>(a.blend??Infinity)-(b.blend??Infinity)||a.id.localeCompare(b.id));
  let rank=0;rows.forEach(p=>{if(!p.kept&&Number.isFinite(p.blend)&&p.blend>0)p.rank=++rank;});
  return rows;
}
function ensureDraftRanks_(input,rebuild=false) {
  const s=table_('Draft Ranks',['ID','Player','Group','sADP at freeze','sRk','Keeper at freeze'],[]);
  if(rebuild||s.getRange('H2').getValue()==='') {
    const rows=draftRankSnapshot_(input.players,input.c,input.keepers);
    s.clearContents();
    s.getRange(1,1,1,6).setValues([['ID','Player','Group','sADP at freeze','sRk','Keeper at freeze']]);
    if(s.getMaxRows()<rows.length+1)s.insertRowsAfter(s.getMaxRows(),rows.length+1-s.getMaxRows());
    if(rows.length)s.getRange(2,1,rows.length,6).setValues(rows.map(p=>[p.id,p.name,p.group,p.blend??'',p.rank??'',p.kept]));
    s.getRange('H1').setValue('Frozen at');s.getRange('H2').setValue(new Date());
    s.getRange('H3').setValue('Draft > Rebuild pre-draft ranks explicitly replaces this snapshot. Draft Log is ignored; keepers are excluded.');
    s.setColumnWidth(2,190);s.setColumnWidths(4,3,120);s.setColumnWidth(8,220);
    if(rows.length)s.getRange(2,4,rows.length,1).setNumberFormat('0.00');
  }
  const ranks=new Map(s.getRange(2,1,s.getLastRow()-1,5).getValues().filter(r=>r[0]).map(r=>[r[0],r[4]]));
  input.players.forEach(p=>{const rank=ranks.get(p.id);p.smartRank=typeof rank==='number'&&rank>0?rank:null;});
}
