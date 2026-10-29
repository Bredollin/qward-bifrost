# Manual do técnico

Para quem nunca usou o terminal do Linux. Se travar em algum passo, chame o Michael.

## 1. Abrir

Dê dois cliques em `QwardBifrost-<versão>-portable.exe`. Não precisa instalar. Na primeira vez o Windows pode avisar que o programa não é assinado: clique em **Mais informações → Executar assim mesmo**.

## 2. Conectar

| Campo | O que pôr |
|---|---|
| Seu nome | seu nome; vai para o registro de ações (todos usam o mesmo usuário no servidor, então é assim que sabemos quem fez o quê) |
| Servidor | IP ou nome do servidor do cliente |
| Porta | normalmente 22 |
| Usuário SSH | o usuário de manutenção da Qward |
| Senha ou Chave SSH | o que o servidor usa |
| Elevar permissões | **sudo** se o usuário de manutenção tem sudo; **su** se precisa da senha do root; **Não elevar** só para olhar |

Clique em **Conectar**.

**Primeira vez num servidor:** aparece a "impressão digital" (um código `SHA256:...`). Ela é a identidade do servidor. Se tiver dúvida se é o servidor certo, pergunte antes de clicar em **Confio neste servidor**. Se um dia o Bifrost disser que **a identidade mudou**, pare e avise o Michael: pode ser servidor reinstalado ou alguém no meio do caminho.

## 3. Arquivos

- **Duplo clique** numa pasta entra nela; **↑** sobe uma pasta; você também pode digitar o caminho e apertar Enter.
- **Clique** num item para selecionar; aí os botões de ação ficam ativos.
- **Ver como root**: mostra pastas que o usuário de manutenção não consegue abrir.

### Criar pasta
**＋ Nova pasta** → nome → (opcional) permissão, ex. `770` → Continuar → confira → **Fazer agora**.

### Renomear ou mover
Selecione → **Renomear / mover** → edite o caminho completo. Se já existir algo com esse nome no destino, o Bifrost **não** sobrescreve.

### Permissões
Selecione → **Permissões**. Marque o que cada um pode fazer:

| | Ler | Escrever | Entrar/Executar |
|---|---|---|---|
| **Dono** | ver o conteúdo | criar, mudar, apagar | entrar na pasta / rodar o programa |
| **Grupo** | idem, para quem está no grupo | | |
| **Outros** | idem, para todo o resto | | |

Comparando com o Windows: é como a aba **Segurança** das propriedades da pasta, mas com só três "pessoas": o dono, o grupo e todo o resto.

Receitas comuns:

| Situação | Número |
|---|---|
| Pasta de um setor (só o grupo mexe, ninguém mais vê) | `770` |
| Igual, e arquivos novos já ficam com o grupo do setor | marque **Pastas novas herdam o grupo** → `2770` |
| Todos veem, só o dono mexe | `755` |
| Arquivo privado | `600` |

**Recursivo** aplica em tudo que está dentro. Use com cuidado: o Bifrost marca como **Risco alto** e pede confirmação extra.

### Dono e grupo
Selecione → **Dono e grupo** → escolha da lista → Continuar → confira.

## 4. Usuários e grupos

- **＋ Novo usuário**: nome em letras minúsculas (ex. `joao_silva`), grupos extras separados por vírgula, shell (`/usr/sbin/nologin` para quem só usa compartilhamento), senha.
- **＋ Novo grupo**: ex. `financeiro`.
- **Colocar usuário em grupo**: a pessoa precisa sair e entrar de novo para valer.
- **Definir senha**: troca a senha de um usuário.
- **Só pessoas** esconde as contas do sistema.

## 5. Registro

A aba **Registro** mostra tudo o que foi feito neste computador: quando, quem, servidor, ação e se deu certo. Passe o mouse para ver o comando exato.

## Mensagens comuns

| Mensagem | O que fazer |
|---|---|
| Usuário ou senha/chave incorretos | confira e tente de novo |
| Elevação recusada pelo sudo/su | senha de elevação errada, ou o usuário não tem sudo: tente **su** ou chame o Michael |
| Bloqueado: ... fora das pastas permitidas | é proposital; pastas do sistema não se mexem pelo Bifrost |
| Tempo esgotado ao conectar | VPN ligada? Servidor ligado? Porta certa? |
| Destino já existe | escolha outro nome |

O que o Bifrost **não** faz de propósito (por enquanto): apagar arquivos, apagar usuários e editar arquivos do sistema. Para isso, chame o Michael.
