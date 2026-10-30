// Gera "ecos" de aventureiros para a arena PvP enquanto o multiplayer não existe.
// Quando houver servidor, um rival real será um personagem salvo de outro jogador
// no mesmo formato de `char` — o resto do código de arena não muda.
import { CLASSES } from '../data/classes.js';
import { SLOTS } from '../data/items.js';
import { generateItem, rollRarity } from './loot.js';
import { newCharacter, createSpirit, POINTS_PER_LEVEL } from './progression.js';

const NAMES = ['Kael', 'Lyra', 'Thorne', 'Mira', 'Bastian', 'Selene', 'Orin', 'Vex', 'Nara', 'Darius', 'Ilya', 'Rook', 'Sora', 'Elara', 'Fenn', 'Isolde', 'Tarek', 'Yara'];
const TITLES = ['o Errante', 'a Veloz', 'o Firme', 'a Sombria', 'o Radiante', 'a Astuta', 'o Bravo', 'a Serena'];

export function generateRival(rng, player) {
  const classId = rng.pick(Object.keys(CLASSES));
  const level = Math.max(1, Math.min(30, player.level + rng.int(-1, 1)));
  const rating = Math.max(800, player.arena.rating + rng.int(-90, 90));
  const char = newCharacter(`${rng.pick(NAMES)} ${rng.pick(TITLES)}`, classId, rng);
  char.level = level;

  const cls = CLASSES[classId];
  const points = POINTS_PER_LEVEL * (level - 1);
  char.alloc[cls.primary] += Math.round(points * 0.6);
  char.alloc.vit += Math.round(points * 0.3);
  char.alloc.agi += points - Math.round(points * 0.6) - Math.round(points * 0.3);

  // Equipamento melhora com o rating do rival.
  const luck = Math.max(0, Math.min(2, (rating - 950) / 350));
  for (const slot of SLOTS) {
    if (slot !== 'weapon' && slot !== 'armor' && !rng.chance(0.6)) { delete char.equipment[slot]; continue; }
    char.equipment[slot] =generateItem(rng, level, { classId, slot, weaponType: slot === 'weapon' ? cls.weapon : undefined, rarityId: rollRarity(rng, luck) });
  }
  char.spirits = [createSpirit(rng, { level: Math.max(1, level - rng.int(0, 3)), luck })];
  char.activeSpirit = char.spirits[0].id;
  char.arena.rating = rating;
  return char;
}
