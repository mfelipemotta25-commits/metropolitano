import { criarMapa } from './mapa-cidade.js';
import { criarLetreiro } from './letreiro.js';
import { svgIcone } from './icones.js';

const $ = (id) => document.getElementById(id);

function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'html') el.innerHTML = valor; // usado só com os ícones internos
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2), valor);
    else el.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho !== null && filho !== undefined && filho !== false) el.append(filho);
  }
  return el;
}

function trocar(el, ...filhos) {
  el.replaceChildren(...filhos.flat().filter((f) => f !== null && f !== undefined && f !== false));
}

function urlSegura(url) {
  if (!url) return '';
  try {
    const u = new URL(url, location.href);
    return ['http:', 'https:'].includes(u.protocol) ? url : '';
  } catch { return ''; }
}

function formatarData(iso) {
  if (!iso) return '';
  const data = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

const ancoraVersao = (numero) => `v${String(numero).replace(/[^A-Za-z0-9]+/g, '-')}`;

function idYoutube(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : '';
}

function cabecalho(titulo, intro) {
  return h('header', { class: 'secao-cabecalho' },
    h('h2', {}, titulo),
    intro ? h('p', {}, intro) : null);
}

// Início
function montarHero(dados, ultima) {
  const { hero } = dados;
  $('hero-frase').textContent = hero.frase;
  $('hero-descricao').textContent = hero.descricao;
  $('hero-status').textContent = hero.status;

  const midia = hero.midia || {};
  const area = $('hero-midia');
  if (midia.tipo === 'imagem' && urlSegura(midia.src)) {
    trocar(area, h('img', { src: midia.src, alt: '', fetchpriority: 'high' }));
  } else if (midia.tipo === 'video' && urlSegura(midia.src)) {
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    trocar(area, h('video', { src: midia.src, muted: true, loop: true, playsinline: true, autoplay: !reduzido, poster: midia.poster || undefined }));
    area.querySelector('video').muted = true;
  } else {
    criarMapa($('hero-mapa'), { celula: innerWidth < 700 ? 38 : 50, deslocamentoY: 60 });
  }

  const mensagens = [...(hero.letreiro || [])].filter(Boolean);
  if (ultima) mensagens.push(`VERSAO ${ultima.numero}`);
  criarLetreiro($('letreiro'), mensagens.length ? mensagens : ['EM DESENVOLVIMENTO']);

  const baixar = $('hero-baixar');
  const url = urlSegura(ultima?.download?.url);
  if (url) {
    baixar.href = url;
    baixar.setAttribute('rel', 'noopener');
  }
}

// Sobre
function montarSobre({ sobre }) {
  const imagem = urlSegura(sobre.imagem);
  $('sobre').classList.toggle('com-imagem', Boolean(imagem));
  trocar($('sobre'), 
    h('h2', { class: 'sobre-titulo' }, sobre.titulo),
    h('div', { class: 'sobre-texto' }, sobre.paragrafos.map((p) => h('p', {}, p))),
    imagem ? h('img', { class: 'sobre-imagem', src: imagem, alt: '', loading: 'lazy' }) : null
  );
}

// Recursos: cada sistema acende uma camada da maquete ou mostra a imagem cadastrada
function montarRecursos({ recursos }) {
  const palco = h('canvas', { class: 'recursos-mapa', 'aria-hidden': 'true' });
  const imagem = h('img', { class: 'recursos-imagem', alt: '', hidden: true });
  const aviso = h('p', { class: 'recursos-aviso' }, 'Ilustração do sistema. Não é uma captura do jogo.');
  let mapa = null;
  const botoes = [];

  function selecionar(indice) {
    const item = recursos.itens[indice];
    botoes.forEach((b, k) => {
      b.setAttribute('aria-selected', k === indice ? 'true' : 'false');
      b.tabIndex = k === indice ? 0 : -1;
    });
    const src = urlSegura(item.imagem);
    imagem.hidden = !src;
    aviso.hidden = Boolean(src);
    palco.hidden = Boolean(src);
    if (src) {
      imagem.src = src;
      imagem.alt = item.titulo;
    } else if (mapa) mapa.definirCamada(item.camada || 'geral');
  }

  const lista = h('div', { class: 'recursos-lista', role: 'tablist', 'aria-label': 'Sistemas do jogo', 'aria-orientation': 'vertical' },
    recursos.itens.map((item, k) => {
      const botao = h('button', {
        type: 'button', role: 'tab', class: 'recurso',
        onclick: () => selecionar(k),
        onkeydown: (e) => {
          const passo = { ArrowDown: 1, ArrowUp: -1 }[e.key];
          if (!passo) return;
          e.preventDefault();
          const proximo = (k + passo + recursos.itens.length) % recursos.itens.length;
          selecionar(proximo);
          botoes[proximo].focus();
        }
      },
      h('span', { class: 'recurso-icone', html: svgIcone(item.icone) }),
      h('span', { class: 'recurso-corpo' },
        h('span', { class: 'recurso-titulo' }, item.titulo),
        h('span', { class: 'recurso-texto' }, item.texto)));
      botoes.push(botao);
      return botao;
    }));

  trocar($('recursos'), 
    cabecalho(recursos.titulo, recursos.intro),
    h('div', { class: 'recursos-corpo' },
      lista,
      h('figure', { class: 'recursos-palco' }, palco, imagem, h('figcaption', {}, aviso))));

  if (recursos.itens.length) {
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      mapa = criarMapa(palco, { celula: 30, semente: 2024, camada: recursos.itens[0].camada || 'geral' });
      selecionar(botoes.findIndex((b) => b.getAttribute('aria-selected') === 'true'));
    }, { rootMargin: '300px' }).observe($('recursos'));
    selecionar(0);
  }
}

