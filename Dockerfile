FROM node:20-alpine

# Dependências para compilar better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

COPY package.json ./
# Compilar nativo dentro do container
RUN npm install --production

COPY . .

VOLUME ["/app/data"]
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
