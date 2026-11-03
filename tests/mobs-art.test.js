import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { MOBS } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';

// Monstros pintados (B2): todo id do índice é um monstro do jogo, tem json + webp válidos, e a memória de textura por zona cabe no orçamento.
const index = JSON.parse(readFileSync('public/assets/mobs/index.json', 'utf8'));
test('índice de monstros pintados: ids existem em MOBS e os arquivos estão íntegros', () => {
  for (const id of index.ids) {
    assert.ok(MOBS[id] || MOBS[id.replace(/_p\d$/, '')], 'monstro desconhecido: ' + id); // `<mob>_p2`: arte da fase 2 de um chefe (ex.: echolord_p1/_p2)
    assert.ok(existsSync(`public/assets/mobs/${id}.webp`) && existsSync(`public/assets/mobs/${id}.json`), 'arquivos de ' + id);
    const m = JSON.parse(readFileSync(`public/assets/mobs/${id}.json`, 'utf8'));
    assert.ok(m.cell[0] > 16 && m.cell[1] > 16 && m.cols === (m.frames ?? 4) && m.rows === (m.frames ? (m.mirror ? 5 : 8) : 2) && m.ax >= 0 && m.ax <= m.cell[0] && m.ay >= 0 && m.ay <= m.cell[1], 'medidas de ' + id);
    assert.ok(statSync(`public/assets/mobs/${id}.webp`).size < 400_000, id + ' pesado demais');
  }
});
test('memória de textura dos monstros carregados por zona (3 comuns + chefe) < 10 MiB decodificados (16 MiB só na Cripta, por ter o chefe em alta resolução) (subiu de 8: a geleia em 150 px; celulares atuais têm folga de memória de GPU)', () => {
  for (const [zid, z] of Object.entries(ZONES)) {
    const base = [...(z.mobs ?? []).map((m) => m[0]), ...(z.boss ? [z.boss.id] : []), ...(z.preload ?? [])]; // a masmorra pré-carrega as criaturas das salas
    const ids = [...new Set(base.flatMap((id) => [MOBS[id].art ?? id, ...index.ids.filter((i) => i.startsWith(id + '_p'))]))].filter((id) => index.ids.includes(id)); // + arte da fase 2 do chefe // variante recolorida ocupa a memória da arte de base (uma cópia recolorida por criatura)
    const bytes = ids.reduce((s, id) => { const m = JSON.parse(readFileSync(`public/assets/mobs/${id}.json`, 'utf8')); return s + m.cell[0] * m.cols * m.cell[1] * m.rows * 4; }, 0);
    const cap = z.dungeon ? 16 : 10; // Cripta: chefe único da masmorra (Soberano dos Ecos, 2 fases em ~245×260 px/célula) leva até 16 MiB; as demais zonas seguem em 10
    assert.ok(bytes < cap * 1048576, `${zid}: ${(bytes / 1048576).toFixed(1)} MiB`);
  }
});
