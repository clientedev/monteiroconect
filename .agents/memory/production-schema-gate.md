---
name: Production schema gate
description: Regra para evitar perda de mensagens quando o banco de produção está atrás do Prisma.
---

O processo que consome mensagens externas só deve iniciar depois que o banco confirmar o schema compatível; falha de sincronização deve interromper o boot, não ser tratada como aviso.

**Why:** Um banco Railway sem campos recentes fez cada mensagem falhar na persistência e gerou uma avalanche de logs descartados.

**How to apply:** Para alterações aditivas em produção, aplicar uma correção idempotente quando necessário, executar a sincronização do Prisma e abortar antes de conectar o WhatsApp se qualquer etapa falhar.