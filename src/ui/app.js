// Tela do Qward Bifrost. Regra: dado vindo do servidor entra só por textContent (nunca innerHTML).
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (name, arg) => {
  const r = await window.bifrost.call(name, arg);
  if (!r.ok) {
    const e = new Error(r.erro);
    e.code = r.code;
    e.fingerprint = r.fingerprint;
    throw e;
  }
  return r.data;
};

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}

const state = { info: null, cwd: '/', entries: [], sel: null, users: [], groups: [] };

function status(msg, isErr = false) {
  const s = $('#status');
  s.textContent = msg || '';
  s.classList.toggle('erro', isErr);
}

// ---------------- Login ----------------

const form = $('#form-login');

function syncLogin() {
  const auth = form.auth.value;
  $$('[data-auth]').forEach((n) => (n.hidden = n.dataset.auth !== auth));
}
form.addEventListener('change', syncLogin);
syncLogin();

$('#btn-chave').addEventListener('click', async () => {
  const p = await api('pickKey');
  if (p) form.keyPath.value = p;
});

async function doConnect(trustFingerprint) {
  const auth = form.auth.value;
  return api('connect', {
    tecnico: form.tecnico.value, host: form.host.value, port: form.port.value, username: form.username.value,
    password: auth === 'senha' ? form.password.value : undefined,
    keyPath: auth === 'chave' ? form.keyPath.value : undefined,
    passphrase: auth === 'chave' ? form.passphrase.value : undefined,
    trustFingerprint,
  });
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#btn-conectar'), err = $('#login-erro');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Conectando…';
  try {
    let info;
    try {
      info = await doConnect();
    } catch (e) {
      if (e.code !== 'UNKNOWN_HOST') throw e;
      const ok = await confirmHost(e.fingerprint);
      if (!ok) throw new Error('Conexão cancelada.');
      info = await doConnect(e.fingerprint);
    }
    form.password.value = form.passphrase.value = '';
    enterApp(info);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Conectar';
  }
});

function confirmHost(fp) {
  return dialog({
    title: 'Primeira conexão com este servidor',
    body: [
      el('p', { text: 'Confira se a impressão digital abaixo é a do servidor certo (pergunte ao responsável se não souber). Ela fica guardada; se mudar no futuro, o Bifrost avisa.' }),
      el('div', { class: 'confirm-cmd', id: 'fp', text: fp }),
    ],
    okText: 'Confio neste servidor',
  });
}

// ---------------- App ----------------

function enterApp(info) {
  state.info = info;
  $('#tela-login').hidden = true;
  $('#tela-app').hidden = false;
  $('#srv-info').textContent = `${form.host.value} · ${info.distro} · ${info.user}`;
  showElevation(info.elevation);
  $('#area-permitida').textContent = 'Alterações permitidas em: ' + info.policy.allowedRoots.join(', ');
  const start = info.policy.allowedRoots[0] || '/';
  go(start).catch(() => go('/'));
}

// ---------------- Elevação ----------------

function showElevation(method) {
  state.info.elevation = method;
  const on = method !== 'none';
  const e = $('#srv-elev');
  e.textContent = on ? `root (${method})` : 'user';
  e.classList.toggle('root', on);
  const b = $('#btn-elevar');
  b.textContent = on ? 'Sair do root' : 'Elevar permissão';
  b.classList.toggle('on', on);
  $('#ver-root').disabled = !on;
  if (!on && $('#ver-root').checked) {
    $('#ver-root').checked = false;
    go(state.cwd).catch(() => {});
  }
}

// Pede sudo ou su com a sessão já aberta. Retorna true se ficou root.
async function elevate(motivo) {
  const ok = await dialog({
    title: 'Elevar permissão',
    body: [
      motivo ? el('p', { class: 'muted', text: motivo }) : null,
      el('fieldset', { class: 'seg' },
        el('legend', { text: 'Como elevar' }),
        el('label', {}, el('input', { type: 'radio', name: 'metodo', value: 'sudo', checked: true }), ' sudo'),
        el('label', {}, el('input', { type: 'radio', name: 'metodo', value: 'su' }), ' su')),
      el('label', {}, 'root',
        el('input', { name: 'elevSenha', type: 'password', required: true })),
      el('p', { class: 'muted small', text: 'A senha fica só na memória até você desconectar ou sair do root.' }),
    ],
    okText: 'Elevar',
    onOk: async (f) => {
      const method = f.metodo.value, password = f.elevSenha.value;
      f.elevSenha.value = '';
      return (await api('elevate', { method, password })).elevation;
    },
  });
  if (!ok) return false;
  showElevation(ok);
  status('Permissão elevada: agora as alterações rodam como root.');
  return true;
}

