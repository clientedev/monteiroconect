# Monteiro Conecta — Central de Atendimento WhatsApp

Sistema completo para gerenciar múltiplas contas WhatsApp em uma única interface web. Ideal para central de atendimento, equipes de suporte e gestão de múltiplos números.

---

## 🚀 Visão Geral

O **Monteiro Conecta** permite conectar e gerenciar vários números de WhatsApp simultaneamente. Cada número tem sua sessão independente — mensagens chegam em tempo real via WebSocket, e o painel oferece dashboard, conversas, contatos, etiquetas, atendentes e logs.

### Fluxo Principal

1. Faça login no painel
2. Clique em "Adicionar WhatsApp"
3. Escaneie o QR Code real com o celular
4. A sessão conecta e as mensagens aparecem em tempo real
5. Envie e receba mensagens diretamente pelo painel
6. Ao reiniciar o servidor, as sessões restauram automaticamente

---

## 📋 Requisitos

- **Node.js** 18+ (recomendado: 20 LTS)
- **npm** 9+
- **Git**

Para Docker (produção):
- **Docker** e **Docker Compose**

---

## 🏗️ Tecnologias

### Backend
| Tecnologia | Uso |
|---|---|
| Node.js + TypeScript | Runtime e linguagem |
| Express | Servidor HTTP |
| Socket.IO | Comunicação em tempo real |
| Prisma | ORM (SQLite dev / PostgreSQL prod) |
| @whiskeysockets/baileys | Integração com WhatsApp Web |
| bcryptjs | Hash de senhas |
| jsonwebtoken | Autenticação JWT |
| Winston | Logging estruturado |
| Zod | Validação de dados |
| Helmet + CORS | Segurança HTTP |

### Frontend
| Tecnologia | Uso |
|---|---|
| React + TypeScript | UI framework |
| Vite | Build tool |
| Tailwind CSS | Estilização |
| Socket.IO Client | Tempo real |
| React Router DOM | Roteamento SPA |
| Lucide React | Ícones |

---

## ⚡ Instalação Rápida (Windows)

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd wa-central
```

### 2. Instale as dependências

```bash
npm run install:all
```

### 3. Configure as variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

As configurações padrão servem para desenvolvimento local. Ajuste pelo menos:

```env
ADMIN_PASSWORD=SuaSenhaSeguraAqui!
JWT_SECRET=um-valor-aleatorio-bem-seguro
```

### 4. Inicialize o banco de dados

```bash
npm run db:push
```

Para o banco local, inicie antes o PostgreSQL com `docker compose up -d postgres`.

### 5. Inicie em modo desenvolvimento

```bash
npm run dev
```

Isso iniciará:
- **Backend** em `http://localhost:3001`
- **Frontend** em `http://localhost:5173`

### 6. Acesse

Abra no navegador: **http://localhost:5173**

**Credenciais padrão** (configure no `.env`):
- Usuário: `admin`
- Senha: `Admin@2026!`

---

## 🐳 Docker (Produção)

```bash
docker compose up -d
```

Acesse: **http://localhost**

Serviços criados:
- Backend (Node.js) — porta 3001
- Frontend (Nginx) — porta 3000
- PostgreSQL — porta 5432

---

## 🚂 Railway (produção)

O WhatsApp mantém as credenciais de login em arquivos. Para a conta continuar
conectada depois de reinícios ou novos deploys, configure no serviço do Railway:

1. Adicione um **Volume persistente** montado em `/app/backend/sessions`.
2. Defina `SESSIONS_PATH=/app/backend/sessions` (ou mantenha o caminho padrão
   somente se o volume estiver montado exatamente nesse diretório).
3. Execute apenas **uma instância** do backend. Escalar horizontalmente o
   processo que mantém a mesma sessão pode causar conflitos e desconexões.
4. Configure `DATABASE_URL`, `JWT_SECRET` e `ADMIN_PASSWORD` como variáveis
   seguras do serviço, nunca no repositório.

O botão **Reconectar** reutiliza as credenciais existentes e não apaga a pasta
da sessão. O botão **Atualizar QR** é a ação explícita para invalidar a sessão e
gerar um QR novo.

O backend também verifica e corrige de forma aditiva o schema da tabela de
mensagens durante o boot. Portanto, depois de atualizar o código, é necessário
fazer um novo deploy no Railway para criar campos como `waMsgId` no banco de
produção.

---

## 📂 Estrutura do Projeto

```
wa-central/
├── backend/
│   ├── src/
│   │   ├── config/          # Configurações (env, etc.)
│   │   ├── controllers/      # Controladores HTTP
│   │   ├── database/         # Cliente Prisma
│   │   ├── middleware/       # Auth, error handler
│   │   ├── routes/           # Rotas Express
│   │   ├── services/         # Lógica de negócio
│   │   ├── utils/            # Helpers, logger, errors
│   │   ├── whatsapp/         # WhatsAppSessionManager
│   │   ├── websocket/        # Socket.IO handler
│   │   └── index.ts          # Entry point
│   ├── prisma/
│   │   ├── schema.prisma     # Schema do banco
│   │   └── seed.ts           # Dados iniciais
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Layout, componentes compartilhados
│   │   ├── context/          # AuthContext
│   │   ├── lib/              # API client, Socket.IO
│   │   ├── pages/            # Páginas React
│   │   ├── App.tsx           # Rotas
│   │   └── main.tsx          # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── sessions/                 # Sessões WhatsApp (não versionar)
├── uploads/                  # Arquivos enviados
├── logs/                     # Logs do sistema
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
└── README.md
```

---

## 📱 Funcionalidades

