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
  // Load persisted overall estimates; Draft Log never changes the rank snapshot.
  model.getRange('AA1').setValue('Frozen pre-draft sRk');
  model.getRange(2,27,players.length,1).setValues(players.map(p=>[p.smartRank??'']));
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
  const powers=refs.map((ref,i)=>'IF('+valid[i]+','+weights[i]+'*POWER(IF('+valid[i]+','+ref+',1),-2),0)').join('+');
  const base='POWER(('+powers+')/('+sum+'),-0.5)';
  return '=IF(('+sum+')=0,"",'+base+'*U'+r+'*POWER('+base+'/$W$2,V'+r+'-1))';
}

function rankUncertaintyFormula_(r) {
  return '=IF(AA'+r+'="","",MAX(XLOOKUP("adpSigmaFloor",Settings!A2:A100,Settings!B2:B100),XLOOKUP("adpSigmaRate",Settings!A2:A100,Settings!B2:B100)*AA'+r+'))';
}
function logNormalTailFormula_(z) {
  // Mills expansion avoids 0/0 when an undrafted player is far past their estimate.
  return 'IF('+z+'>8,-0.5*'+z+'^2-LN('+z+')-0.5*LN(2*PI())+LN(1-1/'+z+'^2+3/'+z+'^4-15/'+z+'^6+105/'+z+'^8),LN(NORMDIST(-'+z+',0,1,TRUE)))';
}
function rankSurvivalFormula_(r) {
  const now='($L$2-1-AA'+r+')/P'+r,next='($L$2-1+$N$2-AA'+r+')/P'+r;
  return '=IF(NOT(J'+r+'),0,IF(NOT(ISNUMBER(AA'+r+')),"",LET(zNow,'+now+',zNext,'+next+',MAX(0,MIN(1,EXP('+logNormalTailFormula_('zNext')+'-'+logNormalTailFormula_('zNow')+'))))))';
}