$('#btn-elevar').addEventListener('click', async () => {
  if (state.info.elevation === 'none') return elevate();
  await api('dropElevation').catch(() => {});
  showElevation('none');
  status('Saiu do root.');
});

$('#btn-sair').addEventListener('click', async () => {
  await api('disconnect').catch(() => {});
  $('#tela-app').hidden = true;
  $('#tela-login').hidden = false;
  status('');
});

$$('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab').forEach((t) => (t.hidden = t.id !== 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'usuarios') loadUsers();
    if (b.dataset.tab === 'registro') loadAudit();
  })
);

// ---------------- Arquivos ----------------

const join = (dir, name) => (dir === '/' ? '' : dir) + '/' + name;
const parent = (p) => p.replace(/\/[^/]+$/, '') || '/';

async function go(path) {
  status('Carregando…');
  try {
    const r = await api('list', { path, elevated: $('#ver-root').checked });
    state.cwd = r.path;
    state.entries = r.entries;
    state.sel = null;
    $('#caminho').value = r.path;
    renderFiles();
    status(`${r.entries.length} itens${r.elevated ? ' · lido como root' : ''}`);
  } catch (e) {
    status(e.message, true);
    throw e;
  }
}

function fmtSize(n, type) {
  if (type === 'pasta') return '';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
}

function renderFiles() {
  const tb = $('#lista');
  tb.replaceChildren();
  const ico = { pasta: '📁', arquivo: '📄', atalho: '🔗', outro: '◇' };
  for (const e of state.entries) {
    const tr = el('tr', { 'data-name': e.name },
      el('td', { class: 'name' }, el('span', { class: 'ico', text: ico[e.type] }), e.name),
      el('td', { class: 'perm', text: e.perms }),
      el('td', { text: e.owner }),
      el('td', { text: e.group }),
      el('td', { class: 'num', text: fmtSize(e.size, e.type) }),
      el('td', { text: new Date(e.mtime).toLocaleString('pt-BR') }));
    tr.addEventListener('click', () => select(e.name));
    tr.addEventListener('dblclick', () => e.type === 'pasta' && go(join(state.cwd, e.name)).catch(() => {}));
    tb.append(tr);
  }
  $('#lista-vazia').hidden = state.entries.length > 0;
  select(null);
}

