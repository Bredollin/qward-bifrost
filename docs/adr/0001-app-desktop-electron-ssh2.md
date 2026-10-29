# 0001. App desktop com Electron e ssh2

Data: 2026-10-29 · Situação: aceita

## Contexto
Os técnicos usam Windows. A ferramenta não pode ser instalada no servidor; precisa falar SSH do lado do técnico. O Michael pediu app desktop para Windows.

## Decisão
Electron (tela em HTML/JS) + biblioteca `ssh2` (JavaScript puro, sem binário nativo obrigatório). Entrega como `.exe` portátil gerado pelo `electron-builder`.

## Alternativas
- **Web app local** (servidor Node + navegador): mais leve, mas exige abrir porta local e o técnico gerenciar um serviço.
- **.NET/WinForms + SSH.NET**: nativo e leve, mas o resto do Brain é Node e o time não teria como testar a interface na nuvem.
- **Tauri**: executável menor, mas o SSH teria de ser em Rust.

## Consequências
- Executável grande (~90 MB). Aceitável para uso interno.
- A mesma base roda em Linux (usado nos testes).
