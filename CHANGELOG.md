# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões: [SemVer](https://semver.org/lang/pt-BR/).

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