function select(name) {
  state.sel = name;
  $$('#lista tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.name === name));
  $$('[data-need-sel]').forEach((b) => (b.disabled = !name));
}
const selected = () => state.entries.find((e) => e.name === state.sel);

$('#form-caminho').addEventListener('submit', (ev) => {
  ev.preventDefault();
  go($('#caminho').value.trim() || '/').catch(() => {});
});
$('#btn-subir').addEventListener('click', () => go(parent(state.cwd)).catch(() => {}));
$('#btn-atualizar').addEventListener('click', () => go(state.cwd).catch(() => {}));
$('#ver-root').addEventListener('change', () => go(state.cwd).catch(() => {}));

$('#btn-nova-pasta').addEventListener('click', () =>
  operation({
    title: 'Nova pasta',
    fields: [field('Nome da pasta', 'nome', { required: true, placeholder: 'ex.: financeiro' }), field('Permissão (opcional)', 'mode', { placeholder: '770', class: 'mono' })],
    op: 'mkdir',
    args: (f) => ({ path: join(state.cwd, f.nome.value.trim()), mode: f.mode.value.trim() || undefined }),
  })
);

$('#btn-mover').addEventListener('click', () => {
  const s = selected();
  operation({
    title: `Renomear ou mover "${s.name}"`,
    fields: [field('Novo caminho completo', 'to', { required: true, value: join(state.cwd, s.name), class: 'mono' })],
    op: 'move',
    args: (f) => ({ from: join(state.cwd, s.name), to: f.to.value.trim() }),
  });
});

$('#btn-permissoes').addEventListener('click', () => {
  const s = selected();
  const frag = $('#tpl-perm').content.cloneNode(true);
  const boxes = $$('input[data-b]', frag);
  const mode = $('input[name=mode]', frag);
  const cur = permsToOctal(s.perms);
  mode.value = cur;
  const fromMode = () => {
    const v = parseInt(mode.value, 8) || 0;
    boxes.forEach((b) => (b.checked = !!(v & Number(b.dataset.b))));
  };
  const toMode = () => {
    const v = boxes.reduce((a, b) => a + (b.checked ? Number(b.dataset.b) : 0), 0);
    mode.value = (v > 511 ? v.toString(8).padStart(4, '0') : v.toString(8).padStart(3, '0'));
  };
  boxes.forEach((b) => b.addEventListener('change', toMode));
  mode.addEventListener('input', fromMode);
  fromMode();
  $('#perm-alvo', frag).textContent = `${join(state.cwd, s.name)} · hoje: ${s.perms} (${cur})`;
  operation({
    title: 'Permissões',
    fields: [frag],
    op: 'chmod',
    args: (f) => ({ path: join(state.cwd, s.name), mode: f.mode.value.trim(), recursive: f.recursive.checked }),
  });
});

$('#btn-dono').addEventListener('click', async () => {
  const s = selected();
  await ensureUsersGroups();
  operation({
    title: 'Dono e grupo',
    fields: [
      el('p', { class: 'muted', text: `${join(state.cwd, s.name)} · hoje: ${s.owner}:${s.group}` }),
      field('Dono', 'owner', { value: s.owner, list: 'dl-usuarios', class: 'mono' }),
      field('Grupo', 'group', { value: s.group, list: 'dl-grupos', class: 'mono' }),
      datalist('dl-usuarios', state.users.map((u) => u.name)),
      datalist('dl-grupos', state.groups.map((g) => g.name)),
      el('label', { class: 'check danger' }, el('input', { type: 'checkbox', name: 'recursive' }), 'Aplicar em tudo que está dentro (recursivo)'),
    ],
    op: 'chown',
    args: (f) => ({
      path: join(state.cwd, s.name),
      owner: f.owner.value.trim() !== s.owner ? f.owner.value.trim() : undefined,
      group: f.group.value.trim() || undefined,
      recursive: f.recursive.checked,
    }),
  });
});

function permsToOctal(p) {
  const s = p.slice(-9);
  let o = '';
  for (let i = 0; i < 9; i += 3) {
    const t = s.slice(i, i + 3);
    o += (t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + (/[xst]/.test(t[2]) ? 1 : 0);
  }
  const sp = (/[sS]/.test(s[2]) ? 4 : 0) + (/[sS]/.test(s[5]) ? 2 : 0) + (/[tT]/.test(s[8]) ? 1 : 0);
  return sp ? sp + o : o;
}

// ---------------- Usuários e grupos ----------------

async function ensureUsersGroups() {
  [state.users, state.groups] = await Promise.all([api('users'), api('groups')]);
}

async function loadUsers() {
  try {
    await ensureUsersGroups();
    renderUsers();
    status(`${state.users.length} usuários · ${state.groups.length} grupos`);
  } catch (e) {
    status(e.message, true);
  }
}

function renderUsers() {
  const only = $('#so-pessoas').checked;
  const us = state.users.filter((u) => !only || u.human || u.name === state.info.user);
  $('#lista-usuarios').replaceChildren(...us.map((u) =>
    el('tr', {}, el('td', { text: u.name }), el('td', { class: 'num', text: u.uid }), el('td', { text: u.home }), el('td', { text: u.shell }))));
  const humans = state.users.filter((u) => u.human);
  const humanGids = new Set(humans.map((u) => u.gid));
  const humanNames = new Set(humans.map((u) => u.name));
  const gs = state.groups.filter((g) => !only || humanGids.has(g.gid) || g.members.some((m) => humanNames.has(m)) ||
    (g.gid >= 1000 && g.gid < 60000 && !g.members.length));
  $('#lista-grupos').replaceChildren(...gs.map((g) =>
    el('tr', {}, el('td', { text: g.name }), el('td', { class: 'num', text: g.gid }), el('td', { text: g.members.join(', ') }))));
}
$('#so-pessoas').addEventListener('change', renderUsers);

const pwFields = () => [
  field('Senha (mín. 8)', 'pw1', { type: 'password', autocomplete: 'new-password' }),
  field('Repita a senha', 'pw2', { type: 'password', autocomplete: 'new-password' }),
];
function checkPw(f, required) {
  if (!required && !f.pw1.value) return null;
  if (f.pw1.value !== f.pw2.value) throw new Error('As senhas não conferem.');
  return f.pw1.value;
}

$('#btn-novo-usuario').addEventListener('click', async () => {
  await ensureUsersGroups();
  operation({
    title: 'Novo usuário',
    fields: [
      field('Nome de usuário', 'nome', { required: true, placeholder: 'ex.: joao.silva → use joao_silva', class: 'mono' }),
      field('Grupos extras (separados por vírgula)', 'groups', { placeholder: 'ex.: financeiro,rh', list: 'dl-grupos', class: 'mono' }),
      datalist('dl-grupos', state.groups.map((g) => g.name)),
      el('label', {}, 'Shell',
        el('select', { name: 'shell' },
          el('option', { value: '/bin/bash', text: '/bin/bash (pode usar terminal)' }),
          el('option', { value: '/bin/sh', text: '/bin/sh' }),
          el('option', { value: '/usr/sbin/nologin', text: '/usr/sbin/nologin (sem terminal, ex.: só compartilhamento)' }))),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'home', checked: true }), 'Criar pasta pessoal (/home/…)'),
      ...pwFields(),
    ],
    op: 'useradd',
    args: (f) => {
      checkPw(f, false);
      return { name: f.nome.value.trim(), groups: f.groups.value.split(',').map((x) => x.trim()).filter(Boolean), shell: f.shell.value, createHome: f.home.checked };
    },
    after: async (f) => {
      const pw = f.pw1.value;
      if (pw) await api('execute', { op: 'passwd', args: { user: f.nome.value.trim(), password: pw } });
      await loadUsers();
    },
  });
});

