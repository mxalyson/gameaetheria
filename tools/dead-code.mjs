// Lista exports que nenhum outro arquivo importa (candidatos a código morto) e imports não usados no próprio arquivo.
// Uso: node tools/dead-code.mjs [--internal]   (só lista; quem remove confere antes: pode haver uso dinâmico, testes ou HTML)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['public', 'server', 'tools', 'tests', 'server.js'];
const files = [];
const walk = (p) => {
  if (/node_modules|test-results|vendor|labs|[\\/]assets[\\/]|art-local/.test(p)) return;
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.(m?js|html)$/.test(p)) files.push(p);
};
ROOTS.forEach(walk);

const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const exportsOf = new Map(); // arquivo -> [nomes]
const imported = new Set();  // "nome" importado em qualquer lugar
const unusedImports = [];

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const IMPORT_RE = /import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s+([\w$]+))?\s*from\s*['"][^'"]+['"]/g;
for (const [f, text] of src) {
  const code = stripComments(text);
  if (f.endsWith('.js') || f.endsWith('.mjs')) {
    const ex = [];
    for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) ex.push(m[1]);
    for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/).pop(); if (k) ex.push(k); }
    if (ex.length) exportsOf.set(f, ex);
  }
  for (const m of code.matchAll(IMPORT_RE)) {
    const names = [];
    if (m[1]) names.push(m[1]);
    if (m[2]) for (const n of m[2].split(',')) { const [orig, alias] = n.trim().split(/\s+as\s+/); if (orig) { imported.add(orig); names.push(alias ?? orig); } }
    if (m[3]) names.push(m[3]);
    // import não usado: o nome só aparece uma vez no arquivo (na própria linha de import)
    const rest = code.replace(IMPORT_RE, ''); // sem NENHUMA linha de import (o mesmo nome pode ser importado em dois pontos)
    for (const n of names) if (!new RegExp(`(?<![\\w$])(?<![^.]\\.)${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(rest)) unusedImports.push(`${relative('.', f)}: import '${n}' não usado`);
  }
  for (const m of code.matchAll(/import\(['"][^'"]+['"]\)/g)) void m; // imports dinâmicos: tratados abaixo por nome
  for (const m of code.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\s+import\(/g)) for (const n of m[1].split(',')) imported.add(n.trim().split(':')[0].trim());
}
// uso interno também conta: um export só usado no próprio arquivo não é "morto", mas é candidato a deixar de ser export
const dead = [], internal = [];
for (const [f, names] of exportsOf) {
  const code = stripComments(src.get(f));
  for (const n of names) {
    if (imported.has(n)) continue;
    const uses = [...code.matchAll(new RegExp(`(?<![\\w$])(?<![^.]\\.)${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))].length;
    (uses > 1 ? internal : dead).push(`${relative('.', f)}: ${n}`);
  }
}
console.log(`== exports nunca importados e nunca usados no próprio arquivo (${dead.length}) ==`); dead.forEach((l) => console.log(l));
console.log(`\n== exports só usados dentro do próprio arquivo (${internal.length}) ==`); internal.forEach((l) => console.log(l));
console.log(`\n== imports não usados (${unusedImports.length}) ==`); unusedImports.forEach((l) => console.log(l));
