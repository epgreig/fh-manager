const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('refresh snapshot freezes values and colours, preserves layout, and reuses its sheet',()=>{
 const calls=[],widths={},hidden=new Set();let exists=false,insertions=0,contents='old rows',rules=['old rule'];
 const backgrounds=[['#fce5cd']],fontColors=[['#000000']];
 const target={breakApart(){calls.push('unmerge');return this;},setBackgrounds(v){assert.equal(v,backgrounds);return this;},setFontColors(v){assert.equal(v,fontColors);return this;},clearDataValidations(){return this;},setNote(v){assert.match(v,/captured after Refresh board/);return this;}};
 const snapshot={getRange:()=>target,getMaxRows:()=>10,getMaxColumns:()=>3,clear(){contents='';},setConditionalFormatRules(v){rules=v;},setFrozenColumns(){},setFrozenRows(){},insertRowsAfter(){},insertColumnsAfter(){},showRows(){},showColumns(){hidden.clear();},setColumnWidth(c,w){widths[c]=w;},hideColumns(c){hidden.add(c);},setRowHeight(){},setRowHeights(){},setHiddenGridlines(){}};
 const source={getNumRows:()=>5,getNumColumns:()=>4,getBackgrounds:()=>backgrounds,getFontColors:()=>fontColors,copyTo(t,type){assert.equal(t,target);calls.push(type||'copy');contents=type==='values'?'frozen values':'formulas';rules=['copied rule'];}};
 const board={getDataRange:()=>source,getColumnWidth:c=>c*10,isColumnHiddenByUser:c=>c===2,getRowHeight:()=>21,getFrozenRows:()=>3,getFrozenColumns:()=>0,hasHiddenGridlines:()=>true};
 const ss={getSheetByName:name=>name==='Board'?board:exists?snapshot:null,insertSheet(name){assert.equal(name,'Board Snapshot');exists=true;insertions++;return snapshot;}};
 const ctx={SpreadsheetApp:{flush:()=>calls.push('flush'),getActive:()=>ss,CopyPasteType:{PASTE_VALUES:'values'}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Live.gs','utf8'),ctx);
 ctx.snapshotBoard_();ctx.snapshotBoard_();
 assert.equal(insertions,1);assert.equal(contents,'frozen values');assert.equal(rules.length,0);
 assert.deepEqual([...hidden],[2]);assert.equal(widths[4],40);
 assert.deepEqual(calls,['flush','unmerge','copy','values','flush','unmerge','copy','values']);
});