// Galeria e visualização ampliada
let itensGaleria = [];
let indiceAmpliado = 0;

function mostrarAmpliada(indice) {
  indiceAmpliado = (indice + itensGaleria.length) % itensGaleria.length;
  const item = itensGaleria[indiceAmpliado];
  const area = $('ampliada-midia');
  if (item.tipo === 'youtube') {
    trocar(area, h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${idYoutube(item.src)}?autoplay=1&rel=0`,
      title: item.legenda || 'Vídeo do jogo',
      allow: 'autoplay; encrypted-media; picture-in-picture',
      allowfullscreen: true
    }));
  } else {
    trocar(area, h('img', { src: item.src, alt: item.legenda || 'Imagem do jogo' }));
  }
  $('ampliada-legenda').textContent = item.legenda || '';
  const varios = itensGaleria.length > 1;
  $('ampliada-anterior').hidden = !varios;
  $('ampliada-proxima').hidden = !varios;
  const dialogo = $('ampliada');
  if (!dialogo.open) dialogo.showModal();
}

function montarGaleria({ galeria }) {
  itensGaleria = galeria.itens.filter((i) => (i.tipo === 'youtube' ? idYoutube(i.src) : urlSegura(i.src)));
  const corpo = itensGaleria.length
    ? h('div', { class: 'galeria-grade' }, itensGaleria.map((item, k) => {
      const miniatura = item.tipo === 'youtube'
        ? `https://i.ytimg.com/vi/${idYoutube(item.src)}/hqdefault.jpg`
        : item.miniatura || item.src;
      return h('button', {
        type: 'button', class: `galeria-item${item.tipo === 'youtube' ? ' galeria-video' : ''}`,
        'aria-label': `Ampliar: ${item.legenda || (item.tipo === 'youtube' ? 'vídeo do jogo' : 'imagem do jogo')}`,
        onclick: () => mostrarAmpliada(k)
      },
      h('img', { src: miniatura, alt: '', loading: 'lazy', width: item.largura, height: item.altura }),
      item.legenda ? h('span', { class: 'galeria-legenda' }, item.legenda) : null);
    }))
    : h('p', { class: 'vazio' }, 'As primeiras capturas reais do jogo serão publicadas aqui.');
  trocar($('galeria'), cabecalho(galeria.titulo, itensGaleria.length ? galeria.intro : ''), corpo);
}

function configurarAmpliada() {
  const dialogo = $('ampliada');
  $('ampliada-fechar').addEventListener('click', () => dialogo.close());
  $('ampliada-anterior').addEventListener('click', () => mostrarAmpliada(indiceAmpliado - 1));
  $('ampliada-proxima').addEventListener('click', () => mostrarAmpliada(indiceAmpliado + 1));
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
  dialogo.addEventListener('close', () => $('ampliada-midia').replaceChildren());
  dialogo.addEventListener('keydown', (e) => {
    if (itensGaleria.length < 2) return;
    if (e.key === 'ArrowRight') mostrarAmpliada(indiceAmpliado + 1);
    if (e.key === 'ArrowLeft') mostrarAmpliada(indiceAmpliado - 1);
  });
}

