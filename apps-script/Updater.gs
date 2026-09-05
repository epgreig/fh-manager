/** Manually invoked updater, authorized by the repository owner. */
function importLatestUpdates() {
  const lock=LockService.getDocumentLock();lock.waitLock(10000);
  try {
    const fetchText=(url,options)=>{
      const response=UrlFetchApp.fetch(url,Object.assign({muteHttpExceptions:true},options||{}));
      if(response.getResponseCode()<200||response.getResponseCode()>=300)
        throw Error('Update failed (HTTP '+response.getResponseCode()+'). Check Apps Script API enablement and authorization. No sheet data was changed.');
      return response.getContentText();
    };
    const commit=JSON.parse(fetchText('https://api.github.com/repos/epgreig/fh-manager/commits/main')).sha;
    if(!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid GitHub revision');
    const replacements=['Code','Engine','Names','Updater'].map(name=>({name,type:'SERVER_JS',source:fetchText('https://raw.githubusercontent.com/epgreig/fh-manager/'+commit+'/apps-script/'+name+'.gs')}));
    if(replacements.some(f=>f.source.length<100)) throw Error('Incomplete update download');
    const url='https://script.googleapis.com/v1/projects/'+encodeURIComponent(ScriptApp.getScriptId())+'/content';
    const headers={Authorization:'Bearer '+ScriptApp.getOAuthToken()};
    const existing=JSON.parse(fetchText(url,{headers}));
    const files=mergeUpdateFiles_(existing.files,replacements);
    fetchText(url,{method:'put',headers,contentType:'application/json',payload:JSON.stringify({files})});
    SpreadsheetApp.getActive().toast('Installed '+commit.slice(0,7)+'. Reload, then Draft → Refresh board.','Code updated',15);
  } finally {lock.releaseLock();}
}
function mergeUpdateFiles_(existing,replacements) {
  if(!Array.isArray(existing)||!existing.some(f=>f.name==='appsscript'&&f.type==='JSON')) throw Error('Project manifest missing');
  const managed=new Set(replacements.map(f=>f.name));
  // The API replaces the whole project. Keep user files, data, and manifest explicitly.
  return existing.filter(f=>!managed.has(f.name)).map(f=>({name:f.name,type:f.type,source:f.source})).concat(replacements);
}
