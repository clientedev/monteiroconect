# ===== Estágio 1: Build do Frontend =====
FROM node:20-alpine AS frontend-builder
RUN apk add --no-cache git
WORKDIR /app/frontend
COPY frontend/_package.json frontend/package-lock.json* ./
RUN mv _package.json package.json
RUN npm install
COPY frontend/ .
RUN npm run build

# ===== Estágio 2: Build do Backend =====
FROM node:20-alpine AS backend-builder
RUN apk add --no-cache git
WORKDIR /app/backend
COPY backend/_package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma/
RUN mv _package.json package.json
RUN npm install
COPY backend/ .
RUN npx prisma generate
RUN npm run build

# ===== Estágio Final: Produção =====
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app/backend

RUN apk add --no-cache git openssl ca-certificates

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

# Servidor inicia imediatamente; prisma db push roda dentro do bootstrap()
CMD ["node", "dist/index.js"]
