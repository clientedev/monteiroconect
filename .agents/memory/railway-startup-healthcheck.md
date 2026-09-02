---
name: Railway startup healthcheck
description: Regra para inicializar o serviço HTTP antes da sincronização do banco em produção
---

O comando de inicialização de produção não deve executar `prisma db push` de forma síncrona antes de iniciar o servidor HTTP.

**Why:** O Railway testa a porta e o healthcheck durante o startup; se o banco estiver lento, indisponível ou exigir retry, o processo ainda não estará escutando e o deploy falhará como `service unavailable`.

**How to apply:** Inicie o processo Node diretamente e mantenha a sincronização do schema em segundo plano, com tratamento de erro e logs. Confirme também que o servidor usa `PORT` e escuta em todas as interfaces.