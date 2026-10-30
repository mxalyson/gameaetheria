// RNG determinístico (mulberry32). Determinismo importa para o futuro servidor
// autoritativo e para gerar o mesmo mapa em todos os clientes.
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // entries: [[valor, peso], ...]
    weighted(entries) {
      const total = entries.reduce((s, e) => s + e[1], 0);
      let r = next() * total;
      for (const [v, w] of entries) if ((r -= w) < 0) return v;
      return entries[entries.length - 1][0];
    },
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
