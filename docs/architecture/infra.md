# Infraestrutura do servidor (P10)
Status: **implementado e testado localmente**; Docker **não testado** (ausente na máquina).

## Publicação (porta única, 2026-11-04)
Com `PORT` definido, `server/start.js` sobe **um** servidor HTTP que entrega o jogo (`public/`, arte com `?v=` em cache imutável), a API (`/api/*`), a operação (`/healthz`, `/readyz`, `/metrics`) e o WebSocket (`/ws`). O `index.html` sai com `<meta name="aetheria-api" content="same-origin">`, que liga o modo online no cliente sem `?api=`; `GET /api/config` devolve `gameUrl: '/ws'` e o cliente monta `wss://<site>/ws`. `PUBLIC_URL` (ex.: `https://aetheria.duckdns.org`) vira a origem permitida padrão. Guia: `docs/deploy/publicar-gratis.md` (Oracle Always Free + DuckDNS + Caddy, `deploy/instalar-vm.sh`, testado em Ubuntu 24.04 limpo com systemd simulado). **Docker construído e testado** nesta data (persistência no volume e SIGTERM limpo); o modo de duas portas abaixo continua para desenvolvimento.

## Processos e portas
`npm run server` (`server/start.js`) sobe **um processo** com: API HTTP (padrão 5176), WebSocket do jogo (5175) e banco SQLite (`node:sqlite`, arquivo em `DB_PATH`). O frontend estático é independente (GitHub Pages ou CDN). Capacidade medida na P9: ≈ 150–250 jogadores por processo (nesta máquina); escalar = mais processos/máquinas (cada sala é independente; o banco compartilhado é o ponto a revisar então — SQLite é de **um** processo).

## Variáveis de ambiente (validadas na partida)
| Variável | Padrão | Observação |
|---|---|---|
| `PORT` | — | **porta única** (publicação): jogo + API + WebSocket `/ws` no mesmo endereço; serviços de hospedagem costumam definir sozinhos |
| `PUBLIC_URL` | — | endereço público `https://host` (sem caminho); vira a origem permitida padrão no modo de porta única |
| `HOST` | 127.0.0.1 | `0.0.0.0` só atrás de proxy com TLS (gera aviso sem `GAME_URL` `wss://`) |
| `API_PORT` / `GAME_PORT` | 5176 / 5175 | inteiros 1–65535, diferentes entre si |
| `ALLOWED_ORIGINS` | http://localhost:5174 | `esquema://host[:porta]`, sem barra final; `http://` não local gera aviso |
| `GAME_URL` | ws://host:porta | URL que o NAVEGADOR usa; em produção `wss://…` |
| `DB_PATH` | data/aetheria.db | volume persistente |
| `GOOGLE_CLIENT_ID` | — | opcional (público por natureza) |
| `TRUST_PROXY` | 0 | `1` atrás de proxy (usa `X-Forwarded-For`) |
| `MAX_PER_IP` | 20 | conexões WebSocket por IP |
| `METRICS_TOKEN` | — | ≥ 16 caracteres; **liga** `/metrics` (sem ele a rota não existe) |
| `LOG_LEVEL` | info | debug · info · warn · error |
| `SHUTDOWN_GRACE_MS` | 3000 | espera após avisar os clientes |
Valor inválido ⇒ mensagem clara e **saída com código 2 antes de abrir qualquer porta**.

## Rotas de operação (porta da API)
- `GET /healthz` → 200 se o processo responde (liveness).
- `GET /readyz` → 200 se banco e servidor de jogo estão prontos; **503 durante o desligamento** (o balanceador para de enviar gente).
- `GET /metrics` (Bearer `METRICS_TOKEN`; comparação em tempo constante) → JSON: uptime, conexões, salas, sessões, fila, mensagens/rejeições/derrubadas, RSS, heap.

## Logs
Uma linha JSON por evento (`{t, level, msg, …campos}`) em stdout; o orquestrador (Docker/systemd) coleta. Eventos de abuso continuam na tabela `audit` do banco. Não há agregador/alertas: **pendente** (Prometheus/Loki ou similar).

## Desligamento limpo
`SIGTERM`/`SIGINT` (ou exceção não tratada): `readyz`→503, envia `notice {code:'server_closing', retryMs}` a todos os clientes, espera `SHUTDOWN_GRACE_MS`, fecha o jogo e a API e o banco. Partidas em andamento **não são migradas** (acabam); o cliente deve reconectar. No Windows `SIGTERM` não é entregue como no Linux — validado em teste (`gracefulShutdown`), **não** com sinal real.

## Backup e restauração
`npm run db:backup` (VACUUM INTO, seguro com o servidor ligado) → `data/backups/`. `npm run db:restore -- <arquivo> [destino]`: confere integridade e se é um banco do Aetheria, **recusa se o servidor está usando o banco** (arquivo `-wal` ativo), guarda cópia do banco atual (`….antes-da-restauracao-…`) e substitui. Teste: `tests/ops.test.js` (ida e volta, backup corrompido, banco em uso). Agendamento do backup (cron/tarefa) e cópia para fora da máquina: **pendente / responsabilidade de quem hospeda**.

## Contêiner (construído e testado em 2026-11-04)
`Dockerfile` (Node 24, usuário não-root, porta única 8080, volume `/data`, `HEALTHCHECK` em `/healthz`; `NODE_IMAGE` troca a imagem base se o Docker Hub der 429), `.dockerignore`, `docker-compose.yml` (jogo + Caddy com HTTPS; `DOMINIO` no `.env`). Testado: build, site/API/registro dentro do contêiner, conta persiste após `docker restart`, desligamento limpo com SIGTERM. Não testado: o Caddy com certificado real.

## Não coberto
TLS/WSS (proxy), vários processos com estado compartilhado (SQLite → PostgreSQL), CI/CD, alertas, limites de CPU/memória do contêiner, rotação de logs, teste de restauração em máquina limpa.

## Versão da arte estática (cache do service worker)
- `public/src/assets-version.js` exporta `ASSET_V` e `asset(path)` (anexa `?v=`). `ui.js`, `touch.js` e os ícones (`skill-icons.js`, `spirit-sprites.js`) usam o helper; o teste `tests/assets-version.test.js` exige que nenhum `src="assets/` fique cru.
- `ASSET_V` e a `VERSION` do `public/sw.js` NÃO são editados à mão: `node tools/bump-assets.mjs` calcula o hash do conteúdo de `public/assets/**` e reescreve os dois (`aetheria-<hash>`); sem `--no-css` ele também anexa `?v=<hash>` às referências `assets/*.webp|png|svg` de `style.css` e `index.html`. `--check` só confere (sai com 1 se desatualizado).
- Rodar o script sempre que a arte de `public/assets` mudar, antes de publicar. Como o `sw.js` muda junto, os aparelhos descartam o cache antigo.
- `node tools/dead-code.mjs` lista exports que ninguém importa e imports não usados (candidatos a código morto; `--internal` mostra também os exports só usados no próprio arquivo).
