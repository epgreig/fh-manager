const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ctx={};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Names.gs','utf8'),ctx);
const players=[{id:'1',name:'Connor McDavid'},{id:'2',name:'Cale Makar'}];
test('name entry tolerates case and surrounding spaces and migrates old IDs',()=>{
 assert.equal(ctx.resolvePlayerName_(' connor mcdavid ',players).player.id,'1');
 assert.equal(ctx.resolvePlayerName_('2',players).player.name,'Cale Makar');
 assert.equal(ctx.resolvePlayerName_('Conor McDavid',players).message,'Name not found');
 assert.equal(ctx.resolvePlayerName_('',players).message,'');
 assert.equal(ctx.resolvePlayerName_('Cale Makar',[...players,{id:'3',name:'Cale Makar'}]).message,'Ambiguous name');
});