$('#btn-novo-grupo').addEventListener('click', () =>
  operation({ title: 'Novo grupo', fields: [field('Nome do grupo', 'nome', { required: true, class: 'mono' })], op: 'groupadd', args: (f) => ({ name: f.nome.value.trim() }), after: loadUsers })
);

$('#btn-add-grupo').addEventListener('click', async () => {
  await ensureUsersGroups();
  operation({
    title: 'Colocar usuário em grupo',
    fields: [
      field('Usuário', 'user', { required: true, list: 'dl-usuarios', class: 'mono' }),
      field('Grupo', 'group', { required: true, list: 'dl-grupos', class: 'mono' }),
      datalist('dl-usuarios', state.users.filter((u) => u.human).map((u) => u.name)),
      datalist('dl-grupos', state.groups.map((g) => g.name)),
      el('p', { class: 'muted small', text: 'O usuário precisa sair e entrar de novo para o grupo valer.' }),
    ],
    op: 'addtogroup',
    args: (f) => ({ user: f.user.value.trim(), group: f.group.value.trim() }),
    after: loadUsers,
  });
});

$('#btn-senha').addEventListener('click', async () => {
  await ensureUsersGroups();
  operation({
    title: 'Definir senha',
    fields: [field('Usuário', 'user', { required: true, list: 'dl-usuarios', class: 'mono' }), datalist('dl-usuarios', state.users.filter((u) => u.human).map((u) => u.name)), ...pwFields()],
    op: 'passwd',
    args: (f) => ({ user: f.user.value.trim(), password: checkPw(f, true) }),
  });
});

// ---------------- Registro ----------------

