// Converte um GLB (sem esqueleto) em OBJ + MTL + textura de cor, para enviar ao auto-rig do Mixamo (aceita .obj/.fbx/.zip).
// Uso: node public/labs/iso-poc/tools/glb-to-obj.mjs <id> [corteFracao]
// Saída: public/labs/iso-poc/art-local/mixamo/<id>/{<id>.obj,<id>.mtl,<id>_cor.jpg}  (compactar em .zip depois)
// `corteFracao` descarta triângulos totalmente abaixo dessa fração da altura (remove pedestais antes de rigar).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 3º argumento opcional: nº alvo de triângulos (ex.: 40000). Reduz a malha com meshoptimizer antes de exportar (o auto-rig do Mixamo falha em malhas muito pesadas).
import { MeshoptSimplifier } from '../vendor/meshoptimizer/meshopt_simplifier.module.js';
const [id, cutArg = '0', targetArg = '0'] = process.argv.slice(2);
const targetTris = parseInt(targetArg, 10) || 0;
if (targetTris) { MeshoptSimplifier.useExperimentalFeatures = true; await MeshoptSimplifier.ready; }
const lab = fileURLToPath(new URL('../', import.meta.url));
const buf = fs.readFileSync(path.join(lab, 'art-local', `${id}.glb`));
const jl = buf.readUInt32LE(12), j = JSON.parse(buf.slice(20, 20 + jl).toString());
const bin = buf.subarray(20 + jl + 8);
const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function read(ai) {
  const a = j.accessors[ai], bv = j.bufferViews[a.bufferView], [T, sz] = CT[a.componentType], n = NC[a.type];
  const stride = bv.byteStride || sz * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new (T === Uint8Array || T === Int8Array ? Float32Array : T)(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
    const o = base + i * stride + k * sz;
    out[i * n + k] = a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5125 ? dv.getUint32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : dv.getUint8(o);
  }
  return out;
}
const S = 100; // metros -> "cm" (≈190 de altura), escala que o Mixamo espera
const lines = [`mtllib ${id}.mtl`, `o ${id}`, 'usemtl mat'];
let vOff = 0, kept = 0, dropped = 0;
let ymin = Infinity, ymax = -Infinity;
for (const m of j.meshes) for (const p of m.primitives) { const P = read(p.attributes.POSITION); for (let i = 1; i < P.length; i += 3) { ymin = Math.min(ymin, P[i]); ymax = Math.max(ymax, P[i]); } }
const yCut = ymin + parseFloat(cutArg) * (ymax - ymin);
for (const m of j.meshes) for (const p of m.primitives) {
  const P = read(p.attributes.POSITION), N = p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null, UV = p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null;
  let I = p.indices != null ? read(p.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
  let nv = P.length / 3;
  let Pw = P, Nw = N, UVw = UV;
  if (targetTris) {
    // atributos (uv + normal) entram com peso para a textura e o sombreamento sobreviverem à redução
    const A = new Float32Array(nv * 5);
    for (let i = 0; i < nv; i++) { A[i * 5] = UV ? UV[i * 2] : 0; A[i * 5 + 1] = UV ? UV[i * 2 + 1] : 0; A[i * 5 + 2] = N ? N[i * 3] : 0; A[i * 5 + 3] = N ? N[i * 3 + 1] : 0; A[i * 5 + 4] = N ? N[i * 3 + 2] : 0; }
    const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(I), P, 3, A, 5, [1, 1, 0.5, 0.5, 0.5], null, targetTris * 3, 0.05, ['LockBorder']);
    console.log('simplificado', I.length / 3, '->', simp.length / 3, 'triângulos, erro', err.toFixed(5));
    const map = new Map(); const nP = [], nN = [], nU = [];
    const remap = new Uint32Array(simp.length);
    for (let k = 0; k < simp.length; k++) {
      const v = simp[k]; let m = map.get(v);
      if (m === undefined) { m = map.size; map.set(v, m); nP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); if (N) nN.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); if (UV) nU.push(UV[v * 2], UV[v * 2 + 1]); }
      remap[k] = m;
    }
    I = remap; Pw = Float32Array.from(nP); Nw = N ? Float32Array.from(nN) : null; UVw = UV ? Float32Array.from(nU) : null; nv = Pw.length / 3;
  }
  const P_ = Pw, N_ = Nw, UV_ = UVw;
  for (let i = 0; i < nv; i++) lines.push(`v ${(P_[i * 3] * S).toFixed(4)} ${((P_[i * 3 + 1] - ymin) * S).toFixed(4)} ${(P_[i * 3 + 2] * S).toFixed(4)}`);
  if (UV_) for (let i = 0; i < nv; i++) lines.push(`vt ${UV_[i * 2].toFixed(5)} ${(1 - UV_[i * 2 + 1]).toFixed(5)}`); // glTF tem V invertido em relação ao OBJ
  if (N_) for (let i = 0; i < nv; i++) lines.push(`vn ${N_[i * 3].toFixed(4)} ${N_[i * 3 + 1].toFixed(4)} ${N_[i * 3 + 2].toFixed(4)}`);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (P_[a * 3 + 1] < yCut && P_[b * 3 + 1] < yCut && P_[c * 3 + 1] < yCut) { dropped++; continue; }
    const f = (v) => `${v + 1 + vOff}${UV_ ? '/' + (v + 1 + vOff) : N_ ? '/' : ''}${N_ ? '/' + (v + 1 + vOff) : ''}`;
    lines.push(`f ${f(a)} ${f(b)} ${f(c)}`); kept++;
  }
  vOff += nv;
}
const dest = path.join(lab, 'art-local', 'mixamo', id);
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, `${id}.obj`), lines.join('\n'));
// textura de cor (baseColorTexture do material)
const tex = j.materials[0].pbrMetallicRoughness.baseColorTexture.index, img = j.images[j.textures[tex].source], bv = j.bufferViews[img.bufferView];
const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
fs.writeFileSync(path.join(dest, `${id}_cor.${ext}`), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
fs.writeFileSync(path.join(dest, `${id}.mtl`), `newmtl mat\nKa 1 1 1\nKd 1 1 1\nmap_Kd ${id}_cor.${ext}\n`);
console.log(id, 'triângulos', kept, 'descartados', dropped, 'altura', ((ymax - ymin) * S).toFixed(1), 'tex', ext);
