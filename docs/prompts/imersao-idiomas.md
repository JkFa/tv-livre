# Tarefa: Imersão em idiomas, legendas e tradução por IA ao vivo — TV Livre

> Prompt para o Claude Code. Coloque este arquivo em `docs/prompts/imersao-idiomas.md` e peça:
> "Leia docs/prompts/imersao-idiomas.md e execute".

Repositório do TV Livre: React + Vite + TypeScript, site estático no GitHub Pages em `/tv-livre/`, PWA, player com
hls.js e HLS nativo, Modo TV. São 12 mil canais de 183 países, e cada canal já traz `languages` (ISO 639-3) em
`shared/types.ts`.

**Objetivo:** um botão **"Legendas IA"** no player que transcreve o áudio do canal ao vivo e mostra **legenda no idioma
original + tradução no idioma escolhido**, transformando os canais estrangeiros numa ferramenta de **imersão para aprender
idiomas**. Tudo roda **no aparelho de quem assiste** (o áudio não sai do navegador), sem servidor próprio e com custo zero.

---

## Antes de escrever código
1. Leia `README.md`, `DESIGN.md`, `shared/types.ts`, `src/lib/playback.ts`, `src/components/HlsStage.tsx`,
   `src/components/Player.tsx`, `src/lib/filter.ts`, `src/lib/labels.ts`, `src/lib/prefs.ts`, `src/lib/storage.ts`,
   `src/lib/shortcuts.ts`, `src/lib/tvmode.ts`, `src/components/FilterSheet.tsx`, `MoreSheet.tsx`, `About.tsx`
   e `vite.config.ts` (PWA/Workbox).
2. Rode `npm install && npm run data:quick && npm run check` e confirme que tudo passa antes de mudar algo.
3. Crie o branch `feat/imersao-idiomas`.
4. **Faça uma prova de conceito antes de construir a interface** (seção 1) e me reporte os números. Se a prova mostrar
   que não é viável num notebook comum, **pare e me mostre os resultados** antes de seguir.

## Regras que não mudam
- **Custo zero, sem backend, sem proxy, sem hospedar vídeo.** O reconhecimento de fala e a tradução rodam no navegador.
- **Privacidade:** por padrão, o áudio **nunca** sai do aparelho. Nada (modelos, bibliotecas) é baixado até o usuário
  ativar a função e **confirmar o download**, vendo o tamanho antes. Explique na página Sobre.
- **Honestidade sobre idiomas:** não diga "todas as línguas". Mostre a lista real de idiomas suportados pelo modelo de
  fala e pelo de tradução, e avise que a qualidade varia por idioma, sotaque, música de fundo e várias pessoas falando juntas.
- Português do Brasil, DESIGN.md (tipografia, um acento vermelho, `prefers-reduced-motion`), acessível.
  A legenda segue boas práticas: contraste alto, fundo semitransparente, no máximo 2 linhas por idioma, tamanho ajustável.
- Não quebre zapear, retomada, PiP, Media Session, Modo TV nem os testes existentes. Cada parte com testes.
  Commits pequenos, um por etapa.
- O trabalho pesado roda em **Web Worker** (nunca trave a interface nem o vídeo).

---

## 1. Prova de conceito (obrigatória, antes da interface)

### 1.1 De onde vem o áudio
- **Caminho A (simples):** `video.captureStream()` / `AudioContext.createMediaElementSource(video)` + AudioWorklet que
  reamostra para **16 kHz mono** e entrega blocos de PCM ao Worker.
  - Funciona nos canais tocados pelo **hls.js com CORS** (os trechos chegam por XHR com CORS e entram no MediaSource, então o
    áudio não fica "contaminado"). Teste e confirme.
  - **Não** funciona com HLS nativo de origem cruzada sem CORS (o áudio sai mudo para o Web Audio): é o caso do iPhone e dos
    canais `cors === false`. Nesses, o botão aparece desativado com a explicação.
  - Problema: a legenda chega **depois** da fala (o tempo de processar).
- **Caminho B (sincronizado):** aproveitar que o hls.js baixa os trechos **antes** de tocá-los. Capture o áudio já
  remuxado (eventos `BUFFER_APPENDING` da faixa de áudio, fMP4), decodifique numa `OfflineAudioContext`/`decodeAudioData`
  separada e transcreva **à frente** do ponto de reprodução. Em modo legenda, aumente `liveSyncDuration` (ex.: +8 s) para
  ganhar folga. Assim cada legenda é exibida no **timestamp certo**, em sincronia com a fala.
