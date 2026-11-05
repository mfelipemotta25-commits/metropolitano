import { GitHub, ErroGitHub, LIMITE_RELEASE } from './github.js';
import { ICONES } from '../../js/icones.js';

const app = document.getElementById('app');
const CHAVE_ACESSO = 'metropolitano.acesso';
const CHAVE_ENVIO = 'metropolitano.envio';
const LIMITE_VIDEO = 90 * 1024 * 1024;

const estado = {
  gh: null,
  info: null,
  original: '',
  dados: null,
  pendentes: new Map(), // caminho do arquivo -> Blob ainda não publicado
  previas: new Map(),
  secao: 'geral',
  editandoVersao: null,
  publicando: false
};

// Utilitários
function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'value') el.value = valor;
    else if (chave === 'checked' || chave === 'disabled') el[chave] = Boolean(valor);
    else if (chave === 'html') el.innerHTML = valor; // só com ícones internos
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2), valor);
    else el.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho !== null && filho !== undefined && filho !== false) el.append(filho);
  }
  return el;
}

function preencher(el, ...filhos) {
  el.replaceChildren(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false));
}

let temporizadorAviso = 0;
function avisar(texto, falha = false) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.classList.toggle('falha', falha);
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, falha ? 9000 : 5000);
}

function confirmar(titulo, texto, rotulo, perigoso = false) {
  return new Promise((resolver) => {
    const d = document.getElementById('dialogo');
    const fechar = (v) => { d.close(); resolver(v); };
    preencher(d, 
      h('h2', {}, titulo),
      h('p', {}, texto),
      h('div', { class: 'dialogo-acoes' },
        h('button', { type: 'button', onclick: () => fechar(false) }, 'Cancelar'),
        h('button', { type: 'button', class: perigoso ? 'perigo' : 'primario', onclick: () => fechar(true) }, rotulo)));
    d.oncancel = (e) => { e.preventDefault(); fechar(false); };
    d.showModal();
  });
}

const novoId = () => Math.random().toString(36).slice(2, 10);
const fatia = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
const linhas = (t) => t.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function caminhoNovo(nome, extensao) {
  const base = fatia(nome.replace(/\.[^.]+$/, '')).toLowerCase().slice(0, 40) || 'arquivo';
  return `assets/uploads/${base}-${novoId()}.${extensao}`;
}

function srcPrevia(caminho) {
  if (!caminho) return '';
  if (/^https?:/.test(caminho)) return caminho;
  if (estado.previas.has(caminho)) return estado.previas.get(caminho);
  return estado.gh.urlBruta(caminho);
}

function guardarArquivo(caminho, blob) {
  estado.pendentes.set(caminho, blob);
  estado.previas.set(caminho, URL.createObjectURL(blob));
}

function canvasParaBlob(canvas, tipo, qualidade) {
  return new Promise((r) => canvas.toBlob(r, tipo, qualidade));
}

// Reduz as imagens antes de publicar, para o site continuar rápido.
async function otimizarImagem(arquivo, maxLado = 2400) {
  if (!arquivo.type.startsWith('image/')) throw new Error(`${arquivo.name} não é uma imagem.`);
  if (arquivo.type === 'image/svg+xml' || arquivo.type === 'image/gif') {
    return { blob: arquivo, extensao: arquivo.type === 'image/gif' ? 'gif' : 'svg' };
  }
  const bitmap = await createImageBitmap(arquivo);
  const desenhar = async (lado) => {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await canvasParaBlob(canvas, 'image/webp', 0.86);
    let extensao = 'webp';
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasParaBlob(canvas, 'image/jpeg', 0.88);
      extensao = 'jpg';
    }
    return { blob, extensao, largura: canvas.width, altura: canvas.height };
  };
  const principal = await desenhar(maxLado);
  const miniatura = await desenhar(960);
  bitmap.close();
  return { ...principal, miniatura };
}

// Campos reutilizáveis
function atualizarBarra() {
  const pendente = temMudancas();
  const texto = document.getElementById('barra-estado');
  if (!texto) return;
  texto.textContent = pendente ? 'Há alterações que ainda não estão no site' : 'Tudo publicado';
  texto.classList.toggle('pendente', pendente);
  document.getElementById('botao-publicar').disabled = !pendente || estado.publicando;
  document.getElementById('botao-descartar').hidden = !pendente;
}

function temMudancas() {
  return estado.pendentes.size > 0 || JSON.stringify(estado.dados) !== estado.original;
}

function campoTexto(rotulo, obj, chave, { area = false, ajuda, tipo = 'text', linhasArea } = {}) {
  const id = `c-${novoId()}`;
  const aoMudar = (e) => { obj[chave] = e.target.value; atualizarBarra(); };
  const campo = area
    ? h('textarea', { id, rows: linhasArea || 3, oninput: aoMudar }, obj[chave] || '')
    : h('input', { id, type: tipo, value: obj[chave] || '', oninput: aoMudar });
  return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), campo, ajuda ? h('span', { class: 'ajuda' }, ajuda) : null);
}

function campoLista(rotulo, obj, chave, ajuda) {
  const id = `c-${novoId()}`;
  return h('div', { class: 'campo' },
    h('label', { for: id }, rotulo),
    h('textarea', { id, rows: 4, oninput: (e) => { obj[chave] = linhas(e.target.value); atualizarBarra(); } }, (obj[chave] || []).join('\n')),
    ajuda ? h('span', { class: 'ajuda' }, ajuda) : null);
}

function escolherArquivo(aceita, multiplo, aoEscolher) {
  const entrada = h('input', { type: 'file', accept: aceita, multiple: multiplo, hidden: true });
  entrada.addEventListener('change', () => { if (entrada.files.length) aoEscolher([...entrada.files]); entrada.remove(); });
  document.body.append(entrada);
  entrada.click();
}

