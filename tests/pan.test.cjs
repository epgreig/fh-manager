const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('sADP uses a p=-2 power mean with 20/40/40 ESPN rank/ADP/Dom weights',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Pan.gs','utf8'),ctx);
 const formula=ctx.draftOrderFormula_(2).slice(1).replaceAll('$S$2','weight').replaceAll('$W$2','pivot').replaceAll('$Y$2','domWeight').replaceAll(')=0',')===0');
 const evaluate=(adp,rank,dom,weight=.2,domWeight=.4,multiplier=1,exponent=1)=>vm.runInNewContext(formula,{
   F2:adp,Q2:rank,X2:dom,U2:multiplier,V2:exponent,weight,domWeight,pivot:50,
   POWER:Math.pow,IF:(condition,a,b)=>condition?a:b,AND:(...args)=>args.every(Boolean),ISNUMBER:x=>typeof x==='number'&&Number.isFinite(x)
 });
 const mean=(...values)=>Math.sqrt(values.length/values.reduce((sum,x)=>sum+1/(x*x),0));
 const expected=1/Math.sqrt(.4/80**2+.2/40**2+.4/10**2);
 vm.runInContext(fs.readFileSync('apps-script/Engine.gs','utf8'),ctx);
 assert.ok(Math.abs(ctx.smartAdpBase_(80,40,10,{espnRankWeight:.2,domRankWeight:.4})-expected)<1e-10);
 assert.ok(Math.abs(evaluate(80,40,10)-expected)<1e-10);
 assert.ok(Math.abs(evaluate(80,40,'')-Math.sqrt(.6/(.4/80**2+.2/40**2)))<1e-10);
 assert.ok(Math.abs(evaluate('',40,10)-Math.sqrt(.6/(.2/40**2+.4/10**2)))<1e-10);
 assert.ok(Math.abs(evaluate(80,'',10)-mean(80,10))<1e-10);
 assert.equal(evaluate('','',''),'');
 assert.ok(Math.abs(evaluate(126,132,31)-1/Math.sqrt(.4/126**2+.2/132**2+.4/31**2))<0.001);
 assert.ok(Math.abs(evaluate(0,40,-1)-40)<1e-10);
 assert.ok(Math.abs(evaluate('','',10)-10)<1e-10);
 assert.equal(evaluate('','',10,.2,0),'');
 assert.ok(Math.abs(evaluate(80,40,10,0,1)-10)<1e-10);
 assert.ok(Math.abs(evaluate(80,40,10,.2,.4,.8)-expected*.8)<1e-10);
});
test('PAN subtracts shared expected best available and uses rank-scaled uncertainty',()=>{
 const cells={},modelFormulas=[];
 const sheet={getMaxColumns:()=>40,getMaxRows:()=>100,clearContents(){},hideSheet(){},getRange(row,col,n=1,m=1){
   return {setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>cells[key(row+i,col+j)]=v));},
   setValue(v){cells[key(row,col)]=v;},setFormulas(values){values.forEach((r,i)=>r.forEach((v,j)=>cells[key(row+i,col+j)]=v));}};
 }};
 const model={getMaxColumns:()=>29,getRange(){return {setValue(){},setValues(){},setFormula(f){modelFormulas.push(f);},setFormulas(rows){modelFormulas.push(...rows.flat());}};}};
 const ctx={SpreadsheetApp:{getActive:()=>({})},table_:()=>sheet};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Pan.gs','utf8'),ctx);
 function key(r,c){return ctx.panColumn_(c)+r;}
 const players=[{id:'a',points:100,group:'F',pos:'C'},{id:'b',points:80,group:'F',pos:'LW'},{id:'c',points:60,group:'F',pos:'C,RW'}];
 ctx.buildPanFormulas_(model,players,{F:20,D:null,G:null},{});
 const probabilities=[0.3,0.6,0.9],par=[80,60,40];
 function evalCell(cell){const value=cells[cell];if(typeof value==='number')return value;
   let expr=value.slice(1).replace(/'Board Data'!O(\d+)/g,(_,r)=>String(probabilities[Number(r)-2]));
   expr=expr.replace(/\b[A-Z]+\d+\b/g,ref=>String(evalCell(ref)));
   return vm.runInNewContext(expr);
 }
 let expected=0;
 for(let mask=0;mask<8;mask++){
   let probability=1,best=0;
   for(let j=0;j<3;j++){const available=Boolean(mask&(1<<j));probability*=available?probabilities[j]:1-probabilities[j];if(available)best=Math.max(best,par[j]);}
   expected+=probability*best;
 }
 assert.equal(cells.A1,'F ID');
 assert.equal(cells.A2,'a');assert.equal(cells.A3,'b');assert.equal(cells.A4,'c');
 assert.equal(cells.I1,'D ID');assert.equal(cells.Q1,'G ID');
 const shared=evalCell('E2')+evalCell('E3')+evalCell('E4');
 assert.ok(Math.abs(shared-expected)<1e-10);
 assert.ok(!modelFormulas.some(f=>f.includes('IF($N$2=0,0,')));
 assert.ok(!modelFormulas.some(f=>f.includes('$M$2')));
 assert.ok(modelFormulas.some(f=>f.includes('ISNUMBER(O2)')));
  assert.ok(modelFormulas.some(f=>f.includes("COUNT('PAN Pools'!C2:C4)=3")));
  assert.ok(modelFormulas.some(f=>f.includes('($L$2-1+$N$2-AA2)/P2')));
  assert.ok(!modelFormulas.some(f=>f.includes('($L$2-1+$N$2)')));
  assert.ok(modelFormulas.some(f=>f.includes('MAX(XLOOKUP("adpSigmaFloor"')&&f.includes('XLOOKUP("adpSigmaRate"')&&f.includes('*AA2')));
  assert.ok(modelFormulas.some(f=>f.includes("SUM('PAN Pools'!E2:E4)")));
  assert.ok(modelFormulas.some(f=>f.includes("D2-20-SUM('PAN Pools'!E2:E4)")));
  assert.ok(!modelFormulas.some(f=>f.includes('(1-O2)*')));
  for(const row of [2,3,4])assert.ok(modelFormulas.some(f=>f.includes('D'+row+"-20-SUM('PAN Pools'!E2:E4)")));
  assert.equal((100-20-shared)-(80-20-shared),20);
});

