// Gera "ecos" de aventureiros para a arena PvP enquanto o multiplayer não existe.
// Quando houver servidor, um rival real será um personagem salvo de outro jogador
// no mesmo formato de `char` — o resto do código de arena não muda.
import { CLASSES } from '../data/classes.js';
import { SLOTS, SHIELD_CLASSES } from '../data/items.js';
import { generateItem, rollRarity } from './loot.js';
import { newCharacter, createSpirit, POINTS_PER_LEVEL } from './progression.js';
import { makeRng } from './rng.js';
import { specsOf, SPEC_LEVEL } from './specs.js';
import { playerPower } from './power.js';

const NAMES = ['Kael', 'Lyra', 'Thorne', 'Mira', 'Bastian', 'Selene', 'Orin', 'Vex', 'Nara', 'Darius', 'Ilya', 'Rook', 'Sora', 'Elara', 'Fenn', 'Isolde', 'Tarek', 'Yara'];
const TITLES = ['o Errante', 'a Veloz', 'o Firme', 'a Sombria', 'o Radiante', 'a Astuta', 'o Bravo', 'a Serena'];

export function generateRival(rng, player, { classId: forced, rating: forcedRating, strength = 1, spec: forcedSpec, exactLevel = false } = {}) {
  const classId = forced ?? rng.pick(Object.keys(CLASSES));
  const jitter = rng.int(-1, 1); // sempre sorteado: mantém a sequência do rng igual com ou sem exactLevel
  const level = Math.max(1, Math.min(30, player.level + (exactLevel ? 0 : jitter)));
  const rating = Math.max(800, (forcedRating ?? player.arena.rating) + rng.int(-90, 90));
  const char = newCharacter(`${rng.pick(NAMES)} ${rng.pick(TITLES)}`, classId, rng);
  char.level = level;

  const cls = CLASSES[classId];
  const points = Math.round(POINTS_PER_LEVEL * (level - 1) * strength); // strength < 1: rival menos investido (usado no pareamento por poder)
  char.alloc[cls.primary] += Math.round(points * 0.6);
  char.alloc.vit += Math.round(points * 0.3);
  char.alloc.agi += points - Math.round(points * 0.6) - Math.round(points * 0.3);

  // Equipamento melhora com o rating do rival.
  const luck = Math.max(0, Math.min(2, (rating - 950) / 350)) * Math.min(1, strength);
  const gearLevel = Math.max(1, Math.round(level * Math.min(1, strength))); // rival fraco usa equipamento de nível menor
  for (const slot of SLOTS) {
    if (slot === 'offhand' && !SHIELD_CLASSES.includes(classId)) continue; // só Guerreiro e Clérigo têm escudo
    if (slot !== 'weapon' && slot !== 'armor' && (strength < 0.3 || !rng.chance(0.6))) { delete char.equipment[slot]; continue; }
    char.equipment[slot] = generateItem(rng, gearLevel, { classId, slot, weaponType: slot === 'weapon' ? cls.weapon : undefined, rarityId: rollRarity(rng, luck) });
  }
  const spirit = createSpirit(rng, { level: Math.max(1, gearLevel - rng.int(0, 3)), luck });
  if (strength >= 0.15) { char.spirits = [spirit]; char.activeSpirit = spirit.id; } // rival muito fraco vai sem spirit (piso de poder mais baixo)
  if (level >= SPEC_LEVEL) { const ids = Object.keys(specsOf(classId)); char.spec = forcedSpec ?? ids[rng.int(0, ids.length - 1)]; }
  char.arena.rating = rating;
  return char;
}

// Pareamento por poder: gera um rival cujo PWR fica o mais perto possível do alvo `target` (busca binária sobre a "força" do rival,
// com a mesma semente em cada tentativa, então o resultado é determinístico para um mesmo estado do rng).
export function generateRivalForPower(rng, player, target, opts = {}) {
  const seed = rng.int(1, 0x3fffffff);
  const build = (strength) => generateRival(makeRng(seed), player, { ...opts, strength, exactLevel: true });
  let lo = 0, hi = 1.2, best = build(hi), bestD = Math.abs(playerPower(best) - target);
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2, c = build(mid), p = playerPower(c), d = Math.abs(p - target);
    if (d < bestD) { best = c; bestD = d; }
    if (p < target) lo = mid; else hi = mid;
  }
  return best;
}
