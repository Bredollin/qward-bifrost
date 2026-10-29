# Compatibilidade

O Bifrost só usa comandos que já vêm no Linux, com alternativas onde as distros diferem.

| Função | Comando | Alternativa |
|---|---|---|
| Listar | `find -mindepth 1 -maxdepth 1 -exec stat -c ... {} +` | (GNU e BusyBox suportam) |
| Resolver links | `readlink -f` | |
| Distro | `/etc/os-release` | |
| Usuários/grupos | `getent passwd` / `getent group` | `cat /etc/passwd` / `/etc/group` |
| Criar usuário | `useradd -m -s ... -G ...` | `adduser -D` + `addgroup usuario grupo` (Alpine/BusyBox) |
| Criar grupo | `groupadd` | `addgroup` |
| Pôr em grupo | `usermod -aG` | `addgroup usuario grupo` |
| Senha | `chpasswd` (entrada padrão) | |
| Elevar (botão) | `su -c ... root` (pty); prompt reconhecido ou senha enviada após 1,5 s; corte em 20 s | `sudo -S` com a mesma senha se o su falhar |

O tipo de arquivo vem de `stat %f` (número), não do texto traduzido, então funciona com o servidor em português.

## Testado

| Distro | Situação |
|---|---|
| Ubuntu 24.04 (OpenSSH 9.6) | ✅ testes de núcleo (sudo e su) e de interface |
| Debian 11 (servidor de teste) | ❌ na 0.1.0+main: su travava sem resposta; correção neste branch, aguardando reteste no servidor real |
| Debian 12, Rocky 9, Alpine 3.20 | ⏳ Dockerfiles prontos em `test/distros/`; não rodaram na nuvem porque a rede bloqueou baixar os pacotes. Rodar num PC com Docker ou num servidor de teste. |

Shell de login do usuário de manutenção: precisa ser compatível com POSIX (`sh`, `bash`, `dash`, `ash`, `zsh`). `fish` e `csh` não foram testados.
