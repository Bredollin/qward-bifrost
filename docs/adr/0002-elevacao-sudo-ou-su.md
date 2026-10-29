# 0002. Conectar como usuário comum e elevar com sudo ou su

Data: 2026-10-29 · Situação: aceita

## Contexto
Usa um único usuário de manutenção nos servidores. O Michael definiu: conectar com usuário comum e depois elevar. Nem todo servidor tem sudo configurado.

## Decisão
Duas formas, escolhidas na tela de conexão: `sudo -S` (senha do usuário, ou outra) e `su` (senha do root, via pseudo-terminal). Leitura roda sem elevação (com "Ver como root" opcional); alteração roda elevada. A elevação é testada ao conectar.

## Consequências
- Login direto como root não é necessário (e é desencorajado).
- `su` depende de reconhecer o prompt de senha; cobertos pt, en, es, de, fr.
