/** Build the third, independent workbook using the bundled artifact runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const out=path.resolve(process.argv[2]||'outputs/management');
const runtime=process.env.FH_ARTIFACT_MODULE;
if(!runtime)throw Error('Set FH_ARTIFACT_MODULE to the bundled @oai/artifact-tool module entry.');
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(runtime).href);
const require=createRequire(import.meta.url),{managementData}=require('./management_data.cjs');
const data=managementData(),wb=Workbook.create();
const roster=wb.worksheets.add('Rosters'),players=wb.worksheets.add('Players'),schedule=wb.worksheets.add('Schedule');
await fs.mkdir(out,{recursive:true});
const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const value=(s,a,v)=>s.getRange(a).values=[[v]],formula=(s,a,v)=>s.getRange(a).formulas=[[v]];
function base(s,range){s.showGridLines=false;s.getRange(range).format.font={name:'Arial',size:10,color:'#202124'};s.getRange(range).format.rowHeight=21;}
function header(s,a){s.getRange(a).format.fill='#eeeeee';s.getRange(a).format.font.bold=true;s.getRange(a).format.borders={bottom:{style:'thin',color:'#555555'}};}
function scale(s,a,color){s.getRange(a).conditionalFormats.add('colorScale',{colors:['#ffffff',color],thresholds:['min','max']});}
base(roster,'A1:Q33');base(players,'A1:N680');base(schedule,'A1:AE95');
const last=data.players.length+6,lookup="'Players'!$A$7:$M$"+last;
value(players,'A2','Players');players.getRange('A2').format.font={size:14,bold:true};
value(players,'A3','Team games / season');value(players,'B3',84);players.getRange('B3').format.fill='#fff2cc';
players.dataValidations.add({range:'B3',rule:{type:'whole',operator:'between',formula1:1,formula2:100}});
value(players,'D3','Skaters: FP / projected GP. Goalies: FP / team games, for weekly schedule estimates.');
value(players,'A4','Projection snapshot: 2026-09-29. League-specific source weights and totals; personal draft cuts are not carried over.');
value(players,'A5','ESPN parts: Dom 12, DtZ 6, LE 6, Blake 4, Nate 4, Laidlaw 3, Cullen 2. Yahoo: Dom 8, Cullen 3; others same.');
players.getRange('A6:N6').values=[['Player','Tm','Age','ESPN POS','Yahoo POS','ESPN FP/g','Yahoo FP/g','Group','ESPN FP','ESPN GP','Yahoo FP','Yahoo GP','ID','']];header(players,'A6:M6');
players.getRange(`A7:M${last}`).values=data.players.map(p=>[p.name,p.team,p.age,p.espnPos,p.yahooPos,null,null,p.group,p.espnPoints,p.espnGp,p.yahooPoints,p.yahooGp,p.id]);
players.getRange(`F7:G${last}`).formulas=data.players.map((p,i)=>{const r=i+7;return [`=IF(H${r}="G",I${r}/$B$3,I${r}/J${r})`,`=IF(H${r}="G",K${r}/$B$3,K${r}/L${r})`];});
players.getRange(`F7:G${last}`).setNumberFormat('0.00');players.getRange(`I7:L${last}`).setNumberFormat('0.0');
players.getRange('A1:A680').format.columnWidthPx=210;players.getRange('B1:C680').format.columnWidthPx=60;players.getRange('D1:G680').format.columnWidthPx=100;players.getRange('H1:L680').format.columnWidthPx=82;players.getRange('M1:M680').format.columnWidthPx=155;
players.freezePanes.freezeRows(6);scale(players,`F7:F${last}`,'#b4a7d6');scale(players,`G7:G${last}`,'#b4a7d6');
value(roster,'A2','ESPN');value(roster,'J2','Yahoo');
for(const a of ['A2','J2'])roster.getRange(a).format.font={size:14,bold:true};
value(roster,'A3','Enter names and optional multipliers. 0.75 = a 25% cut; blank = 1.');
value(roster,'J3','All positions in one list. Include bench and IR players as needed.');
for(const start of [1,10]){
  const name=col(start),adj=col(start+5),check=col(start+7),baseRate=col(start+4);
  roster.getRange(`${name}4:${check}4`).values=[['Player','POS','Tm','Age','FP/g','Adj','Adj FP/g','Check']];header(roster,`${name}4:${check}4`);
  const formulas=[];
  for(let r=5;r<=28;r++){
    const ref=`$${name}${r}`;
    const get=n=>`IFNA(VLOOKUP(TRIM(${ref}),${lookup},${n},FALSE),"")`;
    formulas.push([`=IF(${ref}="","",${get(start===1?4:5)})`,`=IF(${ref}="","",${get(2)})`,`=IF(${ref}="","",${get(3)})`,`=IF(${ref}="","",${get(start===1?6:7)})`]);
    formula(roster,`${col(start+6)}${r}`,`=IF(${ref}="","",IF(${check}${r}<>"","",${baseRate}${r}*IF(ISBLANK(${adj}${r}),1,${adj}${r})))`);
    formula(roster,`${check}${r}`,`=IF(${ref}="","",IF(COUNTIFS('Players'!$A$7:$A$${last},TRIM(${ref}))<>1,"Check name",IF(COUNTIFS(${name}$5:${name}$28,${ref})>1,"Duplicate",IF(AND(${adj}${r}<>"",OR(NOT(ISNUMBER(${adj}${r})),${adj}${r}<0)),"Check adj",""))))`);
  }
  roster.getRange(`${col(start+1)}5:${baseRate}28`).formulas=formulas;
  roster.getRange(`${name}5:${name}28`).format.fill='#fff2cc';roster.getRange(`${adj}5:${adj}28`).format.fill='#fff2cc';
  roster.getRange(`${name}5:${name}28`).dataValidation={rule:{type:'list',formula1:`'Players'!$A$7:$A$${last}`}};
  for(const [offset,width] of [[0,180],[1,65],[2,38],[3,34],[4,53],[5,45],[6,68],[7,90]])roster.getRange(`${col(start+offset)}1:${col(start+offset)}33`).format.columnWidthPx=width;
  for(const o of [4,5,6])roster.getRange(`${col(start+o)}5:${col(start+o)}28`).setNumberFormat(o===5?'0.00':'0.0');
  scale(roster,`${col(start+6)}5:${col(start+6)}28`,'#b4a7d6');
  roster.getRange(`${check}5:${check}28`).conditionalFormats.addCustom(`${check}5<>""`,{fill:'#f4cccc'});
}
roster.getRange('I1:I33').format.columnWidthPx=18;roster.freezePanes.freezeRows(4);
value(roster,'A31','FP/g is per player game for skaters; per team game for goalies. Schedule uses Adj FP/g.');
value(roster,'A32','Names: choose from Players, including Elias Pettersson (D) for the defenseman.');
value(schedule,'A2','Weekly fantasy points');schedule.getRange('A2').format.font={size:14,bold:true};
value(schedule,'A3','Roster rate × team games. Full-roster potential; bench limits, injuries and daily lineup choices are not deducted.');
schedule.getRange('A1:A95').format.columnWidthPx=205;schedule.getRange('B1:B95').format.columnWidthPx=48;schedule.getRange('C1:C95').format.columnWidthPx=70;schedule.getRange('D1:D95').format.columnWidthPx=58;schedule.getRange('E1:AE95').format.columnWidthPx=53;
for(const [start,source,title] of [[5,1,'ESPN'],[33,10,'Yahoo']]){
  const h=start-1; schedule.getRange(`A${h}:D${h}`).values=[[title,'Tm','POS','FP/g']];
  schedule.getRange(`E${h}:AE${h}`).formulas=[Array.from({length:27},(_,i)=>`=${col(i+5)}$62`)];header(schedule,`A${h}:AE${h}`);
  for(let i=0;i<24;i++){
    const r=start+i,rr=5+i,ref=`'Rosters'!${col(source)}${rr}`;
    for(const [offset,origin] of [[0,0],[1,2],[2,1],[3,6]])formula(schedule,`${col(offset+1)}${r}`,`=IF(${ref}="","",'Rosters'!${col(source+origin)}${rr})`);
    const match=`MATCH($B${r},$B$63:$B$94,0)`;
    schedule.getRange(`E${r}:AE${r}`).formulas=[Array.from({length:27},(_,w)=>{
      const game=`INDEX(${col(w+5)}$63:${col(w+5)}$94,${match})`;
      return `=IF($A${r}="","",IF(NOT(ISNUMBER($D${r})),"Check roster",IF(COUNTIFS($B$63:$B$94,$B${r})<>1,"Check team",IF(COUNT(${game})=0,"",$D${r}*${game}))))`;
    })];
  }
  schedule.getRange(`D${start}:AE${start+23}`).setNumberFormat('0.0');scale(schedule,`E${start}:AE${start+23}`,'#8eafe0');
}
value(schedule,'A59','Team games — paste weekly counts below');schedule.getRange('A59').format.font.bold=true;
value(schedule,'A60','Green cells are inputs. Blank = unknown; 0 = no games. Keep team codes in column B. Weeks are editable.');
schedule.getRange('A62:AE62').values=[['Team','Code','','',...Array.from({length:27},(_,i)=>'W'+(i+1))]];header(schedule,'A62:AE62');
const teams=[['Anaheim Ducks','ANA'],['Boston Bruins','BOS'],['Buffalo Sabres','BUF'],['Calgary Flames','CGY'],['Carolina Hurricanes','CAR'],['Chicago Blackhawks','CHI'],['Colorado Avalanche','COL'],['Columbus Blue Jackets','CBJ'],['Dallas Stars','DAL'],['Detroit Red Wings','DET'],['Edmonton Oilers','EDM'],['Florida Panthers','FLA'],['Los Angeles Kings','LA'],['Minnesota Wild','MIN'],['Montreal Canadiens','MTL'],['Nashville Predators','NSH'],['New Jersey Devils','NJ'],['New York Islanders','NYI'],['New York Rangers','NYR'],['Ottawa Senators','OTT'],['Philadelphia Flyers','PHI'],['Pittsburgh Penguins','PIT'],['San Jose Sharks','SJ'],['Seattle Kraken','SEA'],['St. Louis Blues','STL'],['Tampa Bay Lightning','TB'],['Toronto Maple Leafs','TOR'],['Utah Mammoth','UTA'],['Vancouver Canucks','VAN'],['Vegas Golden Knights','VGK'],['Washington Capitals','WSH'],['Winnipeg Jets','WPG']];
schedule.getRange('A63:B94').values=teams;schedule.getRange('E63:AE94').format.fill='#c6e7d6';schedule.getRange('E63:AE94').setNumberFormat('0');
schedule.dataValidations.add({range:'E63:AE94',rule:{type:'whole',operator:'between',formula1:0,formula2:14}});
schedule.freezePanes.freezeRows(4);schedule.freezePanes.freezeColumns(4);
// Exercise the full lookup/multiplier/schedule chain, including missing vs zero.
const sample=data.players.find(p=>p.name==='Nathan MacKinnon'),teamRow=63+teams.findIndex(t=>t[1]===sample.team);
value(roster,'A5',sample.name);value(roster,'F5',0.75);value(roster,'J5','Joey Daccord');value(schedule,`E${teamRow}`,4);wb.recalculate();
const actual=roster.getRange('G5').values[0][0];assert.ok(Math.abs(actual-sample.espnPoints/sample.espnGp*.75)<1e-8);
assert.ok(Math.abs(schedule.getRange('E5').values[0][0]-actual*4)<1e-8);
const goalie=data.players.find(p=>p.name==='Joey Daccord');
assert.ok(Math.abs(roster.getRange('P5').values[0][0]-goalie.yahooPoints/84)<1e-8);
const populatedPreview=await wb.render({sheetName:'Schedule',range:'A1:L10',scale:1.5,format:'png'});
await fs.writeFile(path.join(out,'Schedule-verification.png'),new Uint8Array(await populatedPreview.arrayBuffer()));
value(roster,'F5',0);wb.recalculate();assert.equal(roster.getRange('G5').values[0][0],0);value(roster,'F5',0.75);
assert.equal(schedule.getRange('F5').values[0][0],'');value(schedule,`E${teamRow}`,0);wb.recalculate();assert.equal(schedule.getRange('E5').values[0][0],0);
value(roster,'A6','No Such Player');wb.recalculate();assert.equal(roster.getRange('H6').values[0][0],'Check name');
value(roster,'A6',null);value(roster,'A5',null);value(roster,'F5',null);value(roster,'J5',null);value(schedule,`E${teamRow}`,null);wb.recalculate();
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!',options:{useRegex:true,maxResults:20},summary:'Formula error scan'})).ndjson);
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(path.join(out,'Fantasy-Team-Manager-2026.xlsx'));
for(const [name,range] of [['Rosters','A1:Q16'],['Players','A1:G18'],['Schedule','A59:N74']]){
  const preview=await wb.render({sheetName:name,range,scale:1.5,format:'png'});await fs.writeFile(path.join(out,name+'.png'),new Uint8Array(await preview.arrayBuffer()));
}
await fs.writeFile(path.join(out,'build-summary.json'),JSON.stringify({players:data.players.length,weights:data.weights,tests:'Lookup, multiplier, weekly games, blank/zero and invalid names verified'},null,2));
console.log('Created '+path.join(out,'Fantasy-Team-Manager-2026.xlsx'));