function campoImagem(rotulo, obj, chave, { ajuda, maxLado } = {}) {
  const previa = () => (obj[chave]
    ? h('img', { class: 'imagem-previa', src: srcPrevia(obj[chave]), alt: `Imagem atual: ${rotulo}` })
    : h('div', { class: 'imagem-previa' }, 'Sem imagem'));
  const caixa = h('div', {}, previa());
  const acoes = h('div', { class: 'acoes-linha' });
  const remontar = () => {
    preencher(caixa, previa());
    preencher(acoes, 
      h('button', { type: 'button', onclick: trocar }, obj[chave] ? 'Trocar imagem' : 'Adicionar imagem'),
      obj[chave] ? h('button', { type: 'button', class: 'discreto', onclick: remover }, 'Remover') : null);
    atualizarBarra();
  };
  const trocar = () => escolherArquivo('image/*', false, async ([arquivo]) => {
    try {
      const r = await otimizarImagem(arquivo, maxLado);
      const caminho = caminhoNovo(arquivo.name, r.extensao);
      guardarArquivo(caminho, r.blob);
      obj[chave] = caminho;
      remontar();
    } catch (e) { avisar(e.message, true); }
  });
  const remover = () => { obj[chave] = ''; remontar(); };
  remontar();
  return h('div', { class: 'campo imagem-campo' }, caixa, h('div', {},
    h('p', { class: 'rotulo' }, rotulo),
    ajuda ? h('p', { class: 'ajuda', style: 'margin-bottom:10px' }, ajuda) : null,
    acoes));
}

function botoesOrdem(lista, indice, redesenhar) {
  const mover = (d) => {
    const [item] = lista.splice(indice, 1);
    lista.splice(indice + d, 0, item);
    redesenhar();
  };
  return [
    h('button', { type: 'button', class: 'discreto', disabled: indice === 0, 'aria-label': 'Mover para cima', onclick: () => mover(-1) }, 'Subir'),
    h('button', { type: 'button', class: 'discreto', disabled: indice === lista.length - 1, 'aria-label': 'Mover para baixo', onclick: () => mover(1) }, 'Descer')
  ];
}

// Seções do painel
const SECOES = {
  geral: { nome: 'Visão geral', montar: secaoGeral },
  versoes: { nome: 'Versões e downloads', montar: secaoVersoes },
  galeria: { nome: 'Galeria', montar: secaoGaleria },
  roteiro: { nome: 'Roteiro', montar: secaoRoteiro },
  inicio: { nome: 'Página inicial', montar: secaoInicio },
  sobre: { nome: 'Sobre o jogo', montar: secaoSobre },
  recursos: { nome: 'Recursos', montar: secaoRecursos },
  rodape: { nome: 'Rodapé e busca', montar: secaoRodape }
};

function secaoGeral() {
  const d = estado.dados;
  const ultima = d.versoes[0];
  const verificacoes = h('ul', { class: 'verificacoes' },
    h('li', {}, h('span', { class: 'ok' }, 'Sim'), h('span', {}, `Painel conectado a ${estado.info.full_name}.`)));
  const adicionar = (ok, texto) => verificacoes.append(h('li', {}, h('span', { class: ok ? 'ok' : 'nao' }, ok ? 'Sim' : 'Não'), h('span', {}, texto)));
  adicionar(estado.info.has_pages !== false, estado.info.has_pages === false ? 'O GitHub Pages ainda não está ativo. Ative em Settings, Pages, com a pasta raiz do ramo principal.' : 'GitHub Pages ativo.');
  estado.gh.workflowExiste()
    .then((ok) => adicionar(ok, ok ? 'Automação de envio de arquivos instalada.' : 'A automação de envio de arquivos não foi encontrada. Envie a pasta .github ao repositório.'))
    .catch(() => adicionar(false, 'Não foi possível verificar a automação de envio. Confira a permissão Actions do token.'));
  return [
    h('h1', {}, 'Visão geral'),
    h('p', { class: 'intro' }, 'Edite o que quiser nas seções ao lado. Nada muda no site até você usar o botão Publicar alterações, no topo da página.'),
    h('section', { class: 'bloco' }, h('h2', {}, 'Situação'), verificacoes),
    h('section', { class: 'bloco' },
      h('h2', {}, 'Agora no site'),
      h('p', {}, ultima ? `Versão mais recente: ${ultima.numero}, de ${ultima.data}.` : 'Nenhuma versão publicada ainda.'),
      h('p', {}, `${d.galeria.itens.length} ${d.galeria.itens.length === 1 ? 'item' : 'itens'} na galeria. ${d.roteiro.desenvolvimento.length} em desenvolvimento e ${d.roteiro.embreve.length} em breve no roteiro.`),
      h('div', { class: 'acoes-linha', style: 'margin-top:14px' },
        h('button', { type: 'button', class: 'primario', onclick: () => { estado.editandoVersao = 'nova'; irPara('versoes'); } }, 'Lançar nova versão'),
        h('button', { type: 'button', onclick: () => irPara('galeria') }, 'Adicionar à galeria'),
        h('a', { class: 'botao', href: '../', target: '_blank', rel: 'noopener' }, 'Abrir o site')))
  ];
}

