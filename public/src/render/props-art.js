// Objetos de cenário PINTADOS (fotografados de modelos 3D do Meshy por `tools/mob-bake.mjs --props`; atlas em assets/props/<id>.webp + .json):
// portões, pilares, sarcófagos e piso da Cripta dos Ecos; botes e veleiros do Porto. O atlas é uma linha de vistas (json.views); só carrega o que a zona pede.
// Sem imagem carregada, as funções devolvem false e o desenho antigo (renderer/scenery) segue valendo. Nada aqui aloca por quadro.
import { ASSET_V } from '../assets-version.js';
const P = new Map(), asked = new Set();
let crypt = null; // estado da masmorra (tupla do servidor) do quadro atual: { room: 1.., phase }

export function loadProps(ids) {
  for (const id of ids) {
    if (asked.has(id)) continue; asked.add(id);
    fetch(`assets/props/${id}.json?v=${ASSET_V}`).then((r) => r.json()).then((m) => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res({ img: i, m }); i.onerror = rej; i.src = `assets/props/${id}.webp?v=${ASSET_V}`;
    })).then((o) => { P.set(id, o); }).catch(() => { asked.delete(id); });
  }
}
export const propReady = (id) => P.has(id);
export const propImage = (id) => P.get(id) ?? null; // { img, m }: para carimbos no terreno (scenery.js)

// vista `view` (índice na linha do atlas) com a âncora do chão em (x,y), escala s; `flip` espelha na horizontal
function sprite(g, id, view, x, y, s, flip = false) {
  const p = P.get(id); if (!p) return false;
  const m = p.m, cw = m.cell[0], ch = m.cell[1], w = cw * s, h = ch * s;
  if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(p.img, view * cw, 0, cw, ch, -(cw - m.ax) * s, y - m.ay * s, w, h); g.restore(); }
  else g.drawImage(p.img, view * cw, 0, cw, ch, x - m.ax * s, y - m.ay * s, w, h);
  return true;
}

export const setCryptState = (c) => { crypt = c; };
// Portão `gi` (muro gi da Cripta) aberto? Pelo estado da sala (servidor: sala já limpa ou fase de avanço) ou porque o herói já passou do muro.
export function gateOpen(d, player) {
  if (player && player.x > d.x + 40) return true;
  if (!crypt) return false;
  const r = crypt.room - 1; // sala atual (0..3)
  return r > d.gi || (r === d.gi && crypt.phase === 3);
}
// Fechado, o portão ordena pela base (barra o herói); aberto, ordena pelo topo da porta: quem atravessa passa NA FRENTE do portal escuro.
export const gateSortY = (d, player) => (gateOpen(d, player) ? d.yo : d.y);

export function drawCryptGate(g, d, player) {
  return sprite(g, gateOpen(d, player) ? 'crypt_part4' : 'crypt_part0', 0, d.x, d.y, 1);
}
export function drawCryptPillar(g, d) { return sprite(g, 'crypt_part5', (d.y * 0.0128 | 0) & 1, d.x, d.y, d.ps ?? 0.5); }
export function drawCryptSarcophagus(g, d) { return sprite(g, 'crypt_part3', 0, d.x, d.y, 0.88, d.v > 0.5); }
// Barco: leve balanço (1–2 px) por seno; `d.view` 0..2 escolhe a direção, `d.art` 0 = bote, 1 = veleiro
export function drawHarborBoat(g, d, t) {
  const k = t * 1.3 + d.v * 6.28;
  return sprite(g, d.art ? 'harbor_boat1' : 'harbor_boat0', d.view, d.x + Math.sin(k * 0.7) * 0.8, d.y + Math.sin(k) * 1.4, d.art ? 0.66 : 0.72);
}
// Caixote/barris do Porto: `d.art` 0 = pilha de barris, 1..4 = caixotes; `d.view` 0..1
export function drawHarborCrate(g, d) { return sprite(g, 'harbor_crate' + d.art, d.view, d.x, d.y, d.art ? 0.5 : 0.55); }
// sombras (true = tratado); barco flutua: sem sombra
export function propShadow(g, o) {
  switch (o.type) {
    case 'cgate': return true;
    case 'cboat': return true;
    case 'cprop': g.beginPath(); g.ellipse(o.x + 3, o.y - 3, o.art ? 17 : 26, o.art ? 6 : 9, 0, 0, 6.2832); g.fill(); return true;
    case 'csarco': g.beginPath(); g.ellipse(o.x + 4, o.y - 4, 62, 16, 0, 0, 6.2832); g.fill(); return true;
    default: return false;
  }
}
