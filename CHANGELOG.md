# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões: [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- GitHub Actions gera o .exe no Windows a cada push e publica Release nas tags `v*`.
- Botão **Elevar para root** no topo: entra como usuário comum e troca para root com `su` (senha do root) só quando precisar; "Sair do root" volta ao usuário comum. Elevar e sair vão para o registro.
- Alteração sem elevação abre a janela de elevar antes de continuar.

### Alterado
- Login: sempre como usuário comum; a opção de elevar na tela de login saiu (elevação só dentro do app).
- Interface: elevação só por `su`; `sudo` removido da tela (o núcleo ainda suporta).
- Cores da Qward (verde-escuro, verde vivo e laranja do site qward.com.br), logo em losango e novo lema no topo. Selo de estado mostra o usuário logado ou "root".
- Elevar: tenta `su` (senha do root) e, se falhar, `sudo` com a mesma senha (servidor com root bloqueado).
- Dono `root` em "Dono e grupo" passa a ser risco alto (pede confirmação).
- Testes: `BIFROST_TEST_ELEV=su` roda a suíte num servidor sem sudo.

### Corrigido
- `su` ficava esperando a senha para sempre quando o prompt não era reconhecido (visto no Debian 11): toda alteração travava na janela de elevar. Agora a senha vai após 1,5 s mesmo sem reconhecer o prompt, e sem resposta em 20 s vira erro.
- A senha sumia do campo antes da resposta do su, parecendo que o app pedia de novo. Agora fica até dar certo, e o botão mostra "Elevando…".

### Adicionado (diagnóstico)
- `node tools/diag-elevacao.mjs`: mostra distro, `id`, se há sudo, o prompt cru do su e se su/sudo chegam a root. Pede tudo no terminal, nada gravado.

## [0.1.0] - 2026-10-29

### Adicionado
- Conexão SSH por senha ou chave, com conferência da identidade do servidor (impressão digital SHA256).
- Elevação de permissões por `sudo` (senha do próprio usuário) ou `su` (senha do root), testada ao conectar.
- Navegação de pastas com permissões, dono, grupo, tamanho e data; "Ver como root".
- Criar pasta, renomear/mover, permissões (grade + octal + setgid + recursivo), dono e grupo.
- Usuários e grupos: listar, criar usuário, criar grupo, colocar em grupo, definir senha.
- Travas: confirmação com o comando exato, pastas permitidas, links resolvidos, bloqueio de recursivo em pasta de primeiro nível.
- Revisor: grupos de administrador bloqueados, setuid bloqueado, `.ssh` protegido, link quebrado no destino conta como existente, impressão digital gravada só após conectar, chave só pelo diálogo.
- Registro de ações local (`registro-de-acoes.jsonl`), sem senhas.
- Executável portátil para Windows (`npm run dist`).
- Testes de integração (sudo e su) e teste de ponta a ponta da interface.