function secaoInicio() {
  const { hero } = estado.dados;
  hero.midia ||= { tipo: 'mapa', src: '' };
  const areaMidia = h('div', {});
  const montarMidia = () => {
    const opcao = (valor, texto) => h('label', {}, h('input', {
      type: 'radio', name: 'midia-inicio', checked: hero.midia.tipo === valor,
      onchange: () => { hero.midia.tipo = valor; montarMidia(); atualizarBarra(); }
    }), texto);
    preencher(areaMidia, 
      h('div', { class: 'radio-grupo' }, opcao('mapa', 'Maquete animada do site'), opcao('imagem', 'Imagem do jogo'), opcao('video', 'Vídeo do jogo')),
      hero.midia.tipo === 'imagem' ? campoImagem('Imagem panorâmica', hero.midia, 'src', { ajuda: 'Use uma captura larga, de preferência com 1920 px ou mais.' }) : null,
      hero.midia.tipo === 'video' ? h('div', { class: 'campo' },
        h('p', { class: 'rotulo' }, 'Vídeo panorâmico (MP4 de até 90 MB)'),
        hero.midia.src ? h('video', { class: 'imagem-previa', src: srcPrevia(hero.midia.src), muted: true, controls: true, style: 'max-width:360px;margin-bottom:10px' }) : null,
        h('button', {
          type: 'button',
          onclick: () => escolherArquivo('video/mp4,video/webm', false, ([arquivo]) => {
            if (arquivo.size > LIMITE_VIDEO) { avisar('Esse vídeo passa de 90 MB. Comprima o arquivo e tente de novo.', true); return; }
            const caminho = caminhoNovo(arquivo.name, arquivo.name.split('.').pop().toLowerCase());
            guardarArquivo(caminho, arquivo);
            hero.midia.src = caminho;
            montarMidia();
            atualizarBarra();
          })
        }, hero.midia.src ? 'Trocar vídeo' : 'Escolher vídeo')) : null);
  };
  montarMidia();
  const letreiro = { texto: (hero.letreiro || []).join('\n') };
  return [
    h('h1', {}, 'Página inicial'),
    h('p', { class: 'intro' }, 'A primeira tela que os visitantes veem.'),
    h('section', { class: 'bloco' }, h('h2', {}, 'Fundo da primeira tela'), areaMidia),
    h('section', { class: 'bloco' }, h('h2', {}, 'Textos'),
      campoTexto('Frase de apresentação', hero, 'frase'),
      campoTexto('Descrição', hero, 'descricao', { area: true }),
      campoTexto('Aviso de desenvolvimento', hero, 'status'),
      h('div', { class: 'campo' },
        h('label', { for: 'letreiro-campo' }, 'Mensagens do letreiro'),
        h('textarea', { id: 'letreiro-campo', rows: 3, oninput: (e) => { hero.letreiro = linhas(e.target.value); atualizarBarra(); } }, letreiro.texto),
        h('span', { class: 'ajuda' }, 'Uma mensagem por linha. A versão mais recente é adicionada sozinha.')))
  ];
}

function secaoSobre() {
  const { sobre } = estado.dados;
  const texto = { valor: sobre.paragrafos.join('\n\n') };
  return [
    h('h1', {}, 'Sobre o jogo'),
    h('p', { class: 'intro' }, 'A proposta do Metropolitano, em poucas palavras.'),
    h('section', { class: 'bloco' },
      campoTexto('Título', sobre, 'titulo'),
      h('div', { class: 'campo' },
        h('label', { for: 'sobre-texto' }, 'Texto'),
        h('textarea', { id: 'sobre-texto', rows: 10, oninput: (e) => { sobre.paragrafos = e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean); atualizarBarra(); } }, texto.valor),
        h('span', { class: 'ajuda' }, 'Deixe uma linha em branco entre os parágrafos.')),
      campoImagem('Imagem da seção (opcional)', sobre, 'imagem'))
  ];
}

function secaoRecursos() {
  const { recursos } = estado.dados;
  const lista = h('div', {});
  const redesenhar = () => {
    preencher(lista, ...recursos.itens.map((item, k) => h('div', { class: 'item-lista' },
      h('div', { class: 'item-lista-topo' },
        h('strong', {}, item.titulo || 'Novo recurso'),
        h('div', { class: 'acoes-linha' }, botoesOrdem(recursos.itens, k, () => { redesenhar(); atualizarBarra(); }),
          h('button', { type: 'button', class: 'discreto perigo', onclick: () => { recursos.itens.splice(k, 1); redesenhar(); atualizarBarra(); } }, 'Excluir'))),
      h('div', { class: 'duas' },
        campoTexto('Nome', item, 'titulo'),
        h('div', { class: 'campo' },
          h('label', { for: `ic-${item.id}` }, 'Ícone'),
          h('select', { id: `ic-${item.id}`, onchange: (e) => { item.icone = e.target.value; atualizarBarra(); } },
            Object.entries(ICONES).map(([chave, { nome }]) => {
              const o = h('option', { value: chave }, nome);
              o.selected = chave === item.icone;
              return o;
            })))),
      campoTexto('Descrição', item, 'texto', { area: true }),
      campoImagem('Imagem real deste sistema (opcional)', item, 'imagem', { ajuda: 'Sem imagem, o site mostra a maquete ilustrativa, com um aviso de que não é captura do jogo.' }))));
  };
  redesenhar();
  return [
    h('h1', {}, 'Recursos'),
    h('p', { class: 'intro' }, 'Os sistemas que aparecem na seção de recursos do site.'),
    h('section', { class: 'bloco' }, campoTexto('Título da seção', recursos, 'titulo'), campoTexto('Introdução', recursos, 'intro', { area: true })),
    h('section', { class: 'bloco' }, lista,
      h('button', { type: 'button', onclick: () => { recursos.itens.push({ id: novoId(), icone: 'rua', camada: 'geral', titulo: '', texto: '', imagem: '' }); redesenhar(); atualizarBarra(); } }, 'Adicionar recurso'))
  ];
}

