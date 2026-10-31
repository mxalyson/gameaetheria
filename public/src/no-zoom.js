// Impede o zoom/pinça do navegador durante o jogo (no celular, dois dedos — joystick + botão — viravam gesto de zoom e a tela "encolhia").
// CSS (`touch-action: none`) cobre Chrome/Android; estes ouvintes cobrem o Safari do iPhone (gestos próprios) e o duplo toque.
const stop = (e) => e.preventDefault();
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', stop);
// Ctrl + roda / Ctrl + "+" no PC também não devem mexer na escala da página do jogo.
addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