test('frozen rank survival conditions on elapsed picks and remains stable for overdue players',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Pan.gs','utf8'),ctx);
 const funcs={TRUE:true,IF:(ok,a,b)=>ok?a:b,NOT:x=>!x,ISNUMBER:x=>typeof x==='number',MIN:Math.min,MAX:Math.max,LN:Math.log,EXP:Math.exp,PI:()=>Math.PI};
 const sigmaExpr=ctx.rankUncertaintyFormula_(2).slice(1).replace('AA2=""','AA2===""').replaceAll('Settings!A2:A100','0').replaceAll('Settings!B2:B100','0');
 const uncertainty=rank=>vm.runInNewContext(sigmaExpr,{...funcs,AA2:rank,XLOOKUP:key=>key==='adpSigmaFloor'?4:.18});
 assert.equal(uncertainty(1),4);assert.equal(uncertainty(100),18);
 assert.equal(uncertainty(''),'');assert.ok(!sigmaExpr.includes('$L$2'));
 function normal(x){const a=Math.abs(x)/Math.sqrt(2),t=1/(1+.3275911*a);
  const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);
  return (1+Math.sign(x)*erf)/2;
 }
 const expr=ctx.rankSurvivalFormula_(2).slice(1).replaceAll('$N$2','gap').replaceAll('$L$2','current').replaceAll('^','**').replace('LET(zNow,','LET("zNow",').replace(',zNext,',',"zNext",');
 const survival=(rank,current,gap,available=true)=>{
  const sigma=uncertainty(rank),zNow=(current-1-rank)/sigma,zNext=(current-1+gap-rank)/sigma;
  return vm.runInNewContext(expr,{...funcs,AA2:rank,P2:sigma,gap,current,J2:available,zNow,zNext,NORMDIST:normal,
    LET:(a,x,b,y,result)=>{if(typeof rank==='number'){assert.equal(x,zNow);assert.equal(y,zNext);}return result;}});
 };
 assert.equal(survival(31,26,0),1);assert.equal(survival('',26,22),'');assert.equal(survival(31,26,24,false),0);
 const expected=normal((31-49)/uncertainty(31))/normal((31-25)/uncertainty(31));
 assert.ok(Math.abs(survival(31,26,24)-expected)<1e-8);
 assert.ok(survival(31,26,24)<survival(31,1,24));
 assert.ok(Number.isFinite(survival(1,100,22)));assert.ok(survival(1,100,22)<1e-20);
 assert.equal(survival(1,100,0),1);
});
