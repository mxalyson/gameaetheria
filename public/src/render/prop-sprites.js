// Objetos do mundo PINTADOS (não por código): baú. Arte: assets/props/chest.webp (recorte da folha de itens; tools/chest-from-sheet.py).
// Só há arte de baú FECHADO: o saqueado é o mesmo sprite com a tampa recortada e erguida e o interior escuro (pré-calculado uma vez), sem brilho. Arte própria de baú aberto: pendência (docs/art-direction/prompts-cenario.md).
let img = null, used = null, loading = null;
function load() {
  if (loading) return;
  loading = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/props/chest.webp?v=1'; })
    .then(async (i) => {
      await i.decode?.();
      // baú saqueado (V20): mesma arte, mas a tampa é recortada e erguida (SPLIT = linha da emenda), com o interior escuro no vão; depois, tudo mais escuro
      const w = i.naturalWidth, h = i.naturalHeight, split = Math.round(h * 0.45), lift = Math.round(h * 0.13);
      const c = document.createElement('canvas'); c.width = w; c.height = h + lift;
      const g = c.getContext('2d');
      g.drawImage(i, 0, split, w, h - split, 0, split + lift, w, h - split); // corpo
      const gap = g.createLinearGradient(0, split, 0, split + lift + 6); gap.addColorStop(0, '#0c0806'); gap.addColorStop(1, '#2a1a10');
      g.fillStyle = gap; g.beginPath(); g.moveTo(w * 0.1, split + 2); g.lineTo(w * 0.9, split + 2); g.lineTo(w * 0.93, split + lift + 6); g.lineTo(w * 0.07, split + lift + 6); g.closePath(); g.fill(); // interior
      g.drawImage(i, 0, 0, w, split, 0, 0, w, split); // tampa erguida
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,26,40,0.42)'; g.fillRect(0, 0, c.width, c.height);
      img = i; used = c;
    }).catch(() => { img = null; });
}
export function prepareProps() { load(); }

// Desenha o baú `c` com a base em (c.x, c.y + 14); `ready` = ainda não aberto (com brilho dourado pulsando).
export function drawChestSprite(g, c, ready, t) {
  load();
  if (!img) return; // carregando: não desenha (o desenho antigo foi removido)
  const W = 46, H = W * img.naturalHeight / img.naturalWidth, bx = c.x, by = c.y + 14;
  g.fillStyle = 'rgba(30,40,40,0.25)'; g.beginPath(); g.ellipse(bx, by - 2, 22, 7, 0, 0, Math.PI * 2); g.fill();
  if (ready) {
    const k = 0.12 + 0.08 * Math.sin(t * 3 + c.x);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,214,120,${k})`; g.beginPath(); g.arc(bx, by - H * 0.45, 32, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
  }
  if (ready) g.drawImage(img, bx - W / 2, by - H, W, H);
  else { const k = W / used.width; g.drawImage(used, bx - W / 2, by - used.height * k, W, used.height * k); }
}
