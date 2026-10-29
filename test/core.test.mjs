// Testes de integração contra um servidor SSH de teste (veja docs/testes.md).
// Variáveis: BIFROST_TEST_HOST, BIFROST_TEST_PORT, BIFROST_TEST_USER, BIFROST_TEST_PASS, BIFROST_TEST_ROOTPASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../src/core/session.mjs';
import { Ops } from '../src/core/ops.mjs';
import { Audit } from '../src/core/audit.mjs';
import { q, cleanPath, checkWritable, symbolicToOctal } from '../src/core/validate.mjs';

const E = process.env;
const conn = { host: E.BIFROST_TEST_HOST, port: E.BIFROST_TEST_PORT || 22, username: E.BIFROST_TEST_USER, password: E.BIFROST_TEST_PASS };
const skip = !conn.host && 'defina BIFROST_TEST_HOST para rodar os testes com servidor';
// Servidor sem sudo (ex.: Debian mínimo): BIFROST_TEST_ELEV=su roda a suíte principal com su e pula os testes de sudo.
const ELEV = E.BIFROST_TEST_ELEV === 'su' ? 'su' : 'sudo';
const elevPw = ELEV === 'su' ? E.BIFROST_TEST_ROOTPASS : conn.password;
const skipSudo = skip || (ELEV === 'su' && 'servidor sem sudo (BIFROST_TEST_ELEV=su)');
const policy = { allowedRoots: ['/srv'], noRecursive: [], protectedNames: ['.ssh'], blockedGroups: ['sudo', 'wheel'] };
const BASE = '/srv/bifrost-teste';

test('aspas e validação', () => {
  assert.equal(q("a'b"), `'a'\\''b'`);
  assert.equal(cleanPath('/srv//x/../y/'), '/srv/y');
  assert.throws(() => cleanPath('relativo'));
  assert.throws(() => checkWritable('/etc/x', policy));
  assert.throws(() => checkWritable('/srv', policy));
  assert.equal(symbolicToOctal('drwxr-x---'), '750');
});

async function open(method, pw) {
  const s = new Session();
  await s.connect({ ...conn, confirmHost: async () => true });
  s.setElevation(method, pw);
  return s;
}

