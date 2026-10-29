# Qward Bifrost

> A ponte até os servidores Linux, sem terminal.

Programa para Windows que deixa os técnicos gerenciarem pastas, permissões, donos, grupos e usuários de servidores Linux **por SSH**, com interface gráfica. **Nada é instalado no servidor**: o Bifrost usa só o SSH e comandos que já existem em qualquer Linux.

Criação do Brain (time de agentes do Michael Bredollin). Versão **0.1.0 (protótipo)**.

## O que ele faz

| Área | Funções |
|---|---|
| Arquivos | navegar, criar pasta (com permissão), renomear/mover (sem sobrescrever) |
| Permissões | grade Ler/Escrever/Entrar para dono, grupo e outros; número octal; setgid ("pastas novas herdam o grupo"); recursivo |
| Dono e grupo | trocar dono, grupo ou os dois, com recursivo opcional |
| Usuários e grupos | listar, criar usuário (grupos, shell, pasta pessoal, senha), criar grupo, colocar usuário em grupo, definir senha |
| Registro | toda ação fica gravada no PC: quem, quando, servidor, o quê, resultado |

## Travas de segurança (resumo)

- Toda alteração mostra **o que vai acontecer** e pede confirmação; risco alto pede um "Conferi" extra.
- Alterações só **dentro das pastas permitidas** (padrão: `/srv`, `/home`, `/var/www`, `/opt`, `/mnt`, `/media`, `/dados`, `/data`), nunca na raiz delas. `/etc`, `/usr`, `/boot` e afins ficam fora. Atalhos (links) são resolvidos antes de checar.
- Identidade do servidor conferida na primeira conexão e cobrada nas próximas.
- Senhas só na memória; nunca em arquivo nem no registro.

Detalhes em [docs/seguranca.md](docs/seguranca.md).

## Para usar (técnico)

Baixe o `QwardBifrost-<versão>-portable.exe` em **Releases** (ou em **Actions → exe-windows → última execução → Artifacts**), dê dois cliques e siga o [manual do técnico](docs/manual-do-tecnico.md). Não precisa instalar.

## Para desenvolver

Requisitos: Node 20+ (testado com 22 e 24).

```bash
npm install
npm start          # abre o app
npm test           # testes do núcleo (precisa de servidor SSH de teste, veja docs/testes.md)
npm run test:ui    # teste de ponta a ponta da interface (Playwright + Electron)
npm run dist       # gera dist/QwardBifrost-<versão>-portable.exe
```

## Documentação

- [Manual do técnico](docs/manual-do-tecnico.md): passo a passo, sem jargão.
- [Arquitetura](docs/arquitetura.md): como as peças se encaixam.
- [Segurança](docs/seguranca.md): travas, política de pastas e registro.
- [Compatibilidade](docs/compatibilidade.md): distros e comandos usados.
- [Testes](docs/testes.md): como testar e o que já foi testado.
- [Decisões (ADR)](docs/adr/) e [pendências](docs/pendencias.md).
- [CHANGELOG](CHANGELOG.md).

## Regras do repositório

Nenhum dado de cliente aqui: nada de IP, senha, nome de cliente ou ficha. Exemplos usam endereços de documentação (`192.0.2.x`). Credenciais de teste vêm de variáveis de ambiente.
