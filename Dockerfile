# Servidor do Aetheria (API + WebSocket). NÃO TESTADO nesta máquina (Docker não está instalado): valide com `docker build` antes de usar.
# Requer Node 24 (usa node:sqlite). O frontend estático é publicado à parte (GitHub Pages ou qualquer CDN).
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DB_PATH=/data/aetheria.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public/src/core ./public/src/core
COPY public/src/data ./public/src/data
COPY public/src/game ./public/src/game
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 5175 5176
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5176/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/start.js"]
