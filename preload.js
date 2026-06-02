const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onCloseRequest: (cb) => ipcRenderer.on('close-request', cb),
  confirmClose:   ()   => ipcRenderer.send('close-confirmed'),
  cancelClose:    ()   => ipcRenderer.send('close-cancelled'),
  fetchSheetCSV:  (url)     => ipcRenderer.invoke('fetch-sheet-csv', url),
  writeToSheet:   (updates, gid) => ipcRenderer.invoke('write-to-sheet', updates, gid),
  getSheetTabs:   ()        => ipcRenderer.invoke('get-sheet-tabs'),
  getAppVersion:  ()        => ipcRenderer.invoke('get-app-version'),
  checkUpdate:    ()        => ipcRenderer.invoke('check-update'),
  openExternal:   (url)     => ipcRenderer.invoke('open-external', url),
});