- Implemente os dois atrás de uma interface `FonteDeAudio` e meça o atraso real de cada um.

### 1.2 Reconhecimento de fala (ASR) no navegador
- Use **Transformers.js** (`@huggingface/transformers`) com modelos **Whisper multilíngues** (ONNX), em Worker:
  **WebGPU** quando existir, **WASM** como alternativa.
  - Perfis: **Leve** (`whisper-tiny`/`base`, para celular e notebook fraco) e **Qualidade** (`whisper-small`, só com WebGPU).
    Use as versões quantizadas e meça o tamanho real de cada download.
  - O Whisper detecta o idioma falado; use o `languages` do canal como dica (converta ISO 639-3 → código do Whisper)
    e permita que o usuário force o idioma.
- **Segmentação:** detecção de voz (VAD, ex.: Silero VAD em ONNX) para cortar nas pausas, janelas de 5–15 s com
  sobreposição curta e remoção de texto duplicado entre janelas. Trate as "alucinações" conhecidas do Whisper em silêncio
  ou música (frases repetidas, "Obrigado por assistir", "Legendas pela comunidade…"): descarte por VAD e por lista de padrões.
- Avalie também, por **detecção de recurso**, a fala nativa do navegador (Web Speech API aceitando uma faixa de áudio
  e processamento local, se existir na versão atual). Use-a só onde existir e for local; nunca envie áudio a servidor
  sem o usuário escolher.

### 1.3 Tradução
- **Preferência 1:** a **Translator API nativa do navegador** (on-device, Chrome), por detecção de recurso
  (`'Translator' in self`), checando a disponibilidade de cada par de idiomas e mostrando o download do pacote de idioma quando necessário.
- **Alternativa:** modelo de tradução no Worker via Transformers.js, **NLLB-200 destilado** (cerca de 200 idiomas) ou
  **M2M100**, com o tamanho mostrado antes do download. Para pares comuns, avalie modelos **Opus-MT** por par, que são
  bem menores.
- Mapeie os códigos entre ISO 639-3 (canais), Whisper, NLLB (`por_Latn`, `rus_Cyrl`…) e BCP-47 (interface), com testes.

### 1.4 Medições a reportar (em um notebook com GPU integrada e em um Android intermediário emulado/real)
Uma tabela por perfil com: tamanho do download, tempo até a primeira legenda, **atraso médio fala → legenda** (caminhos A e B),
uso de memória, se o vídeo engasga, e uma amostra de qualidade em **inglês, espanhol, russo, francês e japonês**
(30 s de um canal de notícias de cada, com a transcrição lado a lado). **Pare e me mostre a tabela.**

---

## 2. Experiência do usuário

### 2.1 Ativar
- Botão **"Legendas IA"** (ícone CC com brilho) nos controles do player; atalho `L` (ShortcutsDialog e README);
  item focável no Modo TV.
- Primeira vez: folha explicando o que faz, que roda no aparelho, o **tamanho do download** do perfil sugerido
  (escolhido pela capacidade do aparelho: WebGPU, `navigator.deviceMemory`, celular ou computador), aviso de consumo de
  bateria e um botão **Baixar e ativar**. Barra de progresso do download; os modelos ficam no cache do navegador
  (Cache Storage do Transformers.js; **não** passe os modelos pelo service worker do app).
- Escolhas, salvas em `tvlivre:legendas` via `storage.ts`: idioma da tradução (padrão: o idioma da interface, pt-BR),
  o que mostrar (**Original**, **Tradução**, **Ambas**), tamanho da legenda, perfil (Leve/Qualidade).
- Se o canal não permitir (sem CORS, HLS nativo, YouTube), o botão explica o motivo e sugere canais do mesmo idioma que funcionam.

### 2.2 Legendas na tela
- Sobre o vídeo, legenda dupla: original em cima (menor) e tradução embaixo (maior), ou só uma delas.
  Funciona em tela cheia, PiP (onde der) e Modo TV (legenda maior para 3 metros).
- Enquanto o modelo processa, mostre um indicador discreto ("ouvindo…"), nunca texto falso.
- Se a qualidade estiver ruim (muita música, baixa confiança), mostre "difícil de entender agora" em vez de lixo.

