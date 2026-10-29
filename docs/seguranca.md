# Segurança

O Bifrost cria usuários e muda permissões com poder de root. Estas são as travas, em camadas.

## 1. Conexão

- **Identidade do servidor** (TOFU, igual ao `ssh` do terminal): na primeira conexão o técnico confirma a impressão digital SHA256; ela fica em `servidores-conhecidos.json`. Se mudar, a conexão é **bloqueada** com aviso.
- **Senhas** (login, sudo, su, nova senha de usuário) ficam só na memória do processo e são apagadas da tela após conectar. Nunca vão para arquivo, registro ou linha de comando: a senha do sudo vai pela entrada padrão (`sudo -S`), a do su pelo terminal, e a nova senha de usuário pelo `chpasswd` (entrada padrão).

## 2. Comandos

- Todo valor vindo da tela passa por validação e **aspas POSIX** (`q()` em `validate.mjs`).
  - Nomes de usuário/grupo: `^[a-z_][a-z0-9_-]{0,31}$`.
  - Permissão: 3 ou 4 dígitos octais.
  - Caminho: absoluto, normalizado, sem NUL nem quebra de linha.
- `--` antes dos caminhos para nenhum nome virar opção.
- `mv` checa antes se o destino existe (não sobrescreve).
- Sem operação de apagar (decisão consciente na 0.1.0).

## 3. Política de pastas (`politica.json`)

```json
{
  "allowedRoots": ["/srv", "/home", "/var/www", "/opt", "/mnt", "/media", "/dados", "/data"],
  "noRecursive": ["/home"],
  "protectedNames": [".ssh"],
  "blockedGroups": ["root", "sudo", "wheel", "admin", "adm", "docker", "lxd", "disk", "shadow"]
}
```

- Alteração só **dentro** de uma pasta permitida, nunca na própria raiz (ex.: pode `/srv/financeiro`, não pode `/srv`).
- O caminho é resolvido **no servidor** com `readlink -f` antes da checagem: um atalho `/srv/x → /etc` é bloqueado.
- Recursivo bloqueado em pasta de primeiro nível e nas listadas em `noRecursive`.
- Nenhum caminho com um nome de `protectedNames` (padrão: `.ssh`) pode ser alterado, para proteger as chaves SSH dos usuários.
- Ninguém é colocado (criar usuário, pôr em grupo, trocar grupo) num grupo de `blockedGroups`: são grupos que dão poder de administrador.
- **Apagar** e **Acesso total** recursivos são bloqueados se houver `.ssh` ou um disco montado dentro da pasta (`/proc/mounts`). Apagar um atalho apaga só o atalho, nunca o destino.
- **Acesso total** não dá sudo nem root: o usuário vira dono só da pasta escolhida dentro da área permitida.
- **setuid** (permissão `4xxx`) é bloqueado; setgid (`2xxx`) e sticky (`1xxx`) são liberados.
- Ler/navegar é livre (inclusive `/etc`), alterar não.
- Chave SSH só é lida se o técnico a escolheu pelo diálogo do Windows.
- A impressão digital confirmada só é gravada depois que a conexão funciona.
- Quem ajusta a política é o administrador, editando o arquivo no PC do técnico. Ver [pendências](pendencias.md) para centralizar.

## 4. Confirmação

Toda alteração passa por uma tela com resumo em português, nível de risco e o comando exato. Risco **alto** (recursivo, criar usuário, definir senha, apagar, acesso total) exige marcar "Conferi e quero fazer isso". Apagar pede também o nome digitado e, se recursivo, a palavra `entendo`; o núcleo confere os dois.

## 5. Registro

`registro-de-acoes.jsonl`, uma linha por ação: data, técnico (nome digitado ao conectar), servidor, operação, resumo, comando, se elevou, resultado, erro, duração. Inclui conectar e desconectar. **Sem senhas** (há teste que garante isso).

## 6. Aplicativo

- Electron com `contextIsolation`, `sandbox`, sem `nodeIntegration`; a tela só fala com o núcleo por uma lista fechada de operações.
- CSP `default-src 'self'`: a tela não carrega nada da internet.
- Navegação e janelas novas bloqueadas.
- Nomes de arquivo maliciosos (ex.: `<img onerror=...>`) aparecem como texto: há teste para isso.

## Limites conhecidos

- **Acesso total** (`chown -R`/`chmod -R`) também altera um *hardlink* que esteja dentro da pasta e aponte para um arquivo de fora (mesmo disco). Só acontece se alguém criou o link; o Bifrost não procura por eles.
- Dentro de `/home`, o Bifrost pode mudar dono e permissão das pastas de outros usuários (menos `.ssh`). É de propósito (pastas pessoais), mas exige atenção.
- Nome de arquivo com quebra de linha não aparece na listagem (caso raro).

- O registro fica no PC de cada técnico (não é central nem à prova de edição).
- O executável não é assinado (o Windows avisa na primeira vez).
- Usuário compartilhado no servidor: o registro do servidor (`/var/log/auth.log`) mostra só o usuário de manutenção; quem foi de fato está no registro do Bifrost.
