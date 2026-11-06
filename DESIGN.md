# TV Livre — sistema de design

## Conceito: o controle remoto reinventado

A TV aberta brasileira sempre foi **número**: "passa pro 4", "tá no 13". O TV Livre trata o número do canal como
elemento gráfico principal e a **troca de canal** como a ação central, o produto é um controle remoto que já vem com a
televisão dentro. A tela inicial é a TV desligada na sala (uma ação, ligar); o aparelho (player + grade) vem a um toque.

Três ideias seguram o resto:

1. **O número é a interface.** Cada canal tem um número de grade (posição estável na lista do país). Ele aparece enorme
   na grade, na vinheta de troca e ao lado do player. Dá para digitar o número no teclado.
2. **Zapear é a ação principal.** Prev/Próximo, deslizar no player, botão **Zapear** (sorteio entre canais no ar) e
   setas do teclado. A troca é imediata e anuncia o canal com uma vinheta.
3. **Uma cor só.** O vermelho-tubo é o sinal de "ao vivo"; aparece no canal sintonizado, na ação principal e na luz
   de transmissão. O resto é papel e tinta: preto quente (tema escuro) ou papel envelhecido (tema claro).

Evitamos a nostalgia caricata (nada de TV de tubo, chuvisco ou VHS). A única referência direta é a **tela de ajuste**
(barras verticais) usada como estado de espera, desenhada em tons de papel e tinta com uma única barra vermelha.

### O que escolhemos não fazer

- **Sem logos na grade.** Logos de canais vêm de dezenas de servidores de terceiros, quebram, têm fundos incompatíveis e
  vazam o acesso do usuário a cada rolagem. Na lista o número e o nome bastam. O logo aparece só no canal aberto.
- **Sem cartões.** A grade é uma tabela tipográfica: régua fina, número grande à esquerda, nome ao lado.
- **Sem cor de status.** Status por forma (círculo cheio, vazado, riscado) e por texto. O acento fica reservado.

## Tokens

Definidos em `src/styles/tokens.css`. Dois temas (`data-theme="dark|light"`), com `auto` seguindo o sistema.

| Token | Escuro ("preto quente") | Claro ("papel envelhecido") | Uso |
|---|---|---|---|
| `--bg` | `#15110e` | `#efe6d2` | fundo do app |
| `--surface` | `#1e1914` | `#f6efdf` | painéis, folhas, barra inferior |
| `--raised` | `#2a241d` | `#e5dac0` | hover, campo de busca |
| `--rule` | `#3b342b` | `#cbbd9f` | réguas e bordas (1 px) |
| `--text` | `#f1e9d8` | `#1b1612` | texto principal |
| `--muted` | `#a79e8e` | `#5f574a` | texto secundário (≥ 4,5:1) |
| `--accent` | `#ff4b2b` | `#ff4b2b` | **preenchimentos** de ação e canal atual |
| `--on-accent` | `#15110e` | `#15110e` | texto sobre o acento (6,0:1) |
| `--accent-text` | `#ff4b2b` | `#b5290c` | acento usado como texto/traço (≥ 4,5:1) |
| `--screen` | `#000` | `#000` | tela do player (sempre preta) |

Espaçamento em escala de 4 px (`--s-1` … `--s-8`), raios `--r-s: 4px`, `--r-m: 10px` (um raio de campo, um de
folha; botões de ação são retângulos de cantos pequenos, como teclas), sem sombras difusas. A profundidade vem de
régua e contraste de superfície, não de blur.

## Tipografia

Ambas OFL, autohospedadas, subset latino, `font-display: swap` com fallback ajustado (`size-adjust`) para evitar salto.

- **Archivo** (variável, eixos `wght` e `wdth`), licença em `src/assets/fonts/`.
  - Marca e títulos: `wdth 125`, `wght 800` (expandida).
  - Números de canal: `wdth 62–75`, `wght 800–900` (condensada), `tabular-nums`. O contraste de largura entre marca
    (larga) e número (estreito) é a assinatura tipográfica.
- **Atkinson Hyperlegible Next** (variável): texto corrido e controles. Desenhada para distinguir letras parecidas e ler
  bem em tela pequena e sob luz forte. Corpo mínimo 15 px, rótulos 13 px.

## Componentes

| Componente | Notas |
|---|---|
| **Grade (`Lineup`)** | Virtualizada. Linha de 60 px: número condensado (30 px), nome, subtítulo (categoria · país), status. Canal sintonizado = bloco de número preenchido com o acento. Régua de 1 px, sem cartões. |
| **Player** | 16:9, sempre visível. Estados: espera (tela de ajuste), conectando, no ar, reconectando, erro, incompatível, embed. Controles próprios (sem `controls` nativo) para não brigar com os gestos. |
| **Vinheta (OSD)** | Bloco sólido (sem vidro) no canto: número enorme + nome. Entra por `transform` em 160 ms, some em ~2,4 s. Digitar números mostra o que foi digitado. |
| **Dial** | Faixa "‹ 06 · **07 Nome** · 08 ›" abaixo do player: o controle remoto. Alvos de 56 px. |
| **Navegação inferior** | Início · Canais · **Zapear** (central, acento) · Buscar · Mais. Só abaixo de 960 px. |
| **Folha (`Sheet`)** | `<dialog>` nativo (foco preso, Esc, fundo inerte) ancorada embaixo. Filtros, menu "Mais", atalhos. |
| **Chips de filtro** | Retângulos de canto pequeno, removíveis, com "Limpar tudo". |
| **Painel de HTTP bloqueado** | Mensagem curta no player (título, 1 frase, 2 botões); o passo a passo vive numa folha `modal` para não estourar o 16:9. Ação principal: *Liberar HTTP* (computador Chromium) ou *Abrir no VLC* (demais). |
| **Avisos** | Offline (faixa fixa), atualização (barra com "Atualizar"), instalação (botão discreto). |
| **Ícones** | Um único conjunto (Lucide), traço 2 px, terminações e juntas **retas** (a mesma geometria de uma tecla), 24 px. |