test(`${ELEV}: elevação, pastas, permissões, usuários`, { skip }, async () => {
  const s = await open(ELEV, elevPw);
  const dir = await mkdtemp(join(tmpdir(), 'bifrost-'));
  const audit = new Audit(join(dir, 'audit.log'));
  const ops = new Ops(s, { policy, audit, tecnico: 'teste', host: 'srv-teste' });
  try {
    await s.testElevation();
    const info = await ops.sysinfo();
    assert.ok(info.distro);
    await s.run(`rm -rf ${BASE} && mkdir -p ${BASE} && ln -sfn /etc ${BASE}/atalho-etc`, { elevated: true });

    await ops.execute('mkdir', { path: `${BASE}/projetos`, mode: '750' });
    await ops.execute('mkdir', { path: `${BASE}/nome com espaço e 'aspas'` });
    let l = await ops.list(BASE);
    assert.ok(l.entries.find((e) => e.name === 'projetos' && e.type === 'pasta' && e.perms === 'drwxr-x---'));
    assert.ok(l.entries.find((e) => e.name === "nome com espaço e 'aspas'"));

    await ops.execute('move', { from: `${BASE}/nome com espaço e 'aspas'`, to: `${BASE}/renomeada` });
    await assert.rejects(ops.execute('move', { from: `${BASE}/renomeada`, to: `${BASE}/projetos` }), /existe/);

    const g = 'bftgrupo' + Date.now() % 10000, u = 'bftuser' + Date.now() % 10000;
    await ops.execute('groupadd', { name: g });
    await ops.execute('useradd', { name: u, groups: [g] });
    await ops.execute('passwd', { user: u, password: 'SenhaNova123' });
    assert.ok((await ops.groups()).find((x) => x.name === g && x.members.includes(u)));
    assert.ok((await ops.users()).find((x) => x.name === u && x.human));

    await ops.execute('chown', { path: `${BASE}/projetos`, owner: u, group: g, recursive: true });
    await ops.execute('chmod', { path: `${BASE}/projetos`, mode: '2770' });
    assert.equal((await ops.plan('chmod', { path: `${BASE}/projetos`, mode: '2777' })).risk, 'alto');
    assert.equal((await ops.plan('chmod', { path: `${BASE}/projetos`, mode: '750' })).risk, 'medio');
    assert.equal((await ops.plan('chown', { path: `${BASE}/projetos`, owner: 'root' })).risk, 'alto');
    l = await ops.list(BASE);
    const p = l.entries.find((e) => e.name === 'projetos');
    assert.equal(p.owner, u); assert.equal(p.group, g); assert.equal(p.perms, 'drwxrws---');

    // Trava: atalho dentro de /srv apontando para /etc é bloqueado.
    await assert.rejects(ops.plan('chmod', { path: `${BASE}/atalho-etc`, mode: '777' }), /fora das pastas/);
    await assert.rejects(ops.plan('mkdir', { path: '/etc/bifrost' }), /fora das pastas/);
    await assert.rejects(ops.plan('useradd', { name: 'x; rm -rf /' }), /inválido/);
    await assert.rejects(ops.plan('addtogroup', { user: u, group: 'sudo' }), /administrador/);
    await assert.rejects(ops.plan('useradd', { name: 'outro', groups: ['wheel'] }), /administrador/);
    await assert.rejects(ops.plan('chmod', { path: `${BASE}/projetos`, mode: '4755' }), /setuid/);
    await assert.rejects(ops.plan('mkdir', { path: `${BASE}/.ssh` }), /protegido/);
    // Link quebrado no destino também conta como "já existe".
    await s.run(`ln -sfn /nao/existe ${BASE}/link-quebrado`, { elevated: true });
    await assert.rejects(ops.execute('move', { from: `${BASE}/renomeada`, to: `${BASE}/link-quebrado` }), /existe/);

    // Criar arquivo vazio: não sobrescreve, aceita permissão, mesmas travas do mkdir.
    await ops.execute('touch', { path: `${BASE}/projetos/leia-me.txt`, mode: '640' });
    await assert.rejects(ops.execute('touch', { path: `${BASE}/projetos/leia-me.txt` }), /existe/);
    await assert.rejects(ops.plan('touch', { path: '/etc/bifrost.txt' }), /fora das pastas/);
    await assert.rejects(ops.plan('touch', { path: `${BASE}/atalho-etc/x` }), /fora das pastas/);
    await assert.rejects(ops.plan('touch', { path: `${BASE}/.ssh` }), /protegido/);
    l = await ops.list(`${BASE}/projetos`);
    assert.ok(l.entries.find((e) => e.name === 'leia-me.txt' && e.type === 'arquivo' && e.perms === '-rw-r-----' && e.size === 0));

    // Acesso total: vira dono de tudo com rwX; nunca root, nunca onde há .ssh.
    await s.run(`chown -R root:root ${BASE}/projetos && chmod 600 ${BASE}/projetos/leia-me.txt`, { elevated: true });
    assert.equal((await ops.plan('fullaccess', { path: `${BASE}/projetos`, user: u })).risk, 'alto');
    await ops.execute('fullaccess', { path: `${BASE}/projetos`, user: u });
    l = await ops.list(`${BASE}/projetos`);
    assert.ok(l.entries.find((e) => e.name === 'leia-me.txt' && e.owner === u && e.perms === '-rw-------'));
    assert.ok((await ops.list(BASE)).entries.find((e) => e.name === 'projetos' && e.owner === u && e.perms.startsWith('drwx')));
    await assert.rejects(ops.plan('fullaccess', { path: `${BASE}/projetos`, user: 'root' }), /Bloqueado/);
    await s.run(`mkdir -p ${BASE}/casa/.ssh && touch ${BASE}/casa/.ssh/authorized_keys`, { elevated: true });
    await assert.rejects(ops.plan('fullaccess', { path: `${BASE}/casa`, user: u }), /SSH/);
    await assert.rejects(ops.plan('fullaccess', { path: `${BASE}/atalho-etc`, user: u }), /fora das pastas/);

    // Apagar: confirma pelo nome; pasta com conteúdo só com recursivo + "entendo"; atalho apaga só o atalho.
    await assert.rejects(ops.plan('rm', { path: `${BASE}/projetos/leia-me.txt`, confirmName: 'outro' }), /digite exatamente/);
    await ops.execute('rm', { path: `${BASE}/projetos/leia-me.txt`, confirmName: 'leia-me.txt' });
    assert.ok(!(await ops.list(`${BASE}/projetos`)).entries.find((e) => e.name === 'leia-me.txt'));
    await ops.execute('mkdir', { path: `${BASE}/projetos/sub` });
    await ops.execute('touch', { path: `${BASE}/projetos/sub/a.txt` });
    await s.run(`ln -sfn ${BASE}/projetos ${BASE}/atalho-proj`, { elevated: true });
    await ops.execute('rm', { path: `${BASE}/atalho-proj`, confirmName: 'atalho-proj', recursive: true, entendo: 'entendo' });
    assert.ok((await ops.list(`${BASE}/projetos`)).entries.find((e) => e.name === 'sub'), 'apagar o atalho não pode apagar o destino');
    await assert.rejects(ops.execute('rm', { path: `${BASE}/projetos`, confirmName: 'projetos' }), /not empty|não está vazio|vazio/i);
    await assert.rejects(ops.plan('rm', { path: `${BASE}/projetos`, confirmName: 'projetos', recursive: true }), /entendo/);
    const pr = await ops.plan('rm', { path: `${BASE}/projetos`, confirmName: 'projetos', recursive: true, entendo: 'entendo' });
    assert.equal(pr.risk, 'alto'); assert.match(pr.summary, /3 itens/);
    await ops.execute('rm', { path: `${BASE}/projetos`, confirmName: 'projetos', recursive: true, entendo: 'entendo' });
    assert.ok(!(await ops.list(BASE)).entries.find((e) => e.name === 'projetos'));
    await assert.rejects(ops.plan('rm', { path: `${BASE}/casa`, confirmName: 'casa', recursive: true, entendo: 'entendo' }), /SSH/);
    await assert.rejects(ops.plan('rm', { path: `${BASE}/casa/.ssh`, confirmName: '.ssh', recursive: true, entendo: 'entendo' }), /protegido/);
    await assert.rejects(ops.plan('rm', { path: '/srv', confirmName: 'srv' }), /fora das pastas/);
    await assert.rejects(ops.plan('rm', { path: '/etc/hostname', confirmName: 'hostname' }), /fora das pastas/);
    await assert.rejects(ops.plan('rm', { path: `${BASE}/atalho-etc/hostname`, confirmName: 'hostname' }), /fora das pastas/);

    const log = await readFile(join(dir, 'audit.log'), 'utf8');
    assert.ok(log.includes('"tecnico":"teste"'));
    assert.ok(!log.includes('SenhaNova123'), 'senha não pode ir para o log');

    // Nova senha funciona (login do usuário criado).
    const s2 = new Session();
    await s2.connect({ ...conn, username: u, password: 'SenhaNova123', confirmHost: async () => true });
    s2.close();
    await s.run(`userdel -r ${u} 2>/dev/null; groupdel ${g}; rm -rf ${BASE}`, { elevated: true });
  } finally {
    s.close();
  }
});

