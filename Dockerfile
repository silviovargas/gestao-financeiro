FROM node:20-alpine

# Dependências para compilar better-sqlite3 no Alpine
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Instalar dependências (camada cacheável)
COPY package.json package-lock.json* ./
RUN npm install --production

# Código da aplicação
COPY server.js ./
COPY public ./public

# Volume para o banco de dados
VOLUME ["/app/data"]

ENV PORT=3000 \
    NODE_ENV=production \
    DB_PATH=/app/data/database.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
