function panColumn_(col) {
  let s='';while(col){col--;s=String.fromCharCode(65+col%26)+s;col=Math.floor(col/26);}return s;
}
function buildPanFormulas_(model,players,baselines,c) {
  const ss=SpreadsheetApp.getActive();
  const pools=table_('PAN Pools',['PAN calculation'],[]);pools.clearContents();
  if(pools.getMaxColumns()<40)pools.insertColumnsAfter(pools.getMaxColumns(),40-pools.getMaxColumns());
  if(pools.getMaxRows()<players.length+2)pools.insertRowsAfter(pools.getMaxRows(),players.length+2-pools.getMaxRows());
  model.getRange('O1:P1').setValues([['Probability available next','ADP uncertainty']]);
  model.getRange('P2').setFormula('=XLOOKUP("adpSigma",Settings!A2:A100,Settings!B2:B100)');
  model.getRange(2,15,players.length,1).setFormulas(players.map((p,i)=>{
    const r=i+2;
    // Use the negative normal tail to avoid cancellation from 1-CDF.
    return ['=IF(NOT(J'+r+'),0,IF($M$2="","",IF($N$2=0,1,IF(F'+r+'="","",LET(base,NORMDIST((F'+r+'-($L$2-1))/$P$2,0,1,TRUE),tail,NORMDIST((F'+r+'-($L$2-1+$N$2))/$P$2,0,1,TRUE),IF(base=0,"",MIN(1,MAX(0,tail/base))))))))'];
  }));
  const options=new Map(players.map(p=>[p.id,[]]));
  ['C','LW','RW','D','G'].forEach((pos,index)=>{
    const base=baselines[pos],start=1+8*index;
    const cols=Array.from({length:7},(_,i)=>panColumn_(start+i));
    const [idCol,valueCol,surviveCol,priorGoneCol,priorValueCol,suffixCol,fallbackCol]=cols;
    const pool=players.map((p,i)=>({...p,modelRow:i+2})).filter(p=>p.group==='F'?String(p.pos).split(/[,/\s]+/).includes(pos):p.group===pos).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
    pools.getRange(1,start,1,7).setValues([[pos+' ID','PAR above zero','P available','P better gone','Better expected PAR','Suffix expected PAR','Fallback excluding player']]);
    if(!pool.length||base===null)return;
    const end=pool.length+1;
    const values=pool.map(p=>[p.id,Math.max(0,p.points-base)]);
    pools.getRange(2,start,pool.length,2).setValues(values);
    // Zero PAR is the reserve fallback when every listed alternative is gone.
    pools.getRange(end+1,start+5).setValue(0);
    const formulas=pool.map((p,i)=>{
      const r=i+2,prev=r-1,next=r+1;
      const survival="'Board Data'!O"+p.modelRow;
      const fallback=priorValueCol+r+'+'+priorGoneCol+r+'*'+suffixCol+next;
      options.get(p.id).push({base,fallback:"'PAN Pools'!"+fallbackCol+r,valid:'COUNT(\'PAN Pools\'!'+surviveCol+'2:'+surviveCol+end+')='+pool.length});
      return [
        '='+survival,
        i===0?'=1':'='+priorGoneCol+prev+'*(1-'+surviveCol+prev+')',
        i===0?'=0':'='+priorValueCol+prev+'+'+priorGoneCol+prev+'*'+surviveCol+prev+'*'+valueCol+prev,
        '='+surviveCol+r+'*'+valueCol+r+'+(1-'+surviveCol+r+')*'+suffixCol+next,
        '='+fallback
      ];
    });
    pools.getRange(2,start+2,pool.length,5).setFormulas(formulas);
  });
  model.getRange(2,7,players.length,1).setFormulas(players.map((p,i)=>{
    const r=i+2,choices=options.get(p.id);
    if(!choices.length)return ['=""'];
    const valid=choices.map(x=>x.valid).join(',');
    const costs=choices.map(x=>'(1-O'+r+')*(D'+r+'-'+x.base+'-'+x.fallback+')').join(',');
    return ['=IF(OR(NOT(J'+r+'),$M$2=""),"",IF($N$2=0,0,IF(AND(ISNUMBER(O'+r+'),'+valid+'),MAX('+costs+'),"")))'];
  }));
  pools.hideSheet();
}
