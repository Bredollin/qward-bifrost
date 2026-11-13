// Ponte mínima entre a tela e o processo principal: só os nomes de operação permitidos.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ALLOWED = ['connect', 'disconnect', 'list', 'users', 'groups', 'plan', 'execute', 'audit', 'pickKey', 'elevate', 'dropElevation',
  'pickUpload', 'upload', 'uploadCancel'];

contextBridge.exposeInMainWorld('bifrost', {
  call: (name, arg) => {
    if (!ALLOWED.includes(name)) return Promise.resolve({ ok: false, erro: 'Operação não permitida.' });
    return ipcRenderer.invoke(name, arg);
  },
  // Arquivos soltos na janela: o caminho sai do próprio File (webUtils), nunca de texto vindo da tela.
  // Assim a tela não consegue pedir para enviar um arquivo qualquer do PC.
  dropFiles: async (files) => {
    const paths = [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean);
    return ipcRenderer.invoke('dropUpload', { paths });
  },
  onUploadProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('upload-progress', h);
    return () => ipcRenderer.removeListener('upload-progress', h);
  },
});
