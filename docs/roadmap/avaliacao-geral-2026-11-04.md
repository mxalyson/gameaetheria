# Avaliação geral do Aetheria (2026-11-04)
Base: leitura da documentação (`docs/**`, decisões 0001–0017, auditorias de história, jogabilidade e bugs, pendências), do código e **capturas do jogo real** em celular emulado (844×390, toque): título, criação, Vila, combate no Bosque com habilidade, painel Personagem, Diário e chat. Duelos medidos com `npm run balance`; chefes com `tools/boss-check.mjs`. **Não jogado em celular real.**
Comparação principal: **Ragnarok M: Eternal Love** (RPG de celular com personagens chibi/anime, classes com "troca de classe" no meio do jogo, mascotes, arena PvP, grupos, guildas e chat). Referência visual citada pelo dono: Summoners War (retratos e miniaturas).

## Nota por área (0–10, para orientar prioridade, não é nota de mercado)
| Área | Nota | Ponto forte | Falta / problema |
|---|---|---|---|
| História e mundo | 6 | Arco fechado do Nv 1 ao 30 (Ren → 3 chefes → Cripta → Porto), cânone escrito, NPCs com falas condicionais | Contada só por caixas de texto e avisos; nenhuma cena (chefe chega sem apresentação); o jogador não sabe onde fica a Praça dos Mestres; Místico é só promessa |
| Combate e habilidades | 7 | 4 classes × 2 especializações × 4 habilidades, chefes em 3 fases com avisos no chão, bloqueio, marca, queimadura, mira automática no toque | Ciclos de pares no PvP (Mago × Arqueiro no Nv10: 7%); só o atordoamento tem desenho de status (lentidão, queimadura e cura em aliados não aparecem); sem esquiva visível |
| Animação e arte | 6 | Heróis em miniatura com andar/golpe/habilidade/dano/morte; efeito próprio por habilidade (o Golpe Giratório ficou bonito); interface pintada coerente | **Sem som**; sem pausa de impacto e quase sem tremor de tela (golpe "sem peso"); chão do Bosque repetitivo; NPCs do Porto e o Soberano são recolorações |
| Progressão e economia | 7 | Curva longa até o 30, pity de raridade, ferreiro +8, contratos, banco, diários | Calibração real precisa de jogadores; arena não dá XP (decisão do dono) e pode parecer pouco recompensadora |
| Social e online | 6 (era 4) | Contas, 3 personagens, grupos, PvP 1×1/2×2/4×4, cooperativo e Cripta no servidor; **chat global e de grupo (novo)** | Sem lista de amigos, guilda, sussurro (mensagem privada), denúncia/moderação, ranking visível |
| Celular (UX) | 7 | Toque padrão, botões ≥ 44 px, escala automática, PWA instalável | Aviso de conquista cobre o centro do combate; faixa de boas-vindas cobre o herói; nomes de NPC encostam nos botões de habilidade |
| Técnica | 8 | Servidor autoritativo, 560+ testes, snapshots por delta, publicação em porta única com Docker testado | SQLite = 1 processo (até ~150–250 jogadores); sem monitoramento/alertas |

## Comparando com Ragnarok M
| | Ragnarok M | Aetheria hoje | O que copiar (a ideia, não o conteúdo) |
|---|---|---|---|
| Sensação de golpe | som em cada golpe e habilidade, número de dano saltando (pausa de impacto e tremor são comuns no gênero; não conferi no RO M) | número de dano existe; nada de som, pausa ou vibração | **Áudio + pausa de impacto + vibração no celular** (maior ganho por esforço) |
| Troca de classe | evento marcado, roupa nova, cena | especialização no Nv15 com visual e aura (bom) | um momento de "cerimônia" (tela cheia de 3 s com o retrato e o nome do estilo) |
| Mascotes | pet com afeição e habilidades | spirits que lutam, buscam itens e evoluem (bom) | interação simples (tocar no spirit → reação), mostrar o spirit no retrato |
| Social | chat por canais, amigos, guildas, sussurro, emotes | chat global/grupo (novo), grupos | **amigos + sussurro + emotes rápidos** (frases prontas: "Vem!", "Obrigado") — no celular digitar é ruim |
| Conteúdo diário | missões diárias, eventos com hora marcada | diários do Porto, chefe por ritual | evento global agendado (ex.: chefe mundial às 20h na Vila) — usa o chat para anunciar |
| Narrativa | cenas curtas com retratos e falas | caixas de texto | **apresentação de chefe** (câmera vai até ele, nome grande, 1 fala) |

## Melhorias, em ordem de prioridade
### Posso fazer já (sem arte nova)
1. **Sensação de combate**: pausa de impacto de 40–60 ms no crítico e na morte de elite/chefe, tremor leve no crítico (com opção "reduzir movimento"), vibração curta no celular ao levar dano forte. Só render/cliente; a simulação não muda.
2. **Avisos fora do centro**: mover "Conquista!" e "Bem-vindo" para o topo, menores, sem cobrir o herói nem o combate (vi isso nas capturas).
3. **Desenho dos status**: lentidão (cristais nos pés), queimadura (brasas), marca (selo sobre a cabeça), cura em aliado (anel verde). A pendência 13 já lista; o evento `status` já existe.
4. **Apresentação de chefe**: no evento `boss_warn` "arrive", 1,5 s de câmera no chefe com o nome em destaque e uma fala do cânone.
5. **Chat**: frases rápidas (emotes de texto) em 1 toque, sussurro para um jogador, denúncia e lista de silenciados no menu Opções; filtro simples de palavrões.
6. **Mensagem de onde fica a Praça dos Mestres** e aviso na 1ª queda sem Amuleto/Pedra (já anotados na auditoria de história).
7. **Ciclos do PvP**: Mago × Arqueiro no Nv10 é o pior par; mexer no Teleporte/Nova de Gelo (é decisão de kit: pedir aprovação).

### Depende do dono
- **Áudio** (o maior buraco): música da Vila/zona/chefe e efeitos por classe. Precisa de arquivos com licença livre (ex.: bibliotecas CC0) ou trilha própria; eu integro (WebAudio, volume nas Opções, sem tocar até o primeiro toque, como o navegador exige).
- Arte já listada em `depende-do-dono.md` (NPCs do Porto, Soberano, Místico, ícone de chat no estilo do menu — hoje é um balão em SVG).
- Publicar: criar a conta da Oracle e o domínio DuckDNS (`docs/deploy/publicar-gratis.md`).
- Decisões de design: amigos/guilda, evento mundial, regras de moderação do chat.