// Roteiro: uma linha de metrô com três trechos
function montarRoteiro({ roteiro }) {
  const trechos = [
    { chave: 'adicionado', titulo: 'Já adicionado', classe: 'trecho-feito', vazio: 'Os recursos entregues aparecem aqui a cada nova versão.' },
    { chave: 'desenvolvimento', titulo: 'Em desenvolvimento', classe: 'trecho-agora', vazio: 'Nenhum item em desenvolvimento neste momento.' },
    { chave: 'embreve', titulo: 'Em breve', classe: 'trecho-breve', vazio: 'Os próximos planos serão anunciados aqui.' }
  ];
  trocar($('roteiro'), 
    cabecalho(roteiro.titulo, roteiro.intro),
    h('div', { class: 'linha-metro' }, trechos.map((t) => {
      const itens = roteiro[t.chave] || [];
      return h('section', { class: `trecho ${t.classe}` },
        h('h3', { class: 'trecho-titulo' }, t.titulo),
        itens.length
          ? h('ol', { class: 'estacoes' }, itens.map((item) => h('li', { class: 'estacao' },
            h('span', { class: 'estacao-nome' }, item.titulo),
            item.texto ? h('span', { class: 'estacao-texto' }, item.texto) : null,
            item.versao ? h('a', { class: 'estacao-versao', href: `#${ancoraVersao(item.versao)}` }, `Versão ${item.versao}`) : null)))
          : h('p', { class: 'trecho-vazio' }, t.vazio));
    })));
}

// Atualizações
function listaMudancas(titulo, itens, classe) {
  if (!itens || !itens.length) return null;
  return h('div', { class: `mudancas ${classe}` },
    h('h4', {}, titulo),
    h('ul', {}, itens.map((i) => h('li', {}, i))));
}

function montarAtualizacoes({ atualizacoes, versoes }) {
  const corpo = versoes.length
    ? h('div', { class: 'versoes' }, versoes.map((v, k) => {
      const url = urlSegura(v.download?.url);
      return h('details', { class: 'versao', id: ancoraVersao(v.numero), open: k === 0 },
        h('summary', {},
          h('span', { class: 'versao-numero' }, `Versão ${v.numero}`),
          v.titulo ? h('span', { class: 'versao-titulo' }, v.titulo) : null,
          h('time', { datetime: v.data }, formatarData(v.data))),
        h('div', { class: 'versao-corpo' },
          v.resumo ? h('p', { class: 'versao-resumo' }, v.resumo) : null,
          h('div', { class: 'versao-listas' },
            listaMudancas('Adicionado', v.adicionado, 'm-adicionado'),
            listaMudancas('Modificado', v.modificado, 'm-modificado'),
            listaMudancas('Corrigido', v.corrigido, 'm-corrigido')),
          url ? h('a', { class: 'versao-baixar', href: url, rel: 'noopener' }, `Baixar a versão ${v.numero}`) : null));
    }))
    : h('p', { class: 'vazio' }, 'A primeira versão ainda não foi publicada. Quando sair, as novidades aparecem aqui.');
  trocar($('atualizacoes'), cabecalho(atualizacoes.titulo, atualizacoes.intro), corpo);
}

// Downloads
function tabelaRequisitos(titulo, linhas) {
  if (!linhas?.length) return null;
  return h('div', { class: 'requisitos-coluna' },
    h('h4', {}, titulo),
    h('dl', {}, linhas.flatMap((l) => [h('dt', {}, l.nome), h('dd', {}, l.valor)])));
}

