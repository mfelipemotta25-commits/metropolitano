// Maquete isométrica gerada por código. É uma ilustração do site, não uma captura do jogo.
const CORES = {
  rua: 'rgba(157, 176, 191, 0.34)',
  avenida: 'rgba(214, 226, 234, 0.62)',
  agua: '#14324A',
  parque: '#16382F',
  topo: '#264560',
  lado: '#1A3145',
  frente: '#132333',
  borda: 'rgba(157, 176, 191, 0.26)',
  residencial: '#2EC27E',
  comercial: '#3D8BFF',
  industrial: '#FFB321',
  linhas: ['#F0533F', '#3D8BFF', '#2EC27E']
};

function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gerarCidade(n, semente) {
  const r = aleatorio(semente);
  const fase = [r() * 6, r() * 6, r() * 6, r() * 6];
  const vertice = (i, j) => ({
    x: i + Math.sin(j * 0.17 + fase[0]) * 1.5 + Math.sin(j * 0.53 + i * 0.21 + fase[1]) * 0.26,
    y: j + Math.sin(i * 0.15 + fase[2]) * 1.5 + Math.sin(i * 0.49 + j * 0.23 + fase[3]) * 0.26
  });
  const grade = [];
  for (let i = 0; i <= n; i++) {
    grade[i] = [];
    for (let j = 0; j <= n; j++) grade[i][j] = vertice(i, j);
  }
  const eixoRio = (i) => n * 0.72 + Math.sin(i * 0.13 + fase[1]) * n * 0.1 - i * 0.28;
  const noRio = (i, j) => Math.abs(j - eixoRio(i)) < 1.1;
  const avenida = (k) => k % 7 === 3;
  const centro = n / 2;
  const quadras = [];
  for (let s = 0; s <= 2 * (n - 1); s++) {
    for (let i = Math.max(0, s - n + 1); i <= Math.min(n - 1, s); i++) {
      const j = s - i;
      const dist = Math.hypot(i - centro, j - centro) / (n * 0.7);
      const rio = noRio(i + 0.5, j + 0.5);
      const parque = !rio && r() < 0.045;
      const zonaRuido = Math.sin(i * 0.19 + fase[2]) + Math.cos(j * 0.23 + fase[3]);
      let zona = 'residencial';
      if (dist < 0.34 || (avenida(i) && r() < 0.5) || (avenida(j) && r() < 0.5)) zona = 'comercial';
      else if (zonaRuido > 1.25) zona = 'industrial';
      const densidade = Math.max(0.05, 1 - dist * 1.35) ** 1.5;
      const quadra = { i, j, zona, rio, parque, densidade, predios: [] };
      if (!rio && !parque) {
        const qtd = 1 + Math.floor(r() * 3);
        for (let b = 0; b < qtd; b++) {
          const lado = qtd === 1 ? 0.62 : 0.34;
          const u = qtd === 1 ? 0.19 : 0.1 + (b % 2) * 0.46;
          const v = qtd === 1 ? 0.19 : 0.1 + Math.floor(b / 2) * 0.46;
          const base = zona === 'industrial' ? 0.32 : 0.14;
          const altura = base + densidade * (zona === 'comercial' ? 3.4 : 1.1) * (0.35 + r() * 0.85);
          quadra.predios.push({ u, v, lado, altura });
        }
      }
      quadras.push(quadra);
    }
  }
  // Rotas seguem as avenidas, para o movimento acompanhar a malha desenhada.
  const avenidas = [];
  for (let k = 3; k < n; k += 7) {
    avenidas.push(grade[k].map((p) => p));
    avenidas.push(grade.map((col) => col[k]));
  }
  const rotaEscada = (a, b, inverter) => {
    const rota = [];
    let i = a;
    let j = 0;
    while (i <= n && j <= n) {
      rota.push(inverter ? grade[j][i] : grade[i][j]);
      if ((i + j) % 11 < 6 && i < n && i < b) i++;
      else j++;
    }
    return rota;
  };
  const linhas = [
    rotaEscada(Math.floor(n * 0.2), n, false),
    rotaEscada(Math.floor(n * 0.42), n, true),
    avenidas[Math.min(2, avenidas.length - 1)]
  ];
  return { n, grade, quadras, avenidas, linhas, noRio, avenida };
}

function medirRota(rota) {
  const acumulado = [0];
  for (let k = 1; k < rota.length; k++) {
    acumulado[k] = acumulado[k - 1] + Math.hypot(rota[k].x - rota[k - 1].x, rota[k].y - rota[k - 1].y);
  }
  return { rota, acumulado, total: acumulado[acumulado.length - 1] };
}

