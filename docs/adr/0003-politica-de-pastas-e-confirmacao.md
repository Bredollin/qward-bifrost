# 0003. Política de pastas, confirmação e registro

Data: 2026-10-29 · Situação: aceita

## Contexto
A ferramenta dá poder de root a quem não conhece o terminal. Um `chmod -R 777 /` ou um `chown -R` em `/etc` derruba o servidor do cliente.

## Decisão
- Alterar só dentro de pastas permitidas (lista em `politica.json`), resolvendo links no servidor antes.
- Toda alteração passa por plano → confirmação (com o comando exato) → execução → registro.
- Sem apagar arquivos nem usuários na 0.1.0.

## Consequências
- Algumas tarefas legítimas (ex.: mexer em `/etc/samba`) continuam com o Michael. É de propósito.
