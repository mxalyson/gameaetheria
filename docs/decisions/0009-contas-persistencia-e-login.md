# 0009 — Contas, persistência online e login (P5)
Data: 2026-10-31 · Status: **aprovado pelo proprietário** (conta **obrigatória**; login por **e-mail e Google**). Implementado e testado em ambiente local; **não publicado**.

## Decisões
| Tema | Decisão | Por quê / alternativas |
|---|---|---|
| Banco | **SQLite embutido do Node (`node:sqlite`)**, só em `server/db.js` | zero dependência nova; arquivo único com backup (`npm run db:backup`, `VACUUM INTO`). Risco: o módulo é **experimental** no Node 24 (pode mudar). Mitigação: toda a persistência passa por `server/db.js` — trocar por PostgreSQL é mudar esse arquivo. |
| Senhas | **scrypt** (N=16384, r=8, p=1), sal de 16 bytes por usuário, comparação com `timingSafeEqual`; política: 8–128 caracteres, sem lista de senhas fracas, sem o e-mail dentro | `crypto` nativo, sem dependência |
| Sessão | token aleatório de 256 bits em `Authorization: Bearer`; **só o SHA-256 vai ao banco**; validade de 14 dias; logout e troca de senha encerram | sem cookies ⇒ sem CSRF |
| Recuperação | **8 códigos de uso único** mostrados uma vez no cadastro (guardados como hash) | não há infraestrutura de e-mail; redefinir senha encerra todas as sessões e gera códigos novos |
| Bloqueio | 5 falhas ⇒ conta bloqueada 15 min; 10 tentativas/min por IP nas rotas de login/cadastro; erro idêntico para e-mail inexistente e senha errada (+ hash falso para igualar o tempo) | |
| Google | o navegador obtém um **ID token** (Google Identity Services); o **servidor** o verifica: assinatura RS256 contra as chaves públicas do Google (JWKS), emissor, **público = nosso client id**, validade, `email_verified`; recusa `alg: none`/HS256. Vincula por e-mail verificado ou cria a conta | o *client id* é público por natureza; nada secreto no frontend. **Ligado só se `GOOGLE_CLIENT_ID` estiver configurado** |
| Personagens | até 3 por conta (era 4; mudado pelo dono em 2026-11-04); nome único (sem diferenciar maiúsculas); documento versionado (v2) no banco; **revisão otimista** (`rev`) contra gravações concorrentes | |
| Fonte oficial | com API ligada, o personagem **não fica no `localStorage`**; o servidor cria o personagem inicial e decide recompensas de partida (idempotentes por `matchId`+personagem) | |
| Conta obrigatória | o jogo **só exige login quando há URL de API** (`?api=` ou `API_DEFAULT` em `public/src/online.js`). Sem API (GitHub Pages hoje), continua offline | o site estático não tem servidor; exigir login sem servidor o deixaria **inutilizável**. Quando houver servidor publicado, basta preencher `API_DEFAULT` |

## Limites honestos (leia antes de confiar)
1. **O progresso de PvE (XP, loot, ouro) ainda é calculado no cliente** e enviado ao servidor. O servidor aplica **limites de plausibilidade** (`server/plausible.js`: saltos de nível, ouro, itens, spirits) e **recusa** o que passa deles, mas um jogador pode ganhar progresso "dentro dos limites" sem jogar. PvE autoritativo no servidor é trabalho de P6/P8.
2. **Já são do servidor:** rating, vitórias e derrotas (a nuvem os ignora e restaura) e as recompensas das partidas reais (WebSocket).
3. A arena **contra bots no cliente** não altera rating oficial online.
4. **Sem e-mail** ⇒ sem confirmação de e-mail nem "esqueci a senha" por link: só os códigos de recuperação (perder senha **e** códigos = perder o acesso).
5. **HTTPS/WSS** não estão no processo: exigem proxy com TLS na implantação. Sem isso, senha e sessão viajam em claro.
6. Login Google **testado com tokens assinados por uma chave de teste** (o caminho de verificação é real); **não** foi testado com o Google de verdade (exige um *client id* criado no Google Cloud pelo proprietário).
7. Sem limitação por conta na criação em massa de contas (apenas por IP) e sem CAPTCHA.

## Como ligar
```bash
npm run server        # API http://127.0.0.1:5176 + jogo ws://127.0.0.1:5175 + banco data/aetheria.db
npm start             # site em http://localhost:5174
# abrir: http://localhost:5174/?api=http://127.0.0.1:5176
```
Variáveis: `DB_PATH`, `API_PORT`, `GAME_PORT`, `HOST`, `ALLOWED_ORIGINS`, `GOOGLE_CLIENT_ID`, `TRUST_PROXY`. Backup: `npm run db:backup`.
