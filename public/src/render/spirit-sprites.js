// Spirits pintados (arte gerada, recortada por tools/spirit-icons-from-images.py): forma 1 no jogo; a forma 2 (evoluída) já está em assets/icons/spirit/ mas ainda não tem mecânica.
// Sem a imagem, o desenho antigo por código (renderer.js › drawSpirit) segue valendo.
export const spiritUrl = (type, stage = 1) => `assets/icons/spirit/spirit-${type}${stage > 1 ? '-' + stage : ''}.webp`;
const imgs = new Map();
function img(type) {
  let i = imgs.get(type);
  if (!i) { i = new Image(); i.decoding = 'async'; i.onerror = () => { i.failed = true; }; i.src = spiritUrl(type); imgs.set(type, i); }
  return i;
}
export const preloadSpirits = () => { for (const t of ['ember', 'undine', 'terra', 'zephyr']) img(t); };

// Desenha o spirit `s` (companheiro flutuante) em (x, y); devolve false se a imagem ainda não está pronta.
export function drawSpiritSprite(g, s, y, t) {
  const i = img(s.spiritType);
  if (!i.complete || !i.naturalWidth || i.failed) return false;
  const H = 40, sway = Math.sin(t * 2 + s.id) * 0.06;
  g.save(); g.translate(s.x, y); g.rotate(sway); g.drawImage(i, -H / 2, -H * 0.62, H, H); g.restore();
  return true;
}
