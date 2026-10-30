export const SPIRITS = {
  ember: { name: 'Fagulha', element: 'Fogo', color: '#ff8a3d', glow: '#ffd0a0', role: 'Dano',
    desc: 'Dispara chamas no inimigo mais próximo.' },
  undine: { name: 'Ondina', element: 'Água', color: '#59b8ff', glow: '#c6e8ff', role: 'Cura',
    desc: 'Cura você periodicamente e lança gotas leves.' },
  terra: { name: 'Rochedo', element: 'Terra', color: '#c09060', glow: '#f0d6b0', role: 'Defesa',
    desc: 'Cria escudos quando você é atingido e golpeia inimigos próximos.' },
  zephyr: { name: 'Zéfiro', element: 'Vento', color: '#7ee8c0', glow: '#d6fff0', role: 'Agilidade',
    desc: '+12% de velocidade de movimento e rajadas rápidas.' },
};

export const SPIRIT_RARITY_MUL = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 2 };
export const MAX_SPIRITS = 12;