function montarDownloads({ downloads, versoes }, ultima) {
  const url = urlSegura(ultima?.download?.url);
  const principal = url
    ? h('div', { class: 'baixar' },
      h('p', { class: 'baixar-versao' }, `Versão ${ultima.numero}`),
      h('dl', { class: 'baixar-dados' },
        h('dt', {}, 'Última atualização'), h('dd', {}, formatarData(ultima.data)),
        h('dt', {}, 'Sistema'), h('dd', {}, 'Windows'),
        ultima.download.tamanho ? [h('dt', {}, 'Tamanho'), h('dd', {}, formatarTamanho(ultima.download.tamanho))] : null),
      h('a', { class: 'botao botao-principal', href: url, rel: 'noopener' }, 'BAIXAR PARA WINDOWS'),
      downloads.observacao ? h('p', { class: 'baixar-nota' }, downloads.observacao) : null)
    : h('div', { class: 'baixar' },
      h('p', { class: 'baixar-versao' }, 'Em breve'),
      h('p', { class: 'baixar-nota' }, 'A primeira versão para download ainda não foi publicada.'),
      h('a', { class: 'botao botao-secundario', href: '#roteiro' }, 'VER O ROTEIRO'));

  const { minimos = [], recomendados = [] } = downloads.requisitos || {};
  const requisitos = minimos.length || recomendados.length
    ? [tabelaRequisitos('Mínimos', minimos), tabelaRequisitos('Recomendados', recomendados)]
    : [h('p', { class: 'trecho-vazio' }, 'Os requisitos do sistema serão informados com a primeira versão.')];

  const anteriores = versoes.filter((v) => v !== ultima && urlSegura(v.download?.url));
  trocar($('downloads'), 
    cabecalho(downloads.titulo, downloads.intro),
    h('div', { class: 'downloads-corpo' },
      principal,
      h('div', { class: 'requisitos' }, h('h3', {}, 'Requisitos do sistema'), h('div', { class: 'requisitos-grade' }, requisitos))),
    anteriores.length
      ? h('div', { class: 'anteriores' },
        h('h3', {}, 'Versões anteriores'),
        h('ul', {}, anteriores.map((v) => h('li', {},
          h('a', { href: `#${ancoraVersao(v.numero)}` }, `Versão ${v.numero}`),
          h('span', {}, formatarData(v.data)),
          h('a', { href: urlSegura(v.download.url), rel: 'noopener' }, 'Baixar')))))
      : null);
}

// Rodapé
function montarRodape({ rodape }) {
  const redes = (rodape.redes || []).filter((r) => r.nome && urlSegura(r.url));
  trocar($('rodape'), 
    h('p', { class: 'rodape-marca' }, 'METROPOLITANO'),
    h('nav', { 'aria-label': 'Rodapé' }, [
      ['Sobre', '#sobre'], ['Recursos', '#recursos'], ['Galeria', '#galeria'], ['Roteiro', '#roteiro'],
      ['Atualizações', '#atualizacoes'], ['Downloads', '#downloads']
    ].map(([t, u]) => h('a', { href: u }, t))),
    redes.length
      ? h('nav', { 'aria-label': 'Redes sociais' }, redes.map((r) => h('a', { href: r.url, rel: 'noopener', target: '_blank' }, r.nome)))
      : null,
    h('p', { class: 'rodape-direitos' }, `© ${new Date().getFullYear()} ${rodape.copyright}`));
}

// Navegação
function configurarNavegacao() {
  const topo = $('topo');
  const botao = $('menu-botao');
  const nav = $('navegacao');
  const aoRolar = () => topo.classList.toggle('topo-solido', scrollY > 40);
  addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();
  botao.addEventListener('click', () => {
    const aberto = nav.classList.toggle('aberta');
    botao.setAttribute('aria-expanded', aberto);
    botao.textContent = aberto ? 'Fechar' : 'Menu';
  });
  nav.addEventListener('click', (e) => {
    if (e.target.tagName !== 'A') return;
    nav.classList.remove('aberta');
    botao.setAttribute('aria-expanded', 'false');
    botao.textContent = 'Menu';
  });
}

function irParaAncora() {
  if (!location.hash) return;
  const alvo = document.getElementById(location.hash.slice(1));
  if (!alvo) return;
  if (alvo.tagName === 'DETAILS') alvo.open = true;
  alvo.scrollIntoView();
}

async function iniciar() {
  configurarNavegacao();
  configurarAmpliada();
  let dados;
  try {
    const minuto = Math.floor(Date.now() / 60000);
    const resposta = await fetch(`data/site.json?v=${minuto}`);
    if (!resposta.ok) throw new Error(String(resposta.status));
    dados = await resposta.json();
  } catch {
    document.querySelectorAll('#conteudo > .secao:not(#erro-carga)').forEach((s) => { s.hidden = true; });
    $('erro-carga').hidden = false;
    criarMapa($('hero-mapa'), { celula: 50, deslocamentoY: 60 });
    return;
  }
  const ultima = dados.versoes.find((v) => urlSegura(v.download?.url)) || null;
  montarHero(dados, ultima);
  montarSobre(dados);
  montarRecursos(dados);
  montarGaleria(dados);
  montarRoteiro(dados);
  montarAtualizacoes(dados);
  montarDownloads(dados, ultima);
  montarRodape(dados);
  addEventListener('hashchange', irParaAncora);
  irParaAncora();
}

iniciar();
