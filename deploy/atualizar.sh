#!/usr/bin/env bash
# Atualização automática do Aetheria, AUTORIZADA pelo dono (2026-11-05). Instalada por deploy/instalar-vm.sh em /usr/local/bin/aetheria-atualizar
# e chamada pelo cron a cada 5 min. Se o branch do GitHub tem versão nova: baixa, instala as dependências e reinicia o jogo (os jogadores recebem
# "servidor reiniciando" e reconectam). Sem versão nova não faz nada. Contas e personagens (banco em /var/lib/aetheria) nunca são tocados.
# Desligar: AUTO_UPDATE=0 em /etc/aetheria.env (ou: sudo rm /etc/cron.d/aetheria-update). Rodar na mão: sudo aetheria-atualizar
set -euo pipefail
APP="${APP:-/opt/aetheria}"
BRANCH="${BRANCH:-main}"
RESTART="${RESTART:-systemctl restart aetheria}"
if [ -f /etc/aetheria.env ] && grep -q '^AUTO_UPDATE=0' /etc/aetheria.env && [ "${FORCE:-0}" != 1 ]; then exit 0; fi
exec 9>"${LOCK:-/tmp/aetheria-atualizar.lock}"
flock -n 9 || exit 0 # já há uma atualização rodando
cd "$APP"
git fetch -q --depth 1 origin "$BRANCH"
NOVO="$(git rev-parse FETCH_HEAD)"
if [ "$(git rev-parse HEAD)" = "$NOVO" ]; then exit 0; fi
ANTES="$(git rev-parse --short HEAD)"
git reset -q --hard "$NOVO"
npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1
$RESTART
echo "$(date -Is) Aetheria atualizado: $ANTES -> $(git rev-parse --short HEAD)"
