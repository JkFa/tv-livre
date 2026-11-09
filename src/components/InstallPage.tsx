import { Download, Share, SquarePlus } from 'lucide-react';
import { eBrave } from '../lib/cast.ts';
import { useInstall } from '../lib/pwa.ts';

export function InstallPage() {
  const { kind, standalone, prompt } = useInstall();
  return (
    <article className="doc">
      <h1>Instalar o TV Livre</h1>
      <p className="lead">
        Instalado, o TV Livre abre em tela cheia, sem barra do navegador, com ícone próprio. Ele continua sendo o mesmo
        site: tudo funciona no navegador sem instalar nada.
      </p>

      {standalone ? (
        <p className="callout">Você já está usando o aplicativo instalado.</p>
      ) : kind === 'prompt' ? (
        <p>
          <button type="button" className="btn btn-accent btn-xl" onClick={() => void prompt()}>
            <Download size={22} aria-hidden="true" /> Instalar agora
          </button>
        </p>
      ) : null}

      <section>
        <h2>Android (Chrome, Edge, Samsung Internet)</h2>
        <ol className="steps">
          <li>Abra <b>jkfa.github.io/tv-livre</b> no navegador.</li>
          <li>Toque em <b>Instalar</b> no topo do app. Se não aparecer, abra o menu do navegador (⋮).</li>
          <li>Escolha <b>Instalar aplicativo</b> (ou <b>Adicionar à tela inicial</b>) e confirme.</li>
        </ol>
      </section>

      <section>
        <h2>iPhone e iPad (Safari)</h2>
        <p className="muted">No iOS só o Safari instala aplicativos web. Outros navegadores não têm essa opção.</p>
        <ol className="steps">
          <li>Abra o site no <b>Safari</b>.</li>
          <li>Toque em <b>Compartilhar</b> <Share size={18} aria-label="ícone de compartilhar" className="inline-icon" />.</li>
          <li>Role e toque em <b>Adicionar à Tela de Início</b> <SquarePlus size={18} aria-label="ícone de adicionar" className="inline-icon" />.</li>
          <li>Toque em <b>Adicionar</b>. O ícone do TV Livre aparece na tela de início.</li>
        </ol>
      </section>

      <section>
        <h2>Computador (Chrome, Edge)</h2>
        <ol className="steps">
          <li>Abra o site e clique no botão <b>Instalar</b> do topo do app, ou no ícone de instalação na barra de endereço.</li>
          <li>Confirme em <b>Instalar</b>. O TV Livre abre em uma janela própria e fica no menu de aplicativos.</li>
        </ol>
      </section>

      <section>
        <h2>Firefox e outros navegadores</h2>
        <p>
          O Firefox para computador não instala aplicativos web. No Firefox para Android use o menu (⋮) e
          <b> Instalar</b>. Se o seu navegador não oferecer instalação, o site continua funcionando normalmente na aba: dá
          até para fixá-la.
        </p>
      </section>

      <section>
        <h2>Transmitir para a TV (Chromecast, AirPlay)</h2>
        <p>
          No <b>Chrome</b> e no <b>Edge</b> (Android e computador), o botão <b>Transmitir</b> do player envia o canal para o
          Chromecast ou Google TV; o celular vira controle remoto (zapear, volume, parar). No <b>Safari</b> (iPhone, iPad e Mac),
          use o botão <b>AirPlay</b>. Seu aparelho e a TV precisam estar na mesma rede Wi-Fi. Só canais HLS em HTTPS e com CORS
          liberado podem ser transmitidos. Sem Chromecast, abra <b>Mais › Assistir na Smart TV</b>.
        </p>
        {eBrave() && (
          <div className="notice" data-testid="brave-ajuda">
            <h3>Você está no Brave</h3>
            <p>
              No Brave o Chromecast vem desligado. Abra <code>brave://settings/extensions</code>, ative <b>Media Router</b> e
              recarregue o TV Livre. Depois disso o botão <b>Transmitir</b> funciona.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2>Funciona sem internet?</h2>
        <p>
          O app abre e mostra seus favoritos e os canais que você já visitou, mas <b>para assistir é preciso estar
          online</b>: guardamos só a estrutura do app e a lista de canais, nunca o vídeo.
        </p>
      </section>
    </article>
  );
}
