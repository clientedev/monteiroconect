FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/tsconfig.json ./
COPY backend/prisma ./prisma/
RUN npm install
COPY backend/ .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/package.json ./
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