function secaoGaleria() {
  const { galeria } = estado.dados;
  const grade = h('div', { class: 'grade-galeria' });

  const substituir = (item, arquivo) => otimizarImagem(arquivo).then((r) => {
    const caminho = caminhoNovo(arquivo.name, r.extensao);
    guardarArquivo(caminho, r.blob);
    item.tipo = 'imagem';
    item.src = caminho;
    item.largura = r.largura;
    item.altura = r.altura;
    if (r.miniatura) {
      const mini = caminho.replace(/(\.[^.]+)$/, '-mini$1');
      guardarArquivo(mini, r.miniatura.blob);
      item.miniatura = mini;
    } else delete item.miniatura;
  });

  const adicionar = async (arquivos) => {
    let erros = 0;
    for (const arquivo of arquivos) {
      try {
        const item = { id: novoId(), tipo: 'imagem', src: '', legenda: '' };
        await substituir(item, arquivo);
        galeria.itens.push(item);
      } catch { erros++; }
    }
    redesenhar();
    atualizarBarra();
    if (erros) avisar(`${erros} ${erros === 1 ? 'arquivo não pôde ser lido' : 'arquivos não puderam ser lidos'} como imagem.`, true);
    else avisar(`${arquivos.length} ${arquivos.length === 1 ? 'imagem adicionada' : 'imagens adicionadas'}. Publique para aparecer no site.`);
  };

  const vazia = h('p', { class: 'ajuda' }, 'A galeria ainda está vazia. Adicione a primeira imagem acima.');
  const redesenhar = () => {
    vazia.hidden = galeria.itens.length > 0;
    preencher(grade, ...galeria.itens.map((item, k) => {
      const src = item.tipo === 'youtube'
        ? `https://i.ytimg.com/vi/${idYoutube(item.src)}/hqdefault.jpg`
        : srcPrevia(item.miniatura || item.src);
      return h('div', { class: 'item-galeria' },
        h('img', { src, alt: item.legenda || 'Item da galeria' }),
        item.tipo === 'youtube' ? h('span', { class: 'selo' }, 'Vídeo') : null,
        campoTexto('Legenda', item, 'legenda'),
        h('div', { class: 'acoes-linha' },
          botoesOrdem(galeria.itens, k, () => { redesenhar(); atualizarBarra(); }),
          item.tipo === 'imagem' ? h('button', {
            type: 'button', class: 'discreto',
            onclick: () => escolherArquivo('image/*', false, async ([a]) => {
              try { await substituir(item, a); redesenhar(); atualizarBarra(); } catch (e) { avisar(e.message, true); }
            })
          }, 'Trocar') : null,
          h('button', { type: 'button', class: 'discreto perigo', onclick: () => { galeria.itens.splice(k, 1); redesenhar(); atualizarBarra(); } }, 'Excluir')));
    }));
  };
  redesenhar();

  const zona = h('div', {
    class: 'soltar',
    ondragover: (e) => { e.preventDefault(); zona.classList.add('ativo'); },
    ondragleave: () => zona.classList.remove('ativo'),
    ondrop: (e) => {
      e.preventDefault();
      zona.classList.remove('ativo');
      if (e.dataTransfer.files.length) adicionar([...e.dataTransfer.files]);
    }
  },
  h('p', {}, 'Arraste imagens para cá ou escolha do computador.'),
  h('button', { type: 'button', class: 'primario', onclick: () => escolherArquivo('image/*', true, adicionar) }, 'Escolher imagens'),
  h('p', { class: 'ajuda' }, 'As imagens são reduzidas automaticamente para carregar rápido.'));

  const video = { url: '' };
  const entradaVideo = h('input', { id: 'video-url', type: 'url', placeholder: 'https://www.youtube.com/watch?v=...', oninput: (e) => { video.url = e.target.value; } });
  return [
    h('h1', {}, 'Galeria'),
    h('p', { class: 'intro' }, 'Use apenas imagens e vídeos reais do jogo. A primeira imagem aparece maior no site.'),
    h('section', { class: 'bloco' }, campoTexto('Texto de apresentação', galeria, 'intro')),
    h('section', { class: 'bloco' }, zona,
      h('div', { class: 'campo' },
        h('label', { for: 'video-url' }, 'Adicionar vídeo do YouTube'),
        entradaVideo,
        h('button', {
          type: 'button', style: 'margin-top:8px',
          onclick: () => {
            if (!idYoutube(video.url)) { avisar('Esse não parece ser um link do YouTube. Copie o endereço do vídeo e tente de novo.', true); return; }
            galeria.itens.push({ id: novoId(), tipo: 'youtube', src: video.url, legenda: '' });
            video.url = '';
            entradaVideo.value = '';
            redesenhar();
            atualizarBarra();
          }
        }, 'Adicionar vídeo'))),
    h('section', { class: 'bloco' }, vazia, grade)
  ];
}

function idYoutube(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : '';
}

function secaoRoteiro() {
  const { roteiro } = estado.dados;
  const colunas = [
    ['adicionado', 'Já adicionado', '#2EC27E'],
    ['desenvolvimento', 'Em desenvolvimento', '#FFB321'],
    ['embreve', 'Em breve', '#5B9DFF']
  ];
  const area = h('div', { class: 'colunas-roteiro' });
  const redesenhar = () => {
    preencher(area, ...colunas.map(([chave, titulo, cor], c) => {
      const lista = roteiro[chave];
      return h('section', { class: 'coluna-roteiro', style: `--cor:${cor}` },
        h('h2', {}, titulo),
        lista.map((item, k) => h('div', { class: 'item-lista' },
          campoTexto('Título', item, 'titulo'),
          campoTexto('Detalhe (opcional)', item, 'texto', { area: true, linhasArea: 2 }),
          h('div', { class: 'acoes-linha' },
            botoesOrdem(lista, k, () => { redesenhar(); atualizarBarra(); }),
            colunas.map(([destino, nome], d) => (d === c ? null : h('button', {
              type: 'button', class: 'discreto',
              onclick: () => { lista.splice(k, 1); roteiro[destino].push(item); redesenhar(); atualizarBarra(); }
            }, `Mover: ${nome}`))),
            h('button', { type: 'button', class: 'discreto perigo', onclick: () => { lista.splice(k, 1); redesenhar(); atualizarBarra(); } }, 'Excluir')))),
        h('button', { type: 'button', onclick: () => { lista.push({ id: novoId(), titulo: '', texto: '' }); redesenhar(); atualizarBarra(); } }, 'Adicionar item'));
    }));
  };
  redesenhar();
  return [
    h('h1', {}, 'Roteiro'),
    h('p', { class: 'intro' }, 'Mostre o que já foi adicionado, o que está em desenvolvimento e o que vem em breve.'),
    h('section', { class: 'bloco' }, campoTexto('Introdução', roteiro, 'intro', { area: true, linhasArea: 2 })),
    area
  ];
}

function secaoRodape() {
  const d = estado.dados;
  const redes = h('div', {});
  const redesenhar = () => {
    preencher(redes, ...d.rodape.redes.map((r, k) => h('div', { class: 'linha-par' },
      h('input', { 'aria-label': 'Nome da rede', placeholder: 'Instagram', value: r.nome, oninput: (e) => { r.nome = e.target.value; atualizarBarra(); } }),
      h('input', { 'aria-label': 'Endereço', type: 'url', placeholder: 'https://', value: r.url, oninput: (e) => { r.url = e.target.value; atualizarBarra(); } }),
      h('button', { type: 'button', class: 'discreto perigo', onclick: () => { d.rodape.redes.splice(k, 1); redesenhar(); atualizarBarra(); } }, 'Excluir'))));
  };
  redesenhar();
  return [
    h('h1', {}, 'Rodapé e busca'),
    h('p', { class: 'intro' }, 'Redes sociais, direitos autorais e como o site aparece no Google e nos compartilhamentos.'),
    h('section', { class: 'bloco' }, h('h2', {}, 'Redes sociais'), redes,
      h('button', { type: 'button', onclick: () => { d.rodape.redes.push({ nome: '', url: '' }); redesenhar(); atualizarBarra(); } }, 'Adicionar rede')),
    h('section', { class: 'bloco' }, h('h2', {}, 'Direitos autorais'), campoTexto('Texto', d.rodape, 'copyright', { ajuda: 'O símbolo © e o ano entram sozinhos.' })),
    h('section', { class: 'bloco' }, h('h2', {}, 'Busca e compartilhamento'),
      campoTexto('Título da página', d.meta, 'titulo'),
      campoTexto('Descrição', d.meta, 'descricao', { area: true, ajuda: 'Até cerca de 160 caracteres funciona melhor no Google.' }),
      campoImagem('Imagem de compartilhamento', d.meta, 'imagemCompartilhamento', { maxLado: 1200, ajuda: 'Aparece quando alguém envia o link do site. Use uma imagem larga.' }))
  ];
}

