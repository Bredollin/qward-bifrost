// Registro de ações (auditoria) no PC do técnico, um JSON por linha. Nunca grava senhas.
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class Audit {
  constructor(file) {
    this.file = file;
  }

  async write(entry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, line, 'utf8');
  }

  async tail(n = 200) {
    try {
      const lines = (await readFile(this.file, 'utf8')).split('\n').filter(Boolean);
      return lines.slice(-n).map((l) => JSON.parse(l)).reverse();
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
}
