import { useEffect, useState } from 'react';
import { COUNTER_BASE, COUNTER_NS, readTotal } from '../lib/counter.ts';

const nf = new Intl.NumberFormat('pt-BR');

function VisitCounter({ initial }: { initial: number | null }) {
  const [total, setTotal] = useState<number | null>(initial);
  useEffect(() => {
    if (initial !== null) return;
    let alive = true;
    void readTotal().then((n) => alive && setTotal(n));
    return () => {
      alive = false;
    };
  }, [initial]);
  // Se o serviço falhar ou estivermos offline, o contador simplesmente não aparece.
  if (total === null) return null;
  return (
    <p className="counter" data-testid="contador">
      <span className="num">{nf.format(total)}</span>
      <span>acessos ao site</span>
    </p>
  );
}

export function About({ visits }: { visits: number | null }) {
  return (
    <article className="doc">
      <h1>Sobre o TV Livre</h1>
      <p className="lead">
        Um controle remoto para a TV aberta que passa pela internet. O TV Livre reúne links públicos, mostra o que está no
        ar e toca direto no seu navegador sempre que possível.
      </p>

      <VisitCounter initial={visits} />

      <h2>Não hospedamos vídeo</h2>
      <p>
        Este site <strong>não hospeda, retransmite, grava nem passa por proxy nenhum vídeo</strong>. Quando você abre um
        canal, o seu navegador se conecta diretamente à fonte original da transmissão. O TV Livre só organiza os
        endereços, como uma lista telefônica. Sem anúncios, sem assinatura, sem cobrança.
      </p>

      <h2>Fontes e créditos</h2>
      <ul>
        <li>
          <a href="https://github.com/Free-TV/IPTV" target="_blank" rel="noopener noreferrer">Free-TV/IPTV</a>: playlist
          curada de canais oficialmente gratuitos. Tem prioridade quando um canal aparece nas duas fontes. O repositório não
          declara licença; usamos só nomes e endereços públicos de transmissão, com crédito, e removemos qualquer canal a
          pedido.
        </li>
        <li>
          <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener noreferrer">iptv-org/iptv</a>: coleção
          colaborativa de canais públicos e seu banco de metadados (países, categorias, idiomas, logos), em domínio
          público (Unlicense).
        </li>
      </ul>
      <p>Obrigado às duas comunidades por manter essas listas.</p>

      <h2>Como funciona</h2>
      <ul>
        <li>Todo dia, e a cada alteração do site, um processo automático baixa as duas fontes, une os canais e remove duplicatas.</li>
        <li>Canais adultos são excluídos pelos metadados das fontes, por categoria e por palavras-chave.</li>
        <li>Cada link é testado. Uma falha isolada <em>não</em> remove o canal: ele fica como “desconhecido” até falhar de forma repetida.</li>
        <li>O teste roda em servidores nos EUA, então canais com bloqueio por região podem aparecer como offline ou desconhecido mesmo funcionando no Brasil.</li>
        <li>O número de cada canal é a posição dele na grade do país. Muda só quando a lista muda.</li>
      </ul>

      <h2>Por que alguns canais não tocam?</h2>
      <ul>
        <li><strong>Link HTTP:</strong> o navegador bloqueia vídeo sem criptografia dentro de páginas HTTPS. O site tenta o mesmo endereço por HTTPS sozinho; se não houver, no computador (Chrome, Edge, Brave) você pode liberar &ldquo;Conteúdo não seguro&rdquo; só para este site, e no celular o botão <b>Abrir no VLC</b> abre o canal direto, sem copiar nada.</li>
        <li><strong>CORS:</strong> alguns servidores não deixam outros sites tocarem o vídeo. Onde o navegador toca HLS sozinho (Chrome, Edge, Safari, celulares) o site usa isso e o canal toca; nos demais, o VLC costuma funcionar.</li>
        <li><strong>Bloqueio por região:</strong> parte dos canais só funciona no país de origem.</li>
        <li><strong>Fora do ar:</strong> transmissões gratuitas mudam de endereço ou saem do ar sem aviso.</li>
      </ul>

      <h2>Privacidade e contador de acessos</h2>
      <ul>
        <li>Favoritos, últimos assistidos, tema e país ficam só no armazenamento local do seu aparelho. Nada disso é enviado a ninguém.</li>
        <li>Na grade não carregamos logos de terceiros; o logo só é baixado do servidor de origem quando você abre o canal.</li>
        <li>
          O contador de acessos usa o serviço gratuito{' '}
          <a href={COUNTER_BASE} target="_blank" rel="noopener noreferrer">Abacus</a>. Conta no máximo uma visita por sessão,
          sem cookies e sem dados pessoais: o serviço recebe apenas o nome do contador (<code>{COUNTER_NS}</code>). O número
          mostrado é o valor devolvido pelo serviço; se ele estiver fora do ar, o contador some.
        </li>
        <li>
          Para mostrar <strong>de onde você está acessando</strong> (estado e país), o seu navegador pergunta ao serviço{' '}
          <a href="https://ipwho.is" target="_blank" rel="noopener noreferrer">ipwho.is</a>, que enxerga o seu endereço de
          IP, como qualquer site que você visita. Pedimos só estado e país, sem cidade, sem cookies e sem enviar nada seu. A
          resposta fica só na sessão do navegador e não é guardada pelo TV Livre. Se o serviço falhar, a região não aparece.
        </li>
        <li>
          <strong>Transmitir para a TV:</strong> o SDK do Google Cast <b>só é baixado quando você toca em Transmitir</b> (de
          <code>gstatic.com</code>); ao abrir o site nenhum script de terceiros é carregado. Se você recarregar a página no meio de uma
          transmissão, ele é baixado de novo só para retomar o controle. Quem busca o vídeo é a TV, direto da fonte do canal; o TV
          Livre não passa o vídeo por nenhum servidor.
        </li>
        <li>
          <strong>Modo Rádio e Econômico:</strong> a escolha do modo, do timer e o aviso de dados ficam só no seu aparelho. O consumo mostrado é
          calculado no seu navegador, somando os trechos que ele mesmo baixou; nada é enviado a ninguém.
        </li>
        <li>O app instalado guarda uma cópia da estrutura do site e da lista de canais para abrir offline. Nunca guarda vídeo.</li>
      </ul>

      <h2>Pedir a remoção de um canal</h2>
      <p>
        Se você é responsável por um canal ou detentor de direitos e quer que ele saia do TV Livre, abra uma{' '}
        <a href="https://github.com/JkFa/tv-livre/issues/new?template=remocao-de-canal.yml" target="_blank" rel="noopener noreferrer">solicitação de remoção</a>{' '}
        com o nome do canal e o link. O canal entra em uma lista de exclusão e some na próxima atualização.
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
        Projeto aberto:{' '}
        <a href="https://github.com/JkFa/tv-livre" target="_blank" rel="noopener noreferrer">github.com/JkFa/tv-livre</a>.
        Fontes tipográficas: Archivo e Atkinson Hyperlegible Next (licença OFL).
      </p>
    </article>
  );
}
