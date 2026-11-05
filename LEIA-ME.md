# Site oficial do Metropolitano

Site estático com painel de administrador. Não precisa de servidor nem de banco de dados: o conteúdo fica em `data/site.json`, e o painel publica as alterações direto no repositório do GitHub.

## Colocar no ar (uma vez só)

1. **Crie o repositório.** Em <https://github.com/new>, crie um repositório **público** (por exemplo, `metropolitano`). O GitHub Pages gratuito exige repositório público.
2. **Envie os arquivos.** No repositório, clique em **Add file > Upload files**. Abra a pasta do site, selecione **tudo o que está dentro dela** e arraste para a página, incluindo as pastas `.github` e `assets` e o arquivo `.nojekyll`. Clique em **Commit changes**.
   - Sem a pasta `.github`, o envio do arquivo do jogo pelo painel não funciona. No Windows, ela aparece normalmente. No Mac, aperte `Cmd + Shift + .` no Finder para ver as pastas que começam com ponto.
3. **Ative o site.** Vá em **Settings > Pages**. Em **Source**, escolha **Deploy from a branch**. Em **Branch**, escolha **main** e a pasta **/(root)**, e clique em **Save**.
4. Em cerca de 1 minuto, o site fica disponível em `https://SEU-USUARIO.github.io/metropolitano/`.

## Entrar no painel

O painel fica em `https://SEU-USUARIO.github.io/metropolitano/admin/`.

Para entrar, crie um token em <https://github.com/settings/personal-access-tokens/new>:

- **Repository access:** Only select repositories, marcando o repositório do site.
- **Repository permissions:** Contents em Read and write, e Actions em Read and write.
- **Expiration:** o prazo que preferir. Quando vencer, é só criar outro.

Guarde o token como uma senha. O endereço do painel é público, mas sem o token ninguém consegue alterar nada. Se ele vazar, apague em **Settings > Developer settings > Personal access tokens** no GitHub.

## Usar o painel

- **Publicar alterações:** tudo o que você edita fica pendente até usar esse botão. O site atualiza em cerca de 1 minuto.
- **Lançar uma versão:** em **Versões e downloads**, clique em **Lançar nova versão**, preencha número, data e o que mudou, escolha o arquivo e clique em **Publicar versão**. Ela entra em Atualizações e vira o download principal do site.
- **Enviar o arquivo do jogo:** aceita até 2 GB. Mantenha a página aberta enquanto o percentual sobe. Depois disso, o GitHub monta o download e você pode fechar a página; ao abrir o painel de novo, a publicação é concluída.
- **Trocar imagens:** a galeria fica em **Galeria**. As demais imagens ficam em **Página inicial**, **Sobre o jogo**, **Recursos** e **Rodapé e busca**.
- **Roteiro:** adicione itens e mova entre Já adicionado, Em desenvolvimento e Em breve. Ao lançar uma versão, você pode marcar o que ficou pronto.

## Como o arquivo do jogo é publicado

O navegador não consegue enviar direto para os Releases do GitHub. Por isso, o painel divide o arquivo em partes e as envia para um ramo temporário. A automação `.github/workflows/publicar-versao.yml` monta o arquivo, confere a integridade, cria o Release e apaga o ramo. O visitante baixa pelo link direto do Release.

## Se algo der errado

| O que aparece | O que fazer |
| --- | --- |
| "O GitHub recusou este token" | Confira se o token foi copiado inteiro e se ainda vale. |
| "Repositório não encontrado" | Use o formato `usuario/nome` e confira se o token tem acesso a esse repositório. |
| "O token não pode iniciar a automação" | Dê a permissão Actions: Read and write ao token. |
| "A automação de publicação não está no repositório" | Envie de novo a pasta `.github`. |
| O site não mudou | Aguarde 1 ou 2 minutos e recarregue. O andamento aparece na aba **Actions** do repositório. |

## Usar em outro lugar

O site também funciona no Cloudflare Pages ou em um domínio próprio, sem mudar o código. Se usar o Cloudflare Pages, ligue o projeto ao mesmo repositório do GitHub e deixe o comando de build vazio, com `/` como pasta de saída.

## Fontes

Big Shoulders e Instrument Sans, sob a licença SIL Open Font License. As licenças estão em `assets/fontes/`.
