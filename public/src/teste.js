// Modo TESTE (sandbox): ?teste=paladino | paladino-base | berserker | arcano | bruxo | franco | pistoleiro | guardiao | inquisidor
// Cria um personagem descartável nível 25 só em memória: NADA vai ao localStorage (save.js vira no-op com window.TESTE),
// não usa login nem mexe no personagem real do aparelho. Sem ?teste= este módulo não faz nada.
import { newCharacter } from './core/progression.js';
import { generateItem } from './core/loot.js';
import { makeRng } from './core/rng.js';
import { SPECS } from './data/specs.js';

// kind -> [classe, spec]; spec null = herói base da classe (sem aura nem atlas de evolução)
export const TESTE_KINDS = {
  paladino: ['warrior', 'paladin'], 'paladino-base': ['warrior', null], guerreiro: ['warrior', null], 'mago-base': ['mage', null], 'arqueiro-base': ['archer', null], 'clerigo-base': ['cleric', null], berserker: ['warrior', 'berserker'],
  arcano: ['mage', 'arcane'], bruxo: ['mage', 'warlock'], franco: ['archer', 'sniper'], pistoleiro: ['archer', 'gunslinger'],
  guardiao: ['cleric', 'guardian'], inquisidor: ['cleric', 'inquisitor'],
};

// Lê ?teste= (string de busca). Retorna o kind válido ou null.
export function parseTeste(search) {
  const k = new URLSearchParams(search || '').get('teste');
  return k && Object.hasOwn(TESTE_KINDS, k.toLowerCase()) ? k.toLowerCase() : null;
}

// Personagem de teste: Nv 25, Maestria concluída, escudo lendário (se a classe usa), poções e ouro. RNG fixo = sempre o mesmo item.
export function buildTesteChar(kind) {
  const [classId, spec] = TESTE_KINDS[kind];
  const rng = makeRng(2525);
  const c = newCharacter(`Teste ${kind}`, classId, rng);
  c.level = 25; c.statPoints = 0;
  c.gold = 99999; c.potions = 30; c.scrolls = 10;
  if (spec && SPECS[classId]?.[spec]) {
    c.spec = spec;
    c.quests.done.prova_do_mestre = 1; c.quests.done.maestria = 1; // Maestria: aura refinada (o visual novo já vem da especialização)
  }
  const noShield = spec && SPECS[classId]?.[spec]?.noOffhand;
  c.equipment.weapon = generateItem(rng, 25, { slot: 'weapon', rarityId: 'epic', weaponType: undefined, classId });
  c.equipment.armor = generateItem(rng, 25, { slot: 'armor', classId, rarityId: 'epic' });
  if ((classId === 'warrior' || classId === 'cleric') && !noShield) c.equipment.offhand = generateItem(rng, 25, { slot: 'offhand', classId, rarityId: 'legendary' });
  return c;
}

export const TESTE = parseTeste(typeof location !== 'undefined' ? location.search : '');
if (TESTE && typeof window !== 'undefined') window.TESTE = { kind: TESTE }; // save.js e main.js leem isto

// Selo "MODO TESTE" + atalhos de toque (herói, mapa). Só DOM; as ações chamam game.testeSwitch.
export function installTesteUi(game) {
  const el = document.createElement('div');
  el.id = 'teste-bar';
  el.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:45;display:flex;gap:4px;align-items:center;padding:3px 6px;border-radius:12px;background:rgba(20,16,40,.82);border:1px solid #ffcf4a;font:800 11px Nunito,system-ui,sans-serif;color:#ffe9a0;touch-action:manipulation;max-width:96vw;flex-wrap:wrap;justify-content:center';
  const btn = (id, label, fn) => {
    const b = document.createElement('button');
    b.id = id; b.textContent = label; b.type = 'button';
    b.style.cssText = 'min-height:30px;padding:2px 9px;border-radius:9px;border:1px solid #8d7a3a;background:#2c2552;color:#fff3d0;font:800 11px Nunito,system-ui,sans-serif;cursor:pointer';
    b.addEventListener('click', fn);
    el.appendChild(b); return b;
  };
  const tag = document.createElement('span'); tag.textContent = 'MODO TESTE'; tag.style.cssText = 'padding:0 4px;letter-spacing:.05em';
  el.appendChild(tag);
  const zoneNow = () => game.world?.zoneId ?? 'town';
  const evo = TESTE_KINDS[TESTE][1] ? TESTE : 'paladino'; // o herói evoluído pedido na URL (ou o Paladino); o 'base' é a mesma classe sem especialização
  const baseKind = { warrior: 'paladino-base', mage: 'mago-base', archer: 'arqueiro-base', cleric: 'clerigo-base' }[TESTE_KINDS[evo][0]];
  btn('teste-evo', evo === 'paladino' ? 'Paladino' : 'Evoluído', () => game.testeSwitch(evo, zoneNow()));
  btn('teste-base', TESTE_KINDS[evo][0] === 'warrior' ? 'Guerreiro base' : 'Herói base', () => game.testeSwitch(baseKind, zoneNow()));
  btn('teste-vila', 'Vila', () => game.testeSwitch(window.TESTE.kind, 'town'));
  btn('teste-bosque', 'Bosque', () => game.testeSwitch(window.TESTE.kind, 'forest'));
  document.body.appendChild(el);
  return el;
}
