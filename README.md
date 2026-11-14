# TV Livre

**O controle remoto da TV aberta.** Canais do Brasil e do mundo ao vivo, direto no navegador, com **zapear**, favoritos e
aplicativo instalável. Sem cadastro, sem anúncios, sem cobrança, e **sem hospedar vídeo**.

**Site:** <https://jkfa.github.io/tv-livre/> · **Código:** <https://github.com/JkFa/tv-livre> · **Design:** [DESIGN.md](DESIGN.md)

## Visão geral

- Reúne as listas [Free-TV/IPTV](https://github.com/Free-TV/IPTV) e [iptv-org/iptv](https://github.com/iptv-org/iptv).
- Um pipeline em TypeScript baixa as fontes, normaliza, remove duplicatas, exclui conteúdo adulto, classifica e **testa cada link**.
- O site é 100% estático (React + Vite + TypeScript) e toca HLS com [hls.js](https://github.com/video-dev/hls.js), ou com o
  HLS nativo do navegador onde o hls.js não existe (Safari do iPhone). YouTube usa o embed oficial.
- O navegador acessa **diretamente** a fonte do vídeo: não há backend de vídeo, proxy, retransmissão nem gravação. Há só um **contador de presença** (Cloudflare Worker) para o "assistindo agora"; sem ele, o site funciona igual.
- Interface em português do Brasil, mobile primeiro. **O padrão é o tema claro** (mesmo com o sistema no escuro); o ícone de lua/sol na barra do topo, **inclusive no celular**, alterna claro e escuro com um toque, e **Mais › Tema** também oferece "Automático" (segue o sistema). A escolha fica em `tvlivre:tema`.
- **Guia de TV** (`#/guia`): os canais de um país **por assunto**, com país escolhido **por região** e a **origem** de cada canal (bandeira + país) em toda a interface.
- **Guia de programação** ("Agora" e "A seguir"), **páginas indexáveis por canal** (Google e prévia bonita no WhatsApp) e botão **Compartilhar**.

### A marca: "o controle remoto reinventado"

O número do canal é o elemento gráfico principal (a grade é uma tabela tipográfica, não uma parede de cartões) e **zapear** é a
ação central: botões Anterior/Próximo, deslizar no player, botão **Zapear** (sorteia um canal no ar), setas e números do
teclado. Cada troca mostra uma pequena vinheta com número e nome. Um único acento (vermelho) sobre preto quente ou papel
envelhecido; tipografia Archivo (marca e números) + Atkinson Hyperlegible Next (texto), ambas OFL e autohospedadas.
Detalhes, tokens e regras de movimento em [DESIGN.md](DESIGN.md).

### Recursos do player

| Recurso | Como funciona |
|---|---|
| Zapear | Dial `‹ 06 · 07 Nome · 08 ›`, deslizar no player (ignora as bordas da tela, que são do sistema), botão **Zapear** no dial, no mini-player (o sorteado entra na própria janela), no Guia de TV e no centro da navegação. O sorteio é **um só** (`src/lib/zapear.ts`, hook `useZapear`) para todos esses botões, a tecla `Z`, o botão verde da TV e o controle pelo celular: só canais **no ar** que **tocam neste navegador**; se houver menos de 5, junta os **instáveis**; os que *não abriram aqui* só entram se não sobrar nada; não repete os últimos 10 sorteados enquanto houver alternativa; transmitindo para a TV, só o que o Chromecast abre. Sem dado de saúde (lista antiga), qualquer canal não-offline que toque aqui. |
| Teclado (desktop) | `←` `→` `↑` `↓` trocam de canal · `Z` zapeia · `/` busca · `F` tela cheia · `M` mudo · `P` PiP · `Espaço` pausa · `S` compartilha · `R` alterna o Rádio · `C` abre "Controlar pelo celular" · `0–9`+`Enter` digitam o número · `?` lista os atalhos. |
| Volume | Controle deslizante de 0 a 100 ao lado do botão de som, sempre visível com os controles (não depende de hover). O valor fica salvo (`tvlivre:volume`). O ícone e a tecla `M` silenciam e **devolvem o volume de antes**; arrastar até 0 é mudo. No teclado: `Tab` até o controle e setas (passo de 5), `Home`/`End`. No iPhone/iPad o navegador não deixa o site mudar o volume: fica só o botão de mudo. |
| Mini-player | Sair do canal **com o vídeo tocando** (para o Início, Sobre, Instalar) não para a transmissão: o mesmo player vira uma janela fixa (canto inferior direito; no celular, uma faixa **acima** da navegação) com tocar/pausar, som, **expandir** e **fechar**. É um único `<Player>`/`<video>` que nunca é desmontado na troca de tela (não reinicia o stream e nunca há dois). Na grade (`#/canais`) ele continua no lugar de sempre. Pausado, com erro, no Modo TV ou transmitindo para a TV, sair do canal para como antes. Não é o PiP do navegador (que continua no botão e na tecla `P`). |
| Mobile | Navegação inferior ao alcance do polegar, filtros em folha inferior, player fixo no topo, `playsinline`, paisagem com player e grade lado a lado e convite para tela cheia. |
| Plataforma | Picture-in-Picture, Media Session (tela de bloqueio e teclas de mídia trocam de canal) e Wake Lock (tela ligada enquanto toca). |
| Resiliência | Autoplay só após uma ação do usuário; se o navegador bloquear, a interface continua. Queda de rede ou volta do segundo plano retomam o canal (até 3 tentativas), pulando para o ao vivo. |
| Controle pelo celular | O celular vira controle remoto (QR ou código, dial, teclado numérico, volume, aba Canais): ver a seção abaixo. |
| Transmitir e modos | **Transmitir** (Chromecast, AirPlay), **Normal · Econômico · Rádio**, timer de desligar e consumo estimado: ver as seções abaixo. |
| Retomada | Lembra o último canal (`tvlivre:ultimo`) e oferece "Voltar ao canal NN" ao abrir. |
| Erros | Explica a causa provável (fora do ar, bloqueio por região, CORS, formato, sem internet), oferece tentar de novo, **Abrir no VLC** com um toque (sem copiar link) e sugere outros canais. |

## Controle pelo celular

O celular vira controle remoto do TV Livre que está tocando no **computador ou na Smart TV**, só com o navegador: sem instalar app e sem servidor próprio. **O vídeo continua tocando só no computador/TV**; o celular envia comandos e recebe o estado (canal, número, programa, volume, erro).

**Como usar.**
1. No computador/TV: **Mais › Controlar pelo celular** (ícone de celular no topo, no computador; item no rodapé da grade no Modo TV) ou tecla **C**. Esse clique é o gesto do usuário que libera o som que o navegador exige: **deixe a aba aberta**; o celular controla daqui.
2. No celular: escaneie o **QR code** com a câmera (abre `#/controle`) ou, sem câmera, abra o site no celular, toque em **Mais › Usar este celular como controle** (`#/controle`) e digite o **código de 8 caracteres** (alfabeto sem 0, O, 1, I; vale **10 minutos** se ninguém conectar).
3. O celular mostra o canal atual (número em destaque, nome, logo, programa se houver guia), **dial ‹ ›** (ou deslizar o topo), **teclado numérico** com Enter, **Zapear**, pausa/play, mudo, favoritar, **tela inteira** (liga o layout de janela inteira do Modo TV no computador) e **volume**. A aba **Canais** tem a grade com logos, busca pelo teclado do celular, favoritos e recentes; tocar num canal abre no computador. Se o canal cair, o celular mostra "Fora do ar no computador" com **Próximo canal**.
4. No computador, a folha lista os celulares ("📱 Celular conectado · iPhone · agora") com **Desconectar** (até **3** ao mesmo tempo), **Encerrar o controle** (gera QR e código novos e desconecta todos) e **Desligar**. Cada comando mostra a vinheta de troca de canal e o aviso "📱 controle". Reaproveita as mesmas ações do teclado e da TV (`zap`, `tuneNumber`, favoritar…).

**Segurança.**
| Item | Como é |
|---|---|
| Pareamento (QR) | `sessao` = 16 bytes aleatórios e `chave` = AES-GCM 256 (WebCrypto). Link: `…/tv-livre/#/controle?s=<sessao>&k=<chave>`: tudo depois do `#`, **nunca vai a servidor**; o celular apaga a chave do endereço ao abrir. |
| Tópicos | `tvlivre/v1/<hash(sessao)>/cmd` (celular → computador) e `…/estado` (computador → celular, **mensagem retida**). O broker só vê o hash. |
| Mensagens | **Toda mensagem é cifrada** (AES-GCM, IV aleatório por mensagem) e leva `seq`, `ts`, a versão e o remetente. O computador descarta mensagem com **mais de 30 s**, com `seq` **repetido** ou **adulterada** (o AES-GCM autentica). |
| Código alternativo | Sessão e chave **derivadas do código** (PBKDF2-SHA-256, 200 mil iterações, sal fixo do app). **Expira em 10 min** e é de **uso único**: ao conectar, o computador envia uma chave nova pelo canal já cifrado e o código deixa de valer. |
| Entrada | Todo comando e estado é validado (`src/lib/remote/protocolo.ts`): tipo, faixa e tamanho; o que não passa é descartado. |
| Acesso | Até 3 celulares; o computador desconecta qualquer um (que fica bloqueado) e **Encerrar** invalida o QR antigo. A sessão ativa vive em `sessionStorage` (sobrevive a recarregar a aba, não a fechá-la). |

**O que trafega e por onde.** Só mensagens cifradas, pelo broker MQTT público **HiveMQ** (`wss://broker.hivemq.com:8884/mqtt`, gratuito, sem conta), configurável em `src/lib/remote/transporteMqtt.ts`. Quem vê a rede ou o broker vê tópicos com hash e bytes ilegíveis, não os canais nem os comandos. Quem **fotografa o QR** ou lê o código tem o controle até você **Encerrar**.

**Privacidade.** **Nada é carregado nem conectado até você ativar o controle**: o receptor, o pacote `mqtt` (≈ 99 KB gzip, chunk próprio, fora do pré-cache do service worker) e a conexão com o broker só entram ao ativar. A tela do celular (`#/controle`) é outro chunk, carregado só nessa rota; o celular nunca carrega vídeo nem a lista de streams, só o índice de canais para a grade.

**Desenvolvimento e testes.** `tvlivre:remote-broker` no `localStorage` troca o transporte: `broadcast` (duas abas do mesmo aparelho, via `BroadcastChannel`) ou `ws://host:porta` (broker local). Os E2E sobem um broker local (`aedes` + `ws`, `e2e/broker.ts`): nada sai para a internet.

**Limitações.**
- **Tela cheia:** o navegador não deixa entrar em tela cheia por comando remoto (e o TV Livre não tenta contornar). O botão do celular liga um **layout de janela inteira**; para tela cheia de verdade, aperte **F11** uma vez no computador.
- **iPhone:** o Safari derruba o WebSocket em segundo plano. Ao voltar, o controle reconecta sozinho mostrando "reconectando…" e reenvia `ping`. Com a tela bloqueada o controle não recebe nem envia nada.
- **Redes que bloqueiam WebSocket** (empresas, escolas, alguns Wi-Fi públicos): o celular mostra o motivo e "Tentar de novo". O broker é de terceiros e gratuito: pode ficar fora do ar ou limitar a taxa.
- **Relógio:** a janela de 30 s exige data e hora parecidas nos dois aparelhos; se não forem, o celular avisa para ajustar.
- **O computador precisa ficar com a aba aberta** (em segundo plano funciona; aba fechada ou computador dormindo, não).
- Os favoritos e recentes da aba Canais são os **do celular**; o botão ★ do controle favorita no **computador**.

## Transmitir para a TV

Botão **Transmitir** nos controles do player (só em Chrome, Edge, Brave e outros Chromium; **fora do Modo TV**). Só canais **HLS em HTTPS, com CORS liberado e sem cabeçalhos especiais** podem ser transmitidos (`podeTransmitir`, `src/lib/cast.ts`): o receptor do Chromecast é um app web e pede o vídeo com as mesmas regras do hls.js. Canais HTTP e sem CORS **não** são transmissíveis (não há proxy nem contorno). Canal do YouTube usa o botão de transmitir do próprio embed oficial (o player mostra uma dica).

| Plataforma | Como funciona |
|---|---|
| **Chromecast / Google TV** (Chromium) | Primeiro toque: baixa o SDK do Google Cast **só nesse momento** e abre o seletor. Usa o *Default Media Receiver*; envia a URL do canal (`application/x-mpegURL`, `LIVE`) com título "07 · Nome", subtítulo = programa atual (se o guia existir) ou país e o logo (se https). Depois do SDK, o botão some se não houver aparelho. |
| **AirPlay** (Safari: iPhone, iPad, Mac) | `webkitShowPlaybackTargetPicker`; o botão só aparece com destino na rede. O AirPlay não funciona com MediaSource, então a tentativa troca para **HLS nativo** (`buildPlan(..., { nativeOnly: true })`) e volta ao hls.js ao sair do AirPlay. |
| **Remote Playback API** | Onde `video.remote` existe e o canal toca por `src` nativo; se o navegador recusar, a opção some. |
| **Smart TV sem Chromecast** | **Mais › Assistir na Smart TV** (e o ícone de TV no topo, no computador): endereço curto e número do canal em letras grandes, para digitar no navegador da TV (o **Modo TV** liga sozinho lá). |

**Durante a transmissão o celular vira controle remoto.** O vídeo local para (nada é baixado no celular) e aparece o painel "Transmitindo para {aparelho}" com o número e o nome grandes, volume, mudo e **Parar transmissão** (volta a tocar no celular no mesmo canal). **Zapear continua funcionando** (‹ ›, deslizar, Zapear, teclas, Media Session): cada troca faz um novo `loadMedia` e os canais não transmissíveis são **pulados** com o aviso "canal X não pode ser transmitido, pulando". Erro do receptor aparece no padrão do diagnóstico, com a oferta do próximo canal. Se a página recarregar com a transmissão ativa, o painel é retomado.

**Privacidade.** Nenhum script de terceiros é carregado na abertura do site. O SDK do Google Cast (`gstatic.com`) só é baixado quando você toca em Transmitir (ou, ao recarregar a página no meio de uma transmissão que você mesmo começou, para retomar o controle; isso usa `tvlivre:transmitindo`). Há teste E2E garantindo que nenhuma requisição a `gstatic.com` acontece antes do toque.

**Brave.** O Cast vem desligado (Media Router). Em vez de mostrar um botão quebrado, o Transmitir abre o passo a passo (`brave://settings/extensions` › Media Router), repetido na página **Instalar**, e só depois oferece transmitir.

## Modo rádio e economia de dados

Seletor **Normal · Econômico · Rádio** abaixo do dial (e em **Mais**); tecla **R** alterna o Rádio. A escolha fica em `tvlivre:modo-audio`.

| Modo | O que faz |
|---|---|
| **Normal** | Qualidade automática, como sempre. |
| **Econômico** | Vídeo no **menor bitrate** da lista (`autoLevelCapping` + `currentLevel`), sem trocar de canal nem recarregar. |
| **Rádio** | Só áudio, num elemento **`<audio>`** (o som tem mais chance de continuar com a tela apagada e o app em segundo plano; no HLS nativo do iPhone, `<audio src>`). Usa uma **variante só de áudio** se a lista tiver; senão o menor nível de vídeo, com o vídeo oculto. O **Wake Lock é liberado** (a tela pode apagar); a Media Session segue com título, canal e arte e os botões anterior/próximo trocam de canal. Tela do Rádio: número gigante, nome, programa (se houver guia) e a luz de transmissão da marca (parada com `prefers-reduced-motion`). |

- **Timer de desligar** (15, 30, 60, 90 min ou "fim do programa", este só se houver guia): pausa a reprodução e **baixa o volume gradualmente nos últimos 10 s**. Lembra a última escolha em `tvlivre:timer-padrao`.
- **"Bom para ouvir"** nos filtros: categorias `news`, `music`, `religious`, `talk`, `sports` e `education`.
- **Sugestão automática:** com `navigator.connection.saveData` ou `effectiveType` `2g`/`3g`, aparece **uma vez** um convite discreto para Econômico ou Rádio (dispensável; não volta por 30 dias, `tvlivre:dica-dados`).
- **Consumo honesto.** Mostra o **MB/h estimado** do nível em uso (`bitrate × 3600 / 8`) e o **consumido nesta sessão**, somando os bytes reais dos trechos baixados (`FRAG_LOADED` → `stats.loaded`). Se a lista não tem variante só de áudio, diz isso e informa o consumo do menor vídeo. Canal com **uma única qualidade** avisa que o modo não reduz o consumo. No **HLS nativo (iPhone)** não dá para escolher a qualidade nem medir: aparece "economia não garantida neste aparelho", sem números inventados.
- **O que esperar (amostra real).** Em 114 canais no ar sorteados, **só 1 tem variante só de áudio** (0,9%): na prática o Rádio quase sempre cai no menor vídeo (média ≈ 725 MB/h contra ≈ 728 do Econômico e ≈ 1.048 do Normal médio, pelo BANDWIDTH declarado). O ganho do Rádio é **tela apagada e bateria**, não dados. Detalhes em `scripts/amostra-modos.ts`.
- O hls.js **remove as variantes só de áudio** de `hls.levels` quando há variantes de vídeo; por isso a variante é lida do manifesto bruto (`MANIFEST_LOADED`) e a fonte é recarregada nela.

## Instalar como aplicativo (PWA)

| Plataforma | Como |
|---|---|
| **Android** (Chrome, Edge, Samsung Internet) | Toque em **Instalar** no topo do app (ou menu ⋮ › *Instalar aplicativo*). |
| **iPhone / iPad** (Safari) | **Compartilhar** › **Adicionar à Tela de Início** › **Adicionar**. O app mostra essas instruções. |
| **Computador** (Chrome, Edge) | Botão **Instalar** no topo do app ou ícone de instalação na barra de endereço. |
| Outros (Firefox…) | Sem instalação: o site funciona normalmente na aba. A página **Instalar** (`#/instalar`) explica cada caso. |

O convite não aparece durante a reprodução nem com o app já instalado, e quando dispensado só volta após 30 dias.
O manifesto tem ícones `any` e `maskable`, `apple-touch-icon`, capturas de tela e atalhos (**Zapear**, **Favoritos**,
**Buscar canal**), com `scope`/`start_url` em `/tv-livre/`.

**Offline.** O service worker (vite-plugin-pwa / Workbox) pré-guarda a estrutura do app e usa *stale-while-revalidate* nos
arquivos de `data/`. Sem internet o app abre e mostra favoritos e canais já visitados, e explica que **para assistir é preciso
conexão**. **Vídeo nunca é interceptado nem guardado** (só `data/*` e os arquivos do app passam pelo service worker).
Quando há versão nova aparece "Atualizar"; a atualização **nunca recarrega sozinha** (nem durante a reprodução).

## Contador de acessos e "assistindo agora"

O site continua **sem backend de vídeo e sem proxy**: o vídeo vai direto da fonte para o navegador. O que existe agora é um
**serviço mínimo de presença** (`workers/presenca`, um Cloudflare Worker + Durable Object) que só **conta conexões**:
quantas pessoas estão com o TV Livre aberto, quantas estão com um canal tocando e quantas em cada canal. Ele nunca vê
nem toca vídeo.

```
navegador ──WebSocket──▶ Worker (confere Origin) ──▶ Durable Object "Sala" (uma só, com hibernação)
   ▲                                                    │ guarda por conexão: navegando|assistindo, id do canal, país
   └──── resumo a cada ≥ 3 s, só se mudou ◀─────────────┘ conta, monta o top 10, grava recordes (em lote)
```

Os números na tela: `● 37 assistindo agora · 12.408 acessos` (topo do computador e tela inicial), **"23 assistindo este canal"** no
player, o bloco **"Em alta agora"** (top 5) na tela inicial, o filtro **"Mais assistidos agora"**, a faixa e o "Em alta" do
**Modo TV** e os **recordes** (acessos hoje, pico de pessoas assistindo e o dia dele) na página **Sobre**. O ponto vermelho
pulsa devagar (só opacidade) e fica parado com `prefers-reduced-motion`. Só o total "assistindo agora" é uma região `aria-live`,
com no máximo um anúncio a cada 30 s.

### O que é enviado e o que NÃO é (privacidade)

- **Enviado:** "estou assistindo o canal `BR/globo`" ou "estou navegando". Mais nada.
- **Não existe:** cookie, conta, impressão digital do aparelho, identificador persistente. O id de cada aba é aleatório, vive em
  `sessionStorage` (`tvlivre:presenca-aba`) e **nunca sai do navegador**: serve só para as abas do mesmo navegador se entenderem.
- **IP:** o Worker vê o endereço no instante da conexão, só para limitar abuso (no máximo 10 conexões por endereço), **apenas em memória**,
  sem gravar. O armazenamento guarda só: total de acessos, acessos de hoje, recorde de pessoas assistindo e a data dele.
- **Canal pequeno some:** a contagem de um canal só é divulgada com **3 ou mais** pessoas (o serviço nem envia menos; o site confere de novo).
- **Estimativa:** é o número de conexões abertas, não uma métrica auditada.
- **Sem serviço, o site é o de sempre:** sem `VITE_PRESENCA_URL`, ou com o serviço fora do ar, os números simplesmente **somem** e o
  vídeo, o zapear e tudo mais continuam. Nada é contado em `localhost`, em testes nem sob automação (`navigator.webdriver`).

### Como o cliente se comporta (`src/lib/presenca.ts`)

- **Uma conexão por navegador:** a aba "líder" (eleita por Web Locks) abre o WebSocket; as outras falam com ela por `BroadcastChannel`.
  Duas abas = uma conexão. Se a líder fecha, outra assume.
- **Quando conecta:** depois da carga da página **e** da primeira interação (ou 3 s, o que vier primeiro).
- **Estados:** `assistindo` (+ canal) quando o vídeo **está tocando** (evento `playing`, não pausado) e ao trocar de canal;
  `navegando` ao pausar, dar erro ou sair do player. Mensagens agrupadas: no máximo 1 a cada 2 s, e a mais recente sempre vence.
- **Segundo plano:** aba oculta que ainda toca continua contando; sem tocar, fecha a conexão após 2 min e reabre ao voltar.
- **Reconexão:** espera exponencial de 1 s a 60 s com sorteio (±25%), e **desiste após 5 falhas seguidas** até a próxima interação.
- **Ping** de 60 s (o runtime responde sem acordar o objeto); o servidor derruba conexões mudas por 150 s.
- A visita é registrada **uma vez por sessão** (`POST /acesso`, mesma regra de antes). O **Abacus** continua só como **leitura de reserva**
  do total (e é de onde o serviço novo parte, uma única vez, para o número não cair).

### Limites do plano gratuito e custo (consultados em 2026-11-09)

Documentação: [preços do Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) ·
[limites do Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/) ·
[limites do Workers](https://developers.cloudflare.com/workers/platform/limits/) ·
[WebSockets e hibernação](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) ·
[preços do Workers](https://developers.cloudflare.com/workers/platform/pricing/).

| Recurso (plano gratuito, zera às 00:00 UTC) | Limite |
|---|---|
| Requisições de Worker | 100.000 / dia |
| Requisições de Durable Object (HTTP, alarmes, **mensagens WebSocket recebidas na razão 20:1**) | 100.000 / dia |
| Duração do Durable Object | 13.000 GB-s / dia (128 MB, só enquanto ativo; hibernando não conta) |
| Linhas gravadas (SQLite; cada `setAlarm` = 1) | 100.000 / dia |
| Mensagens enviadas e *pings* de protocolo | sem cobrança |

Cálculo em `workers/presenca/custos.mjs` (premissas: visita de 20 min, 6 trocas de canal, ping de 60 s, difusão a cada 3 s **no pior caso**,
ou seja, sempre há mudança; `node custos.mjs --ping 30 …` recalcula com outros números):

| Simultâneos | Horas/dia nesse nível | Visitas/dia | Worker (100 mil) | Durable Object (100 mil) | Linhas (100 mil) | GB-s (13 mil) | Cabe no gratuito? |
|---:|---:|---:|---|---|---|---|---|
| 100 | 8 | 2.400 | 5% | 18% | 12% | 0% | sim |
| 100 | 24 | 7.200 | 15% | 55% | 35% | 1% | sim |
| 1.000 | 2 | 6.000 | 12% | 23% | 3% | 0% | sim |
| 1.000 | 8 | 24.000 | 48% | **92%** | 12% | 1% | sim (no limite) |
| 1.000 | 24 | 72.000 | 145% | 276% | 35% | 3% | **não** (plano pago: ≈ US$ 6,09/mês) |
| 5.000 | 2 | 30.000 | 61% | 105% | 3% | 1% | **não** (≈ US$ 5,32/mês) |
| 5.000 | 8 | 120.000 | 242% | 420% | 12% | 4% | **não** (≈ US$ 6,74/mês) |

Leitura: **100 pessoas simultâneas cabem no gratuito o dia todo; 1.000 cabem por até ~8,7 h/dia; 5.000 só por ~1,9 h/dia.** Acima disso o
Durable Object passa de 100 mil requisições/dia e o plano pago (US$ 5/mês de mínimo) cobre com folga (a duração, em GB-s, nunca é o gargalo).
O custo por visita é ≈ 2 requisições de Worker e ≈ 3,4 do Durable Object.

**Como chegamos a 1.000 sem estourar** (o roteiro pedia ajustar os intervalos se não coubesse): com *ping* e varredura de 30 s o cenário de
1.000 × 8 h dava **117%** do Durable Object (≈ 116.640 requisições). Subir o *ping* para 60 s (um meio-termo: segura a conexão aberta atrás de redes móveis e NAT, que costumam fechar conexões ociosas, sem pesar na cota; a documentação
consultada não fixa um tempo máximo de ociosidade do WebSocket, então 60 s é uma escolha nossa, não um número da Cloudflare), a varredura para 60 s, gravar contadores em lote (a cada 15 s, em vez de 1 linha por visita: sem isso 72 mil visitas/dia
já estourariam as 100 mil linhas) e rearmar o alarme só quando houve mudança leva a **92%** (≈ 92.160). Se o *ping* automático do runtime
não contar como requisição (a documentação não diz de forma explícita), cai para 68%.

**Teste de carga** (`workers/presenca/carga.mjs`, fora do CI, contra `wrangler dev` local): **500 conexões por 5 min, 0 falhas**; cada cliente
recebeu uma difusão a cada ~3,4 s (o piso de 3 s se mantém sob mudança constante de ~8 trocas/s), 436 bytes por difusão, CPU do `workerd` ≈ **11% de um
núcleo**. O teste valida comportamento e carga; **o consumo cobrado vem do modelo** (a cobrança só existe na Cloudflare).

**Escalabilidade (não implementada de propósito):** hoje há **uma sala só**; um Durable Object atende bem alguns milhares de conexões, mas cada
difusão é O(conexões). Passando de ~10 mil simultâneos, o caminho é fatiar a sala por país/canal (vários objetos que informam totais a um agregador). Não faz sentido antes de precisar.

**Por que não outras opções:** *Firebase Realtime Database* (plano Spark: 100 conexões simultâneas) e *Supabase Realtime* (plano Free: 200 conexões e 100 mensagens/s)
têm tetos baixos demais para um pico; *broker MQTT público* (o do controle remoto) deixa **qualquer pessoa publicar**, então qualquer um forjaria "10 mil assistindo".
O Durable Object é o único que permite conferir `Origin`, validar cada mensagem e limitar abuso no servidor, de graça, com WebSocket de baixo custo (hibernação).

**Abuso:** `Origin` conferida antes de acordar o objeto (só `https://jkfa.github.io`; `localhost`/`127.0.0.1` apenas com `AMBIENTE=dev`), mensagens de até 200 bytes,
validadas (id de canal `[A-Za-z0-9._@~-]{1,100}`), rajada de 3 e depois 1 mensagem a cada 2 s por conexão, 10 conexões por IP, 30 acessos por IP/hora. Não é
à prova de um atacante determinado (a contagem é pública por natureza), mas torna a inflação cara e visível.

### Rodar e testar localmente

Requer **Node 22** (o `wrangler` exige 22.12+).

```bash
cd workers/presenca && npm ci
npm test            # 28 testes no runtime real do Workers (@cloudflare/vitest-plugin)
npm run typecheck
npm run dev         # wrangler dev em http://127.0.0.1:8787 (use --var AMBIENTE:dev para aceitar localhost)
node carga.mjs      # teste de carga manual (500 conexões, 5 min)
node custos.mjs     # tabela de consumo contra os limites gratuitos
```

Para ver o site falando com o serviço local, abra o console em `http://localhost:5173/tv-livre/` e rode
`localStorage.setItem('tvlivre:presenca-teste', 'http://127.0.0.1:8787')` (liga a presença mesmo em localhost e sob automação).
O E2E (`e2e/presenca.spec.ts`) faz isso sozinho, subindo o `wrangler dev` e vários navegadores isolados.

### Publicar o serviço (você ainda não fez; nada é publicado sem isto)

1. Crie uma conta gratuita em <https://dash.cloudflare.com/sign-up> (não pede cartão para o plano gratuito de Workers).
2. Em **Workers & Pages**, defina o subdomínio `workers.dev` da conta quando o painel pedir. O Worker ficará em `https://tvlivre-presenca.<seu-subdominio>.workers.dev`.
3. Copie o **Account ID** (painel › Workers & Pages › barra lateral direita).
4. Crie um **API Token** em *My Profile › API Tokens › Create Token › Create Custom Token* com a permissão mínima **Account › Workers Scripts › Edit**,
   restrita à sua conta. (Se o primeiro deploy reclamar de outra permissão, a mensagem de erro diz qual falta; não a adicione sem necessidade.)
5. No GitHub, em *Settings › Secrets and variables › Actions*: crie os **secrets** `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
6. Rode o workflow **Publicar serviço de presença** (Actions › Run workflow). Ele testa e faz `wrangler deploy`; copie o endereço que aparece no log.
7. Ainda em *Secrets and variables › Actions › Variables*, crie a **variável** `PRESENCA_URL` com esse endereço (não é segredo) e rode **Publicar TV Livre**.

Sem os secrets o workflow só avisa e não publica; sem `PRESENCA_URL` o site é construído como antes. Uma falha do serviço **nunca** bloqueia a publicação do site.

## Modo TV (controle remoto)

Em navegadores de TV (Samsung/Tizen, LG/webOS, Google TV, Fire TV, Chromecast) o site liga sozinho o **Modo TV**: vídeo em tela cheia, letras e foco grandes para 3 metros, e tudo controlado pelo controle remoto. Em qualquer outro aparelho: **Mais → Modo TV → Ligado**, tecla **T** no teclado, ou abra `?tv=1` no endereço (`?tv=0` desliga, `?tv=auto` volta ao automático). **Para sair no navegador:** quando o modo foi ligado à mão (`?tv=1`, menu ou celular), um botão **Sair do modo TV** fica **sempre visível** no canto superior esquerdo, em qualquer tela (vendo o canal, com a grade aberta, tela inicial, páginas de texto); além dele, a tecla **T** e a tecla **Esc** saem (com a grade aberta, o primeiro Esc só a fecha). Em **TV de verdade** (Modo TV ligado sozinho) o botão fica escondido, o mouse segue oculto e o Voltar do controle continua sendo da TV. Também há **Sair do modo TV** no rodapé da grade.

| Tecla | Assistindo | Na grade |
|---|---|---|
| ▲ ▼ ou CH+ CH- | próximo / anterior canal | mover o foco |
| OK | abre a grade (ou liga a TV, ou aciona o botão focado) | assistir o canal focado |
| ◀ ▶ | abre a grade | alternar entre canal e estrela |
| Voltar | (deixa a TV tratar) | fecha a grade |
| 0–9 | digita o número do canal (OK confirma, ou espera 1,6 s) | idem |
| Vermelho | favorita o canal atual | |
| Info | mostra "Agora / A seguir" (também aparece sozinho a cada troca) | |
| Verde | zapear (sorteia um canal no ar) | |
| Amarelo | busca | |
| Azul | filtros | |

- A navegação por setas é **espacial** (`src/lib/spatial.ts`, testada em unidade): o foco vai para o vizinho mais próximo na direção, também dentro de folhas e painéis de erro.
- Os códigos das teclas de Tizen (Voltar 10009, CH± 427/428) e webOS (Voltar 461) são tratados em `src/lib/tvmode.ts`.
- Na TV não aparece "Abrir no VLC" (não há VLC para abrir): quando um canal não toca, o painel leva para trocar de canal.
- Preferência salva em `tvlivre:modo-tv` (`auto` | `ligado` | `desligado`).
- **Não testado em TV de verdade**: só em Chromium a 1920×1080 com o teclado. Modelos antigos (Tizen/webOS com Chromium muito velho) podem ter diferenças de CSS ou de teclas.

## Como o player escolhe como tocar

`src/lib/playback.ts` monta, para cada canal, uma lista de tentativas que o `HlsStage` executa em ordem:

| Canal | Tentativas |
|---|---|
| HTTPS com CORS | hls.js → HLS nativo (se o hls.js falhar sem resposta do servidor) |
| HTTPS sem CORS | HLS nativo (o `<video>` não precisa de CORS) |
| HTTP, página HTTPS | 1) mesmo endereço por **HTTPS** (hls.js reescrevendo lista e trechos; depois nativo) · 2) **HTTP direto**, que só passa se o usuário liberou "Conteúdo não seguro" |
| Nada tocou | painel com a causa real e **Abrir no VLC** |

- Resposta real do servidor (404, 403) ou lentidão no endereço original encerram a sequência: outro motor não resolve.
- Quando o HTTP direto toca, o site lembra (`tvlivre:http-liberado`) e passa a tentar o HTTP primeiro; esses canais entram no zapear.
- O site **não consegue pedir a permissão por código**: não existe API para isso. Ele detecta o bloqueio (HTTP + página HTTPS + falha sem resposta do servidor) e mostra o passo a passo, com o atalho `chrome://settings/content/siteDetails?site=…` para copiar.
- Sem proxy e sem hospedar vídeo: tudo acontece entre o navegador do usuário e o servidor do canal.

## Como os dados são tratados

| Etapa | O que acontece |
| --- | --- |
| Fontes | `playlist.m3u8` do Free-TV e a API do iptv-org (`channels`, `streams`, `feeds`, `logos`, `blocklist`, `countries`). |
| Normalização | Parser M3U tolerante a entradas malformadas; nomes sem acentos/qualidade; `UK` e `GB` unificados. |
| Duplicatas | Por URL (http/https tratados como iguais) e por *nome normalizado + país*. **Free-TV tem prioridade**; a origem de cada canal fica em `sources`. |
| Adultos | Excluídos por `is_nsfw`, categoria `xxx`, blocklist do iptv-org, URLs de canais adultos e palavras-chave. |
| Tipo do link | `hls` (HTTPS reproduzível), `youtube`, `http` (o site tenta HTTPS e, se o usuário liberou, HTTP puro) ou `other`. |
| Status | `online`, `offline` ou `desconhecido`, mais `fails` (falhas seguidas). No app: *No ar*, *Instável* (1–2 falhas seguidas), *Fora do ar* e *Não confirmado* (`src/lib/health.ts`). **Uma falha isolada nunca remove nem derruba um canal.** |
| Medidas | `checked` (último teste, minutos desde a época), `latency` (ms até a resposta, medido nos EUA: só uma dica), `resolution` (maior variante da lista HLS, ex. `1080p`) e `httpsOk` (link HTTP que também responde por HTTPS com CORS: toca no navegador sem conteúdo misto). Só aparecem quando há valor. |
| Saída | `public/data/index.json` (leve) + `public/data/countries/<PAÍS>.json` + `health.json`. A página só baixa o índice e o país escolhido. |

**Número do canal.** É a posição estável do canal na grade do país (Free-TV primeiro, depois ordem alfabética), independente de
filtros e de status; só muda quando a lista de canais muda.

**Regras de status.** Sucesso → `online`. Falha certa (404/410, DNS, certificado) → `offline`, mas um canal que estava online
só cai para `desconhecido` na primeira falha. Falha ambígua (timeout, 403, 5xx, conteúdo estranho, comum em bloqueio
geográfico, já que o teste roda em servidores fora do Brasil) → `desconhecido`, e só vira `offline` após 3 execuções seguidas.
Links HTTP são testados também na versão HTTPS (o player tenta essa versão primeiro).

**Saúde no site (`src/lib/health.ts`, `useHealth`).** Uma única regra alimenta os selos, a ordem da lista, o filtro, o zapear e o
Guia de TV. A lista ordena *no ar → não confirmado → instável → não abriu aqui → fora do ar*, mantendo a ordem de antes
dentro de cada faixa; **nenhum canal some por causa do status**. O filtro *Ocultar canais fora do ar* começa **desligado** e a
escolha fica salva (`tvlivre:ocultar-fora`). Canais que o navegador não consegue tocar aqui (HTTP sem HTTPS numa página segura,
sem CORS e sem HLS nativo, cabeçalhos exigidos, outro formato) levam o selo *Não toca no navegador*, esteja o canal no ar ou não.
**Sinal local:** um canal que deu erro ao tocar neste navegador fica em `tvlivre:falhas` por 7 dias, ganha o selo *Não abriu
aqui* e desce na lista a partir da próxima sessão; se tocar de novo, sai do registro. Sem internet não conta. Nada disso sai do
aparelho: não é métrica de audiência.
O pipeline também detecta se o servidor envia cabeçalhos **CORS**; sem eles o navegador não consegue tocar o canal e o site avisa.

**Origem e regiões.** Cada canal tem o país de origem (`country`, ISO 3166-1; `INT` = internacional). A **bandeira** vem do
campo `flag` do `countries.json` do iptv-org e as **regiões** do `regions.json` (baixado pelo pipeline; se falhar, os países só
ficam sem região). Os dois vão para `index.json` (`countries[].flag`, `countries[].regions`); o site não desenha bandeira a partir
do código. Mostramos 8 regiões (`shared/regions.ts`): América do Sul, Central, Caribe, do Norte, Europa, África, Ásia e Oceania.
A fonte **não divide o mundo de forma exclusiva**: um país pode estar em duas regiões (Rússia, Turquia, Cazaquistão, Geórgia,
Armênia, Azerbaijão e Chipre estão na Europa e na Ásia) e alguns não estão em nenhuma (México, Hong Kong, Macau, Kosovo, Ilhas
Faroé, Caribe Neerlandês): esses aparecem em **"Sem região na fonte"**. Internacional não tem bandeira (ícone de globo).

**Guia de TV (`#/guia`).** Topo com o país (bandeira + nome), quantos canais e quantos no ar, e **Zapear em {país}**; abaixo, o
seletor **região → país**; depois, atalhos por assunto e uma seção por categoria do iptv-org (um canal com várias categorias
aparece em cada uma; "Geral" e "sem assunto" vão para o fim). Cada cartão: número, nome, programa de agora (se o país tem guia),
selo de saúde, bandeira e qualidade; *Mostrar os N* abre a seção e *Abrir na grade* leva a `#/canais` filtrado. Ordem pela saúde,
sem esconder ninguém. Também na abertura: uma faixa com as bandeiras dos países com mais canais no ar (cada uma abre o guia do
país) e "Países por região" no lugar de "Outros países".

**Salvaguardas.** O pipeline termina com erro, e portanto **não publica**, se uma fonte estiver fora do ar/inconsistente ou se o
total de canais cair mais de 50% em relação à publicação anterior.

## Guia de programação (EPG): "Agora" e "A seguir"

Cada canal com guia mostra o programa no ar e o seguinte: na **grade** (título + barra fina de progresso), no **player**
("Agora: Título · 20h00–21h30", barra e "A seguir: Título · 21h30"), na **vinheta do zapear** e no **Modo TV** (faixa por 6 s a
cada troca de canal e com a tecla **Info**). O filtro **Começando agora** (programas que começaram há até 10 min ou começam em
até 15) existe nos filtros e como bloco na tela inicial. Canal sem guia simplesmente não mostra a linha.

| Etapa | Como funciona |
|---|---|
| Cobertura | `npm run epg:coverage` cruza a nossa grade com o `guides.json` do iptv-org e imprime, por país, canais, canais com guia, % e os sites coletores necessários. |
| Coleta | `scripts/build-epg.ts` escolhe, para cada canal com guia, **um** site (o que cobre mais canais do país), gera um `channels.xml` com o `id` da nossa grade como `xmltv_id` e roda o grab do **[iptv-org/epg](https://github.com/iptv-org/epg)** (clonado no workflow) com `--days 2`, tempo total limitado e concorrência controlada (`config/epg.json`). |
| Conversão | XMLTV → `public/data/epg/<PAÍS>.json` = `{ generatedAt, channels: { [id]: [[início, fim, título, categoria?], …] } }`, horários em **epoch UTC (s)**; só de "agora − 2 h" a "+ 36 h". Parser tolerante (entradas quebradas, fuso `20261109200000 -0300`, entidades HTML duplas). |
| Orçamento | **≤ 150 KB gzip por país.** Se passar, a janela à frente encolhe (36 → 30 → 24 → 18 → 12 → 8 h) e o aviso aparece no resumo da execução. |
| Opcional | Se a coleta falhar ou demorar demais, o deploy **continua**, sem guia ou com o último guia ainda válido (canais sem dado novo herdam o do arquivo anterior se ele tiver menos de 48 h). Nunca bloqueia a publicação. |
| No site | `src/lib/epg.ts` carrega só o país em uso (o índice lista os países com guia em `epg`), com *stale-while-revalidate* no service worker. Arquivo com mais de 48 h é tratado como ausente; entradas vencidas são ignoradas; a faixa se atualiza sozinha no fim do programa (um único temporizador). |

**Horários da publicação** (`deploy.yml`): **06:17 UTC** (03:17 em Brasília) roda tudo: dados, teste de links, guia, build, páginas, E2E e deploy.
**18:17 UTC** (15:17 em Brasília) renova só o guia: `--reuse-health` não testa nenhum link de vídeo e reaproveita o status da publicação anterior.
Países com guia: `config/epg.json` (`paises`). Os horários vêm de grades públicas de terceiros e **podem conter erros**; a página Sobre diz isso.

## Páginas indexáveis (SEO)

As rotas do app usam `#` e o Google não as indexa. Depois do `vite build`, `npm run build:pages` (`scripts/build-pages.ts`) gera **HTML estático de verdade**:

| Arquivo | Conteúdo |
|---|---|
| `canal/<pais>/<slug>/index.html` | Uma por canal elegível. `<title>`: `{Nome} ao vivo — canal {NN} \| TV Livre`; descrição com país, categoria, idioma e o programa do momento; `canonical`, Open Graph (`pt_BR`) e Twitter Card; JSON-LD `TelevisionChannel`; conteúdo **visível sem JavaScript** (nome, número, país, "Assistir agora" e canais relacionados). Com JavaScript carrega o mesmo app, que abre o player no canal. |
| `categoria/<slug>/`, `pais/<pais>/` | Listas de canais elegíveis. |
| `og/<pais>/<slug>.png` ou `.jpg` | Prévia 1200×630: número gigante + nome + marca (DESIGN.md), **sem o logo do canal**. Se o PNG projetar mais de 40 MB, usa JPEG na maior qualidade que cabe. |
| `data/paginas/<PAÍS>.json` | `{ id: slug }`, lido pelo botão Compartilhar. |
| `sitemap.xml` | Todas as páginas, com `lastmod`; referenciado no `robots.txt`. |

**Política (`config/seo.json`).** Para reduzir a exposição a reclamações de direitos, **só ganham página** os canais **no ar** cuja fonte principal é o **Free-TV** ou de categoria `public`, `education`, `legislative` ou `religious`. Todos os outros **não** ganham página (continuam no app). `permitir` e `bloquear` aceitam ids (`id` ou `PAÍS/id`; bloquear vence); `"indexar": "nenhum"` publica só os de `permitir`. Canais de `config/removals.json` **nunca** ganham página, nem por `permitir`.

**Slug.** Nome sem acentos, minúsculo, com hífens. Se dois canais do país dão o mesmo slug, todos do grupo ganham o sufixo do id (não depende da ordem).
**Roteamento.** `/tv-livre/canal/<pais>/<slug>/` é reconhecido por `parseLocation` (`src/lib/route-parse.ts`): a página leva `<meta name="tvlivre:canal" content="BR/id">`, que diz qual canal abrir. O hash sempre vence o caminho, então `#/...` e os atalhos do manifesto continuam iguais e o "Início" sai do canal. As páginas de categoria e de país são só para o Google: com JavaScript o app abre na tela inicial.
**Service worker.** Essas páginas ficam **fora** do `navigateFallback` (senão virariam o `index.html` do app) e usam *NetworkFirst* (rede primeiro, cache só offline ou após 4 s, vence em 3 dias): uma página nova aparece na recarga seguinte. Há teste E2E disso.

## Compartilhar

Botão **Compartilhar** ao lado da estrela do dial (e tecla **S**). Usa a **Web Share API** quando existe; senão abre uma folha com **WhatsApp**, **Telegram** e **Copiar link**. No Modo TV, o item **Abrir no celular (QR)** do rodapé da grade mostra um **QR code** do link. Texto: `📺 Tô assistindo {Nome} (canal {NN}) ao vivo no TV Livre: {link}` ou, havendo guia, `📺 Agora em {Nome}: {Programa} — {link}`. O link é a **página indexável** do canal quando ela existe e, senão, `#/canal/CC/ID`; nunca leva parâmetros de rastreamento. Nada é enviado a lugar nenhum pelo TV Livre: quem escolhe o destino é o usuário.

## Executar localmente

Requisitos: Node.js 20.19+ (recomendado 22) e npm.

```bash
npm install
npm run data:quick   # gera public/data sem testar links (rápido, ~2 s)
npm run dev          # http://localhost:5173/tv-livre/
```

Outros comandos:

```bash
npm run data         # pipeline completo, com teste de rede (15–25 min)
npm run check        # lint + tipos + testes unitários
npm run build        # tsc + vite build  → dist/ (inclui o service worker)
npm run build:pages  # páginas indexáveis, prévias OG e sitemap em dist/ (depois do build; usa o Chromium do Playwright)
npm run epg          # guia de programação (precisa de -- --epg-dir <clone do iptv-org/epg com npm ci>)
npm run epg:coverage # cobertura do guia por país (tabela)
npm run preview      # serve dist/ em http://localhost:4173/tv-livre/
npx playwright install chromium webkit
npm run test:e2e     # Chromium e WebKit; Pixel 7, iPhone 14, desktop Chrome e Safari (emulação)
PROJECTS=android,iphone npm run test:e2e                      # só alguns projetos
BASE_URL=https://jkfa.github.io/tv-livre/ npm run test:e2e    # testa o site publicado
npx tsx scripts/make-assets.ts        # regenera ícones, og.png e telas de abertura do iOS (a partir de src/brand/mark.ts)
npx tsx scripts/make-screenshots.ts   # regenera as capturas do manifesto (precisa de build + preview)
npx lighthouse http://localhost:4173/tv-livre/ --only-categories=performance,accessibility,best-practices,seo
```

Opções do pipeline (`tsx scripts/build-data.ts …`): `--no-probe`, `--limit N`, `--ignore-previous`, `--out DIR`,
`--freetv ARQUIVO --org-dir DIR` (usa cópias locais das fontes).

## Atualização dos dados e publicação

O workflow [`deploy.yml`](.github/workflows/deploy.yml) roda **a cada push na `main`, duas vezes por dia (06:17 UTC completa; 18:17 UTC só o guia) e manualmente**
(`workflow_dispatch`): lint → tipos → testes unitários → pipeline de dados → guia de programação (opcional) → build → páginas indexáveis → testes E2E (Playwright) → publicação
no GitHub Pages com `actions/deploy-pages`. Qualquer etapa que falhe impede a publicação, **exceto o guia**, que só gera aviso. O serviço de presença tem workflow próprio, [`presenca.yml`](.github/workflows/presenca.yml) (roda só quando `workers/presenca/**` muda): testes do Worker e `wrangler deploy`; é independente do site.

> O GitHub desativa workflows agendados após 60 dias sem atividade no repositório; basta um push ou execução manual para reativar.

### Remover um canal

Abra uma [solicitação de remoção](https://github.com/JkFa/tv-livre/issues/new?template=remocao-de-canal.yml). O canal é
adicionado a [`config/removals.json`](config/removals.json) (por id, URL, host ou nome) e some na atualização seguinte.

## Estrutura

```
scripts/          pipeline de dados (build-data.ts e lib/), guia (build-epg.ts, epg-coverage.ts), páginas indexáveis (build-pages.ts) + geradores de ativos (make-assets, make-screenshots)
shared/           tipos e utilitários usados pelo pipeline e pelo site
src/brand/        geometria única da marca (moldura aberta + luz de transmissão)
src/styles/       tokens (claro/escuro), base e componentes
src/components/   Player, HlsStage, grade (ChannelList), folhas, navegação inferior, páginas Sobre e Instalar
workers/presenca/ serviço "assistindo agora" (Cloudflare Worker + Durable Object), testes, custos.mjs e carga.mjs; tem `package.json` próprio (Node 22)
src/lib/remote/   controle pelo celular: cifra (AES-GCM, código, anti-repetição), protocolo validado, receptor (computador), controlador (celular) e transportes (MQTT, BroadcastChannel)
src/lib/          filtros, grade/zapear, atalhos, preferências, contador, PWA, rotas por hash, armazenamento seguro, Cast (cast.ts, castSdk.ts, useCast.ts), AirPlay (transporte.ts), modos e timer (modo.ts, timer.ts)
tests/unit/       testes unitários (Vitest) com playlists reais e malformadas em tests/fixtures/
e2e/              testes de ponta a ponta (Playwright) e da PWA
public/           ícones, telas de abertura, capturas, og.png (gerados e versionados)
config/           lista de remoções (removals.json), política de páginas indexáveis (seo.json) e do guia (epg.json)
```

Rotas usam *hash* (`#/` tela inicial, `#/canais` player + grade, `#/canal/BR/<id>`, `#/sobre`, `#/instalar`), então recarregar a página nunca gera 404 no GitHub Pages; o
build ainda copia `index.html` para `404.html`. Os atalhos do manifesto usam `#/zapear`, `#/favoritos` e `#/buscar`.

`localStorage` (todas as leituras e escritas com `try/catch`): `tvlivre:favoritos`, `tvlivre:recentes`, `tvlivre:pais`,
`tvlivre:ultimo`, `tvlivre:tema`, `tvlivre:mudo`, `tvlivre:volume` (0 a 100), `tvlivre:ocultar-fora`, `tvlivre:falhas` (canais que não abriram aqui, 7 dias), `tvlivre:instalar-dispensado`, `tvlivre:dica-deslizar`, `tvlivre:http-liberado`, `tvlivre:modo-tv`, `tvlivre:modo-audio` (`normal` | `economico` | `radio`), `tvlivre:timer-padrao` (`15` | `30` | `60` | `90` | `fim`), `tvlivre:dica-dados` e `tvlivre:transmitindo`; em `sessionStorage` (só enquanto a aba existe): `tvlivre:controle-sessao` (computador), `tvlivre:controle-par` (celular) e `tvlivre:presenca-aba` (id aleatório da aba, nunca enviado); `tvlivre:presenca-teste` (em `localStorage`) só para desenvolvimento e testes; `tvlivre:remote-broker` só para desenvolvimento (só existe durante uma transmissão que o usuário começou).

## Créditos e licenças

- **[iptv-org/iptv](https://github.com/iptv-org/iptv)**: canais e metadados (Unlicense / domínio público).
- **[Free-TV/IPTV](https://github.com/Free-TV/IPTV)**: playlist curada. O repositório **não declara licença**: usamos apenas
  nomes e endereços públicos de transmissão, com crédito, e removemos qualquer canal a pedido.
- Fontes: [Archivo](https://github.com/Omnibus-Type/Archivo) e [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) (SIL OFL 1.1; licenças em `src/assets/fonts/`).
- Ícones: [Lucide](https://lucide.dev) (ISC). [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0), React, Vite, TanStack Virtual, Workbox.

O código deste projeto está sob licença MIT. Os canais, nomes e logos pertencem aos respectivos titulares; o TV Livre apenas
aponta para transmissões publicadas por eles.

## Limitações

- **Link HTTP** é bloqueado pelo navegador numa página HTTPS (conteúdo misto) e **nenhum site consegue liberar isso sozinho**. O player faz o que é possível, nesta ordem e sem o usuário escolher nada (ver "Como o player escolhe como tocar"): HTTPS no mesmo endereço, HTTP direto se o usuário já liberou. Quando nada disso toca, o painel explica e oferece **Abrir no VLC** (celular: link direto; computador: arquivo `.m3u` de um clique).
- **Liberar HTTP** só existe no Chrome, Edge, Brave e Opera **de computador** (Configurações do site → Conteúdo não seguro → Permitir). Chrome/Edge/Firefox no celular, Safari e iPhone não têm essa opção; lá, canais que só existem em HTTP abrem pelo VLC.
- **CORS:** servidores sem CORS não deixam o hls.js ler o vídeo, mas o `<video>` com HLS nativo (Chrome, Edge e Safari recentes, Android, iPhone) toca sem CORS, então o site usa isso. Só Firefox e navegadores sem HLS nativo ficam com "Só no VLC".
- **Canais exigindo cabeçalhos** (User-Agent/Referer) só funcionam em players como o VLC.
- **YouTube:** só vídeos e `channel/UC…` têm embed; links `@handle` abrem no YouTube. O embed não permite PiP próprio nem Media Session.
- **iOS:** instalação só pelo Safari; no iPhone a tela cheia usa o player nativo; as telas de abertura cobrem iPhone e iPad em retrato.
- Links gratuitos mudam ou saem do ar sem aviso; a qualidade das fontes varia.
- Canais do iptv-org sem canal associado nos metadados são ignorados (não dá para filtrar adultos nem definir o país).
- **Transmitir:** só HLS em HTTPS com CORS e sem cabeçalhos (≈ 63% dos canais no ar); o Chromecast não funciona no Safari/Firefox (use AirPlay no Safari) e vem desligado no Brave. Nada disso foi testado em aparelho real nesta versão (ver a lista de testes manuais no PR).
- **Rádio e Econômico:** só reduzem dados onde a lista tem mais de um nível (≈ 40% dos canais da amostra); variante só de áudio é rara. No iPhone (HLS nativo) a economia não é garantida nem medida. O Rádio com a tela bloqueada depende do navegador e do sistema (iOS e Android podem suspender o áudio de abas em segundo plano).
- Logos são carregados dos servidores de origem **só do canal aberto** e podem falhar (aparecem as iniciais).
