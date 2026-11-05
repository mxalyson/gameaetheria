#!/usr/bin/env bash
# Instala o Aetheria numa VM Ubuntu (22.04/24.04; feito para a Oracle Cloud Always Free, ARM ou x86) com HTTPS automático.
# O que faz: Node 24, Caddy (certificado HTTPS grátis da Let's Encrypt), usuário de sistema `aetheria`, código em /opt/aetheria,
# banco em /var/lib/aetheria, serviço systemd (reinicia sozinho), firewall da VM nas portas 80/443 e backup diário do banco.
# Pode rodar de novo para ATUALIZAR o jogo (puxa a versão nova do GitHub e reinicia; a configuração e o banco ficam).
#
# Uso:  sudo bash instalar-vm.sh SEU-NOME.duckdns.org
# Opcional: REPO=https://github.com/voce/outro.git BRANCH=main sudo -E bash instalar-vm.sh dominio
set -euo pipefail

DOMINIO="${1:-}"
REPO="${REPO:-https://github.com/mxalyson/gameaetheria.git}"
BRANCH="${BRANCH:-main}"
APP=/opt/aetheria
DADOS=/var/lib/aetheria
ENVF=/etc/aetheria.env

[ "$(id -u)" = 0 ] || { echo "Rode com sudo: sudo bash $0 seu-dominio"; exit 1; }
[[ "$DOMINIO" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Informe o domínio (ex.: sudo bash $0 aetheria.duckdns.org)"; exit 1; }
# Proteção contra colagem errada (aconteceu: "…duckdns.orgsudo"): se já existe configuração com outro domínio, para em vez de quebrar o HTTPS.
if [ -f "$ENVF" ]; then
  ATUAL="$(sed -n 's#^PUBLIC_URL=https://##p' "$ENVF" | head -1)"
  if [ -n "$ATUAL" ] && [ "$ATUAL" != "$DOMINIO" ] && [ "${TROCAR_DOMINIO:-0}" != 1 ]; then
    echo "O servidor já está configurado para \"$ATUAL\", mas você digitou \"$DOMINIO\"."
    echo "Confira o comando (cole só uma vez). Para trocar de domínio de propósito: sudo TROCAR_DOMINIO=1 bash $0 $DOMINIO"
    exit 1
  fi
fi
export DEBIAN_FRONTEND=noninteractive

echo "== 1/7 Pacotes básicos"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables

echo "== 2/7 Node.js 24"
if ! command -v node >/dev/null || ! node -v | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3/7 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== 4/7 Código do jogo em $APP"
id aetheria >/dev/null 2>&1 || useradd --system --home-dir "$DADOS" --shell /usr/sbin/nologin aetheria
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
(cd "$APP" && npm ci --omit=dev --no-audit --no-fund)
mkdir -p "$DADOS"
chown aetheria:aetheria "$DADOS"
chmod 700 "$DADOS"

echo "== 5/7 Configuração ($ENVF) e serviço"
[ "${TROCAR_DOMINIO:-0}" = 1 ] && [ -f "$ENVF" ] && sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMINIO#" "$ENVF"
if [ ! -f "$ENVF" ]; then # não sobrescreve: suas mudanças (ex.: GOOGLE_CLIENT_ID) ficam
  cat > "$ENVF" <<EOF
# Aetheria — modo de porta única atrás do Caddy (HTTPS). Mudou algo? sudo systemctl restart aetheria
NODE_ENV=production
PORT=8080
HOST=127.0.0.1
PUBLIC_URL=https://$DOMINIO
DB_PATH=$DADOS/aetheria.db
TRUST_PROXY=1
LOG_LEVEL=info
# GOOGLE_CLIENT_ID=   (opcional: login com Google)
EOF
  chmod 640 "$ENVF"
  chown root:aetheria "$ENVF"
fi
cat > /etc/systemd/system/aetheria.service <<EOF
[Unit]
Description=Aetheria (jogo, contas, multiplayer e chat)
After=network-online.target
Wants=network-online.target

[Service]
User=aetheria
Group=aetheria
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server/start.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DADOS

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/caddy/Caddyfile <<EOF
# Aetheria: HTTPS automático (Let's Encrypt) e repasse para o jogo (o WebSocket /ws passa sozinho)
$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
EOF
systemctl daemon-reload
systemctl enable aetheria >/dev/null
systemctl restart aetheria
systemctl reload caddy || systemctl restart caddy

echo "== 6/7 Firewall da VM (portas 80 e 443)"
# A imagem Ubuntu da Oracle vem com iptables que BLOQUEIA tudo menos SSH; libere também na "Security List" da VCN no painel da Oracle.
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null; else apt-get install -y iptables-persistent >/dev/null && netfilter-persistent save >/dev/null; fi

echo "== 7/7 Backup diário do banco (04:30, guarda 14 dias em $DADOS/data/backups)"
cat > /etc/cron.d/aetheria-backup <<EOF
30 4 * * * aetheria cd $DADOS && DB_PATH=$DADOS/aetheria.db /usr/bin/node $APP/tools/db-backup.mjs >/dev/null 2>&1 && find $DADOS/data/backups -name 'aetheria-*.db' -mtime +14 -delete
EOF

echo "== Atualização automática (autorizada pelo dono): confere o GitHub a cada 5 min; desligar com AUTO_UPDATE=0 em $ENVF"
install -m 755 "$APP/deploy/atualizar.sh" /usr/local/bin/aetheria-atualizar
cat > /etc/cron.d/aetheria-update <<EOF
*/5 * * * * root BRANCH=$BRANCH APP=$APP /usr/local/bin/aetheria-atualizar >> /var/log/aetheria-update.log 2>&1
EOF

sleep 2
if curl -fsS http://127.0.0.1:8080/healthz >/dev/null; then echo "Servidor do jogo: OK"; else echo "Servidor do jogo NÃO respondeu: veja  sudo journalctl -u aetheria -n 50"; fi
echo
echo "Pronto. Abra https://$DOMINIO (o certificado pode levar 1–2 minutos na primeira vez)."
echo "Logs: sudo journalctl -u aetheria -f    ·    O jogo se atualiza sozinho a cada 5 min (histórico: /var/log/aetheria-update.log)."
