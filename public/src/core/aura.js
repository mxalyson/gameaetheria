// Aura de evolução (lógica PURA, sem DOM): especialização (nv 15) -> tier 1; Maestria (nv 25) -> tier 2.
// O desenho fica em render/aura.js; aqui só ficam o estilo por (spec, tier), o tier de um ator/personagem e o código compacto do snapshot.
import { SPECS } from '../data/specs.js';

// Ordem FIXA (o código de rede depende dela): só acrescentar no fim.
// (códigos 1..8 mantidos ao trocar os ids: bastion->paladin, executioner->berserker, pyromancer->arcane, cryomancer->warlock, marksman->sniper, hunter->gunslinger.)
export const SPEC_ORDER = ['paladin', 'berserker', 'arcane', 'warlock', 'sniper', 'gunslinger', 'guardian', 'inquisitor'];

// kind = formato da partícula; ring = anéis lentos no chão; n = partículas no tier 1 (o tier 2, Maestria, usa ~1,6x e é maior/mais brilhante).
// c = cor principal; c2 = cor de realce; t2 = assinatura do tier 2 (Maestria): a MESMA família de cor, mais saturada e clara, e o conjunto todo mais forte que o tier 1.
// (c do tier 2 sempre difere da c do tier 1 e as 8 cores principais continuam distintas entre si.)
export const AURA_STYLES = {
  paladin:     { c: '#e0b84a', c2: '#bcd2ff', kind: 'spark',   ring: true,  n: 5, rise: 0.4, t2: { c: '#ffcf3a', c2: '#d6e6ff' } }, // ouro e azul-prata: escudo sagrado
  berserker:   { c: '#d8322a', c2: '#ff9a50', kind: 'ember',   ring: false, n: 6, rise: 1.0, t2: { c: '#ff3b2e', c2: '#ffc070' } },
  arcane:      { c: '#7f8bff', c2: '#e3dcff', kind: 'crystal', ring: true,  n: 5, rise: 0.6, t2: { c: '#8f9cff', c2: '#f2eeff' } }, // cristais violeta-azulados e anel arcano
  warlock:     { c: '#7fd44a', c2: '#d6ff9a', kind: 'ember',   ring: false, n: 7, rise: 0.8, t2: { c: '#8dff3f', c2: '#eaffb8' } }, // brasas verde-veneno subindo
  sniper:      { c: '#3fd3b0', c2: '#d4fff3', kind: 'spark',   ring: true,  n: 4, rise: 0.6, t2: { c: '#2dffd0', c2: '#e6fff9' } },
  gunslinger:  { c: '#ffae3d', c2: '#fff0b8', kind: 'spark',   ring: false, n: 6, rise: 0.9, t2: { c: '#ffb52b', c2: '#fff6cc' } }, // faíscas de latão: disparos rápidos
  guardian:    { c: '#fff1b8', c2: '#ffd36a', kind: 'spark',   ring: true,  n: 5, rise: 0.7, t2: { c: '#fff6c8', c2: '#ffe08a' } },
  inquisitor:  { c: '#b070ff', c2: '#ffe08a', kind: 'rune',    ring: true,  n: 5, rise: 0.6, t2: { c: '#bd6bff', c2: '#fff0b0' } },
};

// Tier de quem tem especialização válida: 0 sem aura, 1 especializado, 2 com Maestria. `o` é ator (spec/mastery) ou documento (spec/level/quests).
export function auraTier(o) {
  if (!o) return 0;
  const spec = o.quests !== undefined ? (o.level >= 15 && SPECS[o.classId]?.[o.spec] ? o.spec : null) : o.spec; // documento x ator
  if (!spec || !(spec in AURA_STYLES)) return 0;
  const mastery = o.mastery === true || o.quests?.done?.maestria != null;
  return mastery ? 2 : 1;
}
export const auraSpec = (o) => (o && o.quests !== undefined ? (o.level >= 15 && SPECS[o.classId]?.[o.spec] ? o.spec : null) : (o?.spec ?? null));

// Estilo resolvido (objetos congelados, calculados uma vez): sem alocar por quadro.
const resolved = new Map();
export function auraStyle(spec, tier) {
  const base = AURA_STYLES[spec];
  if (!base || !tier) return null;
  const key = spec + tier;
  let s = resolved.get(key);
  if (!s) {
    const t2 = tier === 2;
    s = Object.freeze({ spec, tier, kind: base.kind, ring: t2 ? true : base.ring, c: t2 ? base.t2.c : base.c, c2: t2 ? base.t2.c2 : base.c2,
      // Maestria: ~1,6x partículas, halo/anéis maiores e mais brilhantes, segundo anel em contra-rotação (ring2)
      n: t2 ? Math.ceil(base.n * 1.6) : base.n, rise: base.rise, alpha: t2 ? 1 : 0.9, scale: t2 ? 1.4 : 1.1, ring2: t2, big: t2 });
    resolved.set(key, s);
  }
  return s;
}

// Código compacto para o snapshot (0 = sem aura): 1..8 = spec, +16 por tier (16..: tier 1, 32..: tier 2). Cabe num inteiro pequeno.
export function lookCode(o) {
  const spec = auraSpec(o), tier = auraTier(o);
  if (!spec || !tier) return 0;
  return (SPEC_ORDER.indexOf(spec) + 1) | (tier << 4);
}
export function decodeLook(code) {
  const c = code | 0, i = (c & 15) - 1, tier = (c >> 4) & 3;
  if (i < 0 || i >= SPEC_ORDER.length || tier < 1 || tier > 2) return { spec: null, tier: 0 };
  return { spec: SPEC_ORDER[i], tier };
}