// Versões
function secaoVersoes() {
  if (estado.editandoVersao !== null) return formularioVersao();
  const d = estado.dados;
  const lista = h('div', {});
  const redesenhar = () => {
    preencher(lista, ...(d.versoes.length ? d.versoes.map((v, k) => h('div', { class: 'versao-linha' },
      h('div', {},
        h('strong', {}, `Versão ${v.numero}`),
        k === 0 ? h('span', { class: 'selo' }, 'Mais recente') : null,
        h('p', { class: 'ajuda' }, `${v.data}. ${v.download?.url ? `Arquivo: ${v.download.nomeArquivo || 'link externo'}` : 'Sem arquivo para download'}`)),
      h('div', { class: 'acoes-linha' },
        botoesOrdem(d.versoes, k, () => { redesenhar(); atualizarBarra(); }),
        h('button', { type: 'button', onclick: () => { estado.editandoVersao = k; irPara('versoes'); } }, 'Editar'),
        h('button', {
          type: 'button', class: 'discreto perigo',
          onclick: async () => {
            const ok = await confirmar('Tirar esta versão do site?', `A versão ${v.numero} deixa de aparecer depois de publicar. O arquivo enviado continua guardado nos Releases do GitHub.`, 'Tirar do site', true);
            if (ok) { d.versoes.splice(k, 1); redesenhar(); atualizarBarra(); }
          }
        }, 'Excluir')))) : [h('p', { class: 'ajuda' }, 'Nenhuma versão ainda. Lance a primeira para liberar o download no site.')]));
  };
  redesenhar();

  const req = d.downloads.requisitos;
  const tabela = (titulo, chave) => {
    const area = h('div', {});
    const desenhar = () => {
      preencher(area, ...req[chave].map((l, k) => h('div', { class: 'linha-par' },
        h('input', { 'aria-label': 'Item', placeholder: 'Processador', value: l.nome, oninput: (e) => { l.nome = e.target.value; atualizarBarra(); } }),
        h('input', { 'aria-label': 'Valor', placeholder: 'Descreva o requisito', value: l.valor, oninput: (e) => { l.valor = e.target.value; atualizarBarra(); } }),
        h('button', { type: 'button', class: 'discreto perigo', onclick: () => { req[chave].splice(k, 1); desenhar(); atualizarBarra(); } }, 'Excluir'))));
    };
    desenhar();
    return h('div', { style: 'margin-bottom:20px' }, h('p', { class: 'rotulo' }, titulo), area,
      h('button', { type: 'button', onclick: () => { req[chave].push({ nome: '', valor: '' }); desenhar(); atualizarBarra(); } }, 'Adicionar item'));
  };

  return [
    h('h1', {}, 'Versões e downloads'),
    h('p', { class: 'intro' }, 'Cada versão aparece em Atualizações. A mais recente vira o download principal do site.'),
    h('button', { type: 'button', class: 'primario', onclick: () => { estado.editandoVersao = 'nova'; irPara('versoes'); } }, 'Lançar nova versão'),
    h('section', { class: 'bloco', style: 'margin-top:22px' }, h('h2', {}, 'Versões'), lista),
    h('section', { class: 'bloco' }, h('h2', {}, 'Requisitos do sistema'), tabela('Mínimos', 'minimos'), tabela('Recomendados', 'recomendados')),
    h('section', { class: 'bloco' }, h('h2', {}, 'Textos da seção'),
      campoTexto('Introdução', d.downloads, 'intro'),
      campoTexto('Observação abaixo do botão', d.downloads, 'observacao', { area: true, linhasArea: 2 })),
    h('section', { class: 'bloco' }, campoTexto('Introdução da seção Atualizações', d.atualizacoes, 'intro'))
  ];
}

