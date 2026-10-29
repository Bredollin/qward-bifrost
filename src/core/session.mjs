// Sessão SSH: conexão, verificação da chave do servidor, execução de comandos e elevação (sudo ou su).
// Nada é instalado no servidor: só usamos SSH e comandos que já existem em qualquer Linux.
import { Client } from 'ssh2';
import { createHash } from 'node:crypto';
import { q } from './validate.mjs';

export function fingerprint(keyBuf) {
  return 'SHA256:' + createHash('sha256').update(keyBuf).digest('base64').replace(/=+$/, '');
}

const MARK = '__BIFROST_INICIO__';
const SU_PROMPT = /(password|senha|contrase(n|ñ)a|passwort|mot de passe)[^:\n]*:\s*$/i;
const BAD_PW = /(incorrect password|try again|authentication failure|falha de autentica|senha incorreta|no password was provided|a password is required|is not in the sudoers|not allowed to execute)/i;

export class Session {
  constructor() {
    this.client = null;
    this.elevation = { method: 'none', password: null };
    this.info = null;
  }

  // opts: host, port, username, password | privateKey(+passphrase), knownFingerprint, confirmHost(fp) => Promise<bool>
  connect(opts) {
    return new Promise((resolve, reject) => {
      const c = new Client();
      let seenFp = null;
      let hostRejected = null;
      c.on('ready', () => {
        this.client = c;
        resolve({ fingerprint: seenFp });
      });
      c.on('error', (e) => reject(hostRejected || friendlyConnError(e)));
      c.connect({
        host: opts.host,
        port: Number(opts.port) || 22,
        username: opts.username,
        password: opts.password || undefined,
        privateKey: opts.privateKey || undefined,
        passphrase: opts.passphrase || undefined,
        readyTimeout: 15000,
        keepaliveInterval: 20000,
        tryKeyboard: !!opts.password,
        hostVerifier: (key, verify) => {
          seenFp = fingerprint(key);
          if (opts.knownFingerprint) {
            if (opts.knownFingerprint === seenFp) return verify(true);
            hostRejected = new Error(
              `ATENÇÃO: a identidade do servidor mudou (esperado ${opts.knownFingerprint}, recebido ${seenFp}). ` +
                'Pode ser reinstalação do servidor ou um ataque. Confirme com o responsável antes de continuar.'
            );
            return verify(false);
          }
          Promise.resolve(opts.confirmHost ? opts.confirmHost(seenFp) : false).then((ok) => {
            if (!ok) hostRejected = new Error('Conexão cancelada: a identidade do servidor não foi confirmada.');
            verify(!!ok);
          });
        },
      });
      c.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => opts.password || '')));
    });
  }

  close() {
    this.client?.end();
    this.client = null;
  }

  get connected() {
    return !!this.client;
  }

  setElevation(method, password) {
    if (!['none', 'sudo', 'su'].includes(method)) throw new Error('Método de elevação inválido.');
    this.elevation = { method, password: password || null };
  }

  // Executa um comando cru. Retorna { code, stdout, stderr }.
  exec(cmd, { stdin, pty = false, onOut, onStream } = {}) {
    if (!this.client) return Promise.reject(new Error('Não conectado.'));
    return new Promise((resolve, reject) => {
      this.client.exec(cmd, pty ? { pty: { term: 'dumb', cols: 200, rows: 50 } } : {}, (err, stream) => {
        if (err) return reject(err);
        let stdout = '', stderr = '', code = null;
        onStream?.(stream);
        stream.on('data', (d) => {
          stdout += d.toString('utf8');
          onOut?.(stdout, stream);
        });
        stream.stderr.on('data', (d) => (stderr += d.toString('utf8')));
        stream.on('exit', (c) => (code = c));
        stream.on('close', () => resolve({ code, stdout, stderr }));
        if (stdin != null) {
          stream.write(stdin);
          stream.end();
        }
      });
    });
  }

  // Roda um script POSIX (sh). elevated=true usa o método escolhido (sudo ou su).
  async run(script, { elevated = false, stdin = null } = {}) {
    const m = elevated ? this.elevation.method : 'none';
    if (m === 'none') return this.exec(`sh -c ${q(script)}`, stdin != null ? { stdin } : {});

    if (m === 'sudo') {
      // -k: sempre pede a senha (comportamento previsível); -p '': sem texto de prompt; -S: senha pela entrada padrão.
      const r = await this.exec(`sudo -S -k -p '' -- sh -c ${q(script)}`, {
        stdin: (this.elevation.password || '') + '\n' + (stdin ?? ''),
      });
      if (r.code !== 0 && BAD_PW.test(r.stderr)) throw new Error('Elevação recusada pelo sudo (senha errada ou usuário sem permissão de sudo).');
      return r;
    }

    // su precisa de terminal (pty): esperamos o prompt de senha, respondemos e separamos a saída pelo marcador.
    let sentPw = false, sentIn = false, gotMark = false, timedOut = false;
    const wrapped = `stty -echo 2>/dev/null; printf '%s\\n' ${MARK}; ${script}`;
    // O prompt do su varia por distro e idioma: se não reconhecermos o texto em 1,5 s, a senha vai assim mesmo
    // (o su lê do terminal). Se nada responder em 20 s, a sessão é fechada e vira erro, em vez de ficar presa.
    const timers = [];
    const sendPw = (stream) => {
      if (sentPw) return;
      sentPw = true;
      stream.write((this.elevation.password || '') + '\n');
    };
    const r = await this.exec(`su -c ${q(wrapped)} root`, {
      pty: true,
      onStream: (stream) => {
        timers.push(setTimeout(() => sendPw(stream), 1500));
        timers.push(setTimeout(() => !gotMark && ((timedOut = true), stream.close()), 20000));
      },
      onOut: (out, stream) => {
        if (!sentPw && SU_PROMPT.test(out)) sendPw(stream);
        if (sentPw && !sentIn && out.includes(MARK)) {
          sentIn = gotMark = true;
          if (stdin != null) stream.write(stdin + '\x04');
        }
      },
    });
    timers.forEach(clearTimeout);
    const all = r.stdout.replace(/\r\n/g, '\n');
    const i = all.indexOf(MARK + '\n');
    if (i < 0) {
      if (timedOut) throw new Error('O su não respondeu em 20 s (prompt de senha não reconhecido ou servidor lento).');
      if (BAD_PW.test(all) || r.code !== 0) throw new Error('Elevação recusada pelo su (senha de root errada?).');
      throw new Error('Não foi possível elevar com su.');
    }
    const out = all.slice(i + MARK.length + 1);
    // Com pty, stdout e stderr chegam juntos.
    return { code: r.code, stdout: out, stderr: r.code === 0 ? '' : out };
  }

  // Confere se a elevação funciona (id -u precisa dar 0).
  async testElevation() {
    const r = await this.run('id -u', { elevated: true });
    if (r.code !== 0 || r.stdout.trim().split('\n').pop() !== '0') throw new Error('A elevação não resultou em root.');
    return true;
  }
}

function friendlyConnError(e) {
  const m = String(e.message || e);
  if (/All configured authentication methods failed/i.test(m)) return new Error('Usuário ou senha/chave incorretos.');
  if (/ECONNREFUSED/.test(m)) return new Error('Servidor recusou a conexão (porta SSH fechada?).');
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return new Error('Endereço do servidor não encontrado.');
  if (/Timed out|ETIMEDOUT/i.test(m)) return new Error('Tempo esgotado ao conectar (rede, VPN ou firewall?).');
  return new Error(m);
}
