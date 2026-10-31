// Registra o service worker (só em https ou localhost; ?nosw desliga). Falha de registro nunca afeta o jogo.
if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
