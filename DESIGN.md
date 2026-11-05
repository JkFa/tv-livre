# TV Livre — sistema de design

## Conceito: o controle remoto reinventado

A TV aberta brasileira sempre foi **número**: "passa pro 4", "tá no 13". O TV Livre trata o número do canal como
elemento gráfico principal e a **troca de canal** como a ação central, o produto é um controle remoto que já vem com a
televisão dentro. A primeira tela é o aparelho: um player e três ações, sem apresentação de marketing.

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
| **Navegação inferior** | Canais · Favoritos · **Zapear** (central, acento) · Buscar · Mais. Só abaixo de 960 px. |
| **Folha (`Sheet`)** | `<dialog>` nativo (foco preso, Esc, fundo inerte) ancorada embaixo. Filtros, menu "Mais", atalhos. |
| **Chips de filtro** | Retângulos de canto pequeno, removíveis, com "Limpar tudo". |
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

## Paridade com a versão anterior (tag `pre-rebrand`)

Preservado: índice por país e "Todos os países"; busca sem acento por relevância; filtros de categoria, idioma, status e
"só os que tocam no navegador"; grade virtualizada; favoritos (`tvlivre:favoritos`), recentes (`tvlivre:recentes`) e país
(`tvlivre:pais`) com as mesmas chaves; rotas `#/canal/CC/ID` e `#/sobre`; hls.js e HLS nativo; embed do YouTube e
fallback de link; painéis de HTTP/CORS/cabeçalhos com "copiar para o VLC"; diagnóstico de erro com sugestões; tela cheia;
página Sobre (créditos, "não hospedamos vídeo", remoção); título dinâmico; `404.html`.
