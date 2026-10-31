# Testar o jogo no seu Android (passo a passo)
Status: **roteiro escrito, ainda não executado em aparelho** (não tenho um Android aqui). Se algo divergir, anote a tela/mensagem e me mande.

## Caminho A — o mais simples: USB + Chrome (sem domínio, sem túnel, sem pagar nada)
`localhost` conta como endereço seguro para o Chrome, então o PWA instala e o service worker funciona. O aparelho "enxerga" o localhost do seu PC por encaminhamento de portas.

1. **No celular:** Configurações → Sobre o telefone → toque 7× em "Número da versão" → volte e abra **Opções do desenvolvedor** → ligue **Depuração USB**.
2. Conecte o cabo USB e aceite "Permitir depuração USB" no celular.
3. **No PC**, abra o Chrome e vá em `chrome://inspect/#devices`. O celular deve aparecer (precisa do Chrome aberto no celular).
4. Clique em **Port forwarding…**, adicione `5174 → localhost:5174` (e, para jogar online: `5176 → localhost:5176` e `5175 → localhost:5175`). Marque "Enable port forwarding".
5. **No PC**, rode o jogo (e o servidor, se for testar online):
```bash
npm start
```
```bash
npm run server
```
6. **No Chrome do celular** abra `http://localhost:5174/` (offline) ou `http://localhost:5174/?api=http://localhost:5176` (online com conta).
7. Menu ⋮ → **Instalar app** / "Adicionar à tela inicial". Abra pelo ícone: deve ir em tela cheia e paisagem.
8. Teste offline: abra o jogo uma vez, ative o modo avião, abra de novo.

## Caminho B — mesma rede Wi‑Fi (só para jogar/medir; sem instalar como app)
1. PC e celular na mesma rede. Descubra o IP do PC (`ipconfig` → IPv4, ex.: 192.168.0.20) e libere a porta 5174 no firewall do Windows se pedir.
2. No celular: `http://192.168.0.20:5174/`. Funciona para jogar e medir FPS, mas **sem instalação do PWA** (o Chrome só instala em HTTPS ou localhost).
3. Online por Wi‑Fi exigiria liberar origens no servidor: `ALLOWED_ORIGINS=http://192.168.0.20:5174` e `HOST=0.0.0.0` (⚠ só em rede de confiança; sem TLS).

## Caminho C — APK de verdade (depois, com sua autorização)
Precisa de JDK 17+ e Android Studio/SDK (gratuitos; instalo só se você autorizar, conferindo origem). Com o domínio HTTPS pronto, o Bubblewrap gera o APK/AAB. Para instalar no seu aparelho não precisa de conta Play (`adb install`); a conta (US$ 25) só vale para publicar.

## O que medir e me trazer
- [ ] O jogo abre e a tela cheia/paisagem funciona; botões de toque e joystick respondem.
- [ ] **FPS**: no Chrome do PC, `chrome://inspect` → "inspect" no seu aparelho → aba Performance (ou me diga "fluido / engasga" em: vila, exploração com 8 monstros, PvP 4×4).
- [ ] Qualidade **Baixa / Média / Alta** em Opções: qual é o limite do seu aparelho? Modelo e RAM do celular.
- [ ] Notch/barra de gestos cobrindo botões? Quais?
- [ ] Reconexão: trocar Wi‑Fi ↔ 4G no meio de uma partida online.
- [ ] Quanto aquece/consome bateria em 10 min.

Com esses resultados decidimos se o Canvas 2D basta ou se vale a prova de conceito com PixiJS.
