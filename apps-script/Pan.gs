function panColumn_(col) {
  let s='';while(col){col--;s=String.fromCharCode(65+col%26)+s;col=Math.floor(col/26);}return s;
}
function buildPanFormulas_(model,players,baselines,c) {
  if(model.getMaxColumns()<29)model.insertColumnsAfter(model.getMaxColumns(),29-model.getMaxColumns());
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
  model.getRange('X1:Y1').setValues([['Dom rank (league PAR)','Dom rank weight']]);
  model.getRange(2,24,players.length,1).setValues(players.map(p=>[p.domRank==null?'':p.domRank]));
  model.getRange('Y2').setFormula('=XLOOKUP("domRankWeight",Settings!A2:A100,Settings!B2:B100)');
  model.getRange(2,20,players.length,1).setValues(players.map(p=>[p.age==null?'':p.age]));
  model.getRange(2,21,players.length,1).setFormulas(players.map((p,i)=>['=XLOOKUP("multiplier"&I'+(i+2)+',Settings!A2:A100,Settings!B2:B100)']));
  model.getRange(2,22,players.length,1).setFormulas(players.map((p,i)=>['=XLOOKUP("exponent"&I'+(i+2)+',Settings!A2:A100,Settings!B2:B100)']));
  model.getRange(2,18,players.length,1).setFormulas(players.map((p,i)=>[draftOrderFormula_(i+2)]));
  // Sort the available pool once, using full precision and stable ID tie-breaking.
  const last=players.length+1;
  model.getRange('AA1:AC1').setValues([['Smart rank (remaining picks)','Available IDs by sADP','Ordered sADP']]);
  model.getRange('AB2').setFormula(smartRankTableFormula_(last));
  model.getRange(2,27,players.length,1).setFormulas(players.map((p,i)=>[smartRankFormula_(i+2,last)]));
  model.getRange(2,16,players.length,1).setFormulas(players.map((p,i)=>[rankUncertaintyFormula_(i+2)]));
  model.getRange(2,15,players.length,1).setFormulas(players.map((p,i)=>[rankSurvivalFormula_(i+2)]));
  const options=new Map(players.map(p=>[p.id,[]]));
  ['F','D','G'].forEach((pos,index)=>{
    const base=baselines[pos],start=1+8*index;
    const cols=Array.from({length:5},(_,i)=>panColumn_(start+i));
    const [idCol,valueCol,surviveCol,priorGoneCol,contributionCol]=cols;
    const pool=players.map((p,i)=>({...p,modelRow:i+2})).filter(p=>p.group===pos).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
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
  const refs=['F'+r,'Q'+r,'X'+r],weights=['(1-$S$2-$Y$2)','$S$2','$Y$2'];
  const valid=refs.map(ref=>'AND(ISNUMBER('+ref+'),'+ref+'>0)');
  const sum=valid.map((ok,i)=>'IF('+ok+','+weights[i]+',0)').join('+');
  const product=refs.map((ref,i)=>'POWER(IF('+valid[i]+','+ref+',1),'+weights[i]+')').join('*');
  const base='POWER('+product+',1/('+sum+'))';
  return '=IF(('+sum+')=0,"",'+base+'*U'+r+'*POWER('+base+'/$W$2,V'+r+'-1))';
}

function smartRankTableFormula_(last) {
  return '=IFNA(SORT(FILTER(HSTACK(H2:H'+last+',R2:R'+last+'),J2:J'+last+'=TRUE,ISNUMBER(R2:R'+last+')),2,TRUE,1,TRUE),"")';
}
function smartRankFormula_(r,last) {
  return '=IF(AND(J'+r+',ISNUMBER(R'+r+')),IFNA(MATCH(H'+r+',AB$2:AB$'+last+',0),""),"")';
}
function rankUncertaintyFormula_(r) {
  // sRk is relative to now; sigma still grows with the absolute draft depth.
  return '=IF(AA'+r+'="","",MAX(XLOOKUP("adpSigmaFloor",Settings!A2:A100,Settings!B2:B100),XLOOKUP("adpSigmaRate",Settings!A2:A100,Settings!B2:B100)*($L$2-1+AA'+r+')))';
}
function rankSurvivalFormula_(r) {
  // Condition on a future selection (>0), using negative tails for stability.
  // AA is already relative to now: do not subtract current pick again.
  return '=IF(NOT(J'+r+'),0,IF(NOT(ISNUMBER(AA'+r+')),"",MIN(1,MAX(0,NORMDIST((AA'+r+'-$N$2)/P'+r+',0,1,TRUE)/NORMDIST(AA'+r+'/P'+r+',0,1,TRUE)))))';
}
