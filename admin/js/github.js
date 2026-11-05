// Conversa com a API do GitHub. O token só é enviado para api.github.com.
const API = 'https://api.github.com';
export const TAMANHO_PARTE = 25 * 1024 * 1024; // abaixo do limite de 100 MB por blob
export const LIMITE_RELEASE = 2 * 1024 * 1024 * 1024; // limite do GitHub por arquivo
export const WORKFLOW = 'publicar-versao.yml';

export class ErroGitHub extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

export function blobParaBase64(blob) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(blob);
  });
}

function base64ParaTexto(base64) {
  const binario = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hashHex(blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export class GitHub {
  constructor(dono, repo, token) {
    this.dono = dono;
    this.repo = repo;
    this.token = token;
    this.ramo = 'main';
  }

  get base() { return `/repos/${this.dono}/${this.repo}`; }

  urlBruta(caminho) {
    return `https://raw.githubusercontent.com/${this.dono}/${this.repo}/${this.ramo}/${caminho}`;
  }

  async pedir(caminho, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetch(API + caminho, {
        ...opcoes,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opcoes.body ? { 'Content-Type': 'application/json' } : {})
        }
      });
    } catch {
      throw new ErroGitHub('Sem conexão com o GitHub. Verifique a internet e tente de novo.', 0);
    }
    if (resposta.status === 204) return null;
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new ErroGitHub(corpo.message || `Erro ${resposta.status}`, resposta.status);
    return corpo;
  }

  async conectar() {
    let info;
    try {
      info = await this.pedir(this.base);
    } catch (e) {
      if (e.status === 401) throw new ErroGitHub('O GitHub recusou este token. Confira se ele foi copiado inteiro e se não expirou.', 401);
      if (e.status === 404) throw new ErroGitHub('Repositório não encontrado. Confira o nome e se o token tem acesso a ele.', 404);
      throw e;
    }
    this.ramo = info.default_branch;
    if (info.permissions && !info.permissions.push) {
      throw new ErroGitHub('Este token consegue ler o repositório, mas não publicar. Dê a permissão Contents: Read and write.', 403);
    }
    return info;
  }

  async lerTexto(caminho) {
    const r = await this.pedir(`${this.base}/contents/${caminho}?ref=${encodeURIComponent(this.ramo)}`);
    if (r.content && r.encoding === 'base64') return base64ParaTexto(r.content);
    // Arquivos acima de 1 MB chegam sem o conteúdo nessa rota.
    const blob = await this.pedir(`${this.base}/git/blobs/${r.sha}`);
    return base64ParaTexto(blob.content);
  }

  async criarBlob(conteudo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo]);
    const r = await this.pedir(`${this.base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: await blobParaBase64(blob), encoding: 'base64' })
    });
    return r.sha;
  }

  // Grava tudo em um único commit: ou o site inteiro muda, ou nada muda.
  async publicar({ mensagem, arquivos, remover = [] }) {
    const entradas = [];
    for (const [caminho, conteudo] of arquivos) {
      entradas.push({ path: caminho, mode: '100644', type: 'blob', sha: await this.criarBlob(conteudo) });
    }
    for (const caminho of remover) entradas.push({ path: caminho, mode: '100644', type: 'blob', sha: null });

    for (let tentativa = 0; ; tentativa++) {
      const ref = await this.pedir(`${this.base}/git/ref/heads/${this.ramo}`);
      const atual = await this.pedir(`${this.base}/git/commits/${ref.object.sha}`);
      const arvore = await this.pedir(`${this.base}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ base_tree: atual.tree.sha, tree: entradas })
      });
      const commit = await this.pedir(`${this.base}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message: mensagem, tree: arvore.sha, parents: [ref.object.sha] })
      });
      try {
        await this.pedir(`${this.base}/git/refs/heads/${this.ramo}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha })
        });
        return commit.sha;
      } catch (e) {
        if (e.status !== 422 || tentativa >= 2) throw e;
        await espera(800); // outro commit entrou no meio do caminho
      }
    }
  }

  async workflowExiste() {
    try {
      await this.pedir(`${this.base}/actions/workflows/${WORKFLOW}`);
      return true;
    } catch (e) {
      if (e.status === 404) return false;
      throw e;
    }
  }

  // O navegador não consegue enviar direto para os Releases do GitHub, então o arquivo
  // vai em partes para um ramo temporário e uma automação do repositório monta o Release.
  async enviarArquivo({ arquivo, tag, titulo, notas, nomeArquivo, aoProgresso }) {
    const totalPartes = Math.max(1, Math.ceil(arquivo.size / TAMANHO_PARTE));
    const entradas = [];
    const hashes = [];
    for (let k = 0; k < totalPartes; k++) {
      const parte = arquivo.slice(k * TAMANHO_PARTE, (k + 1) * TAMANHO_PARTE);
      const nome = `part-${String(k + 1).padStart(4, '0')}`;
      hashes.push(`${await hashHex(parte)}  ${nome}`);
      let sha;
      for (let tentativa = 0; ; tentativa++) {
        try {
          sha = await this.criarBlob(parte);
          break;
        } catch (e) {
          if (tentativa >= 3 || e.status === 401 || e.status === 403 || e.status === 404) throw e;
          await espera(2000 * (tentativa + 1));
        }
      }
      entradas.push({ path: `_upload/${nome}`, mode: '100644', type: 'blob', sha });
      aoProgresso?.((k + 1) / totalPartes);
    }
    entradas.push({ path: '_upload/partes.sha256', mode: '100644', type: 'blob', sha: await this.criarBlob(`${hashes.join('\n')}\n`) });
    entradas.push({ path: '_upload/notas.md', mode: '100644', type: 'blob', sha: await this.criarBlob(notas || titulo) });

    const arvore = await this.pedir(`${this.base}/git/trees`, { method: 'POST', body: JSON.stringify({ tree: entradas }) });
    const commit = await this.pedir(`${this.base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message: `Envio temporário de ${nomeArquivo}`, tree: arvore.sha, parents: [] })
    });
    const ramoEnvio = `envio-${tag}-${Date.now()}`;
    await this.pedir(`${this.base}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${ramoEnvio}`, sha: commit.sha })
    });
    const iniciado = new Date(Date.now() - 60000).toISOString();
    try {
      await this.pedir(`${this.base}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: this.ramo, inputs: { tag, titulo, arquivo: nomeArquivo, ramo: ramoEnvio } })
      });
    } catch (e) {
      await this.pedir(`${this.base}/git/refs/heads/${ramoEnvio}`, { method: 'DELETE' }).catch(() => {});
      if (e.status === 403) throw new ErroGitHub('O token não pode iniciar a automação. Dê a permissão Actions: Read and write.', 403);
      if (e.status === 404) throw new ErroGitHub('A automação de publicação não está no repositório. Envie de novo a pasta .github ao GitHub.', 404);
      throw e;
    }
    return iniciado;
  }

  async aguardarArquivo({ tag, nomeArquivo, iniciado, tempoLimite = 25 * 60 * 1000, intervalo = 8000 }) {
    const fim = Date.now() + tempoLimite;
    while (Date.now() < fim) {
      try {
        const release = await this.pedir(`${this.base}/releases/tags/${encodeURIComponent(tag)}`);
        const achado = release.assets.find((a) => a.name === nomeArquivo && a.state === 'uploaded' && a.updated_at >= iniciado);
        if (achado) return { url: achado.browser_download_url, tamanho: achado.size };
      } catch (e) {
        if (e.status !== 404) throw e;
      }
      const execucoes = await this.pedir(`${this.base}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=1&created=${encodeURIComponent(`>=${iniciado}`)}`).catch(() => null);
      const ultima = execucoes?.workflow_runs?.[0];
      if (ultima?.status === 'completed' && ultima.conclusion !== 'success') {
        throw new ErroGitHub(`A automação falhou ao montar o arquivo. Veja os detalhes em ${ultima.html_url}`, 500);
      }
      await espera(intervalo);
    }
    throw new ErroGitHub('O GitHub está demorando mais que o normal. Abra o painel de novo em alguns minutos para concluir.', 408);
  }
}