function formularioVersao() {
  const d = estado.dados;
  const nova = estado.editandoVersao === 'nova';
  const existente = nova ? null : d.versoes[estado.editandoVersao];
  const v = existente
    ? JSON.parse(JSON.stringify(existente))
    : { id: novoId(), numero: '', data: hoje(), titulo: '', resumo: '', adicionado: [], modificado: [], corrigido: [], download: null };
  const envio = { modo: v.download?.origem === 'externo' ? 'link' : 'arquivo', arquivo: null, link: v.download?.origem === 'externo' ? v.download.url : '' };
  const concluidos = new Set();
  const erro = h('p', { class: 'erro', role: 'alert', hidden: true });

  const areaArquivo = h('div', {});
  const montarArquivo = () => {
    const opcao = (valor, texto) => h('label', {}, h('input', {
      type: 'radio', name: 'modo-arquivo', checked: envio.modo === valor,
      onchange: () => { envio.modo = valor; montarArquivo(); }
    }), texto);
    preencher(areaArquivo, 
      h('div', { class: 'radio-grupo' }, opcao('arquivo', 'Enviar arquivo do computador'), opcao('link', 'Usar link externo'), opcao('nenhum', 'Sem download')),
      envio.modo === 'arquivo' ? h('div', { class: 'campo' },
        v.download?.origem === 'release' && !envio.arquivo ? h('p', { class: 'ajuda', style: 'margin-bottom:8px' }, `Arquivo atual: ${v.download.nomeArquivo}. Envie outro só se quiser trocar.`) : null,
        envio.arquivo ? h('p', { style: 'margin-bottom:8px' }, `${envio.arquivo.name} (${formatarTamanho(envio.arquivo.size)})`) : null,
        h('button', {
          type: 'button',
          onclick: () => escolherArquivo('', false, ([a]) => {
            if (a.size >= LIMITE_RELEASE) { avisar('O GitHub aceita arquivos de até 2 GB. Divida ou comprima o arquivo.', true); return; }
            envio.arquivo = a;
            montarArquivo();
          })
        }, envio.arquivo ? 'Trocar arquivo' : 'Escolher arquivo'),
        h('span', { class: 'ajuda' }, 'Até 2 GB. Um .zip ou instalador .exe funciona bem.')) : null,
      envio.modo === 'link' ? h('div', { class: 'campo' },
        h('label', { for: 'link-externo' }, 'Link do download'),
        h('input', { id: 'link-externo', type: 'url', placeholder: 'https://', value: envio.link, oninput: (e) => { envio.link = e.target.value; } })) : null);
  };
  montarArquivo();

  const emDesenvolvimento = d.roteiro.desenvolvimento;

  const publicarVersao = async () => {
    erro.hidden = true;
    const falhar = (texto) => { erro.textContent = texto; erro.hidden = false; erro.scrollIntoView({ block: 'center' }); };
    v.numero = v.numero.trim().replace(/^v(?=\d)/i, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v.numero)) return falhar('Informe o número da versão só com letras, números, ponto ou hífen. Exemplo: 0.2.0');
    if (!v.data) return falhar('Informe a data da versão.');
    if (d.versoes.some((o) => o.numero === v.numero && o.id !== v.id)) return falhar(`A versão ${v.numero} já existe. Edite a existente ou use outro número.`);
    if (!v.resumo.trim() && !v.adicionado.length && !v.modificado.length && !v.corrigido.length) return falhar('Descreva o que mudou nesta versão.');
    if (envio.modo === 'arquivo' && !envio.arquivo && v.download?.origem !== 'release') return falhar('Escolha o arquivo do jogo, use um link externo ou marque Sem download.');
    if (envio.modo === 'link' && !/^https?:\/\//.test(envio.link)) return falhar('Informe um link de download começando com https://');

    if (envio.modo === 'link') v.download = { origem: 'externo', url: envio.link, nomeArquivo: '', tamanho: 0 };
    if (envio.modo === 'nenhum') v.download = null;

    try {
      if (envio.modo === 'arquivo' && envio.arquivo) {
        const pedido = { arquivo: envio.arquivo, versao: v, concluidos: [...concluidos] };
        await enviarEConcluir(pedido);
        return;
      }
      aplicarVersao(v, [...concluidos]);
      await publicarTudo(`Versão ${v.numero}`);
      estado.editandoVersao = null;
      irPara('versoes');
    } catch (e) { falhar(e.message); }
  };

  return [
    h('h1', {}, nova ? 'Nova versão' : `Editar a versão ${v.numero}`),
    h('p', { class: 'intro' }, 'Ao publicar, a versão entra no site junto com as outras alterações que estiverem pendentes.'),
    h('section', { class: 'bloco' },
      h('div', { class: 'duas' },
        campoTexto('Número da versão', v, 'numero', { ajuda: 'Exemplo: 0.2.0' }),
        campoTexto('Data', v, 'data', { tipo: 'date' })),
      campoTexto('Título (opcional)', v, 'titulo', { ajuda: 'Exemplo: Atualização das ruas' }),
      campoTexto('Descrição', v, 'resumo', { area: true })),
    h('section', { class: 'bloco' }, h('h2', {}, 'O que mudou'),
      campoLista('Adicionado', v, 'adicionado', 'Um item por linha.'),
      campoLista('Modificado', v, 'modificado'),
      campoLista('Corrigido', v, 'corrigido')),
    h('section', { class: 'bloco' }, h('h2', {}, 'Arquivo para download'), areaArquivo),
    emDesenvolvimento.length ? h('section', { class: 'bloco' }, h('h2', {}, 'Roteiro'),
      h('p', { class: 'ajuda', style: 'margin-bottom:12px' }, 'Marque o que ficou pronto. Esses itens vão para Já adicionado, com o número desta versão.'),
      emDesenvolvimento.map((item) => h('label', { class: 'linha-check' },
        h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) concluidos.add(item.id); else concluidos.delete(item.id); } }),
        item.titulo))) : null,
    erro,
    h('div', { class: 'acoes-linha' },
      h('button', { type: 'button', class: 'primario', onclick: publicarVersao }, 'Publicar versão'),
      h('button', { type: 'button', onclick: () => { estado.editandoVersao = null; irPara('versoes'); } }, 'Cancelar'))
  ];
}

