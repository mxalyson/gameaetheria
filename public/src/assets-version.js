// Versão da arte estática (public/assets/**). Gerada por `node tools/bump-assets.mjs` (hash do conteúdo): não editar à mão.
// O service worker serve imagens do cache primeiro; sem `?v=` uma arte trocada com o mesmo nome ficaria velha no aparelho.
export const ASSET_V = '7d1ee3d6';

// Anexa `?v=` a um caminho de arte (relativo, como 'assets/icons/x.webp'). Caminhos que já têm query ficam como estão.
export const asset = (path) => (path.includes('?') ? path : `${path}?v=${ASSET_V}`);