function pontoNaRota(medida, d) {
  const alvo = ((d % medida.total) + medida.total) % medida.total;
  let k = 1;
  while (k < medida.acumulado.length - 1 && medida.acumulado[k] < alvo) k++;
  const a = medida.rota[k - 1];
  const b = medida.rota[k];
  const t = (alvo - medida.acumulado[k - 1]) / (medida.acumulado[k] - medida.acumulado[k - 1] || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function criarMapa(canvas, opcoes = {}) {
  const celula = opcoes.celula || 50;
  const semente = opcoes.semente || 1985;
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let camada = opcoes.camada || 'geral';
  let cidade;
  let largura = 0;
  let altura = 0;
  let dpr = 1;
  let origem = { x: 0, y: 0 };
  let fundos = new Map();
  let veiculos = [];
  let rotasMetro = [];
  let visivel = true;
  let quadro = 0;
  let ultimo = 0;

  const projetar = (x, y, z = 0) => ({
    x: origem.x + (x - y) * 0.866 * celula,
    y: origem.y + (x + y) * 0.5 * celula - z * celula
  });

  function preparar() {
    const caixa = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    largura = Math.max(1, Math.round(caixa.width));
    altura = Math.max(1, Math.round(caixa.height));
    canvas.width = largura * dpr;
    canvas.height = altura * dpr;
    const n = Math.min(70, Math.ceil((largura / 1.732 + altura) / celula) + 6);
    cidade = gerarCidade(n, semente);
    origem = {
      x: largura / 2,
      y: altura / 2 - n * 0.5 * celula + (opcoes.deslocamentoY || 0)
    };
    fundos = new Map();
    const r = aleatorio(semente + 7);
    const medidas = cidade.avenidas.map(medirRota).filter((m) => m.total > 0);
    const qtd = Math.min(260, Math.round((largura * altura) / 6500));
    veiculos = Array.from({ length: qtd }, () => ({
      rota: medidas[Math.floor(r() * medidas.length)],
      d: r() * 400,
      v: (0.5 + r() * 0.9) * (r() < 0.5 ? -1 : 1),
      onibus: r() < 0.12
    }));
    rotasMetro = cidade.linhas.map(medirRota).filter((m) => m.total > 0).map((m, k) => ({
      medida: m,
      cor: CORES.linhas[k % CORES.linhas.length],
      trens: [0, 0.34, 0.67].map((f) => f * m.total)
    }));
    desenharQuadro(0);
  }

  function corDaQuadra(q, alcance) {
    if (camada === 'zonas') return CORES[q.zona];
    if (camada === 'crescimento') return q.densidade > 0.45 ? '#FFB321' : q.densidade > 0.2 ? '#3D8BFF' : null;
    return alcance ? null : null;
  }

  function desenharFundo() {
    const fora = document.createElement('canvas');
    fora.width = canvas.width;
    fora.height = canvas.height;
    const c = fora.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { grade, quadras, n, noRio, avenida } = cidade;

    const poligono = (pontos, preencher, traco, espessura = 1) => {
      c.beginPath();
      pontos.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (preencher) { c.fillStyle = preencher; c.fill(); }
      if (traco) { c.strokeStyle = traco; c.lineWidth = espessura; c.stroke(); }
    };
    const emQuadra = (q, u, v) => {
      const a = grade[q.i][q.j];
      const b = grade[q.i + 1][q.j];
      const d = grade[q.i][q.j + 1];
      const e = grade[q.i + 1][q.j + 1];
      return {
        x: a.x * (1 - u) * (1 - v) + b.x * u * (1 - v) + d.x * (1 - u) * v + e.x * u * v,
        y: a.y * (1 - u) * (1 - v) + b.y * u * (1 - v) + d.y * (1 - u) * v + e.y * u * v
      };
    };

    // Água e parques ficam no chão, abaixo da malha.
    for (const q of quadras) {
      if (!q.rio && !q.parque) continue;
      const cantos = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
        const p = emQuadra(q, u, v);
        return projetar(p.x, p.y);
      });
      poligono(cantos, q.rio ? CORES.agua : CORES.parque, q.rio ? CORES.agua : null);
    }

    // Ruas: avenidas passam por cima do rio, ruas comuns param na margem.
    const realceRuas = camada === 'construcao';
    const traco = (i1, j1, i2, j2, eAvenida) => {
      const meioI = (i1 + i2) / 2;
      const meioJ = (j1 + j2) / 2;
      if (!eAvenida && noRio(meioI, meioJ)) return;
      const a = projetar(grade[i1][j1].x, grade[i1][j1].y);
      const b = projetar(grade[i2][j2].x, grade[i2][j2].y);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.strokeStyle = realceRuas ? (eAvenida ? '#FFB321' : 'rgba(255, 179, 33, 0.62)') : eAvenida ? CORES.avenida : CORES.rua;
      c.lineWidth = eAvenida ? 2.1 : 0.9;
      c.stroke();
    };
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        if (j < n) traco(i, j, i, j + 1, avenida(i));
        if (i < n) traco(i, j, i + 1, j, avenida(j));
      }
    }

    // Prédios em ordem de profundidade, para os da frente cobrirem os de trás.
    for (const q of quadras) {
      const destaque = corDaQuadra(q);
      for (const p of q.predios) {
        const u2 = p.u + p.lado;
        const v2 = p.v + p.lado;
        const base = [[p.u, p.v], [u2, p.v], [u2, v2], [p.u, v2]].map(([u, v]) => emQuadra(q, u, v));
        const chao = base.map((b) => projetar(b.x, b.y));
        const teto = base.map((b) => projetar(b.x, b.y, p.altura));
        c.globalAlpha = 1;
        poligono([chao[1], chao[2], teto[2], teto[1]], CORES.lado, CORES.borda, 0.6);
        poligono([chao[3], chao[2], teto[2], teto[3]], CORES.frente, CORES.borda, 0.6);
        poligono(teto, CORES.topo, CORES.borda, 0.6);
        if (destaque) {
          c.globalAlpha = 0.72;
          poligono(teto, destaque, null);
          c.globalAlpha = 0.22;
          poligono([chao[1], chao[2], teto[2], teto[1]], destaque, null);
          poligono([chao[3], chao[2], teto[2], teto[3]], destaque, null);
          c.globalAlpha = 1;
        }
      }
    }

    // Linhas de transporte por cima da maquete, como num mapa de metrô.
    const mostrarLinhas = camada === 'geral' || camada === 'transporte' || camada === 'gestao';
    if (mostrarLinhas) {
      const forte = camada !== 'geral';
      for (const { medida, cor } of rotasMetro) {
        c.beginPath();
        medida.rota.forEach((p, k) => {
          const s = projetar(p.x, p.y, 0.05);
          if (k) c.lineTo(s.x, s.y);
          else c.moveTo(s.x, s.y);
        });
        c.strokeStyle = cor;
        c.globalAlpha = forte ? 1 : 0.72;
        c.lineWidth = forte ? 3.4 : 2.4;
        c.lineJoin = 'round';
        c.stroke();
        c.globalAlpha = 1;
        const estacoes = forte ? 7 : 8;
        medida.rota.forEach((p, k) => {
          if (k % estacoes !== 2) return;
          const s = projetar(p.x, p.y, 0.05);
          c.beginPath();
          c.arc(s.x, s.y, forte ? 4.2 : 3.2, 0, Math.PI * 2);
          c.fillStyle = '#EEF0EA';
          c.fill();
          c.strokeStyle = cor;
          c.lineWidth = 2;
          c.stroke();
        });
      }
    }
    return fora;
  }

  function desenharQuadro(dt) {
    if (!cidade) return;
    if (!fundos.has(camada)) fundos.set(camada, desenharFundo());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fundos.get(camada), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fluxo = camada === 'trafego' ? 1 : camada === 'geral' ? 0.7 : camada === 'transporte' ? 0.3 : 0.25;
    const limite = Math.floor(veiculos.length * fluxo);
    for (let k = 0; k < veiculos.length; k++) {
      const v = veiculos[k];
      v.d += v.v * dt;
      if (k >= limite) continue;
      const p = pontoNaRota(v.rota, v.d);
      const s = projetar(p.x, p.y, 0.03);
      ctx.fillStyle = v.onibus ? '#FFB321' : v.v > 0 ? '#EEF0EA' : '#F0533F';
      const raio = v.onibus ? 2.1 : camada === 'trafego' ? 1.7 : 1.3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, raio, 0, Math.PI * 2);
      ctx.fill();
    }
    if (camada === 'geral' || camada === 'transporte' || camada === 'gestao') {
      for (const linha of rotasMetro) {
        for (let t = 0; t < linha.trens.length; t++) {
          linha.trens[t] += dt * 1.7;
          const p = pontoNaRota(linha.medida, linha.trens[t]);
          const s = projetar(p.x, p.y, 0.05);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        }
      }
    }
  }

  function animar(agora) {
    quadro = requestAnimationFrame(animar);
    if (!visivel || document.hidden) { ultimo = agora; return; }
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    if (dt < 1 / 32) return; // cerca de 30 quadros por segundo já bastam
    ultimo = agora;
    desenharQuadro(dt);
  }

  let espera = 0;
  const aoRedimensionar = () => {
    clearTimeout(espera);
    espera = setTimeout(preparar, 180);
  };
  addEventListener('resize', aoRedimensionar);
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(canvas);
  preparar();
  if (!reduzido) quadro = requestAnimationFrame(animar);

  return {
    definirCamada(nova) {
      camada = nova;
      desenharQuadro(0);
    },
    destruir() {
      cancelAnimationFrame(quadro);
      removeEventListener('resize', aoRedimensionar);
    }
  };
}
