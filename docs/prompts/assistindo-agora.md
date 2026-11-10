# Tarefa: Acessos em tempo real + "assistindo agora" — TV Livre

> Prompt para o Claude Code. Coloque este arquivo em `docs/prompts/assistindo-agora.md` e peça:
> "Leia docs/prompts/assistindo-agora.md e execute".

Repositório do TV Livre: React + Vite + TypeScript, site estático no GitHub Pages em `/tv-livre/`, PWA, Modo TV.
Hoje o site mostra o **total de acessos** pelo contador Abacus (`src/lib/counter.ts`, uma visita por sessão), que só
atualiza ao recarregar a página.

**Objetivo:**
1. **Acessos ao vivo:** o total de acessos sobe na tela sem recarregar.
2. **Assistindo agora:** quantas pessoas estão com o TV Livre aberto **e tocando um canal** neste momento, no total e
   **por canal** ("23 assistindo este canal"), mais um ranking **"Em alta agora"**.
3. **Recordes:** acessos de hoje e pico de pessoas assistindo ao mesmo tempo.

---

## Por que precisa de um serviço (leia antes de começar)
Um site estático não tem como saber quem mais está online: contar presença exige **um ponto central que mantém conexões
abertas e sabe quando cada uma cai**. A solução escolhida é um serviço mínimo, de custo zero, que **só conta conexões**:

- **Cloudflare Worker + Durable Object** com WebSocket (API de *hibernation*), no plano gratuito.
  - **Verifique na documentação atual** os limites do plano gratuito para Workers e Durable Objects (requisições/dia,
    mensagens de WebSocket, duração, armazenamento) e calcule o consumo para **100, 1.000 e 5.000 pessoas simultâneas**.
    Reporte a tabela. Se o cálculo passar do gratuito com 1.000 pessoas, ajuste os intervalos (seção 2) até caber e
    mostre a conta.
- Alternativas que **não** quero como principal (documente o porquê no PR): Firebase/Supabase (limites baixos de conexões
  simultâneas no gratuito) e broker MQTT público (qualquer um publica no tópico e cada cliente recebe a presença de todos).

O serviço **não recebe vídeo, não vê o que a pessoa assiste além do id do canal, não guarda IP nem identificador
persistente**. Atualize o README: o projeto continua "sem backend de vídeo e sem proxy"; passa a ter um contador de
presença, e a seção explica exatamente o que ele recebe.

---

## Antes de escrever código
1. Leia `README.md` (seção "Contador de acessos"), `DESIGN.md`, `src/lib/counter.ts`, `src/components/Visits.tsx`,
   `src/components/Home.tsx`, `src/components/Player.tsx`, `src/components/ChannelList.tsx`, `src/lib/storage.ts`,
   `src/lib/media.ts`, `src/lib/tvmode.ts`, `About.tsx`, `.github/workflows/deploy.yml` e `tests/unit/counter.test.ts`.
2. Rode `npm install && npm run data:quick && npm run check` e confirme que tudo passa.
3. Crie o branch `feat/assistindo-agora`.
4. **Conta da Cloudflare:** eu ainda preciso criar a conta e o token. Desenvolva tudo localmente com `wrangler dev` e
   testes. Quando chegar a hora de publicar, **pare e me passe o passo a passo**: criar conta, criar API token com a
   permissão mínima (Workers Scripts: Edit), e quais secrets colocar no GitHub (`CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`). Não invente valores.

## Regras que não mudam
- Custo zero. Nada de dados pessoais: sem cookies, sem IP gravado, sem fingerprint, sem id persistente
  (o id é aleatório **por aba**, em `sessionStorage`).
- Português do Brasil, DESIGN.md (números em Archivo, um acento vermelho, `prefers-reduced-motion` nas animações).
- Se o serviço estiver fora do ar ou bloqueado, **os números simplesmente somem**, sem erro na tela e sem atrapalhar o vídeo.
- Não contar: `localhost`, testes, automação (`navigator.webdriver`), igual ao contador atual.
- Não quebre nada existente. Cada parte com testes. Commits pequenos.

---

## 1. Serviço de presença (`workers/presenca/`)
- Projeto separado no repositório: `workers/presenca/` com `wrangler.toml`, TypeScript e testes próprios
  (`@cloudflare/vitest-pool-workers`).
- **Um Durable Object `Sala` global** (nome fixo), que:
  - aceita WebSocket em `GET /ws` usando a **API de hibernation** (`ctx.acceptWebSocket`) para não cobrar tempo
    com conexões ociosas, e `setWebSocketAutoResponse` para o ping/pong **sem acordar o objeto**;
  - guarda por conexão (via `serializeAttachment`): `estado` (`navegando` | `assistindo`), `canal` (id) e `pais` do canal;
  - recebe mensagens pequenas do cliente: `{"t":"estado","s":"assistindo","c":"<canalId>"}` e `{"t":"estado","s":"navegando"}`;
    valide tudo (tamanho máximo, formato do id) e ignore o resto;
  - calcula `online`, `assistindo`, contagem **por canal** e o **top 10 "Em alta"**;
  - **transmite** o resumo para todos no máximo **a cada 3 s** (agrupando mudanças), e só se algo mudou;
    cada cliente recebe o total, o top 10 e **a contagem do canal que ele assiste** (não a lista de todos os canais);
  - mantém **recordes** no armazenamento do Durable Object: pico de `assistindo` (com data) e acessos do dia (fuso
    `America/Sao_Paulo`);
  - conta **acessos**: `POST /acesso` incrementa o total e o do dia e devolve os valores. **Migração:** na primeira
    execução, o total começa no valor atual do Abacus (`GET /get/tvlivre-jkfa/acessos`), para o número não cair.
