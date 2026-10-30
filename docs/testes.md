# Testes

## Núcleo (`npm test`)

Precisa de um servidor SSH de teste **descartável** (nunca de cliente). As credenciais vêm do ambiente:

```bash
export BIFROST_TEST_HOST=127.0.0.1 BIFROST_TEST_PORT=2222
export BIFROST_TEST_USER=qward BIFROST_TEST_PASS='...' BIFROST_TEST_ROOTPASS='...'
npm test
```

O servidor precisa ter o usuário com sudo e uma pasta `/srv`. Sem `BIFROST_TEST_HOST`, só roda o teste de validação.

Cobre: aspas e validação; sudo (pastas, nomes com espaço e aspas, mover sem sobrescrever, grupo, usuário, senha, dono, setgid, bloqueio de link para `/etc`, bloqueio fora da área, injeção no nome, criar arquivo vazio sem sobrescrever, acesso total, apagar com nome digitado e `entendo`, atalho apaga só o atalho, bloqueio com `.ssh` dentro, registro sem senha, login com a senha nova); sudo com senha errada; su (elevação, pasta como root, usuário, senha, senha errada).

### Servidor de teste com Docker

```bash
cd test/distros
docker build -t bifrost-debian -f debian.Dockerfile .
docker run -d -p 127.0.0.1:2222:22 -e TEST_PASS='...' -e TEST_ROOTPASS='...' bifrost-debian
```

Troque `debian` por `rocky` ou `alpine` para as outras distros.

### Servidor sem sudo

`BIFROST_TEST_ELEV=su` roda a suíte principal com `su` (precisa de `BIFROST_TEST_ROOTPASS`) e pula os testes de sudo. Vale também para o `test:ui`.

### Antes de entregar mudança na elevação

Rode `node tools/diag-elevacao.mjs` e os testes num **Debian real** (não só no Ubuntu da nuvem): o prompt do su muda por distro e idioma.

## Interface (`npm run test:ui`)

Abre o app de verdade (Electron + Playwright), conecta no servidor de teste e faz o caminho do técnico, salvando capturas:

```bash
npm run test:ui -- capturas    # Linux sem tela: xvfb-run -a npm run test:ui -- capturas
```

Cobre: confirmar servidor, criar pasta, entrar, criar com permissão, nome malicioso como texto, grade de permissões (2770), faixa de área (liberada, sistema em `/etc` com botões desligados, raiz com etiqueta "área liberada" e atalho "Ir para"), grupo, usuário com senha, dono e grupo, novo arquivo, apagar arquivo (nome errado recusado), acesso total, apagar pasta recursiva, registro sem senha.

## Resultado em 2026-10-30 (0.3.0, interface nova)

- `npm test`: 5/5 ✅ (Ubuntu 24.04). `test:ui`: ✅, 17 capturas conferidas.

## Resultado em 2026-10-29

- `npm test`: 5/5 ✅ (Ubuntu 24.04), incluindo entrar como usuário comum e elevar depois.
- `test:ui`: ✅, 11 capturas conferidas (botão Elevar com senha errada e certa, elevação pedida pela operação, cores da Qward).
- Pacote: `.exe` portátil gerado; o mesmo pacote em Linux abriu e conectou.
