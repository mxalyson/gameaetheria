// Orçamento de texturas dos heróis em miniatura: lê as dimensões REAIS dos PNG de public/labs/iso-poc/art-local/atlas-rig e calcula a memória
// decodificada (RGBA, 4 bytes/pixel) em cada escala de qualidade. Uso: npm run texture:budget.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'public/labs/iso-poc/art-local/atlas-rig';
const HEROES = { paladino: 'Guerreiro', aprendiz: 'Mago', franco: 'Arqueiro', sacerdote: 'Clérigo' };
const SCALES = [['alta', 1], ['média (padrão em celular)', 0.75], ['baixa', 0.5]];
// ORÇAMENTO ASSUMIDO (não medido em aparelho): ≤ 64 MiB de texturas de herói em celulares de 2–3 GB de RAM.
export const BUDGET_MIB = 64;

export function heroBytes(id, k = 1) {
  const dir = join(ROOT, id);
  let total = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
    const b = readFileSync(join(dir, f));
    total += Math.round(b.readUInt32BE(16) * k) * Math.round(b.readUInt32BE(20) * k) * 4; // largura/altura do cabeçalho IHDR
  }
  return total;
}

if (process.argv[1]?.endsWith('texture-budget.mjs')) {
  if (!existsSync(ROOT)) { console.log('Atlas não encontrados em', ROOT); process.exit(0); }
  const mib = (n) => (n / 1048576).toFixed(1).padStart(6);
  console.log('Memória de textura DECODIFICADA por herói (MiB):');
  console.log('  herói'.padEnd(22) + SCALES.map(([n]) => n.padStart(28)).join(''));
  const totals = SCALES.map(() => 0);
  for (const [id, cls] of Object.entries(HEROES)) {
    const row = SCALES.map(([, k], i) => { const b = heroBytes(id, k); totals[i] += b; return mib(b).padStart(28); });
    console.log(`  ${cls} (${id})`.padEnd(22) + row.join(''));
  }
  console.log('  TOTAL (4 classes)'.padEnd(22) + totals.map((t) => mib(t).padStart(28)).join(''));
  console.log(`\nOrçamento assumido: ${BUDGET_MIB} MiB. Partida 4×4 com as 4 classes: ` + SCALES.map(([n], i) => `${n}: ${totals[i] / 1048576 <= BUDGET_MIB ? 'dentro' : 'ACIMA'}`).join(' · '));
}
