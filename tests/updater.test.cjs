const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('updater retains manifest, projection data and custom files',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Updater.gs','utf8'),ctx);
 const original=[{name:'appsscript',type:'JSON',source:'{}',createTime:'ignored'},
 {name:'ProjectionData',type:'SERVER_JS',source:'data'},
 {name:'Custom',type:'SERVER_JS',source:'custom'}, {name:'Code',type:'SERVER_JS',source:'old'}];
 const files=ctx.mergeUpdateFiles_(original,[{name:'Code',type:'SERVER_JS',source:'new'}]);
 assert.equal(files.length,4);assert.equal(files.find(f=>f.name==='ProjectionData').source,'data');
 assert.equal(files.find(f=>f.name==='Custom').source,'custom');assert.equal(files.find(f=>f.name==='Code').source,'new');
 assert.equal(files[0].createTime,undefined);assert.throws(()=>ctx.mergeUpdateFiles_([],[]));
});
