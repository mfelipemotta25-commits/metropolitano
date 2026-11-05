// Ícones de traço único, no mesmo grid de 24 px. O painel usa a mesma lista.
export const ICONES = {
  rua: { nome: 'Rua', d: 'M7 21 10 3M17 21 14 3M12 5v3M12 11v3M12 17v3' },
  zonas: { nome: 'Zonas', d: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z' },
  carro: { nome: 'Veículo', d: 'M4 16v-4l2-5h12l2 5v4M4 12h16M4 16h16M6.5 16v3M17.5 16v3M7.5 13.5h.01M16.5 13.5h.01' },
  metro: { nome: 'Metrô', d: 'M7 3h10a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 11h14M12 3v8M8 18l-2 3M16 18l2 3M8.5 14.5h.01M15.5 14.5h.01' },
  loja: { nome: 'Loja', d: 'M4 10v11h16V10M3 10l2-7h14l2 7zM3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M10 21v-6h4v6' },
  predios: { nome: 'Prédios', d: 'M3 21V10l6-3v14M9 21V3l8 3v15M17 21v-9l4 2v7M2 21h20M12 8h2M12 12h2M12 16h2' },
  painel: { nome: 'Painel', d: 'M3 6h18M3 12h18M3 18h18M8 4v4M15 10v4M6 16v4' }
};

export function svgIcone(chave) {
  const icone = ICONES[chave] || ICONES.rua;
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icone.d}"/></svg>`;
}