- **Abuso:** verifique o cabeçalho `Origin` (só `https://jkfa.github.io` e o endereço de desenvolvimento), limite de
  conexões por IP **só em memória** (ex.: 10), limite de mensagens por conexão (ex.: 1 a cada 2 s) e tamanho máximo da
  mensagem. Documente que o número é uma **estimativa**, não uma métrica auditada.
- **Privacidade por canal:** só divulgue a contagem de um canal quando ela for **≥ 3** (abaixo disso mostre nada).
- `GET /resumo` (sem WebSocket) devolve o último resumo em JSON com cache curto, para a página Sobre e para quem não
  conseguir abrir WebSocket.
- Escalabilidade: documente no README que um Durable Object atende alguns milhares de conexões; se passar disso, o
  caminho é dividir em salas por fragmento com um agregador. **Não implemente agora.**

## 2. Cliente no site (`src/lib/presenca.ts`)
- Abre **uma única conexão por navegador**, mesmo com várias abas: eleja uma aba líder com `BroadcastChannel`
  (ou Web Locks), e as outras recebem os números por ela. Se a líder fechar, outra assume.
- Conecta depois que a página carrega e o usuário interage, ou após 3 s (o que vier primeiro); nunca atrasa o vídeo.
- Envia `assistindo` + id do canal quando o vídeo **realmente começa a tocar** (evento `playing`) e a cada troca de canal;
  envia `navegando` ao pausar, ao dar erro ou ao sair do player.
- Aba em segundo plano: se ainda estiver tocando (áudio, PiP), continua contando; se não estiver tocando por 2 min,
  fecha a conexão e reabre ao voltar.
- Reconexão com backoff exponencial e variação aleatória (1 s → 60 s); depois de 5 falhas seguidas, desiste até a
  próxima interação.
- Ping a cada **30 s** (resposta automática do servidor). O servidor considera morta a conexão que não responder por 75 s.
- O registro de **acesso** continua uma vez por sessão (mesma regra do `counter.ts`), agora no serviço novo.
  Mantenha o Abacus como alternativa de leitura se o serviço novo falhar.

## 3. Na tela
- **Topo (computador) e tela inicial:** `● 37 assistindo agora · 12.408 acessos`, com o ponto vermelho pulsando
  devagar (parado com `prefers-reduced-motion`). Os números mudam com uma transição curta, sem pular o layout
  (`font-variant-numeric: tabular-nums`).
- **Player:** `23 assistindo este canal` (só se ≥ 3), discreto, perto do nome do canal.
- **Tela inicial:** bloco **"Em alta agora"** com os 5 canais mais assistidos (número, nome, logo e quantos assistem),
  clicável. Na grade, um filtro/ordem **"Mais assistidos agora"**.
- **Página Sobre:** recordes (pico de pessoas assistindo e data, acessos hoje e total) e a explicação do que o
  contador recebe e não recebe.
- **Modo TV:** mostre só o total de assistindo na faixa superior e o "Em alta" na grade; tudo focável.
- Acessibilidade: `aria-live="polite"` só no total, e no máximo uma atualização anunciada a cada 30 s
  (leitores de tela não podem ser inundados).

## 4. Publicação
- Novo job no `deploy.yml` (ou workflow separado `presenca.yml`, que roda só quando `workers/presenca/**` muda):
  testes do worker → `wrangler deploy` com os secrets. A falha desse job **não** pode impedir a publicação do site.
- O endereço do worker fica numa variável de build (`VITE_PRESENCA_URL`). Sem ela, o site funciona como hoje
  (só Abacus, sem "assistindo agora").

## 5. Testes
- **Worker** (vitest-pool-workers): conexões entram e saem; contagem por estado e por canal; limite ≥ 3; top 10;
  transmissão agrupada a cada 3 s (relógio simulado); conexão morta é removida; `Origin` inválido é recusado;
  mensagem inválida ou grande demais é ignorada; limite por IP; recordes e virada do dia em `America/Sao_Paulo`;
  migração do valor do Abacus só uma vez.
- **Cliente** (unitários): eleição de aba líder, estados `assistindo`/`navegando`, segundo plano, backoff de reconexão,
  não contar em `localhost`/automação.
- **E2E** (Playwright) contra o worker rodando local (`wrangler dev`): três páginas abertas em canais diferentes
  → os números batem; duas abas no mesmo navegador contam como uma conexão; fechar uma página reduz a contagem;
  serviço desligado → números somem e o vídeo continua.
- Teste de carga simples (script fora do CI): 500 conexões simuladas por 5 min contra o `wrangler dev`, medindo
  mensagens trocadas e uso de CPU; use o resultado na tabela de custos.

## Entrega
1. README (seção "Contador de acessos e assistindo agora": arquitetura, o que é enviado, privacidade, limites,
   como publicar o worker) e página Sobre atualizados.
2. `npm run check`, `npm run build`, `npm run test:e2e` e os testes do worker passando.
3. Pull request para `main` com: a **tabela de custos** (100/1.000/5.000 simultâneos vs. limites gratuitos atuais, com
   link para a documentação consultada), o resultado do teste de carga, capturas (topo, tela inicial com "Em alta",
   player com "assistindo este canal", Modo TV) e o **passo a passo da Cloudflare** para eu fazer.
4. **Não faça merge**: eu crio a conta, configuro os secrets e testo antes.
