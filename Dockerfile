# Aetheria: jogo + contas + multiplayer + chat num só endereço (modo de porta única, server/start.js com PORT).
# Construído e testado com `docker build` em 2026-11-04 (ver docs/deploy/publicar-gratis.md). Node 24 (node:sqlite).
# Na frente vai um proxy com HTTPS (Caddy faz o certificado sozinho) ou o HTTPS do próprio serviço de hospedagem.
# NODE_IMAGE: troque por public.ecr.aws/docker/library/node:24-slim se o Docker Hub recusar por limite de downloads (429)
ARG NODE_IMAGE=node:24-slim
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DB_PATH=/data/aetheria.db TRUST_PROXY=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY tools/db-backup.mjs tools/db-restore.mjs ./tools/
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/start.js"]