function formatarTamanho(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function notasDaVersao(v) {
  const secao = (titulo, itens) => (itens.length ? `## ${titulo}\n${itens.map((i) => `- ${i}`).join('\n')}\n` : '');
  return [v.resumo, secao('Adicionado', v.adicionado), secao('Modificado', v.modificado), secao('Corrigido', v.corrigido)].filter(Boolean).join('\n');
}

function aplicarVersao(v, concluidos) {
  const d = estado.dados;
  const k = d.versoes.findIndex((o) => o.id === v.id);
  if (k >= 0) d.versoes[k] = v;
  else d.versoes.unshift(v);
  for (const id of concluidos) {
    const i = d.roteiro.desenvolvimento.findIndex((item) => item.id === id);
    if (i >= 0) {
      const [item] = d.roteiro.desenvolvimento.splice(i, 1);
      d.roteiro.adicionado.push({ ...item, versao: v.numero });
    }
  }
}

async function enviarEConcluir({ arquivo, versao, concluidos }) {
  const tag = `v${versao.numero}`;
  const nomeArquivo = fatia(arquivo.name) || `metropolitano-${versao.numero}.zip`;
  const janela = abrirProgresso(`Enviando a versão ${versao.numero}`);
  const sair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
  addEventListener('beforeunload', sair);
  try {
    janela.etapa('Enviando o arquivo. Mantenha esta página aberta.', 0);
    const iniciado = await estado.gh.enviarArquivo({
      arquivo, tag, nomeArquivo,
      titulo: versao.titulo ? `Versão ${versao.numero}: ${versao.titulo}` : `Versão ${versao.numero}`,
      notas: notasDaVersao(versao),
      aoProgresso: (p) => janela.etapa(`Enviando o arquivo: ${Math.round(p * 100)}%. Mantenha esta página aberta.`, p * 0.8)
    });
    guardarEnvio({ tag, nomeArquivo, iniciado, versao, concluidos });
    removeEventListener('beforeunload', sair);
    await concluirEnvio({ tag, nomeArquivo, iniciado, versao, concluidos }, janela);
  } catch (e) {
    janela.fechar();
    throw e;
  } finally {
    removeEventListener('beforeunload', sair);
  }
}

function guardarEnvio(dados) {
  try { localStorage.setItem(CHAVE_ENVIO, JSON.stringify(dados)); } catch { /* segue sem retomada */ }
}
function lerEnvio() {
  try { return JSON.parse(localStorage.getItem(CHAVE_ENVIO)); } catch { return null; }
}
function limparEnvio() {
  try { localStorage.removeItem(CHAVE_ENVIO); } catch { /* nada a limpar */ }
}

async function concluirEnvio({ tag, nomeArquivo, iniciado, versao, concluidos }, janela) {
  janela.etapa('O GitHub está montando o download. Isso costuma levar poucos minutos, e você já pode fechar esta página.', 0.85);
  try {
    const { url, tamanho } = await estado.gh.aguardarArquivo({ tag, nomeArquivo, iniciado });
    versao.download = { origem: 'release', url, nomeArquivo, tamanho };
    aplicarVersao(versao, concluidos);
    janela.etapa('Publicando a versão no site.', 0.95);
    await publicarTudo(`Versão ${versao.numero}`);
    limparEnvio();
    janela.fechar();
    estado.editandoVersao = null;
    irPara('versoes');
    avisar(`Versão ${versao.numero} publicada. O site atualiza em cerca de 1 minuto.`);
  } catch (e) {
    janela.fechar();
    if (e.status !== 408) limparEnvio();
    throw e;
  }
}

function abrirProgresso(titulo) {
  const d = document.getElementById('dialogo');
  const barra = h('div', {});
  const texto = h('p', {});
  preencher(d, h('h2', {}, titulo), h('div', { class: 'progresso' }, barra), texto);
  d.oncancel = (e) => e.preventDefault();
  if (!d.open) d.showModal();
  return {
    etapa(t, p) { texto.textContent = t; barra.style.width = `${Math.round(p * 100)}%`; },
    fechar() { if (d.open) d.close(); }
  };
}

// Publicação do site
function caminhosUsados(dados) {
  const achados = new Set();
  JSON.stringify(dados).replace(/assets\/uploads\/[^"\\]+/g, (m) => { achados.add(m); return m; });
  return achados;
}

const escaparAtributo = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function arquivosDeBusca({ meta }) {
  const site = new URL('../', location.href).href;
  const titulo = escaparAtributo(meta.titulo);
  const descricao = escaparAtributo(meta.descricao);
  const blocos = [
    `<title>${titulo}</title>`,
    `<meta name="description" content="${descricao}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Metropolitano">',
    `<meta property="og:url" content="${escaparAtributo(site)}">`,
    `<meta property="og:title" content="${titulo}">`,
    `<meta property="og:description" content="${descricao}">`,
    meta.imagemCompartilhamento ? `<meta property="og:image" content="${escaparAtributo(new URL(meta.imagemCompartilhamento, site).href)}">` : null,
    '<meta name="twitter:card" content="summary_large_image">'
  ].filter(Boolean).join('\n  ');
  const html = await estado.gh.lerTexto('index.html');
  const novoHtml = html.replace(/<!--seo:inicio-->[\s\S]*?<!--seo:fim-->/, `<!--seo:inicio-->\n  ${blocos}\n  <!--seo:fim-->`);
  const arquivos = [];
  if (novoHtml !== html) arquivos.push(['index.html', novoHtml]);
  arquivos.push(['robots.txt', `User-agent: *\nDisallow: /admin/\nSitemap: ${site}sitemap.xml\n`]);
  arquivos.push(['sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escaparAtributo(site)}</loc><lastmod>${hoje()}</lastmod></url></urlset>\n`]);
  return arquivos;
}

async function publicarTudo(mensagem) {
  // Fotografa o conteúdo agora: o que for editado durante o envio continua pendente.
  const retrato = JSON.stringify(estado.dados);
  const dados = JSON.parse(retrato);
  const usados = caminhosUsados(dados);
  const antigos = caminhosUsados(JSON.parse(estado.original));
  const remover = [...antigos].filter((c) => !usados.has(c));
  const novos = [...estado.pendentes].filter(([c]) => usados.has(c));
  const arquivos = [...novos, ['data/site.json', `${JSON.stringify(dados, null, 2)}\n`]];
  estado.publicando = true;
  atualizarBarra();
  try {
    arquivos.push(...await arquivosDeBusca(dados));
    await estado.gh.publicar({ mensagem, arquivos, remover });
    estado.original = retrato;
    for (const [caminho] of novos) estado.pendentes.delete(caminho);
    for (const caminho of [...estado.pendentes.keys()]) {
      if (!caminhosUsados(estado.dados).has(caminho)) estado.pendentes.delete(caminho);
    }
  } finally {
    estado.publicando = false;
    atualizarBarra();
  }
}

async function aoPublicar(botao) {
  botao.textContent = 'Publicando...';
  try {
    await publicarTudo('Atualiza o conteúdo do site');
    avisar('Alterações publicadas. O site atualiza em cerca de 1 minuto.');
  } catch (e) {
    avisar(`As alterações não foram publicadas. ${mensagemErro(e)}`, true);
  } finally {
    botao.textContent = 'Publicar alterações';
    atualizarBarra();
  }
}

function mensagemErro(e) {
  if (e instanceof ErroGitHub && e.status === 403) return 'O token não tem permissão para isso. Confira as permissões em Contents e Actions.';
  if (e instanceof ErroGitHub && e.status === 401) return 'O token expirou ou foi revogado. Saia e entre com um novo.';
  return e.message;
}

// Telas
function irPara(secao) {
  estado.secao = secao;
  desenharPainel();
  scrollTo(0, 0);
}

function desenharPainel() {
  const { nome } = SECOES[estado.secao];
  document.title = `${nome}: painel do Metropolitano`;
  preencher(app, h('div', { class: 'painel' },
    h('aside', { class: 'lateral' },
      h('p', { class: 'lateral-marca' }, 'METROPOLITANO'),
      h('nav', { 'aria-label': 'Seções do painel' }, Object.entries(SECOES).map(([chave, s]) => h('button', {
        type: 'button', 'aria-current': chave === estado.secao ? 'page' : undefined,
        onclick: () => { estado.editandoVersao = null; irPara(chave); }
      }, s.nome))),
      h('div', { class: 'lateral-rodape' },
        h('a', { class: 'botao discreto', href: '../', target: '_blank', rel: 'noopener' }, 'Abrir o site'),
        h('button', { type: 'button', class: 'discreto', onclick: sair }, 'Sair do painel'))),
    h('div', { class: 'area' },
      h('div', { class: 'barra' },
        h('span', { class: 'barra-estado', id: 'barra-estado' }),
        h('div', { class: 'barra-acoes' },
          h('button', { type: 'button', id: 'botao-descartar', onclick: descartar }, 'Descartar'),
          h('button', { type: 'button', class: 'primario', id: 'botao-publicar', onclick: (e) => aoPublicar(e.currentTarget) }, 'Publicar alterações'))),
      h('main', { class: 'conteudo' }, SECOES[estado.secao].montar()))));
  atualizarBarra();
}

async function descartar() {
  const ok = await confirmar('Descartar as alterações?', 'Tudo o que ainda não foi publicado volta ao que está no site.', 'Descartar', true);
  if (!ok) return;
  estado.dados = JSON.parse(estado.original);
  estado.pendentes.clear();
  estado.editandoVersao = null;
  desenharPainel();
}

function sair() {
  try { localStorage.removeItem(CHAVE_ACESSO); sessionStorage.removeItem(CHAVE_ACESSO); } catch { /* nada guardado */ }
  location.reload();
}

function lerAcesso() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_ACESSO) || localStorage.getItem(CHAVE_ACESSO));
  } catch { return null; }
}

