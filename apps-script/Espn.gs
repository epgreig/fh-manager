function espnNameKey_(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function matchEspn_(name,players) {
  // Reviewed Athletic-to-ESPN spelling differences; IDs avoid ambiguous surname matching.
  const aliases={'Alex Nikishin':'5188393','Janis Moser':'4874929','Alex Romanov':'4587854',
    'Alex Carrier':'3942064','Jacob Middleton':'3149839','William Borgen':'3941946',
    'Alex Wennberg':'3042017','Yegor Chinakhov':'4697404','Elias Pettersson (D)':'5238086',
    'Josh Mahura':'4063504','Thomas Novak':'3942061','Emil Martinsen Lilleberg':'5146599',
    'Zachary Bolduc':'4874734','Daniil Tarasov (G)':'4587994','Alex Texier':'4233880',
    'Max Shabanov':'5302535','Alex Kerfoot':'3069394','Alexei Toropchenko':'4392454','Alex Holtz':'4697388'};
  if(aliases[name]) return players.find(p=>p.id===aliases[name])||null;
  const key=espnNameKey_(name), matches=players.filter(p=>espnNameKey_(p.name)===key);
  return matches.length===1?matches[0]:null;
}
function importEspnSnapshot() {
  withLock_(()=>{
    const ss=SpreadsheetApp.getActive(),s=ss.getSheetByName('Players');
    const rows=s.getRange(2,1,s.getLastRow()-1,8).getValues();
    const report=[];
    const values=rows.map(r=>{
      const p=matchEspn_(r[1],ESPN_DATA.players);
      if(!p) {report.push([r[1],'No unique ESPN name match']);return r.slice(5,8);}
      if(!p.pos) {report.push([r[1],'ESPN eligibility missing']);return r.slice(5,8);}
      report.push([r[1],p.adp===null?'Eligibility imported; no positive ESPN ADP':'Imported']);
      return [p.pos,p.adp===null?'':p.adp,'ESPN '+ESPN_DATA.season+' · '+ESPN_DATA.retrievedAt+' · '+ESPN_DATA.url];
    });
    s.getRange(2,6,values.length,3).setValues(values);
    const audit=table_('ESPN Import',['Player','Result'],[]);
    audit.clearContents();audit.getRange(1,1,1,2).setValues([['Player','Result']]);
    audit.getRange(2,1,report.length,2).setValues(report);audit.autoResizeColumns(1,2);
    ss.toast('Imported ESPN snapshot dated '+ESPN_DATA.retrievedAt.slice(0,10)+'. See ESPN Import for unmatched players.');
  });
  refreshBoard();
}
