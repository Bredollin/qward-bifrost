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

test('sudo: elevação, pastas, permissões, usuários', { skip }, async () => {
  const s = await open('sudo', conn.password);
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

test('sudo com senha errada é recusado', { skip }, async () => {
  const s = await open('sudo', 'errada');
  try {
    await assert.rejects(s.testElevation(), /recusada/);
  } finally {
    s.close();
  }
});

test('su: elevação com senha de root', { skip: skip || (!E.BIFROST_TEST_ROOTPASS && 'sem BIFROST_TEST_ROOTPASS') }, async () => {
  const s = await open('su', E.BIFROST_TEST_ROOTPASS);
  const ops = new Ops(s, { policy });
  try {
    await s.testElevation();
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
