# Publicar o Aetheria de graça (contas, até 3 personagens, multiplayer e chat)

Atualizado em 2026-11-04. Um endereço só serve tudo: o jogo, o login, os personagens salvos no servidor, o multiplayer e o chat
(modo de porta única: `server/start.js` com `PORT`). O site do GitHub Pages continua existindo como versão **offline** (sem conta).

## Qual serviço grátis usar
| Opção | Custo | Fica ligado 24 h | Banco (contas) persiste | Observação |
|---|---|---|---|---|
| **A. Oracle Cloud Always Free (VM)** — recomendada | grátis (pede cartão só para verificar) | sim | sim (disco da VM) | Mais passos na 1ª vez; depois é um comando. A Oracle pode recuperar VM parada/ociosa: mantenha o backup fora dela. |
| B. Seu próprio PC + túnel grátis da Cloudflare | grátis, sem cadastro | só com o PC ligado | sim (no PC) | Bom para testar com amigos hoje. Endereço muda a cada vez. |
| Render / Koyeb / Fly.io grátis | — | dorme / some | **não** (disco apagado ao reiniciar) ou pago | **Não use para contas**: Render grátis dorme após 15 min e não tem disco persistente; Fly.io acabou com o plano grátis; Koyeb grátis pede cartão e não garante disco. |