### WhatsApp
- ✅ Conectar múltiplas contas WhatsApp
- ✅ QR Code real gerado automaticamente
- ✅ Sessões persistentes (sobrevivem a restarts)
- ✅ Reconexão automática com backoff exponencial
- ✅ Detecção de status (conectado, desconectado, erro)
- ✅ Desconectar e remover contas

### Mensagens
- ✅ Receber mensagens em tempo real
- ✅ Enviar mensagens de texto
- ✅ Suporte a múltiplos tipos (texto, imagem, áudio, vídeo, documento, localização, sticker)
- ✅ Histórico de conversas
- ✅ Contador de não lidas
- ✅ Marcar como lida

### Painel
- ✅ Dashboard com estatísticas
- ✅ Central de conversas estilo chat
- ✅ Gerenciamento de contatos
- ✅ Sistema de etiquetas/tags
- ✅ Gestão de atendentes (admin, supervisor, atendente)
- ✅ Busca global
- ✅ Logs do sistema
- ✅ Interface responsiva

### Segurança
- ✅ Autenticação JWT
- ✅ Senhas com hash bcrypt
- ✅ Autorização por função (RBAC)
- ✅ Rate limiting
- ✅ Helmet (headers de segurança)
- ✅ CORS configurável
- ✅ Validação de inputs (Zod)
- ✅ Sessões WhatsApp protegidas no servidor

---

## 🔧 Biblioteca de Integração

### @whiskeysockets/baileys

Esta é uma biblioteca open-source que implementa o protocolo do WhatsApp Web.
Não é uma API oficial da Meta/WhatsApp.

- **Versão**: 6.7.x
- **Repositório**: https://github.com/WhiskeySockets/Baileys
- **Licença**: MIT

### ⚠️ Riscos e Limitações

1. **Terms of Service**: O uso pode violar os Termos de Serviço do WhatsApp
2. **Banimento**: Contas podem ser banidas por uso de clientes não oficiais
3. **Mudanças de protocolo**: Atualizações do WhatsApp podem quebrar a integração
4. **Sem suporte oficial**: Não há suporte da Meta para esta biblioteca
5. **Reconexão**: A conexão pode cair e exigir novo QR Code após atualizações do WhatsApp

### Como Atualizar

```bash
cd backend
npm update @whiskeysockets/baileys
npm run build
```

---

## 🔐 Configurações do .env

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta do servidor backend | `3001` |
| `NODE_ENV` | Ambiente (development/production) | `development` |
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql://...` |
| `JWT_SECRET` | Segredo para tokens JWT | — |
| `JWT_EXPIRES_IN` | Expiração do token | `24h` |
| `SESSIONS_PATH` | Pasta de sessões WhatsApp | `./sessions` |
| `MAX_RECONNECT_ATTEMPTS` | Tentativas de reconexão | `10` |
| `ADMIN_USERNAME` | Usuário admin inicial | `admin` |
| `ADMIN_PASSWORD` | Senha admin inicial | `Admin@2026!` |
| `CORS_ORIGIN` | Origens permitidas | `http://localhost:5173` |

---

## 🛡️ Segurança das Sessões

**IMPORTANTE**: A pasta `sessions/` contém as credenciais de autenticação do WhatsApp.

- Nunca compartilhe a pasta `sessions/`
- Nunca faça commit da pasta `sessions/` (já está no .gitignore)
- Em produção, proteja com permissões restritas de sistema de arquivos
- Faça backup da pasta apenas de forma segura (criptografado)
- Ao remover uma conta, as credenciais são excluídas

---

## 🧪 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia backend + frontend em desenvolvimento |
| `npm run dev:backend` | Inicia apenas o backend |
| `npm run dev:frontend` | Inicia apenas o frontend |
| `npm run build` | Compila backend + frontend |
| `npm run db:push` | Sincroniza schema Prisma com banco |
| `npm run db:seed` | Insere dados iniciais |
| `npm run db:studio` | Abre Prisma Studio (GUI do banco) |

---

## 📝 Primeiro Acesso

1. Abra `http://localhost:5173`
2. Faça login com as credenciais admin (configuradas no `.env`)
3. Vá em "WhatsApps" no menu lateral
4. Clique em "Adicionar WhatsApp"
5. Dê um nome para a conta
6. Aguarde o QR Code aparecer
7. Abra o WhatsApp no celular → Menu → Dispositivos Conectados → Conectar
8. Escaneie o QR Code
9. Pronto! A conta aparecerá como conectada
10. Vá em "Conversas" para ver e responder mensagens

---

## 🔄 Reconexão Automática

O sistema implementa reconexão robusta com:
- **Backoff exponencial**: Intervalos crescentes entre tentativas
- **Jitter**: Aleatoriedade para evitar thundering herd
- **Limite máximo**: 10 tentativas antes de desistir
- **Novo QR Code**: Se a sessão expirou, solicita novo scan

---

## 🐛 Troubleshooting

### Backend não inicia
- Verifique se Node.js 18+ está instalado: `node -v`
- Delete `node_modules` e reinstale: `rm -rf node_modules && npm install`

### QR Code não aparece
- Verifique se o backend está rodando e conectado ao WebSocket
- Abra o console do navegador (F12) para erros
- Verifique os logs do backend

### Sessão cai frequentemente
- Verifique sua conexão de internet
- O WhatsApp pode ter atualizado o protocolo — atualize a biblioteca
- Verifique se o celular está desconectando ativamente

### Banco de dados com erro
- Delete o arquivo `backend/dev.db` e rode `npm run db:push` novamente

---

## 📄 Licença

Este projeto é para uso educacional e autorizado. O uso de integrações não oficiais com WhatsApp é de responsabilidade do usuário e pode violar os termos de serviço da Meta.
