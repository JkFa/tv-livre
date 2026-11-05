export function About() {
  return (
    <article className="about">
      <h1>Sobre o TV Livre</h1>
      <p className="lead">
        O TV Livre é um catálogo gratuito de canais de TV abertos que transmitem pela internet. Ele reúne links públicos,
        mostra se estão no ar e toca direto no seu navegador sempre que possível.
      </p>

      <h2>Não hospedamos vídeo</h2>
      <p>
        Este site <strong>não hospeda, retransmite, grava nem passa por proxy nenhum vídeo</strong>. Quando você abre um
        canal, o seu navegador se conecta diretamente à fonte original da transmissão (a emissora ou a plataforma que a
        publica). O TV Livre apenas organiza os endereços, é um índice, como uma lista telefônica.
      </p>
      <p>
        Não há anúncios, assinaturas, login nem rastreadores. Favoritos e últimos assistidos ficam apenas no
        armazenamento local do seu navegador (nunca saem do seu dispositivo). Logos e vídeos são carregados dos servidores
        de origem, que podem registrar o seu acesso, como em qualquer site.
      </p>

      <h2>Fontes e créditos</h2>
      <ul>
        <li>
          <a href="https://github.com/Free-TV/IPTV" target="_blank" rel="noopener noreferrer">Free-TV/IPTV</a> — playlist
          curada de canais oficialmente gratuitos. Tem prioridade quando um canal aparece nas duas fontes. O repositório não
          declara uma licença; usamos somente nomes e endereços públicos de transmissão, com crédito, e removemos qualquer
          canal a pedido.
        </li>
        <li>
          <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener noreferrer">iptv-org/iptv</a> — coleção
          colaborativa de canais públicos e seu banco de metadados (países, categorias, idiomas, logos). Dados em domínio
          público (Unlicense).
        </li>
      </ul>
      <p>Obrigado às duas comunidades pelo trabalho de manter essas listas.</p>

      <h2>Como funciona</h2>
      <ul>
        <li>Todos os dias, e a cada alteração do site, um processo automático baixa as duas fontes, une os canais e remove duplicatas.</li>
        <li>Canais adultos são excluídos pelos metadados das fontes, por categoria e por palavras-chave.</li>
        <li>Cada link é testado. Uma falha isolada <em>não</em> remove o canal: ele fica como “desconhecido” até falhar de forma repetida.</li>
        <li>
          O teste roda em servidores nos EUA, então canais com bloqueio geográfico podem aparecer como offline ou desconhecido
          mesmo funcionando no Brasil.
        </li>
      </ul>

      <h2>Por que alguns canais não tocam?</h2>
      <ul>
        <li><strong>Link HTTP:</strong> o navegador bloqueia vídeos sem criptografia dentro de páginas HTTPS. Copie o link e abra no VLC.</li>
        <li><strong>CORS:</strong> alguns servidores não deixam outros sites tocarem o vídeo. No VLC costuma funcionar.</li>
        <li><strong>Bloqueio geográfico:</strong> parte dos canais só funciona no país de origem.</li>
        <li><strong>Canal fora do ar:</strong> transmissões gratuitas mudam de endereço ou saem do ar sem aviso.</li>
      </ul>

      <h2>Pedir a remoção de um canal</h2>
      <p>
        Se você é responsável por um canal ou detentor de direitos e quer que ele saia do TV Livre, abra uma{' '}
        <a href="https://github.com/JkFa/tv-livre/issues/new?template=remocao-de-canal.yml" target="_blank" rel="noopener noreferrer">
          solicitação de remoção
        </a>{' '}
        informando o nome do canal e o link. O canal é adicionado a uma lista de exclusão e deixa de aparecer na próxima
        atualização.
      </p>
      <p>
        Como o TV Livre só aponta para a transmissão original, a remoção definitiva do conteúdo depende de quem o publica.
        Para sair também das listas de origem, use o{' '}
        <a href="https://github.com/iptv-org/iptv/issues/new?template=6_copyright-claim.yml" target="_blank" rel="noopener noreferrer">formulário do iptv-org</a>{' '}
        ou abra um pull request no{' '}
        <a href="https://github.com/Free-TV/IPTV" target="_blank" rel="noopener noreferrer">Free-TV</a>.
      </p>

      <h2>Código</h2>
      <p>
        O projeto é aberto:{' '}
        <a href="https://github.com/JkFa/tv-livre" target="_blank" rel="noopener noreferrer">github.com/JkFa/tv-livre</a>.
      </p>
    </article>
  );
}
