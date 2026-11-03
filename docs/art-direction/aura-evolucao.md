# Aura de evolução (implementada)

Efeito de luz/partícula **procedural** (ambiente/efeito, não desenha o personagem). Código: `core/aura.js` (estilo, tier e código de rede, sem DOM) e `render/aura.js` (desenho).

- **Nível 15 (tier 1):** aura da especialização, forte e viva. **Nível 25 com Maestria (tier 2, `quests.done.maestria`):** versão discreta e refinada (fio fino, gemas orbitando, menos partículas, prata/branco quente).
- Estilos (por especialização; os ids novos mantêm os 8 códigos de rede na mesma ordem): Paladino dourado com azul-prata e anéis lentos · Berserker rubro com brasas · Arcano violeta-azulado com cristais e anel arcano · Bruxo verde-veneno com brasas subindo · Franco-atirador verde-água com anel de mira · Pistoleiro âmbar com faíscas de latão · Guardião branco-dourado com anel e halo · Inquisidor violeta-âmbar com runas.
- Ids antigos migram nos saves (`SPEC_ALIASES` em `data/specs.js`): bastion→paladin, executioner→berserker, pyromancer→arcane, cryomancer→warlock, marksman→sniper, hunter→gunslinger.
- Desenho: halo + anel (2 `drawImage`) + poucas partículas, de sprites pintados uma vez por `(spec, tier, qualidade)`. Qualidade baixa: só o halo; média: metade das partículas. Sem alocação por quadro.
- Online: a aura vai como 8º elemento da tupla do ator (`lookCode`: spec 1..8 + tier*16), só quando existe; formato antigo continua válido. Decodificada em `core/snapshot.js` (`look`) e aplicada em `main.js updateNet`.
- Custo medido (`tests/e2e/draw-cost.spec.js`, CPU headless, pessimista): diferença com aura em até 25 atores ≈ 0,2–0,4 ms por quadro, no ruído da medição; em GPU deve ser menor. Medir em celular real.

## Atlas de variante (Paladino Maestria, implementado)
`heroLook(char|ator)` em `render/hero-sprites.js` devolve `{ tier, spec, atlasVariant? }`. `VARIANT_ATLASES` tem `'warrior:paladin:2' -> 'paladin_sun'` (GLB "Chibi Sun Knight" do dono, Nv 25): `drawHeroSprite` usa esse atlas no lugar do da classe só para ator com `spec` e tier 2; carrega sob demanda (`preloadHero` aceita o personagem e já o carrega na entrada), enquanto carrega ou se falhar desenha o atlas base (nunca some). Online: o `lookCode` (spec+tier) já basta para os outros verem o mesmo visual. A aura do tier 2 continua por cima. `meta.sizeMul` (1,1) iguala a altura na tela ao herói base.
Gerar de novo: `public/labs/iso-poc/art-local/paladin_sun.glb` -> `blender -b --python tools/blender/rig_animate.py -- <glb> art-local/blender/spec/paladin_sun.json art-local/rigged/paladin_sun.glb` (spec em `tools/blender/specs.json`; espada e escudo rígidos, capa rígida atrás) -> `RIG=1 BRI=1.28 SAT=1.1 SIZEMUL=1.1 node tools/bake-atlas.mjs paladin_sun 160 0` (com `npm start`). `BRI`/`SAT` clareiam o GLB, que sai mais escuro que a arte.
Para os outros 7 heróis de evolução (`docs/roadmap/depende-do-dono.md` A8): mesmo caminho, registrar `'classe:spec:tier' -> id` em `VARIANT_ATLASES` e acrescentar o id em `tools/texture-budget.mjs`.