async function loadAudit() {
  try {
    const rows = await api('audit');
    $('#lista-registro').replaceChildren(...rows.map((r) =>
      el('tr', { title: r.command || '' },
        el('td', { text: new Date(r.ts).toLocaleString('pt-BR') }),
        el('td', { text: r.tecnico }),
        el('td', { text: r.host }),
        el('td', { text: r.summary || r.op }),
        el('td', { class: r.ok ? 'ok' : 'fail', text: r.ok ? 'ok' : 'falhou: ' + (r.error || '') }))));
    status(`${rows.length} registros`);
  } catch (e) {
    status(e.message, true);
  }
}

// ---------------- Janelas ----------------

function field(labelText, name, attrs = {}) {
  return el('label', {}, labelText, el('input', { name, ...attrs }));
}
function datalist(id, values) {
  return el('datalist', { id }, values.map((v) => el('option', { value: v })));
}

// Janela genérica. onOk pode lançar erro: a mensagem aparece e a janela continua aberta.
function dialog({ title, body, okText = 'Continuar', danger = false, onOk }) {
  const d = $('#dlg');
  $('#dlg-title').textContent = title;
  $('#dlg-body').replaceChildren(...[].concat(body).filter((n) => n != null));
  const err = $('#dlg-erro');
  err.hidden = true;
  const ok = $('#dlg-ok');
  ok.textContent = okText;
  ok.className = 'btn ' + (danger ? 'danger' : 'primary');
  return new Promise((resolve) => {
    const f = $('#dlg-form');
    const submit = async (ev) => {
      if (ev.submitter?.value !== 'ok') return;
      ev.preventDefault();
      if (!f.reportValidity()) return;
      ok.disabled = true;
      try {
        const v = onOk ? await onOk(f) : true;
        cleanup();
        d.close();
        resolve(v ?? true);
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        ok.disabled = false;
      }
    };
    const cancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      f.removeEventListener('submit', submit);
      d.removeEventListener('close', onClose);
    };
    // O evento 'close' chega atrasado; se a janela já reabriu para o próximo passo, ignora.
    const onClose = () => { if (!d.open) cancel(); };
    f.addEventListener('submit', submit);
    d.addEventListener('close', onClose);
    d.showModal();
    $('input:not([type=checkbox]):not([readonly])', d)?.focus();
  });
}

// Fluxo de toda alteração: formulário -> plano (o que vai acontecer) -> confirmação -> execução -> registro.
async function operation({ title, fields, op, args, after }) {
  if (state.info.elevation === 'none' && !(await elevate('Esta alteração precisa de root. Eleve a permissão para continuar.'))) {
    status('Cancelado: esta alteração precisa de root.');
    return;
  }
  let a, plan, values;
  const filled = await dialog({
    title,
    body: fields,
    onOk: async (f) => {
      a = args(f);
      plan = await api('plan', { op, args: a });
      values = f;
      return true;
    },
  });
  if (!filled) return;
  // Guarda os valores digitados antes de trocar o conteúdo da janela.
  const snapshot = Object.fromEntries(['nome', 'pw1', 'pw2'].map((k) => [k, values[k]?.value]));
  const high = plan.risk === 'alto';
  const confirmed = await dialog({
    title: 'Confirme a alteração',
    body: [
      el('span', { class: 'risk ' + plan.risk, text: { baixo: 'Risco baixo', medio: 'Risco médio', alto: 'Risco alto' }[plan.risk] }),
      el('p', { text: plan.summary }),
      el('details', {}, el('summary', { text: 'Ver o comando que será executado' }), el('div', { class: 'confirm-cmd', text: plan.command })),
      high ? el('label', { class: 'check danger' }, el('input', { type: 'checkbox', name: 'entendo', required: true }), 'Conferi e quero fazer isso') : null,
    ],
    okText: 'Fazer agora',
    danger: high,
    onOk: async () => {
      await api('execute', { op, args: a });
      return true;
    },
  });
  if (!confirmed) return;
  status('Feito: ' + plan.summary);
  try {
    if (after) await after({ nome: { value: snapshot.nome }, pw1: { value: snapshot.pw1 }, pw2: { value: snapshot.pw2 } });
    if (op !== 'useradd' && op !== 'groupadd' && op !== 'addtogroup' && op !== 'passwd') await go(state.cwd);
    status('Feito: ' + plan.summary);
  } catch (e) {
    status(e.message, true);
  }
}
