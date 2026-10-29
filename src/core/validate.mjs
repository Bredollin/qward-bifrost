// Validação e montagem segura de comandos. Tudo que vai para o shell remoto passa por aqui.
import { posix } from 'node:path';

// Aspas simples POSIX: funciona em sh, bash, dash, ash (BusyBox) e zsh.
export function q(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

export function cleanPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/')) throw new Error('Caminho precisa ser absoluto (começar com /).');
  if (/[\0\n\r]/.test(p)) throw new Error('Caminho com caractere inválido.');
  const n = posix.normalize(p);
  return n.length > 1 ? n.replace(/\/+$/, '') : n;
}

// Nome de usuário/grupo portátil (useradd do Debian/RHEL e adduser do BusyBox aceitam).
export function cleanName(n, what = 'nome') {
  if (typeof n !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(n)) {
    throw new Error(`${what} inválido: use letras minúsculas, números, - ou _ (até 32, começando por letra).`);
  }
  return n;
}

export function cleanMode(m) {
  if (typeof m !== 'string' || !/^[0-7]{3,4}$/.test(m)) throw new Error('Permissão inválida: use 3 ou 4 dígitos octais (ex.: 755).');
  // setuid (4xxx) faz um programa rodar como o dono (ex.: root): bloqueado. setgid e sticky continuam liberados.
  if (m.length === 4 && Number(m[0]) & 4) throw new Error('Bloqueado: setuid (4xxx) não é permitido pelo Bifrost.');
  return m;
}

export function cleanShell(s) {
  if (typeof s !== 'string' || !/^\/[A-Za-z0-9_./-]+$/.test(s)) throw new Error('Shell inválido.');
  return s;
}

// Política de segurança: onde a ferramenta pode alterar coisas.
export const DEFAULT_POLICY = {
  // Alterações só DENTRO destas pastas (nunca na própria raiz delas).
  allowedRoots: ['/srv', '/home', '/var/www', '/opt', '/mnt', '/media', '/dados', '/data'],
  // Recursivo (-R) bloqueado nestes caminhos, mesmo que estejam dentro de uma raiz permitida.
  noRecursive: ['/home'],
  // Nenhum caminho com estes nomes pode ser alterado (ex.: chaves SSH dos usuários).
  protectedNames: ['.ssh'],
  // Grupos que dão poder de administrador: o Bifrost não coloca ninguém neles.
  blockedGroups: ['root', 'sudo', 'wheel', 'admin', 'adm', 'docker', 'lxd', 'disk', 'shadow'],
};

export function checkGroup(g, policy) {
  if ((policy.blockedGroups || []).includes(g)) throw new Error(`Bloqueado: o grupo ${g} dá poder de administrador; peça ao responsável.`);
  return g;
}

export function isInside(p, root) {
  return p !== root && p.startsWith(root === '/' ? '/' : root + '/');
}

export function checkWritable(realPath, policy, { recursive = false } = {}) {
  const roots = policy.allowedRoots.map(cleanPath);
  if (!roots.some((r) => isInside(realPath, r))) {
    throw new Error(`Bloqueado: ${realPath} está fora das pastas permitidas (${roots.join(', ')}).`);
  }
  const prot = realPath.split('/').find((seg) => (policy.protectedNames || []).includes(seg));
  if (prot) throw new Error(`Bloqueado: ${realPath} é protegido (${prot}).`);
  if (recursive) {
    const depth = realPath.split('/').filter(Boolean).length;
    if (depth < 2) throw new Error('Bloqueado: recursivo em pasta de primeiro nível.');
    if (policy.noRecursive?.map(cleanPath).includes(realPath)) throw new Error(`Bloqueado: recursivo em ${realPath}.`);
  }
  return realPath;
}

// Converte "rwxr-x---" (9 letras) em octal "750" e vice-versa, para a interface.
export function symbolicToOctal(sym) {
  const s = sym.slice(-9);
  let out = '';
  for (let i = 0; i < 9; i += 3) {
    const t = s.slice(i, i + 3);
    out += (t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + (/[xst]/.test(t[2]) ? 1 : 0);
  }
  return out;
}
