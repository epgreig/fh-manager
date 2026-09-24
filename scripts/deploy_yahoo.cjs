/** Explicit Yahoo-only deployment, with the completed ESPN league protected. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'build/yahoo');
const target=JSON.parse(fs.readFileSync(path.join(root,'leagues/yahoo-deployment.local.json')));
const local=JSON.parse(fs.readFileSync(path.join(dir,'.clasp.json')));
const espn=JSON.parse(fs.readFileSync(path.join(root,'apps-script/.clasp.json')));
if(!target.scriptId||local.scriptId!==target.scriptId||target.scriptId===espn.scriptId)throw Error('Refusing deployment: not the configured independent Yahoo script');
const config=fs.readFileSync(path.join(dir,'LeagueConfig.gs'),'utf8');
if(!config.includes('"platform":"Yahoo"')||fs.existsSync(path.join(dir,'EspnData.gs')))throw Error('Not a Yahoo build');
const result=cp.spawnSync('clasp',['push','--force'],{cwd:dir,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
