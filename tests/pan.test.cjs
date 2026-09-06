const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('draft estimate blends rank and ADP equally and handles missing inputs',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Pan.gs','utf8'),ctx);
 const formula=ctx.draftOrderFormula_(2).slice(1);
 const evaluate=(adp,rank,weight)=>vm.runInNewContext(formula.replaceAll('$S$2','weight'),{
   F2:adp,Q2:rank,weight,IF:(condition,a,b)=>condition?a:b,AND:(...args)=>args.every(Boolean),ISNUMBER:x=>typeof x==='number'
 });
 assert.equal(evaluate(80,40,.5),60);
 assert.equal(evaluate(80,40,0),80);
 assert.equal(evaluate(80,40,1),40);
 assert.equal(evaluate(80,'',.5),80);
 assert.equal(evaluate('',40,.5),40);
 assert.equal(evaluate('','',.5),'');
});
test('generated fallback formulas equal exhaustive independent availability outcomes',()=>{
 const cells={},modelFormulas=[];
 const sheet={getMaxColumns:()=>40,getMaxRows:()=>100,clearContents(){},hideSheet(){},getRange(row,col,n=1,m=1){
   return {setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>cells[key(row+i,col+j)]=v));},
   setValue(v){cells[key(row,col)]=v;},setFormulas(values){values.forEach((r,i)=>r.forEach((v,j)=>cells[key(row+i,col+j)]=v));}};
 }};
 const model={getRange(){return {setValues(){},setFormula(f){modelFormulas.push(f);},setFormulas(rows){modelFormulas.push(...rows.flat());}};}};
 const ctx={SpreadsheetApp:{getActive:()=>({})},table_:()=>sheet};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Pan.gs','utf8'),ctx);
 function key(r,c){return ctx.panColumn_(c)+r;}
 const players=[{id:'a',points:100,group:'F',pos:'C'},{id:'b',points:80,group:'F',pos:'C'},{id:'c',points:60,group:'F',pos:'C'}];
 ctx.buildPanFormulas_(model,players,{C:20,LW:null,RW:null,D:null,G:null},{});
 const probabilities=[0.3,0.6,0.9],par=[80,60,40];
 function evalCell(cell){const value=cells[cell];if(typeof value==='number')return value;
   let expr=value.slice(1).replace(/'Board Data'!O(\d+)/g,(_,r)=>String(probabilities[Number(r)-2]));
   expr=expr.replace(/\b[A-Z]+\d+\b/g,ref=>String(evalCell(ref)));
   return vm.runInNewContext(expr);
 }
 for(let excluded=0;excluded<3;excluded++){
   let expected=0;
   for(let mask=0;mask<8;mask++){
     let probability=1,best=0;
     for(let j=0;j<3;j++){const available=Boolean(mask&(1<<j));probability*=available?probabilities[j]:1-probabilities[j];if(j!==excluded&&available)best=Math.max(best,par[j]);}
     expected+=probability*best;
   }
   assert.ok(Math.abs(evalCell('G'+(excluded+2))-expected)<1e-10);
 }
 assert.ok(modelFormulas.some(f=>f.includes('IF($N$2=0,0,')));
 assert.ok(modelFormulas.some(f=>f.includes('ISNUMBER(O2)')));
 assert.ok(modelFormulas.some(f=>f.includes("COUNT('PAN Pools'!C2:C4)=3")));
 assert.ok(modelFormulas.some(f=>f.includes('($L$2-1+$N$2)')));
});
