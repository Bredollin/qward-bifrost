// Operações de arquivo, permissão, usuário e grupo. Cada operação tem duas fases:
// plan() mostra exatamente o que será feito (para a tela de confirmação) e execute() faz.
// Os comandos usados existem em Debian/Ubuntu, RHEL/Rocky/Alma, SUSE e Alpine (BusyBox).
import { randomUUID } from 'node:crypto';
import { q, cleanPath, cleanName, cleanMode, cleanShell, checkWritable, checkGroup, DEFAULT_POLICY } from './validate.mjs';

const SEP = '\t';
const STAT_FMT = ['%f', '%A', '%U', '%G', '%s', '%Y', '%n'].join(SEP);

export class Ops {
  constructor(session, { policy = DEFAULT_POLICY, audit = null, tecnico = 'desconhecido', host = '' } = {}) {
    this.s = session;
    this.policy = policy;
    this.audit = audit;
    this.tecnico = tecnico;
    this.host = host;
  }

  get canElevate() {
    return this.s.elevation.method !== 'none';
  }

  async sysinfo() {
    const r = await this.s.run(
      `. /etc/os-release 2>/dev/null; printf '%s\\n' "\${PRETTY_NAME:-Linux}"; uname -r; id -un; id -u; ` +
        `(PATH=/usr/local/sbin:/usr/sbin:/sbin:$PATH; command -v useradd >/dev/null) && echo useradd || echo adduser`
    );
    const [distro, kernel, user, uid, userTool] = r.stdout.trim().split('\n');
    return { distro, kernel, user, uid: Number(uid), userTool };
  }

  // ---------- leitura ----------