Estados desenhados para tudo: foco (anel de 2 px no acento com 2 px de recuo, 3:1 contra o fundo), pressionado
(translateY 1 px + inversão), carregando (esqueleto de linhas e barra de progresso), vazio e erro (texto direto e uma ação).

## Movimento

- Duração: **120 ms** (micro: pressionar, chips), **160 ms** (vinheta, folhas), **240 ms** (troca de página/aviso).
- Curva: `cubic-bezier(.2,.7,.2,1)` na entrada, `ease-in` na saída.
- Só `transform` e `opacity`. Nada anima `width`, `height`, `top` ou `box-shadow`.
- Nada anima na carga da página. Movimento só responde a uma ação (trocar de canal, abrir folha, mostrar aviso).
- `prefers-reduced-motion: reduce`: deslocamentos são removidos; ficam apenas fades de 1 ms (efetivamente instantâneos).

## Mobile primeiro

- Base: 360 × 640. Polegar embaixo: navegação inferior (alvos ≥ 48 px) e dial (56 px).
- Player fixo no topo da tela, lista rolável abaixo, busca sempre no topo da lista e também na navegação inferior.
- Gestos: deslizar horizontalmente no player troca de canal (ignorado nos 24 px das bordas, que são do sistema);
  `touch-action: pan-y` preserva a rolagem vertical.
- Paisagem em celular: player e grade lado a lado; aviso para tela cheia sem perder o canal.
- `100dvh`, `env(safe-area-inset-*)`, `viewport-fit=cover`.

## Desktop

Player grande à esquerda; grade à direita (380 px). Abaixo do player: dial, número gigante do canal e ações. Atalhos:
`←/→` e `↑/↓` trocam de canal, `Z` zapeia, `/` busca, `F` tela cheia, `M` mudo, `P` PiP, `Espaço` pausa, `0–9` + `Enter`
digitam o número, `?` lista os atalhos.

## Tela inicial (`#/`)

Porta de entrada. O aparelho (player + grade) mora em `#/canais` e em `#/canal/CC/ID`. Segue as mesmas regras do app:
régua fina, número grande, um acento, sem cartões e sem logos.

| Bloco | Decisão |
|---|---|
| **Vitrine** | Título largo (Archivo 125%), uma ação principal ("Ligar a TV", ou "Continuar: 07 Nome" se há histórico) e uma secundária ("Ver todos os canais"). À direita, a "tela": barras de ajuste com a vinheta do canal em destaque (o último visto; senão um curado no ar, fixo durante o dia). Não toca vídeo nem baixa nada além do país. "Outro canal" avança na lista do dia. |
| **Ir ao número** | Campo numérico (4 dígitos): o número é a interface também aqui. Aceita os mesmos números digitados no teclado. |
| **Números** | Faixa de 4 totais em condensado (canais, no ar agora, países, curados), vindos do índice: aparecem sem esperar a grade. |
| **Vistos há pouco / Favoritos** | Só aparecem se existirem. Linhas de 68 px: número, nome, status por forma. |
| **No ar agora** | 8 canais curados, no ar e que tocam neste navegador. Esqueleto enquanto o país carrega (sem salto de layout). |
| **Por assunto / Outros países** | Atalhos que abrem a grade já filtrada ou trocam o país sem sair da tela. Países em código ISO condensado (sem emoji de bandeira, que o Windows não desenha). |
| **Em qualquer tela** | Celular (instalar), televisão (Modo TV), computador (atalhos). |

Mobile: a ação principal e a "tela" ficam acima da dobra em 360×640; navegação inferior vira Início · Canais · **Zapear** · Buscar · Mais.
Na TV: sem barras, foco inicial em "Ligar a TV", setas movem o foco, tipografia de 3 metros e seções de ajuda escondidas.

## Modo TV

`html[data-tv='on']` (src/styles/tv.css). O player ocupa a tela inteira; a grade vira um painel de ~50% da largura que entra pela direita (240 ms, só `transform`) e fica `inert` quando fechado. Sem barras, sem navegação inferior, sem controles do player.

- **Tamanhos de sala:** número da vinheta 120 px, linhas da grade de 84 px com número de 52 px e nome de 27 px, botões de 64–88 px.
- **Foco:** anel de 5 px no acento, com recuo de 3 px (invertido para claro sobre o vídeo). O foco é o cursor; o mouse some.
- **Teclas coloridas** têm legenda no rodapé da grade; a cor só marca a tecla, o texto diz a ação.
- **Regra de ouro:** ▲▼ nunca ficam sem efeito. Assistindo, trocam de canal; na grade, movem o foco; num painel de erro, movem entre os botões.

## Paridade com a versão anterior (tag `pre-rebrand`)

Preservado: índice por país e "Todos os países"; busca sem acento por relevância; filtros de categoria, idioma, status e
"só os que tocam no navegador"; grade virtualizada; favoritos (`tvlivre:favoritos`), recentes (`tvlivre:recentes`) e país
(`tvlivre:pais`) com as mesmas chaves; rotas `#/canal/CC/ID` e `#/sobre` (a lista agora vive em `#/canais`; `#/` é a tela inicial); hls.js e HLS nativo; embed do YouTube e
fallback de link; painéis de HTTP/CORS/cabeçalhos com "copiar para o VLC"; diagnóstico de erro com sugestões; tela cheia;
página Sobre (créditos, "não hospedamos vídeo", remoção); título dinâmico; `404.html`.
