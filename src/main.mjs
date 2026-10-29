// Processo principal do Electron: guarda a sessão SSH e expõe operações para a tela via IPC.
// A tela (renderer) nunca toca em SSH, arquivos locais ou senhas guardadas: só pede operações.
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from './core/session.mjs';
import { Ops } from './core/ops.mjs';
import { Audit } from './core/audit.mjs';
import { KnownHosts } from './core/knownhosts.mjs';
import { DEFAULT_POLICY } from './core/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
if (process.env.BIFROST_DATA_DIR) app.setPath('userData', process.env.BIFROST_DATA_DIR);
const data = () => app.getPath('userData');

let session = null;
let ops = null;
const pickedKeys = new Set(); // só lemos chaves escolhidas pelo diálogo do Windows
const audit = () => new Audit(join(data(), 'registro-de-acoes.jsonl'));
const known = () => new KnownHosts(join(data(), 'servidores-conhecidos.json'));

// Política editável pelo administrador em %APPDATA%\Qward Bifrost\politica.json
async function loadPolicy() {
  const f = join(data(), 'politica.json');
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(await readFile(f, 'utf8')) };
  } catch (e) {
    if (e.code === 'ENOENT') {
      await mkdir(data(), { recursive: true });
      await writeFile(f, JSON.stringify(DEFAULT_POLICY, null, 2));
      return DEFAULT_POLICY;
    }
    throw new Error('politica.json com erro: ' + e.message);
  }
}

function need() {
  if (!ops) throw new Error('Não conectado.');
  return ops;
}

// Erros viram { erro } para a tela mostrar a mensagem em português sem stack trace.
function handle(name, fn) {
  ipcMain.handle(name, async (_e, arg) => {
    try {
      return { ok: true, data: await fn(arg || {}) };
    } catch (e) {
      return { ok: false, erro: e.message, code: e.code, fingerprint: e.fingerprint };
    }
  });
}

handle('connect', async (a) => {
  if (!a.tecnico?.trim()) throw new Error('Informe seu nome (fica no registro de ações).');
  if (!a.host?.trim() || !a.username?.trim()) throw new Error('Informe servidor e usuário.');
  const port = Number(a.port) || 22;
  const kh = known();
  // A impressão digital confirmada só é gravada depois que a conexão der certo.
  const knownFingerprint = (await kh.get(a.host, port)) || a.trustFingerprint || null;
  if (a.keyPath && !pickedKeys.has(a.keyPath)) throw new Error('Escolha a chave pelo botão "Escolher…".');
  const privateKey = a.keyPath ? await readFile(a.keyPath) : undefined;

  session?.close();
  const s = new Session();
  let unknownFp = null;
  try {
    await s.connect({
      host: a.host.trim(), port, username: a.username.trim(),
      password: a.password, privateKey, passphrase: a.passphrase, knownFingerprint,
      confirmHost: async (fp) => ((unknownFp = fp), false),
    });
  } catch (e) {
    if (unknownFp) {
      const err = new Error('Primeira conexão com este servidor: confirme a identidade.');
      err.code = 'UNKNOWN_HOST';
      err.fingerprint = unknownFp;
      throw err;
    }
    throw e;
  }

  if (a.trustFingerprint && !(await kh.get(a.host, port))) await kh.set(a.host, port, a.trustFingerprint);

  // Sempre entra como usuário comum; a elevação acontece só dentro do app, pelo botão Elevar.
  session = s;
  ops = new Ops(s, { policy: await loadPolicy(), audit: audit(), tecnico: a.tecnico.trim(), host: a.host.trim() });
  const info = await ops.sysinfo();
  await audit().write({ tecnico: ops.tecnico, host: ops.host, op: 'conectar', summary: `Conectou como ${info.user}`, ok: true });
  return { ...info, elevation: 'none', policy: ops.policy };
});

handle('disconnect', async () => {
  if (ops) await audit().write({ tecnico: ops.tecnico, host: ops.host, op: 'desconectar', summary: 'Desconectou', ok: true });
  session?.close();
  session = ops = null;
});

// Botão Elevar: liga sudo ou su com a sessão já aberta. Se a senha falhar, continua sem elevação.
handle('elevate', async (a) => {
  const o = need();
  if (!['sudo', 'su'].includes(a.method)) throw new Error('Escolha sudo ou su.');
  if (!a.password) throw new Error('Informe a senha.');
  session.setElevation(a.method, a.password);
  try {
    await session.testElevation();
  } catch (e) {
    session.setElevation('none');
    await audit().write({ tecnico: o.tecnico, host: o.host, op: 'elevar', summary: `Tentou elevar com ${a.method}`, ok: false, error: e.message });
    throw e;
  }
  await audit().write({ tecnico: o.tecnico, host: o.host, op: 'elevar', summary: `Elevou com ${a.method}`, ok: true });
  return { elevation: a.method };
});

handle('dropElevation', async () => {
  const o = need();
  session.setElevation('none');
  await audit().write({ tecnico: o.tecnico, host: o.host, op: 'baixar-elevacao', summary: 'Saiu do modo root', ok: true });
  return { elevation: 'none' };
});

handle('list', (a) => need().list(a.path, { elevated: !!a.elevated }));
handle('users', () => need().users());
handle('groups', () => need().groups());
handle('plan', (a) => need().plan(a.op, a.args).then(({ stdin, ...p }) => p));
handle('execute', (a) => need().execute(a.op, a.args));
handle('audit', () => audit().tail(300));
handle('pickKey', async () => {
  const r = await dialog.showOpenDialog({ title: 'Escolha a chave privada SSH', properties: ['openFile', 'showHiddenFiles'] });
  if (r.canceled) return null;
  pickedKeys.add(r.filePaths[0]);
  return r.filePaths[0];
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 640,
    title: 'Qward Bifrost', backgroundColor: '#0a2420',
    icon: join(here, 'ui', 'icone.png'),
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(join(here, 'ui', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  session?.close();
  app.quit();
});