  async list(dir, { elevated = false } = {}) {
    const d = cleanPath(dir);
    const script = `cd -- ${q(d)} 2>/dev/null && [ -r . ] || exit 2; find . -mindepth 1 -maxdepth 1 -exec stat -c ${q(STAT_FMT)} {} + 2>/dev/null; exit 0`;
    let r = await this.s.run(script, { elevated });
    if (r.code === 2 && !elevated && this.canElevate) {
      r = await this.s.run(script, { elevated: true });
      elevated = true;
    }
    if (r.code !== 0) throw new Error(`Não foi possível abrir ${d}: ${firstLine(r.stderr) || 'sem permissão ou pasta inexistente'}`);
    const entries = r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const p = line.split(SEP);
        if (p.length < 7) return null;
        const [type, perms, owner, group, size, mtime] = p;
        const name = p.slice(6).join(SEP).replace(/^\.\//, '');
        return { name, type: typeName(type), perms, owner, group, size: Number(size), mtime: Number(mtime) * 1000 };
      })
      .filter(Boolean)
      .sort((a, b) => (a.type === 'pasta') === (b.type === 'pasta') ? a.name.localeCompare(b.name) : a.type === 'pasta' ? -1 : 1);
    return { path: d, elevated, entries };
  }

  async users() {
    const r = await this.s.run('getent passwd 2>/dev/null || cat /etc/passwd');
    return r.stdout.split('\n').filter(Boolean).map((l) => {
      const [name, , uid, gid, gecos, home, shell] = l.split(':');
      return { name, uid: Number(uid), gid: Number(gid), gecos, home, shell, human: Number(uid) >= 1000 && Number(uid) < 60000 && (/^\/home\//.test(home) || !/(nologin|false)$/.test(shell)) };
    });
  }

  async groups() {
    const r = await this.s.run('getent group 2>/dev/null || cat /etc/group');
    return r.stdout.split('\n').filter(Boolean).map((l) => {
      const [name, , gid, members] = l.split(':');
      return { name, gid: Number(gid), members: members ? members.split(',').filter(Boolean) : [] };
    });
  }

  // ---------- escrita (plan + execute) ----------

  // Resolve links simbólicos no servidor antes de checar a política (evita /srv/atalho -> /etc).
  async realpath(p, { mustExist = true } = {}) {
    const c = cleanPath(p);
    const target = mustExist ? c : c.slice(0, c.lastIndexOf('/')) || '/';
    const r = await this.s.run(`readlink -f -- ${q(target)}`, { elevated: this.canElevate });
    const real = r.stdout.trim().split('\n').pop();
    if (r.code !== 0 || !real) throw new Error(`Caminho não encontrado: ${target}`);
    return mustExist ? real : (real === '/' ? '' : real) + c.slice(c.lastIndexOf('/'));
  }

  // Tipo do item sem seguir atalho (pasta, arquivo, atalho, outro).
  async kind(path) {
    const r = await this.s.run(`stat -c %f -- ${q(path)}`, { elevated: this.canElevate });
    if (r.code !== 0) throw new Error(`Não encontrado: ${path}`);
    return typeName(r.stdout.trim());
  }

  // Recursivo não passa por chave SSH nem por disco montado dentro da pasta (ex.: um NAS em /mnt/nas/backup).
  async guardTree(path) {
    const r = await this.s.run(
      `find ${q(path)} -name .ssh -print 2>/dev/null | head -n 1; ` +
        // ENVIRON não interpreta barra invertida; o /proc/mounts escreve espaço como \040 (tab, quebra e barra também em octal).
        `P=${q(path)} awk '{ m = $2; gsub(/\\\\040/, " ", m); gsub(/\\\\011/, "\\t", m); gsub(/\\\\012/, "\\n", m); gsub(/\\\\134/, "\\\\", m); ` +
          `p = ENVIRON["P"]; if (m == p || index(m, p "/") == 1) { print "montagem:" m; exit } }' /proc/mounts 2>/dev/null`,
      { elevated: this.canElevate }
    );
    const hit = r.stdout.trim().split('\n').filter(Boolean)[0];
    if (hit?.startsWith('montagem:')) throw new Error(`Bloqueado: há um disco montado em ${hit.slice(9)}.`);
    if (hit) throw new Error(`Bloqueado: ${path} contém chaves SSH (${hit}).`);
  }

  async count(path) {
    const r = await this.s.run(`find ${q(path)} 2>/dev/null | wc -l`, { elevated: this.canElevate });
    return Number(r.stdout.trim()) || 0;
  }

  async plan(op, a) {
    switch (op) {
      case 'mkdir': {
        const path = checkWritable(await this.realpath(a.path, { mustExist: false }), this.policy);
        const mode = a.mode ? cleanMode(a.mode) : null;
        return mk(op, `Criar a pasta ${path}${mode ? ` com permissão ${mode}` : ''}`,
          `mkdir -- ${q(path)}${mode ? ` && chmod ${mode} -- ${q(path)}` : ''}`, 'baixo');
      }
      case 'touch': {
        const path = checkWritable(await this.realpath(a.path, { mustExist: false }), this.policy);
        const mode = a.mode ? cleanMode(a.mode) : null;
        return mk(op, `Criar o arquivo vazio ${path}${mode ? ` com permissão ${mode}` : ''} (não sobrescreve nada)`,
          `${notExists(path)}touch -- ${q(path)}${mode ? ` && chmod ${mode} -- ${q(path)}` : ''}`, 'baixo');
      }
      case 'rm': {
        // Só a pasta-mãe é resolvida: se o alvo for um atalho, apaga o atalho, nunca o destino dele.
        const path = await this.realpath(a.path, { mustExist: false });
        const name = path.slice(path.lastIndexOf('/') + 1);
        // A confirmação é conferida aqui também, não só na tela.
        if (a.confirmName !== name) throw new Error(`Para apagar, digite exatamente o nome: ${name}`);
        const kind = await this.kind(path);
        const rec = !!a.recursive && kind === 'pasta';
        checkWritable(path, this.policy, { recursive: rec });
        if (rec && a.entendo !== 'entendo') throw new Error('Para apagar a pasta com tudo dentro, digite "entendo".');
        if (rec) {
          await this.guardTree(path);
          const n = await this.count(path);
          return mk(op, `Apagar a pasta ${path} e TUDO dentro dela (${n} ${n === 1 ? 'item' : 'itens'}). Não tem volta.`, `rm -rf -- ${q(path)}`, 'alto');
        }
        const cmd = kind === 'pasta' ? `rmdir -- ${q(path)}` : `rm -f -- ${q(path)}`;
        return mk(op, `Apagar ${kind === 'pasta' ? 'a pasta vazia' : kind === 'atalho' ? 'o atalho' : 'o arquivo'} ${path}. Não tem volta.`, cmd, 'alto');
      }
      case 'fullaccess': {
        // Acesso total na área permitida: o usuário vira dono e ganha rwx (X: entra nas pastas). Não dá sudo nem root.
        const user = cleanName(a.user, 'Usuário');
        if (user === 'root') throw new Error('Bloqueado: use "Dono e grupo" para passar algo ao root.');
        const path = checkWritable(await this.realpath(a.path), this.policy, { recursive: true });
        await this.guardTree(path);
        return mk(op, `Dar acesso total a ${user} em ${path} e TUDO dentro dela (vira dono, com ler, gravar e entrar)`,
          `chown -R ${q(user)} -- ${q(path)} && chmod -R u+rwX -- ${q(path)}`, 'alto');
      }
      case 'upload':
        // Só para mostrar o plano na tela; quem envia de verdade é uploadFiles (o temporário nunca vem da tela).
        return this.planUpload(a, null);
      case 'move': {
        const from = checkWritable(await this.realpath(a.from, { mustExist: false }), this.policy);
        const to = checkWritable(await this.realpath(a.to, { mustExist: false }), this.policy);
        return mk(op, `Mover/renomear ${from} para ${to} (não sobrescreve nada)`,
          `${notExists(to)}mv -- ${q(from)} ${q(to)}`, 'medio');
      }
      case 'chmod': {
        const rec = !!a.recursive;
        const path = checkWritable(await this.realpath(a.path), this.policy, { recursive: rec });
        const mode = cleanMode(a.mode);
        // "Outros" com escrita (ex.: 777, 2777): qualquer usuário do servidor altera ou apaga.
        const world = (Number(mode.slice(-1)) & 2) === 2;
        return mk(op, `Mudar a permissão de ${path} para ${mode}${rec ? ' (em TUDO dentro dela)' : ''}${world ? ' (ATENÇÃO: qualquer usuário do servidor poderá escrever)' : ''}`,
          `chmod ${rec ? '-R ' : ''}${mode} -- ${q(path)}`, rec || world ? 'alto' : 'medio');
      }
      case 'chown': {
        const rec = !!a.recursive;
        const path = checkWritable(await this.realpath(a.path), this.policy, { recursive: rec });
        const owner = a.owner ? cleanName(a.owner, 'Dono') : '';
        const group = a.group ? checkGroup(cleanName(a.group, 'Grupo'), this.policy) : '';
        if (!owner && !group) throw new Error('Informe o dono, o grupo ou os dois.');
        const R = rec ? '-R ' : '';
        const cmd = owner ? `chown ${R}${q(owner + (group ? ':' + group : ''))} -- ${q(path)}` : `chgrp ${R}${q(group)} -- ${q(path)}`;
        const what = [owner && `dono ${owner}`, group && `grupo ${group}`].filter(Boolean).join(' e ');
        const root = owner === 'root' || owner === '0';
        return mk(op, `Mudar ${what} de ${path}${rec ? ' (em TUDO dentro dela)' : ''}${root ? ' (dono root: só o root escreve)' : ''}`, cmd, rec || root ? 'alto' : 'medio');
      }
      case 'groupadd': {
        const name = cleanName(a.name, 'Grupo');
        return mk(op, `Criar o grupo ${name}`,
          `if command -v groupadd >/dev/null 2>&1; then groupadd ${q(name)}; else addgroup ${q(name)}; fi`, 'medio');
      }
      case 'useradd': {
        const name = cleanName(a.name, 'Usuário');
        const shell = cleanShell(a.shell || '/bin/bash');
        const groups = (a.groups || []).map((g) => checkGroup(cleanName(g, 'Grupo'), this.policy));
        const home = a.createHome !== false;
        const ua = `useradd ${home ? '-m ' : '-M '}-s ${q(shell)}${groups.length ? ` -G ${q(groups.join(','))}` : ''} ${q(name)}`;
        const ad = `adduser -D ${home ? '' : '-H '}-s ${q(shell)} ${q(name)}` + groups.map((g) => ` && addgroup ${q(name)} ${q(g)}`).join('');
        return mk(op, `Criar o usuário ${name}${groups.length ? ` nos grupos ${groups.join(', ')}` : ''}${home ? ' com pasta pessoal' : ''}`,
          `if command -v useradd >/dev/null 2>&1; then ${ua}; else ${ad}; fi`, 'alto');
      }
      case 'addtogroup': {
        const user = cleanName(a.user, 'Usuário');
        const group = checkGroup(cleanName(a.group, 'Grupo'), this.policy);
        return mk(op, `Colocar o usuário ${user} no grupo ${group}`,
          `if command -v usermod >/dev/null 2>&1; then usermod -aG ${q(group)} ${q(user)}; else addgroup ${q(user)} ${q(group)}; fi`, 'medio');
      }
      case 'passwd': {
        const user = cleanName(a.user, 'Usuário');
        if (typeof a.password !== 'string' || a.password.length < 8 || /[\n\r:]/.test(a.password)) {
          throw new Error('Senha precisa ter pelo menos 8 caracteres (sem ":" nem quebra de linha).');
        }
        // A senha vai pela entrada padrão do chpasswd: nunca aparece na linha de comando nem no log.
        return { ...mk(op, `Definir a senha do usuário ${user}`, 'chpasswd', 'alto'), stdin: `${user}:${a.password}\n` };
      }
      default:
        throw new Error(`Operação desconhecida: ${op}`);
    }
  }

  // Arquivo do PC do técnico para o servidor. Chega numa pasta temporária do usuário conectado
  // (ver uploadFiles) e este comando, como root, põe no destino e acerta dono e permissão.
  async planUpload(a, tmp) {
    const name = cleanFileName(a.name);
    const dir = await this.realpath(a.dir);
    const path = checkWritable((dir === '/' ? '' : dir) + '/' + name, this.policy);
    const src = tmp ? cleanStage(tmp) : '<pasta temporária do usuário>/' + name;
    const asDir = a.owner !== 'conectado';
    const exists = await this.s.run(`[ -e ${q(path)} ] || [ -L ${q(path)} ]`, { elevated: this.canElevate });
    const replace = exists.code === 0;
    if (replace && !a.replace) throw Object.assign(new Error(`Já existe: ${path}`), { code: 'EXISTS' });
    // Só substitui arquivo comum: atalho (o mv entraria na pasta apontada) e pasta são recusados.
    if (replace && (await this.kind(path)) !== 'arquivo') throw new Error(`Já existe uma PASTA ou ATALHO com esse nome: ${path}`);
    // Permissão do arquivo = a da pasta sem o "executar" (ex.: pasta 2770 -> arquivo 660). Dono: o da pasta ou o usuário conectado.
    const perm = `chmod "$(printf %o $((0$(stat -c %a -- ${q(dir)}) & 0666)))" -- ${q(path)}`;
    const own = asDir ? `chown "$(stat -c %u:%g -- ${q(dir)})" -- ${q(path)} && ` : '';
    // SELinux (RHEL/Rocky): o mv mantém o rótulo da pasta pessoal; restorecon devolve o rótulo do destino.
    const selinux = ` && { command -v restorecon >/dev/null 2>&1 && restorecon -- ${q(path)} 2>/dev/null; true; }`;
    const cmd = `${replace ? '' : notExists(path)}mv -f -- ${q(src)} ${q(path)} && ${own}${perm}${selinux}`;
    return mk('upload', `${replace ? 'SUBSTITUIR' : 'Enviar'} ${path} (${fmtBytes(a.size)})` +
      `, ${asDir ? 'com dono e permissão iguais aos da pasta' : 'dono = usuário conectado, permissão igual à da pasta'}${replace ? '. O arquivo antigo some, não tem volta.' : ''}`,
      cmd, replace ? 'alto' : 'baixo');
  }

  // Envia arquivos do PC para a pasta `dir`. files: [{ local, name, size }].
  // conflict: 'replace' | 'skip' (a tela pergunta antes quando o técnico escolhe "Perguntar").
  // Etapas por arquivo: plano (valida) -> SFTP como usuário conectado para ~/.bifrost-envio -> root move e acerta dono.
  async uploadFiles({ dir, files, conflict = 'skip', owner = 'pasta' }, { onProgress, signal } = {}) {
    if (!Array.isArray(files) || !files.length) throw new Error('Nenhum arquivo escolhido.');
    const st = await this.s.run('d="$HOME/.bifrost-envio"; mkdir -p "$d" && chmod 700 "$d" && cd "$d" && pwd -P');
    const stage = st.stdout.trim().split('\n').pop();
    if (st.code !== 0 || !stage?.startsWith('/')) throw new Error('Não foi possível criar a pasta temporária do envio no servidor (pasta pessoal do usuário).');
    try {
      return await this.#uploadEach(stage, { dir, files, conflict, owner }, { onProgress, signal });
    } finally {
      await this.s.run(`rmdir -- ${q(stage)} 2>/dev/null; true`).catch(() => {});
    }
  }

  async #uploadEach(stage, { dir, files, conflict, owner }, { onProgress, signal }) {
    const total = files.reduce((t, f) => t + (Number(f.size) || 0), 0);
    let sentAll = 0;
    const result = [];
    for (const [i, f] of files.entries()) {
      if (signal?.aborted) break;
      const args = { dir, name: f.name, size: f.size, owner, replace: conflict === 'replace' };
      let p;
      try {
        p = await this.planUpload(args, null);
      } catch (e) {
        if (e.code === 'EXISTS') {
          result.push({ name: f.name, status: 'pulado', motivo: 'já existe' });
          sentAll += Number(f.size) || 0;
          continue;
        }
        throw e;
      }
      const tmp = `${stage}/${randomUUID()}`;
      const started = Date.now();
      let ok = false, error = null, sent = 0, via = null;
      try {
        via = await this.s.upload(f.local, tmp, {
          signal,
          onBytes: (n) => {
            sent += n;
            onProgress?.({ index: i, count: files.length, name: f.name, sent, size: f.size, sentAll: sentAll + sent, total });
          },
        });
        p = await this.planUpload(args, tmp);
        const r = await this.s.run(p.command, { elevated: this.canElevate });
        if (r.code !== 0) throw new Error(firstLine(r.stderr) || `Falhou (código ${r.code}).`);
        ok = true;
        result.push({ name: f.name, status: 'enviado' });
      } catch (e) {
        error = signal?.aborted ? 'Cancelado pelo técnico.' : e.message;
        await this.s.run(`rm -f -- ${q(tmp)}`).catch(() => {});
        if (signal?.aborted) {
          result.push({ name: f.name, status: 'cancelado' });
        } else throw new Error(`${f.name}: ${e.message}`);
      } finally {
        sentAll += Number(f.size) || 0;
        await this.audit?.write({
          tecnico: this.tecnico, host: this.host, op: 'upload', summary: p.summary, command: p.command,
          elevated: this.canElevate, ok, error, ms: Date.now() - started, bytes: sent, via,
        });
      }
    }
    for (const f of files.slice(result.length)) result.push({ name: f.name, status: 'cancelado' });
    return result;
  }

  async execute(op, a) {
    if (op === 'upload') throw new Error('Use o envio de arquivos (uploadFiles).');
    const p = await this.plan(op, a);
    const started = Date.now();
    let ok = false, error = null;
    try {
      const r = await this.s.run(p.command, { elevated: this.canElevate, stdin: p.stdin ?? null });
      if (r.code !== 0) throw new Error(firstLine(r.stderr) || `Falhou (código ${r.code}).`);
      ok = true;
      return { ok: true, summary: p.summary };
    } catch (e) {
      error = e.message;
      throw e;
    } finally {
      await this.audit?.write({
        tecnico: this.tecnico, host: this.host, op, summary: p.summary,
        command: p.command, elevated: this.canElevate, ok, error, ms: Date.now() - started,
      });
    }
  }
}