function guardarAcesso(acesso, lembrar) {
  try {
    (lembrar ? localStorage : sessionStorage).setItem(CHAVE_ACESSO, JSON.stringify(acesso));
  } catch { /* sem armazenamento, vale só nesta tela */ }
}

function repoProvavel() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return '';
  const pasta = location.pathname.split('/').filter(Boolean)[0];
  return `${m[1]}/${pasta && pasta !== 'admin' ? pasta : `${m[1]}.github.io`}`;
}

function telaAcesso(mensagem) {
  const salvo = lerAcesso();
  const form = { repo: salvo?.repo || repoProvavel(), token: '', lembrar: false };
  const erro = h('p', { class: 'erro', role: 'alert', hidden: !mensagem }, mensagem || '');
  const enviar = h('button', { type: 'submit', class: 'primario' }, 'Entrar no painel');
  preencher(app, h('div', { class: 'acesso' },
    h('section', { class: 'acesso-apresentacao' },
      h('h1', {}, 'Painel do Metropolitano'),
      h('p', {}, 'Para entrar, use um token do GitHub com acesso só ao repositório do site. Ele fica guardado apenas neste navegador.'),
      h('ol', {},
        h('li', {}, 'Abra ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'a criação de token no GitHub'), '.'),
        h('li', {}, 'Em Repository access, marque Only select repositories e escolha o repositório do site.'),
        h('li', {}, 'Em Repository permissions, deixe Contents e Actions como Read and write.'),
        h('li', {}, 'Gere o token e cole aqui ao lado.'))),
    h('form', {
      class: 'acesso-form',
      onsubmit: async (e) => {
        e.preventDefault();
        enviar.disabled = true;
        enviar.textContent = 'Conectando...';
        erro.hidden = true;
        try {
          const repo = form.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
          if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Informe o repositório no formato usuario/nome.');
          await entrar({ repo, token: form.token.trim() }, form.lembrar);
        } catch (falha) {
          erro.textContent = falha.message;
          erro.hidden = false;
          enviar.disabled = false;
          enviar.textContent = 'Entrar no painel';
        }
      }
    },
    h('h2', {}, 'Entrar'),
    erro,
    h('div', { class: 'campo' }, h('label', { for: 'repo' }, 'Repositório'),
      h('input', { id: 'repo', required: true, placeholder: 'usuario/metropolitano', value: form.repo, autocomplete: 'off', oninput: (e) => { form.repo = e.target.value; } })),
    h('div', { class: 'campo' }, h('label', { for: 'token' }, 'Token do GitHub'),
      h('input', { id: 'token', type: 'password', required: true, autocomplete: 'off', oninput: (e) => { form.token = e.target.value; } })),
    h('label', { class: 'linha-check' },
      h('input', { type: 'checkbox', onchange: (e) => { form.lembrar = e.target.checked; } }),
      h('span', {}, 'Manter conectado neste navegador. Não marque em computador compartilhado.')),
    enviar)));
}

async function entrar(acesso, lembrar) {
  const [dono, repo] = acesso.repo.split('/');
  const gh = new GitHub(dono, repo, acesso.token);
  estado.info = await gh.conectar();
  estado.gh = gh;
  const texto = await gh.lerTexto('data/site.json');
  estado.dados = JSON.parse(texto);
  estado.original = JSON.stringify(estado.dados);
  if (lembrar !== undefined) guardarAcesso(acesso, lembrar);
  desenharPainel();
  const envio = lerEnvio();
  if (envio) {
    const janela = abrirProgresso(`Concluindo a versão ${envio.versao.numero}`);
    concluirEnvio(envio, janela).catch((e) => avisar(mensagemErro(e), true));
  }
}

addEventListener('beforeunload', (e) => {
  if (estado.dados && temMudancas()) { e.preventDefault(); e.returnValue = ''; }
});

async function iniciar() {
  const salvo = lerAcesso();
  if (salvo?.token) {
    try {
      await entrar(salvo);
      return;
    } catch (e) {
      telaAcesso(e.message);
      return;
    }
  }
  telaAcesso();
}

iniciar();
