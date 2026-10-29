// Diagnóstico da elevação num servidor real: mostra o prompt que o su envia e se su e sudo chegam a root.
// Uso: node tools/diag-elevacao.mjs  (pede servidor, usuário e senhas no terminal; nada é gravado).
import { createInterface } from 'node:readline';
import { Session } from '../src/core/session.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (t) => !muted && rl.output.write(t);
const lines = rl[Symbol.asyncIterator]();
async function ask(q, hidden = false) {
  process.stdout.write(q);
  muted = hidden;
  const a = (await lines.next()).value ?? '';
  muted = false;
  if (hidden) process.stdout.write('\n');
  return a;
}

const host = await ask('Servidor: ');
const port = (await ask('Porta [22]: ')) || '22';
const username = await ask('Usuário: ');
const password = await ask('Senha do usuário: ', true);
const rootpw = await ask('Senha do root (Enter para pular): ', true);
rl.close();

const s = new Session();
await s.connect({ host, port, username, password, confirmHost: async () => true });
const info = await s.run('. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME"; id; command -v sudo || echo "sem sudo"; locale 2>/dev/null | head -1');
console.log(info.stdout.trim());

// Prompt cru do su, sem mandar senha (fecha em 3 s).
const raw = await new Promise((res) => {
  s.client.exec('su -c true root', { pty: { term: 'dumb', cols: 200, rows: 50 } }, (err, st) => {
    if (err) return res('erro: ' + err.message);
    let out = '';
    st.on('data', (d) => (out += d));
    setTimeout(() => st.close(), 3000);
    st.on('close', () => res(out));
  });
});
console.log('Prompt do su:', JSON.stringify(raw));

for (const [m, pw] of [['su', rootpw], ['sudo', password]]) {
  if (!pw) continue;
  s.setElevation(m, pw);
  const t = Date.now();
  try {
    await s.testElevation();
    console.log(`${m}: ok, virou root (${Date.now() - t} ms)`);
  } catch (e) {
    console.log(`${m}: falhou (${Date.now() - t} ms): ${e.message}`);
  }
}
s.close();
