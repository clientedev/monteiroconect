---
name: WhatsApp media payloads
description: Regra para envio e reprodução de imagens, documentos e áudios pelo painel.
---

Arquivos recebidos pelo upload local devem ser lidos como Buffer antes de serem entregues ao Baileys, e documentos/áudios devem preservar MIME e nome original.

**Why:** Passar `/uploads/...` como se fosse uma URL fazia o Baileys falhar ao enviar arquivos locais; documentos sem `fileName` e áudio sem MIME confiável também eram rejeitados ou ficavam inutilizáveis.

**How to apply:** Ao criar novos fluxos de mídia, reutilizar o upload autenticado, validar a existência do arquivo no servidor e enviar `mimetype`, `fileName` quando aplicável e o payload binário.