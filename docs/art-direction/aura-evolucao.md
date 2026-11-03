# Aura de evolução (implementada)

Efeito de luz/partícula **procedural** (ambiente/efeito, não desenha o personagem). Código: `core/aura.js` (estilo, tier e código de rede, sem DOM) e `render/aura.js` (desenho).

- **Nível 15 (tier 1):** aura da especialização, forte e viva. **Nível 25 com Maestria (tier 2, `quests.done.maestria`):** versão discreta e refinada (fio fino, gemas orbitando, menos partículas, prata/branco quente).
- Estilos (por especialização; os ids novos mantêm os 8 códigos de rede na mesma ordem): Paladino dourado com azul-prata e anéis lentos · Berserker rubro com brasas · Arcano violeta-azulado com cristais e anel arcano · Bruxo verde-veneno com brasas subindo · Franco-atirador verde-água com anel de mira · Pistoleiro âmbar com faíscas de latão · Guardião branco-dourado com anel e halo · Inquisidor violeta-âmbar com runas.
- Ids antigos migram nos saves (`SPEC_ALIASES` em `data/specs.js`): bastion→paladin, executioner→berserker, pyromancer→arcane, cryomancer→warlock, marksman→sniper, hunter→gunslinger.
- Desenho: halo + anel (2 `drawImage`) + poucas partículas, de sprites pintados uma vez por `(spec, tier, qualidade)`. Qualidade baixa: só o halo; média: metade das partículas. Sem alocação por quadro.
- Online: a aura vai como 8º elemento da tupla do ator (`lookCode`: spec 1..8 + tier*16), só quando existe; formato antigo continua válido. Decodificada em `core/snapshot.js` (`look`) e aplicada em `main.js updateNet`.
- Custo medido (`tests/e2e/draw-cost.spec.js`, CPU headless, pessimista): diferença com aura em até 25 atores ≈ 0,2–0,4 ms por quadro, no ruído da medição; em GPU deve ser menor. Medir em celular real.

## Gancho do "design completo" (arte do dono, ainda não existe)
`heroLook(char|ator)` em `render/hero-sprites.js` devolve `{ tier: 0|1|2, spec, atlasVariant? }`. `atlasVariant` é sempre `undefined` hoje (`VARIANT_ATLASES` vazio). Quando o dono entregar os atlas de variante (8 heróis, ver `docs/roadmap/depende-do-dono.md` A8): registrar `'classe:spec:tier' -> id do atlas` em `VARIANT_ATLASES` e fazer `drawHeroSprite` carregar `atlasVariant` no lugar de `CLASS_TO_HERO[classId]`. A aura continua por cima (ou é reduzida, a critério do dono).
