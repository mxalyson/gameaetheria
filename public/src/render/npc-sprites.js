// NPCs pintados (fotos 3D de frente, recortadas por tools/npc-from-sheet.py → assets/npcs/<id>.webp + .json). NPC não anda: uma vista só, com respiração leve.
// Só com ?visual=original (ou falha ao carregar) vale o desenho antigo (renderer.js › NPC_LOOK); todo NPC do jogo tem arte pintada ou alias.
import { mobSpritesEnabled, tint } from './mob-sprites.js';

// NPCs que têm arte (evita pedir arquivos que não existem)
export const NPC_ART = new Set(['merchant', 'arena', 'sage', 'guard', 'herbalist', 'smith', 'master_warrior', 'master_mage', 'master_archer', 'master_cleric']);
// NPCs sem arte própria (Porto de Marfim) usam a arte pintada do papel parecido, com tinta leve para se distinguirem. Arte nova: docs/roadmap/pendencias.md.
export const NPC_ALIAS = {
  banker: { art: 'sage', tint: { hue: 38, sat: 1.1, bri: 1.05 } },     // mística de manto azul -> manto dourado (cofres)
  hunter: { art: 'guard', tint: { hue: -150, sat: 0.9, bri: 1 } },     // soldado -> caçadora de verde e couro
  dealer: { art: 'merchant', tint: { hue: -40, sat: 1, bri: 1 } },     // comerciante da vila, outro tom
  duelist: { art: 'arena', tint: { hue: 12, sat: 1.15, bri: 1 } },     // mestre da arena em rubro
  captain: { art: 'guard', tint: { hue: 40, sat: 1, bri: 1.05 } },     // soldado em azul-mar
};
export const npcArt = (id) => NPC_ALIAS[id]?.art ?? id;
const WORLD_PER_PX = 0.4; // altura no mundo = altura da imagem (px) × isto: mantém as proporções entre os NPCs
const items = new Map();
export const stats = { drawn: 0 };

function load(id) {
  let it = items.get(id);
  if (it) return it;
  it = { state: 'loading', img: null, meta: null }; items.set(id, it);
  const al = NPC_ALIAS[id], art = al?.art ?? id;
  (async () => {
    try {
      const meta = await fetch(`assets/npcs/${art}.json`).then((r) => r.json());
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `assets/npcs/${art}.webp?v=${meta.v ?? 0}`; });
      if (img.naturalWidth !== meta.w || img.naturalHeight !== meta.h) { it.state = 'none'; return; }
      await img.decode?.(); it.meta = meta; it.img = al?.tint ? await tint(img, al.tint) : img; it.state = 'ready';
    } catch { it.state = 'none'; }
  })();
  return it;
}
export const preloadNpcs = () => { if (mobSpritesEnabled()) { for (const id of NPC_ART) load(id); for (const id in NPC_ALIAS) load(id); } };

// Y (relativo aos pés do NPC) do topo do sprite pronto; null se ainda não há arte (o nome e a marca usam o ponto antigo).
export function npcTop(id) { const it = items.get(id); return it?.state === 'ready' ? 14 - it.meta.ay * WORLD_PER_PX : null; }

// Desenha o NPC `o` (com x, y nos pés); devolve false se não há arte pronta.
export function drawNpcSprite(g, o, t) {
  if (!mobSpritesEnabled() || !(NPC_ART.has(o.id) || NPC_ALIAS[o.id])) return false;
  const it = load(o.id);
  if (it.state === 'loading') return true; // carregando: não desenha (senão o herói recolorido piscava antes do NPC pintado)
  if (it.state !== 'ready') return false;
  const { meta, img } = it, H = meta.h * WORLD_PER_PX, W = meta.w * WORLD_PER_PX;
  const br = 1 + Math.sin(t * 1.7 + o.x * 0.013) * 0.012; // respiração: estica 1,2% a partir dos pés
  g.save(); g.translate(o.x, o.y + 14); g.scale(1 / br, br);
  g.drawImage(img, -meta.ax * WORLD_PER_PX, -meta.ay * WORLD_PER_PX, W, H); g.restore(); stats.drawn++;
  return true;
}
