// Teste de ponta a ponta da interface (Electron + Playwright) contra o servidor SSH de teste.
// Uso: BIFROST_TEST_HOST=... BIFROST_TEST_PORT=... BIFROST_TEST_USER=... BIFROST_TEST_PASS=... node test/ui.test.mjs [pasta-das-capturas]
import { createRequire } from 'node:module';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Session } from '../src/core/session.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const E = process.env;
if (!E.BIFROST_TEST_HOST) {
  console.log('pulado: defina BIFROST_TEST_HOST');
  process.exit(0);
}
const shots = process.argv[2] || 'test-shots';
await mkdir(shots, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), 'bifrost-ui-'));
const tag = String(Date.now() % 100000);
const BASE = '/srv/bifrost-ui-' + tag;

const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', '.'], env: { ...process.env, BIFROST_DATA_DIR: dataDir } });
const w = await app.firstWindow();
await w.setViewportSize({ width: 1280, height: 800 });
const shot = (n) => w.screenshot({ path: join(shots, n + '.png') });
const ok = async () => w.click('#dlg-ok');

try {
  await shot('01-login');
  await w.fill('[name=tecnico]', 'Teste UI');
  await w.fill('[name=host]', E.BIFROST_TEST_HOST);
  await w.fill('[name=port]', E.BIFROST_TEST_PORT || '22');
  await w.fill('[name=username]', E.BIFROST_TEST_USER);
  await w.fill('[name=password]', E.BIFROST_TEST_PASS);
  await w.click('#btn-conectar');

  await w.waitForSelector('#fp');
  await shot('02-confirmar-servidor');
  await ok();
  await w.waitForSelector('#tela-app:not([hidden])');

  // Pasta de teste criada direto pelo app: navegar até /srv e criar.
  await w.fill('#caminho', '/srv');
  await w.press('#caminho', 'Enter');
  await w.waitForFunction(() => document.querySelector('#caminho').value === '/srv');
  await w.click('#btn-nova-pasta');
  await w.fill('#dlg [name=nome]', 'bifrost-ui-' + tag);
  await ok();
  await w.waitForSelector('.risk');
  await shot('03-confirmar-nova-pasta');
  await ok();
  await w.waitForSelector(`tr[data-name="bifrost-ui-${tag}"]`);
  await w.dblclick(`tr[data-name="bifrost-ui-${tag}"] td.name`);
  await w.waitForFunction((b) => document.querySelector('#caminho').value === b, BASE);

  await w.click('#btn-nova-pasta');
  await w.fill('#dlg [name=nome]', 'financeiro');
  await w.fill('#dlg [name=mode]', '750');
  await ok();
  await ok();
  await w.waitForSelector('tr[data-name="financeiro"]');
  assert.equal(await w.textContent('tr[data-name="financeiro"] td.perm'), 'drwxr-x---');

  // Nome malicioso aparece como texto (sem virar HTML).
  await w.click('#btn-nova-pasta');
  await w.fill('#dlg [name=nome]', '<img src=x onerror=alert(1)>');
  await ok();
  await ok();
  await w.waitForSelector('tr[data-name="<img src=x onerror=alert(1)>"]');
  assert.equal(await w.locator('#lista img').count(), 0);

  // Permissões pela grade de caixas.
  await w.click('tr[data-name="financeiro"] td.name');
  await w.click('#btn-permissoes');
  await w.check('#dlg input[data-b="16"]');
  await w.check('#dlg input[data-b="1024"]');
  assert.equal(await w.inputValue('#dlg [name=mode]'), '2770');
  await shot('04-permissoes');
  await ok();
  await w.waitForSelector('.risk');
  await ok();
  await w.waitForFunction(() => document.querySelector('tr[data-name="financeiro"] td.perm')?.textContent === 'drwxrws---');

  // Trava: fora da área permitida.
  await w.fill('#caminho', '/etc');
  await w.press('#caminho', 'Enter');
  await w.waitForFunction(() => document.querySelector('#caminho').value === '/etc');
  await w.click('#btn-nova-pasta');
  await w.fill('#dlg [name=nome]', 'nao-pode');
  await ok();
  await w.waitForSelector('#dlg-erro:not([hidden])');
  assert.match(await w.textContent('#dlg-erro'), /fora das pastas permitidas/);
  await shot('05-bloqueio-etc');
  await w.click('#dlg-cancel');

  // Grupo e usuário.
  await w.click('[data-tab=usuarios]');
  await w.click('#btn-novo-grupo');
  await w.fill('#dlg [name=nome]', 'bfui' + tag);
  await ok();
  await ok();
  await w.waitForSelector(`#lista-grupos td:text-is("bfui${tag}")`);
  await w.click('#btn-novo-usuario');
  await w.fill('#dlg [name=nome]', 'bfuser' + tag);
  await w.fill('#dlg [name=groups]', 'bfui' + tag);
  await w.fill('#dlg [name=pw1]', 'SenhaDoTeste1');
  await w.fill('#dlg [name=pw2]', 'SenhaDoTeste1');
  await ok();
  await w.waitForSelector('.risk.alto');
  await shot('06-confirmar-usuario');
  await w.check('#dlg [name=entendo]');
  await ok();
  await w.waitForSelector(`#lista-usuarios td:text-is("bfuser${tag}")`);
  await shot('07-usuarios');

  // Dono e grupo.
  await w.click('[data-tab=arquivos]');
  await w.fill('#caminho', BASE);
  await w.press('#caminho', 'Enter');
  await w.waitForSelector('tr[data-name="financeiro"]');
  await w.click('tr[data-name="financeiro"] td.name');
  await w.click('#btn-dono');
  await w.fill('#dlg [name=owner]', 'bfuser' + tag);
  await w.fill('#dlg [name=group]', 'bfui' + tag);
  await ok();
  await ok();
  await w.waitForFunction((t) => document.querySelector('tr[data-name="financeiro"] td:nth-child(3)')?.textContent === 'bfuser' + t, tag);
  await w.click('tr[data-name="financeiro"] td.name');
  await shot('08-arquivos');

  await w.click('[data-tab=registro]');
  await w.waitForSelector('#lista-registro tr');
  const reg = await w.textContent('#lista-registro');
  assert.match(reg, /Teste UI/);
  assert.doesNotMatch(reg, /SenhaDoTeste1/);
  await shot('09-registro');
  console.log('UI ok: capturas em', shots);
} catch (e) {
  await shot('erro').catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await app.close();
  // Limpeza do servidor de teste (o app não apaga nada, de propósito).
  const s = new Session();
  await s.connect({ host: E.BIFROST_TEST_HOST, port: E.BIFROST_TEST_PORT || 22, username: E.BIFROST_TEST_USER, password: E.BIFROST_TEST_PASS, confirmHost: async () => true });
  s.setElevation('sudo', E.BIFROST_TEST_PASS);
  await s.run(`userdel -r bfuser${tag} 2>/dev/null; groupdel bfui${tag} 2>/dev/null; rm -rf ${BASE}`, { elevated: true });
  s.close();
}
