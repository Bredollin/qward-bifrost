# Qward Bifrost

App desktop (Electron + ssh2) para os técnicos da Qward gerenciarem pastas, permissões, donos, grupos e usuários de servidores Linux por SSH. Criação do Brain (repo `Bredollin/brain`), mas vive **neste** repositório. Responda em português (Brasil).

## Regras

- **Nada de dado de cliente** no repositório: IPs, senhas, nomes de clientes, fichas. Exemplos usam `192.0.2.x`. Credenciais de teste só por variável de ambiente.
- **Nada instalado no servidor**: só SSH e comandos padrão; ao adicionar comando, cubra GNU e BusyBox e atualize `docs/compatibilidade.md`.
- **Toda operação nova** passa por `Ops.plan()` (validação + `checkWritable` + `q()`) e `Ops.execute()` (registro). Nunca concatene valor da tela sem `q()` e validação.
- **Tela**: dado do servidor só por `textContent`/`el()`, nunca `innerHTML`.
- Senha nunca em arquivo, registro ou linha de comando.
- Antes de entregar: `npm test` + `npm run test:ui` com servidor de teste, olhar as capturas e passar pelo Revisor do Brain. Atualize `CHANGELOG.md` e a doc que mudou.
- Commits e push só no branch combinado; merge é do Michael.

## Mapa

`src/main.mjs` (Electron, IPC) · `src/preload.cjs` (ponte) · `src/ui/` (tela) · `src/core/` (sessão, operações, validação, registro, servidores conhecidos) · `test/` · `docs/` (manual, arquitetura, segurança, compatibilidade, testes, ADRs, pendências).
