// NPCs pintados (fotos 3D de frente, recortadas por tools/npc-from-sheet.py → assets/npcs/<id>.webp + .json). NPC não anda: uma vista só, com respiração leve.
// Sem arte do NPC (ex.: a herbalista ainda não tem) ou com ?visual=original vale o herói em miniatura recolorido (renderer.js › NPC_LOOK).
import { mobSpritesEnabled } from './mob-sprites.js';

// NPCs que têm arte (evita pedir arquivos que não existem)
export const NPC_ART = new Set(['merchant', 'arena', 'sage', 'guard', 'herbalist', 'smith']);
const WORLD_PER_PX = 0.4; // altura no mundo = altura da imagem (px) × isto: mantém as proporções entre os NPCs
const items = new Map();
export const stats = { drawn: 0 };

function load(id) {
  let it = items.get(id);
  if (it) return it;
  it = { state: 'loading', img: null, meta: null }; items.set(id, it);
  (async () => {
    try {
      const meta = await fetch(`assets/npcs/${id}.json`).then((r) => r.json());
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `assets/npcs/${id}.webp?v=${meta.v ?? 0}`; });
      if (img.naturalWidth !== meta.w || img.naturalHeight !== meta.h) { it.state = 'none'; return; }
      await img.decode?.(); it.meta = meta; it.img = img; it.state = 'ready';
    } catch { it.state = 'none'; }
  })();
  return it;
}
export const preloadNpcs = () => { if (mobSpritesEnabled()) for (const id of NPC_ART) load(id); };

// Y (relativo aos pés do NPC) do topo do sprite pronto; null se ainda não há arte (o nome e a marca usam o ponto antigo).
export function npcTop(id) { const it = items.get(id); return it?.state === 'ready' ? 14 - it.meta.ay * WORLD_PER_PX : null; }

// Desenha o NPC `o` (com x, y nos pés); devolve false se não há arte pronta.
export function drawNpcSprite(g, o, t) {
  if (!mobSpritesEnabled() || !NPC_ART.has(o.id)) return false;
  const it = load(o.id);
  if (it.state === 'loading') return true; // carregando: não desenha (senão o herói recolorido piscava antes do NPC pintado)
  if (it.state !== 'ready') return false;
  const { meta, img } = it, H = meta.h * WORLD_PER_PX, W = meta.w * WORLD_PER_PX;
  const br = 1 + Math.sin(t * 1.7 + o.x * 0.013) * 0.012; // respiração: estica 1,2% a partir dos pés
  g.save(); g.translate(o.x, o.y + 14); g.scale(1 / br, br);
  g.drawImage(img, -meta.ax * WORLD_PER_PX, -meta.ay * WORLD_PER_PX, W, H); g.restore(); stats.drawn++;
  return true;
}
