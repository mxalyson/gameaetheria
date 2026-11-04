// Ícones das habilidades (arte em public/assets/icons). Um só lugar decide o caminho: a UI, o toque e os tooltips usam estas funções.
// A mecânica não depende disto (data/skills.js segue com o emoji como reserva se a imagem não carregar).
import { asset } from '../assets-version.js';
import { SKILLS } from '../data/skills.js';
// `art` (data/kits.js): habilidades de especialização reaproveitam o ícone existente mais parecido até o dono entregar a arte própria
export const skillIconUrl = (id) => `assets/icons/skills/${SKILLS[id]?.art ?? id}.webp`;
// Ataque básico: um emblema por classe (escudo de bronze, runas arcanas, folhas, asas de ouro)
export const attackIconUrl = (classId) => `assets/icons/attack/atk-${classId}.webp`;
export const attackImg = (classId, emoji = '', cls = 'art') => iconImg(attackIconUrl(classId), emoji, cls);
export const POTION_ICON = 'assets/icons/status/potion.webp';
// <img> pronto; `emoji` vira o texto alternativo (aparece se o arquivo falhar)
export const iconImg = (src, emoji = '', cls = 'art') => `<img class="${cls}" src="${asset(src)}" alt="${emoji}" draggable="false" decoding="async">`;
export const skillImg = (id, emoji = '', cls = 'art') => iconImg(skillIconUrl(id), emoji, cls);
// aquece o cache do navegador (evita o ícone "piscar" ao abrir a barra)
export function preloadSkillIcons(ids, classId = null) { if (classId) new Image().src = asset(attackIconUrl(classId)); for (const id of [...ids, null]) { const i = new Image(); i.src = asset(id ? skillIconUrl(id) : POTION_ICON); } }

// Categoria da habilidade para a interface (cor + FORMA, para não depender só da cor): dano, cura, buff (reforço/proteção/mobilidade) ou controle (atordoa/desacelera).
// Calculada dos dados reais de data/skills.js: não há campo novo e a mecânica não muda.
export const CATEGORIES = { dano: 'Dano', cura: 'Cura', buff: 'Reforço', controle: 'Controle' };
export function skillCategory(s) {
  if (s.heal) return 'cura';
  if (s.stun || s.slow) return 'controle';
  if (s.kind === 'buff' || s.kind === 'blink' || s.invuln) return 'buff';
  return 'dano';
}