Fontes (2026, conferir na página oficial de cada um antes de decidir): [Render — free tier](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), [comparação de planos grátis](https://snapdeploy.dev/blog/free-cloud-deployment-platforms-2026-comparison), [Oracle Always Free 2026](https://space-node.net/blog/oracle-cloud-free-vps-guide-2026) (há relatos de que contas novas recebem 2 OCPU/12 GB ARM em vez de 4/24 — sobra para o jogo).

---

## Opção A — Oracle Cloud Always Free (passo a passo)
**O que foi testado aqui:** o script `deploy/instalar-vm.sh` rodou completo num Ubuntu 24.04 limpo (Node 24, Caddy, configuração válida, firewall, serviço respondendo, backup, e rodar de novo para atualizar); a imagem Docker também foi construída e rodada. **Não testado:** a conta Oracle, o DuckDNS e o certificado HTTPS de verdade (precisam do seu cadastro).

1. **Conta:** crie em https://www.oracle.com/cloud/free/ . Escolha a região mais perto (ex.: *Brazil East — São Paulo*); ela não muda depois. O cartão é só verificação (o Always Free não cobra).
2. **VM:** Menu → *Compute* → *Instances* → *Create instance*.
   - *Image*: **Canonical Ubuntu 24.04**.
   - *Shape*: **VM.Standard.A1.Flex** com 1 OCPU e 6 GB (ARM, Always Free). Se disser "out of capacity", tente outro *Availability Domain* ou mais tarde; ou use **VM.Standard.E2.1.Micro** (x86, 1 GB — também roda).
   - *Networking*: deixe "Assign a public IPv4 address" marcado.
   - *SSH keys*: "Generate a key pair for me" → **baixe a chave privada** (guarde; sem ela não entra).
   - Crie e anote o **IP público**.
3. **Abrir as portas 80 e 443 no painel da Oracle:** na página da instância → *Subnet* → *Security Lists* → a lista padrão → *Add Ingress Rules*: Source `0.0.0.0/0`, IP Protocol `TCP`, Destination Port `80,443`. (O script abre o firewall de dentro da VM; este passo é o de fora.)
4. **Domínio grátis (DuckDNS):** entre em https://www.duckdns.org com sua conta Google/GitHub, crie um nome (ex.: `aetheria-lumen`) e coloque o **IP público** da VM. Seu endereço será `aetheria-lumen.duckdns.org`.
5. **Instalar** (no seu PC, terminal/PowerShell, na pasta onde está a chave):
   ```bash
   ssh -i ssh-key-2026-11-04.key ubuntu@SEU_IP
   ```
   e, já dentro da VM:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/mxalyson/gameaetheria/main/deploy/instalar-vm.sh -o instalar-vm.sh
   ```
   ```bash
   sudo bash instalar-vm.sh aetheria-lumen.duckdns.org
   ```
   Leva 2–4 minutos. No fim aparece "Servidor do jogo: OK".
6. **Jogar:** abra `https://aetheria-lumen.duckdns.org` no celular (paisagem). O jogo pede **criar conta (e-mail e senha)**; cada conta cria **até 3 personagens**, salvos no servidor; o botão de balão no menu abre o **chat** (Global e Grupo). O certificado HTTPS pode levar 1–2 min na primeira vez.

### Depois de publicado
- **Atualizar o jogo** (depois de um `git push` no `main`): entre na VM e rode de novo `sudo bash instalar-vm.sh aetheria-lumen.duckdns.org`. Contas, personagens e configuração ficam.
- **Ver o que está acontecendo:** `sudo journalctl -u aetheria -f` (logs em JSON) · saúde: `curl http://127.0.0.1:8080/healthz`.
- **Backup:** automático todo dia às 04:30 em `/var/lib/aetheria/data/backups` (guarda 14 dias). **Copie para fora da VM** de vez em quando (no seu PC):
  ```bash
  scp -i ssh-key-2026-11-04.key "ubuntu@SEU_IP:/var/lib/aetheria/data/backups/*.db" .
  ```
  (os arquivos são do usuário `aetheria`; se o `scp` negar, na VM: `sudo cp /var/lib/aetheria/data/backups/*.db /home/ubuntu/ && sudo chown ubuntu /home/ubuntu/*.db`.)
- **Restaurar:** `sudo systemctl stop aetheria`, depois `cd /opt/aetheria && sudo -u aetheria env DB_PATH=/var/lib/aetheria/aetheria.db node tools/db-restore.mjs <arquivo.db>` e `sudo systemctl start aetheria`.
- **Login com Google (opcional):** crie um Client ID OAuth "Web" no Google Cloud com a origem `https://aetheria-lumen.duckdns.org`, ponha `GOOGLE_CLIENT_ID=...` em `/etc/aetheria.env` e `sudo systemctl restart aetheria`.
- **Configurações** ficam em `/etc/aetheria.env` (`PUBLIC_URL`, `DB_PATH`, `LOG_LEVEL`…; lista completa em `docs/architecture/infra.md`).

### Com Docker (alternativa)
Na VM com Docker instalado: crie `.env` com `DOMINIO=aetheria-lumen.duckdns.org` e rode `docker compose up -d --build` (jogo + Caddy com HTTPS). Se o Docker Hub recusar por limite (erro 429): `docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:24-slim .`

---

## Opção B0 — o seu PC como servidor, na rede de casa (mais simples; **testado aqui**)
Na pasta do jogo, no seu PC: `npm install` (só na 1ª vez) e depois `npm run online`. Ele mostra dois endereços:
- `http://localhost:8080` — para jogar no próprio PC;
- `http://192.168.x.x:8080` — para celulares e outros PCs **no mesmo Wi-Fi** (o Windows pode perguntar se libera o Node no firewall: marque "Redes privadas").
Contas, até 3 personagens, multiplayer e chat funcionam (testado com login, entrada no mundo e conexão de partidas por `http` na rede local). Sem cadeado (HTTPS) dentro de casa: aceitável na sua rede, **não** exponha assim na internet. O jogo não instala como app (PWA) sem HTTPS, mas roda no navegador. O banco fica em `data/aetheria.db`; o PC precisa ficar ligado com o terminal aberto.

## Opção B — amigos fora de casa a partir do seu PC (túnel grátis com HTTPS; o túnel em si **não testado aqui**)
1. Instale o `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Num terminal: `cloudflared tunnel --url http://localhost:8080` → ele mostra um endereço `https://algo-aleatorio.trycloudflare.com`.
3. Em outro terminal, na pasta do jogo (PowerShell):
   ```bash
   $env:PUBLIC_URL="https://algo-aleatorio.trycloudflare.com"; npm run online
   ```
4. Mande o endereço `https://…trycloudflare.com` para os amigos. Funciona enquanto os dois terminais estiverem abertos; o banco fica em `data/aetheria.db` no seu PC. O endereço muda a cada vez que o túnel reinicia (então repita o passo 3 com o novo `PUBLIC_URL`).

## Segurança (vale para as duas opções)
- Só publique com **HTTPS** (o Caddy e o túnel fazem isso): senhas e sessões nunca andam sem criptografia. O servidor avisa no log se `PUBLIC_URL` não for `https://`.
- Senhas guardadas com scrypt; limite de tentativas de login por IP e por conta; códigos de recuperação de uso único (mostrados no cadastro).
- Chat: até 140 caracteres, sem caracteres invisíveis, 1 mensagem a cada 1,2 s e no máximo 5 em 10 s, sem repetir; o jogador pode **silenciar** outro tocando no nome. As mensagens não são gravadas no banco (somem ao reiniciar). **Pendente:** filtro de palavrões, denúncia e moderação por administrador.