### 2.3 Modo imersão (aprender idioma)
- **"Estou aprendendo:"** o usuário escolhe um idioma, e um filtro novo **"Aprender idioma"** na grade e na tela
  inicial lista os canais naquele idioma (via `languages`), com os de **notícias e educação** primeiro (fala mais clara).
  Mostre só canais em que a legenda IA funciona (hls.js + CORS).
- **Painel de transcrição** lateral (desktop) ou folha inferior (celular): as últimas frases com original + tradução.
- **Toque numa palavra** da legenda original → popup com a tradução da palavra e da frase e o botão
  **"Salvar no vocabulário"**.
- **"Ouvir de novo"**: repete o áudio da frase (guarde o PCM das últimas frases na memória, nunca em disco).
- **Transliteração** opcional para escritas não latinas (cirílico, grego e árabe com tabelas simples; para japonês e
  chinês, só se houver biblioteca leve; senão, deixe de fora e documente).
- **Meu vocabulário** (página `#/vocabulario`): palavras salvas com frase de exemplo, canal e data; revisão simples
  em cartões (mostrar/ocultar tradução, "sei"/"não sei"); exportar **CSV compatível com Anki**. Tudo em `localStorage`.
- Não ofereça download da transcrição completa do programa (é conteúdo da emissora); o vocabulário pessoal pode ser exportado.

### 2.4 Opcional: modo nuvem (desligado por padrão)
- Para aparelhos fracos, permita que o usuário **cole a própria chave** de um serviço de transcrição com plano gratuito
  (ex.: API compatível com Whisper). A chave fica só no aparelho. Antes de ativar, avise claramente que **o áudio sairá
  do aparelho** para aquele serviço. Implemente atrás da mesma interface do ASR local. Se isso complicar demais, deixe
  documentado como próxima etapa e não implemente.

---

## 3. Arquitetura sugerida
```
src/lib/legendas/
  fonte-audio.ts        # Caminho A (captureStream/AudioWorklet) e B (trechos do hls.js), mesma interface
  worklet-16k.ts        # reamostragem para 16 kHz mono
  segmentador.ts        # VAD + janelas + sobreposição + deduplicação
  asr.worker.ts         # Whisper (Transformers.js), WebGPU/WASM
  traducao.ts           # Translator API nativa → fallback NLLB/M2M100/Opus-MT no worker
  idiomas.ts            # mapeamento ISO 639-3 ↔ Whisper ↔ NLLB ↔ BCP-47 + nomes em pt-BR
  alucinacoes.ts        # filtros de texto inventado
  capacidade.ts         # escolhe o perfil pelo aparelho
src/components/Legendas.tsx, PainelTranscricao.tsx, Vocabulario.tsx, FolhaLegendas.tsx
```
- Carregue tudo isso em **chunks sob demanda** (o bundle inicial do site não pode crescer mais que 5 KB gzip).

## 4. Testes
- Unitários: mapeamento de idiomas, segmentador (janelas, sobreposição, deduplicação), filtro de alucinações,
  escolha de perfil, sincronização por timestamp (caminho B), vocabulário e exportação CSV.
- E2E com o **ASR simulado** (worker falso que devolve frases fixas com timestamps) e uma **lista HLS de fixture local**
  com áudio: ligar/desligar, legenda dupla aparece no tempo certo, tocar numa palavra salva no vocabulário, canal sem
  CORS mostra o motivo, nada é baixado antes de confirmar (verifique as requisições), preferência persiste.
- Script manual `npm run test:asr` que roda o modelo real em um clipe curto de áudio de domínio público e imprime
  texto, idioma detectado e tempo (não entra no CI).

## Entrega
1. Atualize README (seção "Legendas IA e imersão": como funciona, privacidade, idiomas suportados de verdade,
   requisitos de aparelho, limitações: iPhone, canais sem CORS, atraso, música) e a página Sobre (créditos e licenças
   dos modelos usados).
2. `npm run check`, `npm run build` e `npm run test:e2e` passando.
3. Pull request para `main` com: a tabela da prova de conceito (seção 1.4), tamanhos dos downloads, impacto no bundle
   inicial, capturas (legenda dupla no desktop, celular e Modo TV; popup da palavra; página Vocabulário) e
   **uma lista de testes manuais** para eu fazer: notebook sem GPU dedicada, Android intermediário, um canal em
   inglês, russo, espanhol e japonês, e 20 minutos contínuos para ver aquecimento e bateria.
4. **Não faça merge**: eu reviso e testo antes.
