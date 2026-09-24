// Use an explicitly selected Python, the bundled runtime, or the normal local Python.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
const python=process.env.FH_PYTHON||(fs.existsSync(bundled)?bundled:'python3');
const result=cp.spawnSync(python,[path.join(__dirname,'build_yahoo.py')],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