test('sudo com senha errada é recusado', { skip: skipSudo }, async () => {
  const s = await open('sudo', 'errada');
  try {
    await assert.rejects(s.testElevation(), /recusada/);
  } finally {
    s.close();
  }
});

test('entrar como usuário comum e elevar depois (botão Elevar)', { skip: skipSudo }, async () => {
  const s = await open('none');
  const ops = new Ops(s, { policy });
  try {
    assert.equal(ops.canElevate, false);
    assert.notEqual((await s.run('id -u', { elevated: true })).stdout.trim(), '0');
    s.setElevation('sudo', 'errada');
    await assert.rejects(s.testElevation(), /recusada/);
    s.setElevation('sudo', conn.password);
    await s.testElevation();
    assert.equal(ops.canElevate, true);
    s.setElevation('none');
    assert.equal(ops.canElevate, false);
  } finally {
    s.close();
  }
});

test('su: elevação com senha de root', { skip: skip || (!E.BIFROST_TEST_ROOTPASS && 'sem BIFROST_TEST_ROOTPASS') }, async () => {
  const s = await open('su', E.BIFROST_TEST_ROOTPASS);
  const ops = new Ops(s, { policy });
  try {
    await s.testElevation();
    // su -c no Debian não traz sbin no PATH; o Bifrost acrescenta.
    assert.equal((await s.run('command -v useradd >/dev/null && echo ok', { elevated: true })).stdout.trim(), 'ok');
    await s.run(`rm -rf ${BASE}-su && mkdir -p ${BASE}-su`, { elevated: true });
    await ops.execute('mkdir', { path: `${BASE}-su/via-su` });
    const l = await ops.list(`${BASE}-su`, { elevated: true });
    assert.ok(l.entries.find((e) => e.name === 'via-su' && e.owner === 'root'));
    const u = 'bftsu' + Date.now() % 10000;
    await ops.execute('useradd', { name: u });
    await ops.execute('passwd', { user: u, password: 'OutraSenha123' });
    const s2 = new Session();
    await s2.connect({ ...conn, username: u, password: 'OutraSenha123', confirmHost: async () => true });
    s2.close();
    await s.run(`userdel -r ${u} 2>/dev/null; rm -rf ${BASE}-su`, { elevated: true });
    s.setElevation('su', 'errada');
    await assert.rejects(s.testElevation(), /recusada|elevar/);
  } finally {
    s.close();
  }
});
