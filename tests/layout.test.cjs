const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('live board filters log availability and separates PAN from player lists',()=>{
 const hidden=new Set([8,17,26]), widths={},writes=[],calls=[],formulas=[];
 const range=new Proxy({}, {get:(_,name)=>(...args)=>{calls.push(name);return range;}});
 const sheet=new Proxy({}, {get:(_,name)=>{
   if(name==='getMaxRows')return ()=>1000;
   if(name==='getMaxColumns')return ()=>26;
   if(name==='getRange')return (...args)=>new Proxy({}, {get:(_,method)=>(...values)=>{if(method==='setValues')writes.push({args,values:values[0]});if(method==='setFormula')formulas.push(values[0]);return range;}});
   if(name==='showColumns')return ()=>hidden.clear();
   if(name==='hideColumns')return col=>hidden.add(col);
   if(name==='setColumnWidth')return (col,w)=>{calls.push('setColumnWidth');widths[col]=w;};
   if(name==='setColumnWidths')return (col,n,w)=>{for(let i=0;i<n;i++)widths[col+i]=w;};
   return ()=>sheet;
 }});
 const rule=new Proxy({}, {get:(_,name)=>()=>name==='build'?{}:rule});
 const ctx={SpreadsheetApp:{getActive:()=>({getSheetByName:()=>sheet}),newConditionalFormatRule:()=>rule,InterpolationType:{NUMBER:'number',PERCENTILE:'percentile'},BorderStyle:{SOLID:'solid'},WrapStrategy:{CLIP:'clip'}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Engine.gs','utf8')+'\n'+fs.readFileSync('apps-script/Code.gs','utf8')+'\n'+fs.readFileSync('apps-script/Live.gs','utf8'),ctx);
 ctx.table_=()=>sheet;
 ctx.evaluate=()=>({available:['F','D','G'].map(g=>({group:g,id:g,name:g,points:100,par:20,adp:5,pan:null,pos:g,team:'TOR'})),panReady:false});
 ctx.renderBoard_({c:{teams:12,rounds:16,parTop:.15,adpBottom:.1},players:[{},{},{}],state:{current:1,next:24}});
 assert.deepEqual([...hidden].sort((a,b)=>a-b),[4,8,11,13,17,20,22,26]);
 assert.equal(Object.entries(widths).reduce((sum,[col,w])=>sum+(hidden.has(Number(col))?0:w),0),1029);
 assert.equal(formulas.filter(f=>f.startsWith('=IFNA(SORT(FILTER')).length,3);
 assert.ok(formulas.some(f=>f.startsWith('=FH_STATE(')));
 assert.ok(formulas.some(f=>f.startsWith('=FH_PAN(HSTACK(')));
 assert.ok(formulas.filter(f=>f.startsWith('=IFNA(SORT(FILTER')).every(f=>f.includes('!A2:F')));
});
