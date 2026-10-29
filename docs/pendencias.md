# Pendências e pontos de decisão

Atualizado em 2026-10-29. Em **negrito** o padrão adotado no protótipo.

## Para o Michael decidir

1. **Pastas permitidas**: padrão `/srv, /home, /var/www, /opt, /mnt, /media, /dados, /data`. Quais pastas os clientes da Qward usam de verdade (ex.: compartilhamentos Samba)?
2. **Apagar**: **fora na 0.1.0**. Incluir "apagar pasta vazia"? Com lixeira?
3. **Senha salva**: **nada salvo**. Guardar no Cofre do Windows (Credential Manager) por servidor?
4. **Lista de servidores**: hoje digita o IP toda vez. Criar uma lista de favoritos (sem senha) no PC?
5. **Registro central**: hoje fica no PC de cada técnico. Mandar cópia para um lugar central (ex.: pasta de rede da Qward)?
6. **Política central**: hoje `politica.json` em cada PC. Distribuir uma política única?
7. **Assinatura do .exe**: sem assinatura o Windows avisa na primeira vez. Vale um certificado?

## Técnicas

- Rodar os testes em Debian 12, Rocky 9 e Alpine (Dockerfiles em `test/distros/`).
- Testar shell de login `fish`/`csh` (se algum cliente usar).
- ACLs (`setfacl`) para permissões mais finas, se necessário.
- Upload/download de arquivos (SFTP), se o time pedir.
