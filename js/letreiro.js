// Letreiro de LED no estilo dos ônibus brasileiros, desenhado ponto a ponto.
const FONTE = {
  ' ': [0, 0, 0], '-': [8, 8, 8, 8, 8], '.': [96, 96], '/': [32, 16, 8, 4, 2], ':': [54, 54],
  0: [62, 81, 73, 69, 62], 1: [66, 127, 64], 2: [66, 97, 81, 73, 70], 3: [33, 65, 69, 75, 49],
  4: [24, 20, 18, 127, 16], 5: [39, 69, 69, 69, 57], 6: [60, 74, 73, 73, 48], 7: [1, 113, 9, 5, 3],
  8: [54, 73, 73, 73, 54], 9: [6, 73, 73, 41, 30],
  A: [126, 17, 17, 17, 126], B: [127, 73, 73, 73, 54], C: [62, 65, 65, 65, 34], D: [127, 65, 65, 34, 28],
  E: [127, 73, 73, 73, 65], F: [127, 9, 9, 9, 1], G: [62, 65, 73, 73, 122], H: [127, 8, 8, 8, 127],
  I: [65, 127, 65], J: [32, 64, 65, 63, 1], K: [127, 8, 20, 34, 65], L: [127, 64, 64, 64, 64],
  M: [127, 2, 12, 2, 127], N: [127, 4, 8, 16, 127], O: [62, 65, 65, 65, 62], P: [127, 9, 9, 9, 6],
  Q: [62, 65, 81, 33, 94], R: [127, 9, 25, 41, 70], S: [70, 73, 73, 73, 49], T: [1, 1, 127, 1, 1],
  U: [63, 64, 64, 64, 63], V: [31, 32, 64, 32, 31], W: [63, 64, 56, 64, 63], X: [99, 20, 8, 20, 99],
  Y: [7, 8, 112, 8, 7], Z: [97, 81, 73, 69, 67]
};

function colunasDoTexto(texto) {
  const limpo = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const colunas = [];
  for (const letra of limpo) {
    colunas.push(...(FONTE[letra] || FONTE[' ']), 0);
  }
  return colunas;
}

export function criarLetreiro(elemento, mensagens) {
  const canvas = elemento.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const passo = 4;
  const linhas = 9;
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let indice = 0;
  let deslocamento = 0;
  let inicioPagina = performance.now();
  let larguraColunas = 0;
  let quadro = 0;
  let visivel = true;

  elemento.setAttribute('aria-label', mensagens.join('. '));

  function ajustar() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const largura = elemento.clientWidth;
    larguraColunas = Math.floor(largura / passo);
    canvas.width = largura * dpr;
    canvas.height = linhas * passo * dpr;
    canvas.style.height = `${linhas * passo}px`;
    canvas.style.width = `${largura}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    desenhar();
  }

  function desenhar() {
    const colunas = colunasDoTexto(mensagens[indice]);
    const cabe = colunas.length <= larguraColunas;
    const margem = cabe ? 0 : -deslocamento + 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let c = 0; c < larguraColunas; c++) {
      const bits = colunas[c - margem] || 0;
      for (let l = 0; l < linhas; l++) {
        const aceso = l > 0 && l < 8 && (bits >> (l - 1)) & 1;
        ctx.fillStyle = aceso ? '#FFB321' : 'rgba(255, 179, 33, 0.07)';
        ctx.beginPath();
        ctx.arc(c * passo + passo / 2, l * passo + passo / 2, aceso ? 1.7 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function animar(agora) {
    quadro = requestAnimationFrame(animar);
    if (!visivel) return;
    const colunas = colunasDoTexto(mensagens[indice]);
    const cabe = colunas.length <= larguraColunas;
    const decorrido = agora - inicioPagina;
    if (cabe) {
      if (decorrido > 3800) proxima(agora);
      return;
    }
    const novo = Math.max(0, Math.floor((decorrido - 1200) / 45));
    if (novo !== deslocamento) {
      deslocamento = novo;
      desenhar();
    }
    if (deslocamento > colunas.length - larguraColunas + 4 && decorrido > 2000) {
      if ((decorrido - 1200) / 45 > colunas.length - larguraColunas + 30) proxima(agora);
    }
  }

  function proxima(agora) {
    indice = (indice + 1) % mensagens.length;
    deslocamento = 0;
    inicioPagina = agora;
    desenhar();
  }

  addEventListener('resize', ajustar);
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(elemento);
  ajustar();
  if (!reduzido && mensagens.length) quadro = requestAnimationFrame(animar);
  return () => cancelAnimationFrame(quadro);
}
