// Objetos do mundo PINTADOS (não por código): baú. Arte: assets/props/chest.webp (recorte da folha de itens; tools/chest-from-sheet.py).
// Só há arte de baú FECHADO: o baú já saqueado é o mesmo sprite escurecido (pré-calculado uma vez), sem brilho. Falta arte de baú aberto (docs/roadmap/pendencias.md).
let img = null, used = null, loading = null;
function load() {
  if (loading) return;
  loading = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/props/chest.webp?v=1'; })
    .then(async (i) => {
      await i.decode?.();
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,26,40,0.5)'; g.fillRect(0, 0, c.width, c.height); // saqueado: mais escuro e sem vida
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
  g.drawImage(ready ? img : used, bx - W / 2, by - H, W, H);
}
