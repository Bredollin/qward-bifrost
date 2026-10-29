# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões: [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- GitHub Actions gera o .exe no Windows a cada push e publica Release nas tags `v*`.
- Botão **Elevar permissão** no topo: entra como usuário comum e eleva com sudo ou su só quando precisar; "Sair do root" volta ao usuário comum. Elevar e sair vão para o registro.
- Alteração sem elevação abre a janela de elevar antes de continuar.

### Alterado
- Login: o padrão agora é "Depois (botão Elevar)"; elevar já no login (sudo ou su) continua como opção.
- Cores da Qward (verde-escuro, verde vivo e laranja do site qward.com.br), logo em losango e novo lema no topo. Textos de elevação curtos e técnicos ("root", "user", "sudo", "su").

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