// Nome que vem do Windows: só o nome, sem pasta, sem "." ou "..".
function cleanFileName(n) {
  if (typeof n !== 'string' || !n || n === '.' || n === '..' || /[/\0\n\r]/.test(n) || n.length > 255) {
    throw new Error(`Nome de arquivo inválido: ${n}`);
  }
  return n;
}

// Arquivo temporário do envio: sempre dentro de uma pasta .bifrost-envio.
function cleanStage(p) {
  const c = cleanPath(p);
  if (!/\/\.bifrost-envio\/[0-9a-f-]{36}$/.test(c)) throw new Error('Arquivo temporário inválido.');
  return c;
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0).replace('.', ',') + ' ' + u[i];
}

function mk(op, summary, command, risk) {
  return { op, summary, command, risk };
}

// Prefixo de comando: aborta se o caminho já existe (inclusive atalho quebrado).
function notExists(p) {
  return `{ [ -e ${q(p)} ] || [ -L ${q(p)} ]; } && { echo 'Destino já existe' >&2; exit 17; }; `;
}

function firstLine(s) {
  return String(s || '').trim().split('\n').filter((l) => l.trim()).pop() || '';
}

function typeName(hex) {
  const t = parseInt(hex, 16) & 0o170000;
  if (t === 0o040000) return 'pasta';
  if (t === 0o120000) return 'atalho';
  if (t === 0o100000) return 'arquivo';
  return 'outro';
}
