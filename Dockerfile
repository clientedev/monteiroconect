# ===== Estágio 1: Build do Frontend =====
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ===== Estágio 2: Build do Backend =====
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma/
RUN npm install
COPY backend/ .
RUN npx prisma generate
RUN npm run build

# ===== Estágio Final: Produção =====
FROM node:20-alpine
WORKDIR /app/backend

ENV NODE_ENV=production

# Backend compilado + dependências
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/package.json ./

# Frontend buildado (servido pelo Express em mesma origem)
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Diretórios de runtime
RUN mkdir -p /app/backend/sessions /app/backend/uploads /app/backend/logs

EXPOSE 3001

# Cria as tabelas automaticamente no primeiro boot e inicia o servidor
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
