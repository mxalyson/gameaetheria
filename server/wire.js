// Eventos da simulação → mensagens do protocolo (só ids e números; nada de objetos do mundo). Compartilhado pelas salas.
const r1 = (n) => Math.round(n * 10) / 10;
const id = (a) => a?.id ?? null;

export function wire(ev) {
  switch (ev.type) {
    case 'hit': return { e: 'hit', src: id(ev.src), target: id(ev.target), amount: ev.amount, crit: !!ev.crit, absorbed: !!ev.absorbed };
    case 'heal': return { e: 'heal', actor: id(ev.actor), amount: ev.amount };
    case 'swing': return { e: 'swing', actor: id(ev.actor), ang: Math.round(ev.ang * 100) / 100 };
    case 'cast': return { e: 'cast', actor: id(ev.actor), skill: ev.skill, ang: Math.round((ev.ang ?? 0) * 100) / 100, ...(ev.tx != null ? { tx: Math.round(ev.tx), ty: Math.round(ev.ty) } : {}) };
    case 'status': return { e: 'status', actor: id(ev.actor), kind: ev.kind, dur: r1(ev.dur) };
    case 'death': return { e: 'death', actor: id(ev.actor), killer: id(ev.killer) };
    case 'telegraph': return { e: 'telegraph', x: Math.round(ev.x), y: Math.round(ev.y), r: ev.r, delay: ev.delay, color: ev.color };
    default: return null;
  }
}
