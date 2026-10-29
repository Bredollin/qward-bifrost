// Operações de arquivo, permissão, usuário e grupo. Cada operação tem duas fases:
// plan() mostra exatamente o que será feito (para a tela de confirmação) e execute() faz.
// Os comandos usados existem em Debian/Ubuntu, RHEL/Rocky/Alma, SUSE e Alpine (BusyBox).
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

  async execute(op, a) {
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
