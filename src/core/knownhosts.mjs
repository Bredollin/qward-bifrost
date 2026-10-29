// Impressões digitais dos servidores já confirmados (confiança no primeiro uso, como o ssh do terminal).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class KnownHosts {
  constructor(file) {
    this.file = file;
  }

  async #load() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  async get(host, port) {
    return (await this.#load())[`${host}:${port}`] || null;
  }

  async set(host, port, fp) {
    const all = await this.#load();
    all[`${host}:${port}`] = fp;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2));
  }
}
