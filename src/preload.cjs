// Ponte mínima entre a tela e o processo principal: só os nomes de operação permitidos.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ALLOWED = ['connect', 'disconnect', 'list', 'users', 'groups', 'plan', 'execute', 'audit', 'pickKey', 'elevate', 'dropElevation',
  'pickUpload', 'dropUpload', 'upload', 'uploadCancel'];

contextBridge.exposeInMainWorld('bifrost', {
  call: (name, arg) => {
    if (!ALLOWED.includes(name)) return Promise.resolve({ ok: false, erro: 'Operação não permitida.' });
    return ipcRenderer.invoke(name, arg);
  },
  // Caminho no Windows de um arquivo arrastado para a janela (o Electron não expõe mais File.path).
  pathFor: (file) => webUtils.getPathForFile(file),
  onUploadProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('upload-progress', h);
    return () => ipcRenderer.removeListener('upload-progress', h);
  },
});
