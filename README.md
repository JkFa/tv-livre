# TV Livre

**O controle remoto da TV aberta.** Canais do Brasil e do mundo ao vivo, direto no navegador, com **zapear**, favoritos e
aplicativo instalável. Sem cadastro, sem anúncios, sem cobrança, e **sem hospedar vídeo**.

**Site:** <https://jkfa.github.io/tv-livre/> · **Código:** <https://github.com/JkFa/tv-livre> · **Design:** [DESIGN.md](DESIGN.md)

## Visão geral

- Reúne as listas [Free-TV/IPTV](https://github.com/Free-TV/IPTV) e [iptv-org/iptv](https://github.com/iptv-org/iptv).
- Um pipeline em TypeScript baixa as fontes, normaliza, remove duplicatas, exclui conteúdo adulto, classifica e **testa cada link**.
- O site é 100% estático (React + Vite + TypeScript) e toca HLS com [hls.js](https://github.com/video-dev/hls.js), ou com o
  HLS nativo do navegador onde o hls.js não existe (Safari do iPhone). YouTube usa o embed oficial.
- O navegador acessa **diretamente** a fonte do vídeo: não há backend, proxy, retransmissão nem gravação.
- Interface em português do Brasil, claro e escuro, mobile primeiro.
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
| Zapear | Dial `‹ 06 · 07 Nome · 08 ›`, deslizar no player (ignora as bordas da tela, que são do sistema), botão central **Zapear**. |
| Teclado (desktop) | `←` `→` `↑` `↓` trocam de canal · `Z` zapeia · `/` busca · `F` tela cheia · `M` mudo · `P` PiP · `Espaço` pausa · `S` compartilha · `0–9`+`Enter` digitam o número · `?` lista os atalhos. |
| Mobile | Navegação inferior ao alcance do polegar, filtros em folha inferior, player fixo no topo, `playsinline`, paisagem com player e grade lado a lado e convite para tela cheia. |
| Plataforma | Picture-in-Picture, Media Session (tela de bloqueio e teclas de mídia trocam de canal) e Wake Lock (tela ligada enquanto toca). |
| Resiliência | Autoplay só após uma ação do usuário; se o navegador bloquear, a interface continua. Queda de rede ou volta do segundo plano retomam o canal (até 3 tentativas), pulando para o ao vivo. |
| Retomada | Lembra o último canal (`tvlivre:ultimo`) e oferece "Voltar ao canal NN" ao abrir. |
| Erros | Explica a causa provável (fora do ar, bloqueio por região, CORS, formato, sem internet), oferece tentar de novo, **Abrir no VLC** com um toque (sem copiar link) e sugere outros canais. |

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

## Contador de acessos

Serviço: **[Abacus](https://abacus.jasoncameron.dev)** (gratuito, sem chave, sem cookies, CORS aberto). Escolhido após
testar de verdade a partir da origem `https://jkfa.github.io`: o CounterAPI v2 exige conta/workspace e o hits.sh não devolve JSON.

- Conta **no máximo uma visita por sessão** (`sessionStorage`, vale também para o app instalado) com `GET /hit/tvlivre-jkfa/acessos`.
- Só conta no site publicado, sem automação (`navigator.webdriver`). Nunca em `localhost`, nem nos testes.
- Mostra o total em formato brasileiro (ex.: `128.402 acessos`), exatamente o valor devolvido pelo serviço, em três lugares: bloco
  grande na **tela inicial**, faixa fixa no **topo do computador** (todas as páginas) e página **Sobre**. Ambiente local, testes e
  automação só **leem** o total (`GET /get/...`). Se o serviço falhar ou não houver internet, o contador some.
- Não envia dados pessoais: `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, só o nome do contador.
- **Região de quem acessa** ("Você está acessando de Minas Gerais, Brasil"): o navegador consulta o **[ipwho.is](https://ipwho.is)**
  (HTTPS, CORS aberto, sem chave), que enxerga o IP de quem pergunta. Pedimos só `region`, `country` e `country_code` (sem cidade),
  sem cookies e sem referência (`src/lib/region.ts`). A resposta fica só em `sessionStorage` (uma consulta por sessão) e nunca é
  enviada ao contador nem guardada pelo TV Livre. Se o serviço falhar, só a região some. A página Sobre explica isso ao usuário.
- Limitação inerente: o contador é um endereço público; qualquer pessoa pode chamá-lo. O número é uma contagem de visitas
  sem verificação, não uma métrica auditada.

## Modo TV (controle remoto)

Em navegadores de TV (Samsung/Tizen, LG/webOS, Google TV, Fire TV, Chromecast) o site liga sozinho o **Modo TV**: vídeo em tela cheia, letras e foco grandes para 3 metros, e tudo controlado pelo controle remoto. Em qualquer outro aparelho: **Mais → Modo TV → Ligado**, tecla **T** no teclado, ou abra `?tv=1` no endereço (`?tv=0` desliga, `?tv=auto` volta ao automático). Também há **Sair do modo TV** no rodapé da grade.

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
| Status | `online`, `offline` ou `desconhecido` (no app: *No ar*, *Fora do ar*, *Não confirmado*). **Uma falha isolada nunca remove nem derruba um canal.** |
| Saída | `public/data/index.json` (leve) + `public/data/countries/<PAÍS>.json` + `health.json`. A página só baixa o índice e o país escolhido. |

**Número do canal.** É a posição estável do canal na grade do país (Free-TV primeiro, depois ordem alfabética), independente de
filtros e de status; só muda quando a lista de canais muda.

**Regras de status.** Sucesso → `online`. Falha certa (404/410, DNS, certificado) → `offline`, mas um canal que estava online
só cai para `desconhecido` na primeira falha. Falha ambígua (timeout, 403, 5xx, conteúdo estranho, comum em bloqueio
geográfico, já que o teste roda em servidores fora do Brasil) → `desconhecido`, e só vira `offline` após 3 execuções seguidas.
O pipeline também detecta se o servidor envia cabeçalhos **CORS**; sem eles o navegador não consegue tocar o canal e o site avisa.

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
no GitHub Pages com `actions/deploy-pages`. Qualquer etapa que falhe impede a publicação, **exceto o guia**, que só gera aviso.

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
src/lib/          filtros, grade/zapear, atalhos, preferências, contador, PWA, rotas por hash, armazenamento seguro
tests/unit/       testes unitários (Vitest) com playlists reais e malformadas em tests/fixtures/
e2e/              testes de ponta a ponta (Playwright) e da PWA
public/           ícones, telas de abertura, capturas, og.png (gerados e versionados)
config/           lista de remoções (removals.json), política de páginas indexáveis (seo.json) e do guia (epg.json)
```

Rotas usam *hash* (`#/` tela inicial, `#/canais` player + grade, `#/canal/BR/<id>`, `#/sobre`, `#/instalar`), então recarregar a página nunca gera 404 no GitHub Pages; o
build ainda copia `index.html` para `404.html`. Os atalhos do manifesto usam `#/zapear`, `#/favoritos` e `#/buscar`.

`localStorage` (todas as leituras e escritas com `try/catch`): `tvlivre:favoritos`, `tvlivre:recentes`, `tvlivre:pais`,
`tvlivre:ultimo`, `tvlivre:tema`, `tvlivre:mudo`, `tvlivre:instalar-dispensado`, `tvlivre:dica-deslizar`, `tvlivre:http-liberado`, `tvlivre:modo-tv`.

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
- Logos são carregados dos servidores de origem **só do canal aberto** e podem falhar (aparecem as iniciais).
