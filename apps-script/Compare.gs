function projectionComparison_(players, config, projections) {
  const stats=['GP','G','A','BLK','PIM','SHP','W','SO','GA','SV'];
  const sources=[...new Set(projections.filter(r=>r[2]>0).map(r=>r[1]))];
  const byPlayer=new Map();
  projections.filter(r=>r[2]>0).forEach(r=>{
    if(!byPlayer.has(r[0]))byPlayer.set(r[0],new Map());
    const map=byPlayer.get(r[0]);
    if(map.has(r[1]))throw Error('Duplicate projection source for '+r[0]+': '+r[1]);
    map.set(r[1],r);
  });
  const rows=players.map(p=>{
    const required=p.group==='G'?['W','SO','GA','SV']:['G','A','BLK','PIM','SHP'];
    const notes=[];
    const totals=sources.map(source=>{
      const row=(byPlayer.get(p.id)||new Map()).get(source);
      if(!row){notes.push('No projection');return '';}
      const filled={...p.stats},missing=[];
      required.forEach(k=>{
        const value=row[3+stats.indexOf(k)];
        if(typeof value==='number'&&Number.isFinite(value))filled[k]=value;
        else missing.push(k);
      });
      notes.push(missing.length?'Blended estimate used for missing '+missing.join(', '):'All scored categories supplied');
      return scorePlayer({...p,stats:filled},config);
    });
    return {name:p.name,team:p.team,pos:p.pos,points:scorePlayer(p,config),totals,notes};
  }).sort((a,b)=>b.points-a.points);
  return {sources,rows};
}

function renderProjectionComparison_(input) {
  const result=projectionComparison_(input.players,input.c,rows_('Projections'));
  const ss=SpreadsheetApp.getActive();
  const sheet=ss.getSheetByName('Projection Comparison')||ss.insertSheet('Projection Comparison');
  if(sheet.getFilter())sheet.getFilter().remove();
  sheet.getDataRange().breakApart();sheet.clear();
  const headers=['Player','Tm','POS','Blend FP','Std dev','Range','Sources',...result.sources];
  const count=result.rows.length, width=headers.length;
  if(sheet.getMaxRows()<count+2)sheet.insertRowsAfter(sheet.getMaxRows(),count+2-sheet.getMaxRows());
  if(sheet.getMaxColumns()<width)sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
  sheet.getRange(1,1).setValue('Source disagreement · Missing stats use the blend (hover source cells). Missing players stay blank. Refresh board to update.');
  sheet.getRange(1,1,1,width).merge().setFontColor('#555555').setFontSize(10);
  sheet.getRange(2,1,1,width).setValues([headers]).setBackground('#17364d').setFontColor('#ffffff').setFontWeight('bold');
  if(count) {
    const last=sheet.getRange(1,width).getA1Notation().replace(/1$/,'');
    sheet.getRange(3,1,count,width).setValues(result.rows.map((p,i)=>{
      const span='H'+(i+3)+':'+last+(i+3);
      return [p.name,p.team,p.pos,p.points,
        '=IF(COUNT('+span+')<2,"",STDEV.P('+span+'))',
        '=IF(COUNT('+span+')<2,"",MAX('+span+')-MIN('+span+'))',
        '=COUNT('+span+')',...p.totals];
    }));
    sheet.getRange(3,8,count,result.sources.length).setNotes(result.rows.map(p=>p.notes));
    sheet.getRange(3,4,count,width-3).setNumberFormat('0.0');
    sheet.getRange(3,7,count,1).setNumberFormat('0');
    sheet.getRange(2,1,count+1,width).createFilter();
  }
  sheet.setFrozenRows(2);sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1,185);sheet.setColumnWidths(2,2,55);
  sheet.setColumnWidths(4,width-3,100);
  sheet.getRange(2,1,1,width).setWrap(true);sheet.setRowHeight(2,42);
  sheet.getRange('E2').setNote('Unweighted population standard deviation of available, positive-weight source totals. Measures model disagreement, not a calibrated prediction interval. Missing-category imputation can reduce the apparent spread; sources may also share assumptions or data.');
  sheet.getRange('D2').setNote('Your weighted category blend, scored with Settings including the defense bonus. Weights affect this total; each source gets equal weight in the disagreement statistics.');
}
