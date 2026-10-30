# Manual do técnico

Para quem nunca usou o terminal do Linux. Se travar em algum passo, chame o administrador.

## 1. Abrir

Dê dois cliques em `QwardBifrost.exe`. Não precisa instalar. Na primeira vez o Windows pode avisar que o programa não é assinado: clique em **Mais informações → Executar assim mesmo**.

## 2. Conectar

| Campo | O que pôr |
|---|---|
| Seu nome | seu nome; vai para o registro de ações (todos usam o mesmo usuário no servidor, então é assim que sabemos quem fez o quê) |
| Servidor | IP ou nome do servidor do cliente |
| Porta | normalmente 22 |
| Usuário SSH | o usuário de manutenção da Qward |
| Senha ou Chave SSH | o que o servidor usa |

O login é sempre como usuário comum. Depois de conectar, o botão laranja **Elevar para root** (no topo, à direita) troca do usuário de manutenção para root (`su`, pede a senha do root). O selo muda do nome do usuário para "root" e o botão vira **Sair do root**. Se você tentar uma alteração sem elevar, o Bifrost abre essa janela sozinho. Depois de elevar, você continua como root até clicar em **Sair do root** ou desconectar.

Clique em **Conectar**.

**Primeira vez num servidor:** aparece a "impressão digital" (um código `SHA256:...`). Ela é a identidade do servidor. Se tiver dúvida se é o servidor certo, pergunte antes de clicar em **Confio neste servidor**. Se um dia o Bifrost disser que **a identidade mudou**, pare e avise o administrador: pode ser servidor reinstalado ou alguém no meio do caminho.

## 3. Arquivos

- **Duplo clique** numa pasta entra nela; **↑** sobe uma pasta; você também pode digitar o caminho e apertar Enter.
- **Clique** num item para selecionar; aí os botões de ação ficam ativos.
- **Ver como root**: mostra pastas que o usuário de manutenção não consegue abrir.

### Avisos de área (faixa acima dos botões)

| Faixa | Onde | O que acontece |
|---|---|---|
| Laranja, **Pasta do sistema · somente leitura** | `/`, `/bin`, `/etc`, `/usr`, `/boot` e tudo fora da área liberada | Dá para olhar, não dá para mudar: os botões de alteração ficam desligados, mesmo como root. A faixa diz para que serve a pasta e traz atalhos **Ir para** as áreas liberadas. |
| Vermelha, **Pasta protegida** | qualquer `.ssh` | Chaves de acesso: o Bifrost não altera, para ninguém perder o acesso ao servidor. |
| Verde, **Área liberada** | dentro de `/srv`, `/home`, `/var/www`, `/opt`, `/mnt`, `/media`, `/dados`, `/data` | Botões ligados; toda alteração mostra o comando, pede confirmação e vai para o registro. |

Na raiz (`/`), as pastas da área liberada aparecem com a etiqueta verde **área liberada**; `.ssh` aparece com **protegida**.

Os botões seguem cores fixas: **verde cheio** cria, **contorno** muda o item selecionado, **vermelho** apaga, **laranja** eleva para root.

### Criar pasta
**Nova pasta** → nome → (opcional) permissão, ex. `770` → Continuar → confira → **Fazer agora**.

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

### Criar arquivo vazio
**Novo arquivo** → nome → (opcional) permissão, ex. `660` → Continuar → confira. Se já existir, nada é sobrescrito.

### Acesso total
Selecione a pasta → **Acesso total** → escolha o usuário → confira. Ele vira dono da pasta e de tudo dentro, com ler, gravar e entrar. Não vira administrador do servidor (sem sudo, sem root).

### Apagar
Selecione → **Apagar** → digite o nome do item → confira. Pasta com coisas dentro: marque **recursivo** e digite `entendo`; a confirmação mostra quantos itens vão sumir. **Não tem volta.**

## 4. Usuários e grupos

- **Novo usuário**: nome em letras minúsculas (ex. `joao_silva`), grupos extras separados por vírgula, shell (`/usr/sbin/nologin` para quem só usa compartilhamento), senha.
- **Novo grupo**: ex. `financeiro`.
- **Colocar usuário em grupo**: a pessoa precisa sair e entrar de novo para valer.
- **Definir senha**: troca a senha de um usuário.
- **Só pessoas** esconde as contas do sistema.

## 5. Registro

A aba **Registro** mostra tudo o que foi feito neste computador: quando, quem, servidor, ação e se deu certo. Passe o mouse para ver o comando exato.

## Mensagens comuns

| Mensagem | O que fazer |
|---|---|
| Usuário ou senha/chave incorretos | confira e tente de novo |
| Elevação recusada pelo su | senha do root errada: confira com o administrador |
| Bloqueado: ... fora das pastas permitidas | é proposital; pastas do sistema não se mexem pelo Bifrost |
| Tempo esgotado ao conectar | VPN ligada? Servidor ligado? Porta certa? |
| Destino já existe | escolha outro nome |

O que o Bifrost **não** faz de propósito (por enquanto): apagar arquivos, apagar usuários e editar arquivos do sistema. Para isso, chame o administrador.
