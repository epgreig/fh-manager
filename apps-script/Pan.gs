function panColumn_(col) {
  let s='';while(col){col--;s=String.fromCharCode(65+col%26)+s;col=Math.floor(col/26);}return s;
}
function buildPanFormulas_(model,players,baselines,c) {
  const ss=SpreadsheetApp.getActive();
  const pools=table_('PAN Pools',['PAN calculation'],[]);pools.clearContents();
  if(pools.getMaxColumns()<40)pools.insertColumnsAfter(pools.getMaxColumns(),40-pools.getMaxColumns());
  if(pools.getMaxRows()<players.length+2)pools.insertRowsAfter(pools.getMaxRows(),players.length+2-pools.getMaxRows());
  model.getRange('O1:P1').setValues([['Probability available next','Draft-order uncertainty']]);
  model.getRange('Q1:S1').setValues([['ESPN default rank','Smart ADP','ESPN rank weight']]);
  model.getRange('S2').setFormula('=XLOOKUP("espnRankWeight",Settings!A2:A100,Settings!B2:B100)');
  model.getRange(2,17,players.length,1).setValues(players.map(p=>[p.espnRank==null?'':p.espnRank]));
  model.getRange('T1:V1').setValues([['Age','Position multiplier','Position exponent']]);
  model.getRange('W1').setValue('Curve pivot');
  model.getRange('W2').setFormula('=XLOOKUP("curvePivot",Settings!A2:A100,Settings!B2:B100)');
  model.getRange(2,20,players.length,1).setValues(players.map(p=>[p.age==null?'':p.age]));
  model.getRange(2,21,players.length,1).setFormulas(players.map((p,i)=>['=XLOOKUP("multiplier"&I'+(i+2)+',Settings!A2:A100,Settings!B2:B100)']));
  model.getRange(2,22,players.length,1).setFormulas(players.map((p,i)=>['=XLOOKUP("exponent"&I'+(i+2)+',Settings!A2:A100,Settings!B2:B100)']));
  model.getRange(2,18,players.length,1).setFormulas(players.map((p,i)=>[draftOrderFormula_(i+2)]));
  model.getRange(2,16,players.length,1).setFormulas(players.map((p,i)=>{
    const r=i+2;
    return ['=IF(R'+r+'="","",MAX(XLOOKUP("adpSigmaFloor",Settings!A2:A100,Settings!B2:B100),XLOOKUP("adpSigmaRate",Settings!A2:A100,Settings!B2:B100)*R'+r+'))'];
  }));
  model.getRange(2,15,players.length,1).setFormulas(players.map((p,i)=>{
    const r=i+2;
    // Use the negative normal tail to avoid cancellation from 1-CDF.
    return ['=IF(NOT(J'+r+'),0,IF(R'+r+'="","",LET(base,NORMDIST((R'+r+'-($L$2-1))/P'+r+',0,1,TRUE),tail,NORMDIST((R'+r+'-($L$2-1+$N$2))/P'+r+',0,1,TRUE),IF(base=0,"",MIN(1,MAX(0,tail/base))))))'];
  }));
  const options=new Map(players.map(p=>[p.id,[]]));
  ['C','LW','RW','D','G'].forEach((pos,index)=>{
    const base=baselines[pos],start=1+8*index;
    const cols=Array.from({length:5},(_,i)=>panColumn_(start+i));
    const [idCol,valueCol,surviveCol,priorGoneCol,contributionCol]=cols;
    const pool=players.map((p,i)=>({...p,modelRow:i+2})).filter(p=>p.group==='F'?String(p.pos).split(/[,/\s]+/).includes(pos):p.group===pos).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
    pools.getRange(1,start,1,5).setValues([[pos+' ID','PAR above zero','P available','P better gone','Expected-best contribution']]);
    if(!pool.length||base===null)return;
    const end=pool.length+1;
    const values=pool.map(p=>[p.id,Math.max(0,p.points-base)]);
    pools.getRange(2,start,pool.length,2).setValues(values);
    const formulas=pool.map((p,i)=>{
      const r=i+2,prev=r-1;
      const survival="'Board Data'!O"+p.modelRow;
      const expected="SUM('PAN Pools'!"+contributionCol+'2:'+contributionCol+end+')';
      options.get(p.id).push({base,expected,valid:'COUNT(\'PAN Pools\'!'+surviveCol+'2:'+surviveCol+end+')='+pool.length});
      return [
        '='+survival,
        i===0?'=1':'='+priorGoneCol+prev+'*(1-'+surviveCol+prev+')',
        '='+valueCol+r+'*'+surviveCol+r+'*'+priorGoneCol+r
      ];
    });
    pools.getRange(2,start+2,pool.length,3).setFormulas(formulas);
  });
  model.getRange(2,7,players.length,1).setFormulas(players.map((p,i)=>{
    const r=i+2,choices=options.get(p.id);
    if(!choices.length)return ['=""'];
    const valid=choices.map(x=>x.valid).join(',');
    const costs=choices.map(x=>'(D'+r+'-'+x.base+'-'+x.expected+')').join(',');
    return ['=IF(NOT(J'+r+'),"",IF(AND(ISNUMBER(O'+r+'),'+valid+'),MAX('+costs+'),""))'];
  }));
  pools.hideSheet();
}

function draftOrderFormula_(r) {
  const both='POWER(F'+r+',1-$S$2)*POWER(Q'+r+',$S$2)';
  return '=IF(AND(ISNUMBER(F'+r+'),ISNUMBER(Q'+r+')),'+both+'*U'+r+'*POWER('+both+'/$W$2,V'+r+'-1),IF(ISNUMBER(F'+r+'),F'+r+'*U'+r+'*POWER(F'+r+'/$W$2,V'+r+'-1),IF(ISNUMBER(Q'+r+'),Q'+r+'*U'+r+'*POWER(Q'+r+'/$W$2,V'+r+'-1),"")))';
}
