---
name: WhatsApp session durability
description: Regras operacionais para manter sessões Baileys conectadas e evitar QR desnecessário.
---

A sessão Baileys deve ser restaurada usando as credenciais existentes; somente uma ação explícita de atualização de QR pode invalidar os arquivos de autenticação.

**Why:** O Railway pode reiniciar o processo e, sem armazenamento persistente ou com duas instâncias usando a mesma sessão, o WhatsApp perde o estado ou encerra uma conexão concorrente.

**How to apply:** Em produção, montar um volume persistente para `SESSIONS_PATH`, manter uma única instância por sessão e diferenciar reconexão automática/manual de geração deliberada de um QR novo.