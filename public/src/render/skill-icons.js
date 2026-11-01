// Ícones das habilidades (arte em public/assets/icons). Um só lugar decide o caminho: a UI, o toque e os tooltips usam estas funções.
// A mecânica não depende disto (data/skills.js segue com o emoji como reserva se a imagem não carregar).
export const skillIconUrl = (id) => `assets/icons/skills/${id}.webp`;
export const POTION_ICON = 'assets/icons/status/potion.webp';
// <img> pronto; `emoji` vira o texto alternativo (aparece se o arquivo falhar)
export const iconImg = (src, emoji = '', cls = 'art') => `<img class="${cls}" src="${src}" alt="${emoji}" draggable="false" decoding="async">`;
export const skillImg = (id, emoji = '', cls = 'art') => iconImg(skillIconUrl(id), emoji, cls);
// aquece o cache do navegador (evita o ícone "piscar" ao abrir a barra)
export function preloadSkillIcons(ids) { for (const id of [...ids, null]) { const i = new Image(); i.src = id ? skillIconUrl(id) : POTION_ICON; } }
