// Ponte mínima entre a tela e o processo principal: só os nomes de operação permitidos.
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = ['connect', 'disconnect', 'list', 'users', 'groups', 'plan', 'execute', 'audit', 'pickKey', 'elevate', 'dropElevation'];

contextBridge.exposeInMainWorld('bifrost', {
  call: (name, arg) => {
    if (!ALLOWED.includes(name)) return Promise.resolve({ ok: false, erro: 'Operação não permitida.' });
    return ipcRenderer.invoke(name, arg);
  },
});
