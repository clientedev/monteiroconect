---
name: Baileys dependency firewall
description: Ambiente de instalação e validação da dependência Baileys deste projeto.
---

A instalação da dependência Baileys pode ser bloqueada pelo firewall de pacotes do ambiente por alerta de segurança, mesmo quando a versão já está declarada no projeto.

**Why:** Sem o pacote, o backend não pode ser compilado ou executado localmente, embora o parsing dos arquivos TypeScript continue possível.

**How to apply:** Ao validar mudanças no fluxo WhatsApp, tente instalar as dependências antes de declarar a execução completa; se o bloqueio persistir, não substitua a biblioteca sem revisar compatibilidade e segurança.