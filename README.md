# RPGGG — Mestre de RPG com IA

RPG de fantasia sombria em texto, narrado por um Mestre baseado em LLM (OpenAI). O jogador escolhe caminhos ou digita ações livres; um **dado de 1 a 10, rolado pelo servidor**, determina o desfecho, e a IA apenas narra as consequências dentro de regras fixas. Cada cena recebe uma ilustração gerada por IA, pode ser narrada em voz alta e, ao final, o jogador pode receber um resumo da aventura por e-mail. No **modo plateia**, o público escaneia um QR Code e vota pelo celular no próximo passo do herói.

**No ar:** https://32-192-117-236.sslip.io (AWS EC2, conta AWS Academy; fica fora do ar enquanto a sessão do lab estiver encerrada). Como publicar e atualizar: [DEPLOY.md](DEPLOY.md).

## Sumário

1. [Visão geral e motivação](#1-visão-geral-e-motivação)
2. [O jogo](#2-o-jogo)
3. [Arquitetura](#3-arquitetura)
4. [Fluxo de uma partida, de ponta a ponta](#4-fluxo-de-uma-partida-de-ponta-a-ponta) (inclui o [modo plateia](#modo-plateia-votação-pelo-celular))
5. [Camada de IA (`@rpggg/ai`)](#5-camada-de-ia-rpgggai)
6. [Backend (`@rpggg/backend`)](#6-backend-rpgggbackend)
7. [Frontend (`@rpggg/frontend`)](#7-frontend-rpgggfrontend)
8. [Instalação e execução](#8-instalação-e-execução)
9. [Configuração](#9-configuração)
10. [Decisões de projeto](#10-decisões-de-projeto)
11. [Limitações conhecidas e próximos passos](#11-limitações-conhecidas-e-próximos-passos)

Documentos relacionados: **[DEPLOY.md](DEPLOY.md)** (deploy em produção) · **[CHANGELOG.md](CHANGELOG.md)** (histórico de mudanças) · READMEs de cada pacote: [ai](ai/README.md), [backend](backend/README.md), [frontend](frontend/README.md).

---

## 1. Visão geral e motivação

Usar um LLM como mestre de RPG tem problemas conhecidos: o modelo inventa itens, ignora resultados de dados, concede recompensas exageradas, perde a coerência do estado do personagem e não sabe quando encerrar a história.

O RPGGG trata isso como um problema de **separação de responsabilidades**:

| Responsabilidade | Quem cuida |
| --- | --- |
| Aleatoriedade (dado) | Servidor, via `crypto.randomInt` — nunca o modelo |
| Regras, lore, itens, criaturas | Base de conhecimento fixa injetada no prompt do sistema |
| Ritmo da campanha (em que turno chegar a cada região) | Prompt de ação gerado pelo código a cada turno + rede de segurança no turno final |
| Narrativa e escolhas | LLM |
| Formato da resposta | Function calling com JSON Schema obrigatório |
| Campos ausentes ou malformados | Normalização e nova tentativa no servidor |
| Validação de entrada, limites por IP e segredos (OpenAI, n8n) | Backend Express |
| Guardrails numéricos (ouro por turno, vida máxima, nível pelo XP, derrota com vida 0) | `normalize`, no servidor |
| Estado da partida (personagem e turno) | Token assinado pelo servidor; o cliente só o devolve |

## 2. O jogo

**Premissa.** Um herói deve atravessar a Região das Sombras Eternas e destruir o Orbe do Caos, guardado pelo Lich Malachar na Torre da Perdição.

**Progressão.** As regiões são percorridas em ordem:

| # | Região | Perigo | Itens de progressão |
| --- | --- | --- | --- |
| 1 | Vila de Pedra Cinza | Segura (ponto de partida) | — |
| 2 | Floresta de Sussurros | Perigosa, criaturas menores | — |
| 3 | Pântano da Podridão | Muito perigosa, criaturas venenosas | Amuleto da Proteção, Mapa das Ruínas |
| 4 | Ruínas de Aldrath | Perigosa, mortos-vivos | Pedra do Trovão, Diário de Aldric (exige o Mapa) |
| 5 | Montanha do Trovão | Extremamente perigosa (exige a Pedra do Trovão) | Chave da Torre (dropada pelo Dragão Juvenil) |
| 6 | Torre da Perdição | Chefão final (exige a Chave da Torre) | — |

**Duração: exatamente 10 turnos.** A abertura é o turno 1. Os turnos 1 a 5 levam o herói da Vila até o topo da Torre (uma região por turno; o turno 5 condensa a Montanha e a chegada à Torre). Os turnos 6 a 10 são a luta contra o Lich, em 5 rodadas com fases fixas: Raio Necrótico, Escudo de Ossos, Invoca Mortos, fase desesperada e golpe final. As constantes ficam em [ai/prompts.ts](ai/prompts.ts) (`MAX_TURNS = 10`, `BOSS_START_TURN = 6`).

**Bestiário**

| Criatura | Vida | Ataque | Defesa | XP | Ouro |
| --- | --- | --- | --- | --- | --- |
| Goblin | 20 | 5 | 3 | 10 | 5–10 |
| Lobo das Sombras | 35 | 8 | 5 | 20 | 8–15 |
| Esqueleto Guerreiro | 45 | 10 | 8 | 30 | 10–20 |
| Troll do Pântano | 80 | 15 | 10 | 60 | 25–40 |
| Dragão Juvenil | 120 | 22 | 18 | 150 | 80–120 |
| Lich Malachar (chefão) | 200 | 35 | 25 | Vitória | — |

**Itens.** Consumíveis (poções de cura menor/normal/maior, antídoto, pão de viagem), armas (Espada de Ferro a Espada Rúnica, arco, cajado), armaduras (couro a placas) e os itens especiais de progressão da tabela acima. A lista completa, com preços e efeitos, está em [ai/knowledgeBase.ts](ai/knowledgeBase.ts).

**Personagem inicial.** 100/100 de vida, 20 de ouro, nível 1, 0 XP, com Espada de Ferro, Escudo de Madeira e 2 Poções de Cura ([ai/character.ts](ai/character.ts)).

**Origem do herói.** Na tela de boas-vindas o jogador escolhe uma motivação — **Vingança** (vila natal destruída pelas Sombras), **Dever** (guarda de Pedra Cinza cumprindo juramento, o padrão) ou **Descoberta** (aprendiz da boticária Ysolda, atrás da verdade sobre o Orbe). A origem não altera nenhum atributo; só dá contexto emocional que o Mestre referencia ao longo da campanha ([ai/origins.ts](ai/origins.ts)).

**NPCs nomeados.** Conselheiro Toran (ancião que envia o herói), Bram Aço-Negro (ferreiro), Ysolda (boticária) e Renn Passo-Leve (Mercador Viajante, regiões 2–4). Ficam fixos na base de conhecimento para a IA não inventar nomes novos a cada cena.

**A verdade sobre o Lich (spoiler, para quem trabalha no código).** Malachar é Aldric, um herói de Pedra Cinza que séculos atrás prendeu uma entidade sem nome ("a Fome Sem Nome") no Orbe do Caos e assumiu a guarda da Torre. Décadas atrás, para salvar seu povo de uma fome, rompeu o próprio selo e foi consumido por dentro. O jogador só descobre isso pelo item **Diário de Aldric**; o Mestre é instruído a nunca revelar a história antes disso.

**Resolução por dado**

| Dado | Resultado | Consequência obrigatória |
| --- | --- | --- |
| 1–3 | Ruim | Dano, perda de item ou ouro, armadilha |
| 4–7 | Médio | Situação equilibrada, com algum custo |
| 8–10 | Bom | Vantagem, achado ou vitória |

**Regras de progressão e guardrails**

- Nível = 1 + floor(XP / 100), máximo 10; vida máxima limitada a 200.
- Ouro só aumenta ao derrotar criaturas ou achar tesouros, com teto de 150 por turno.
- Curas não excedem o valor do item nem a vida máxima.
- O personagem não morre de surpresa: com vida ≥ 20, nenhum dano do turno o leva abaixo de 1; abaixo de 20, o Mestre avisa do perigo.
- O chefão só aparece na região 6, e a vitória exige que a luta tenha acontecido em um turno anterior.
- Cada turno oferece de 2 a 4 caminhos distintos; o jogador pode ignorá-los e digitar uma ação livre (até 500 caracteres).
- A ação do jogador é tratada como dado do jogo, nunca como instrução: tentativas de mudar regras ou revelar o prompt viram uma ação inválida do personagem.

**Fim de jogo.** Derrota (`is_game_over`) ou vitória (`is_victory`). A vitória tem duas narrações: o **final verdadeiro** (herói com o Diário de Aldric liberta o espírito de Aldric) ou o **final sombrio** (Orbe destruído por força bruta). A IA escolhe a partir do inventário. Na tela final o jogador pode começar uma nova aventura e, se o envio por e-mail estiver configurado, pedir o resumo da aventura.

## 3. Arquitetura

Monorepo **pnpm workspaces** com três pacotes:

```
RPGGG/
├── ai/                  @rpggg/ai        Domínio do jogo: lore, prompts, schema, chamadas à OpenAI (texto, imagem, voz)
├── backend/             @rpggg/backend   API HTTP (Express 5), validação, guarda dos segredos, ponte com o n8n
├── frontend/            @rpggg/frontend  Interface React 19 + Tailwind 4
├── index.html           Entrada do Vite (na raiz por exigência do Figma Make)
├── vite.config.ts       Vite + proxy /api → backend
├── .figma/              Configuração do Figma Make
├── Dockerfile           Imagem de desenvolvimento (hot reload)
├── Dockerfile.prod      Imagem de produção (backend serve o build do frontend)
├── deploy/aws-ec2.sh    Deploy na AWS (EC2 + Docker + Caddy com HTTPS)
├── .env.example         Modelo das variáveis de ambiente
└── tsconfig.base.json   Configuração TypeScript compartilhada
```

```
 Telão (navegador) ──┐
                     ▼
              ┌────────────────────────────┐
 Celulares ──▶│ Frontend (React/Vite)      │
 (QR Code)    │  /        jogo             │
              │  /v/CÓD   votação          │
              └─────────────┬──────────────┘
                            │ /api/*  (JSON)
              ┌─────────────▼──────────────┐  import  ┌────────────┐  HTTPS  ┌──────────────┐
              │ Backend (Express 5)        │ ───────▶ │ @rpggg/ai  │ ──────▶ │    OpenAI    │
              │  /api/game/*   partida     │          └────────────┘         │ chat/img/voz │
              │  /api/rooms/*  plateia     │                                 └──────────────┘
              └─────────────┬──────────────┘
                            │ webhook (opcional)   ┌────────┐
                            └────────────────────▶ │  n8n   │ ──▶ e-mail do jogador
                                                   └────────┘
```

**Em produção** ([DEPLOY.md](DEPLOY.md)):

```
Internet ──HTTPS──▶ EC2 t3.small · Amazon Linux 2023 · Elastic IP
                    ├── rpggg-caddy   Caddy 2 nas portas 80/443, certificado automático para <ip>.sslip.io
                    │        │ reverse_proxy
                    │        ▼
                    └── rpggg-app     imagem do Dockerfile.prod: Express serve /api/* e o build do frontend (porta 3001)
```

Pontos importantes:

- **Isolamento dos segredos.** Somente o backend lê `OPENAI_API_KEY` e `N8N_WEBHOOK_URL`. O navegador nunca os vê.
- **Tipos compartilhados.** O frontend importa apenas tipos e constantes de `@rpggg/ai` (subpaths `./types`, `./character`, `./origins` e `./room`), garantindo um contrato único sem levar código de servidor ao bundle.
- **Proxy de desenvolvimento.** O Vite encaminha `/api` para `http://localhost:${BACKEND_PORT}`, evitando CORS.
- **Produção em um processo.** Se existir `dist/` (gerado por `pnpm build`), o próprio backend serve os arquivos estáticos e devolve `index.html` para qualquer rota fora de `/api/*`.

## 4. Fluxo de uma partida, de ponta a ponta

**Início**

1. Na tela de boas-vindas o jogador escolhe a origem e clica em "Iniciar Aventura".
2. O frontend chama `POST /api/game/start` com `{ origin }`. O backend valida a origem e chama `getOpeningScene`.
3. A abertura usa dado fixo 7 (resultado médio), o personagem inicial e um prompt que apresenta Toran, um NPC ligado à origem e 3–4 caminhos. Ela conta como turno 1 de 10.
4. A resposta vem com um `state_token`: o estado da partida (id, turno, personagem e desfecho) assinado com HMAC pelo servidor.

**Cada turno**

1. O jogador escolhe um caminho ou digita uma ação; o frontend envia `POST /api/game/action` com `{ action, history, state_token }`.
2. O backend valida o payload e confere a assinatura do token. Personagem e turno vêm do token, nunca do corpo da requisição; partida já terminada é recusada.
3. `callGameMaster` rola o dado com `randomInt(1, 11)` para o turno seguinte ao do token.
4. As mensagens enviadas à OpenAI são: prompt do sistema, últimas 10 mensagens do histórico e um prompt de ação. Esse prompt traz a ação, o status atual, o dado já classificado, a região atual e a próxima, alertas de vida baixa, a motivação do herói e uma **nota de ritmo** (que região alcançar neste turno, ou qual rodada da luta contra o Lich narrar).
5. A chamada usa **function calling forçado** (`tool_choice` na função `game_response`) com `temperature: 0.9`.
6. `normalize` faz o parse do JSON, preenche campos omitidos com o estado atual, **sobrescreve `dice` e `result_type` com o valor do servidor**, mantém a origem escolhida e aplica os guardrails numéricos: ouro sobe no máximo 150 por turno, vida máxima até 200, vida nunca acima do máximo, com vida ≥ 20 o herói não morre no turno, nível = 1 + floor(XP / 100) e vida 0 é derrota. Também garante ao menos dois caminhos (ou usa caminhos de fallback).
7. **Rede de segurança do turno 10:** se o modelo não encerrou a história, `normalize` força o confronto com o Lich. Com vida acima de 0 o herói vence; com vida 0 ele perde.
8. Se a resposta vier vazia ou inválida, há **uma nova tentativa**; persistindo, o erro chega ao jogador como mensagem do sistema e ele pode tentar de novo.
9. O backend devolve o `GameResponse` com um novo `state_token`. O frontend atualiza personagem, chat, dado e barras, e salva a sessão (com o token) no `localStorage`.
10. Em paralelo, sem bloquear a narração: se as imagens estiverem ligadas, pede `POST /api/game/image` com o `scene_image_prompt`; se a voz escolhida for uma voz da OpenAI, pré-gera o áudio com `POST /api/game/speech`.

**Fim**

1. Quando chega `is_game_over` ou `is_victory`, os caminhos somem e aparece a tela de vitória ou derrota.
2. Se o servidor tiver `N8N_WEBHOOK_URL` (o `/api/health` responde `hasEmail: true`), aparece um campo de e-mail. O frontend monta um resumo (desfecho, status final e um trecho de cada cena) e chama `POST /api/game/send-summary` com o `state_token` final.
3. O backend só aceita token de partida terminada, uma vez por partida, e repassa `{ toEmail, outcome, summary, character, sentAt }` ao webhook do n8n. Desfecho e personagem vêm do token.

### Modo plateia (votação pelo celular)

Pensado para apresentações: o telão roda o jogo e o público decide os caminhos.

1. No telão, clique em **📱 Jogar com a plateia** (na tela inicial ou na barra lateral). O backend cria uma sala com código de 5 letras e o telão mostra um QR Code grande para `https://<site>/v/<CÓDIGO>`.
2. Cada vez que uma cena oferece caminhos, o telão abre uma rodada de votação de 5 min. Os celulares mostram o dado da cena (valor e resultado), o título e a narração completa (com o log de combate), as opções, o cronômetro e as barras de votos ao vivo. Cada celular tem 1 voto por rodada e pode trocá-lo até o fim.
3. Quando o tempo acaba com pelo menos um voto, ou quando o apresentador clica em **Encerrar votação**, a opção mais votada vence (empate é sorteado). O resultado aparece por 2,5 s e o caminho é executado. Sem votos, o telão espera: dá para clicar num caminho, dar **+15s** ou encerrar na mão.
4. Enquanto o Mestre narra, os celulares mostram "aguarde"; no fim do jogo, mostram vitória ou derrota.

O apresentador continua podendo clicar num caminho ou digitar uma ação livre a qualquer momento. Telão e celulares consultam a sala a cada 1–1,5 s (polling), sem WebSocket. As salas ficam em memória, expiram após 4 horas paradas e somem se o servidor reiniciar; nesse caso o telão avisa e basta ativar a plateia de novo.

## 5. Camada de IA (`@rpggg/ai`)

| Arquivo | Função |
| --- | --- |
| [knowledgeBase.ts](ai/knowledgeBase.ts) | Fonte única de verdade do mundo: história, segredo do Orbe, NPCs, regiões, criaturas, itens, economia e regras do Mestre |
| [prompts.ts](ai/prompts.ts) | `buildSystemPrompt` (papel, base de conhecimento, guardrails, segurança), `buildActionPrompt` (ação, status, dado, progresso e ritmo), `buildOpeningPrompt(origin)` e as constantes de turnos |
| [schema.ts](ai/schema.ts) | JSON Schema da resposta (`game_response`), com limites como 2–4 caminhos e nível 1–10 |
| [gameMaster.ts](ai/gameMaster.ts) | `callGameMaster`, `getOpeningScene`, retry, `normalize` (guardrails numéricos) e rede de segurança do turno final |
| [origins.ts](ai/origins.ts) | `HERO_ORIGINS`: as três motivações selecionáveis |
| [imageGen.ts](ai/imageGen.ts) | Ilustração da cena (1536×1024, estilo dark fantasy fixo); retorna data URL JPEG |
| [voiceGen.ts](ai/voiceGen.ts) | Narração com voz da OpenAI (6 vozes, instruções de narrador dramático em pt-BR); retorna data URL MP3 |
| [types.ts](ai/types.ts) | `CharacterStatus`, `GameResponse`, `Path`, `HistoryMessage` |
| [character.ts](ai/character.ts) | `INITIAL_CHARACTER` e `characterFromResponse` |
| [room.ts](ai/room.ts) | Tipos do modo plateia (`RoomState`, `RoomOption`, `RoomPhase`), compartilhados entre backend e frontend |

**Contrato de resposta (`GameResponse`).** `dice`, `result_type`, `event`, `description`, `narrator_message`, `scene_image_prompt`, `paths[]`, `character_status`, `is_boss_fight`, `is_game_over`, `is_victory` e `combat_log` opcional. Na luta contra o Lich, a `description` termina com `[Vida do Lich: X/200]` para manter o controle entre turnos.

## 6. Backend (`@rpggg/backend`)

API Express 5 em [backend/src/server.ts](backend/src/server.ts), executada com `tsx` (sem passo de build próprio). O estado assinado fica em [session.ts](backend/src/session.ts) e o limite por IP em [rateLimit.ts](backend/src/rateLimit.ts).

As respostas de `start` e `action` são o `GameResponse` mais um campo `state_token`.

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok, hasKey, hasEmail }` |
| `POST /api/game/start` | `{ origin? }` | `GameResponse` da cena de abertura |
| `POST /api/game/action` | `{ action, history, state_token }` | `GameResponse` do próximo turno |
| `POST /api/game/image` | `{ prompt }` | `{ image }` (data URL JPEG) |
| `POST /api/game/speech` | `{ text, voice?, speed? }` | `{ audio }` (data URL MP3) |
| `POST /api/game/send-summary` | `{ email, summary, state_token }` | `{ ok: true }` |
| `POST /api/rooms` | — | `{ code, hostKey }` (cria sala do modo plateia) |
| `GET /api/rooms/:code?voter=` | — | `RoomState` |
| `POST /api/rooms/:code/vote` | `{ voterId, round, optionId }` | `RoomState` |
| `POST /api/rooms/:code/host` | `{ hostKey, op, ... }` | `RoomState` (op: `round`, `extend`, `waiting`, `close`, `end`) |

**Validação**

- Corpo JSON limitado a 64 KB.
- `origin`: uma das chaves de `HERO_ORIGINS` (`vinganca`, `dever`, `descoberta`).
- `action`: string não vazia, até 500 caracteres.
- `state_token`: assinatura HMAC válida e emitido há no máximo 7 dias.
- `history`: no máximo 50 mensagens, papel `user` ou `assistant`, até 8.000 caracteres cada.
- `prompt` de imagem: até 800 caracteres.
- `text` de voz: até 4.000 caracteres; `voice` deve estar em `TTS_VOICES`; `speed` é limitado a 0,25–4.
- `email`: formato válido, até 200 caracteres; `summary` até 8.000 caracteres.
- Salas: código de 5 caracteres sem 0/O/1/I; rodada com 1–4 opções, `narration` até 6.000 caracteres, `dice` 1–10 e 5–300 s de cronômetro; `voterId` de 8–64 caracteres.

**Limites por IP** (em memória, por processo): `start` + `action` 30 a cada 10 min; `image` 30 a cada 10 min; `speech` 60 a cada 10 min; `send-summary` 5 por hora. Modo plateia: 20 salas por hora, 600 ações do telão e 6.000 votos a cada 10 min; consultar a sala não tem limite. Os limites da plateia são altos porque, numa apresentação, todos os celulares costumam sair pelo mesmo IP (Wi-Fi do local).

**Erros.** Entrada inválida retorna `400`; token inválido ou expirado, `401`; partida já terminada (ou e-mail já enviado), `409`; limite excedido, `429` com `Retry-After`; segredo ausente, `500`; falha do provedor (OpenAI ou n8n) retorna `502` com a mensagem do erro. Sem `OPENAI_API_KEY` ou sem `N8N_WEBHOOK_URL`, o servidor sobe com aviso e só as rotas que dependem deles respondem `500`.

## 7. Frontend (`@rpggg/frontend`)

React 19 + Tailwind 4, com o Vite na raiz do repositório. Lógica e telas em [frontend/src/App.tsx](frontend/src/App.tsx); cliente HTTP em [frontend/src/services/gameApi.ts](frontend/src/services/gameApi.ts).

- **Telas:** boas-vindas (escolha de origem e os botões **Iniciar Aventura** e **📱 Jogar com a plateia**), jogo (chat + painel do personagem), fim de jogo (vitória ou derrota; o formulário de e-mail só aparece com o envio configurado) e a página do celular em `/v/<CÓDIGO>`.
- **Painel do personagem:** barras de vida e XP, ouro, nível, localização e inventário; destaque visual na luta contra o chefão.
- **Chat:** mensagens do narrador, do jogador e do sistema, dado animado com a classe do resultado, opções de caminho e campo de ação livre.
- **Ilustração por cena:** carregamento assíncrono, botão de tentar novamente e liga/desliga salvo no `localStorage`.
- **Narração por voz:** duas opções. A voz do navegador (Web Speech API, grátis e instantânea, o padrão) ou uma das 6 vozes da OpenAI, pré-geradas assim que a cena chega. Voz e velocidade (0,5–2×) ficam salvas no `localStorage`.
- **Continuar de onde parou:** a sessão (token da partida, personagem, mensagens, histórico e flags de fim de jogo) é salva no `localStorage` a cada mudança. Saves sem token, de versões anteriores, são descartados. Imagens e áudios não entram no save e podem ser regenerados com um clique.
- **Tratamento de erro:** falhas do Mestre aparecem como mensagem do sistema e devolvem o controle ao jogador.
- **Modo plateia:** QR Code (biblioteca `qrcode`), votos ao vivo em cada caminho e cronômetro no telão ([Audience.tsx](frontend/src/Audience.tsx)); página do celular em `/v/<CÓDIGO>` ([VotePage.tsx](frontend/src/VotePage.tsx)).

## 8. Instalação e execução

**Requisitos:** Node 22 e pnpm 10 (versões fixadas em [.mise.toml](.mise.toml)) e uma chave da OpenAI com acesso a chat, imagens e áudio. O webhook do n8n é opcional (só para o resumo por e-mail).

> O lockfile (formato 9.0) funciona com pnpm 10, usado no Docker, e com pnpm 12. Use a mesma versão que instalou o seu `node_modules`; se o pnpm reclamar de `ERR_PNPM_UNEXPECTED_STORE`, é porque a versão é outra.

```bash
pnpm install
cp .env.example .env            # preencha OPENAI_API_KEY e SESSION_SECRET (N8N_WEBHOOK_URL é opcional)
pnpm dev:all                     # frontend (porta 8443) + backend (porta 3001)
```

| Script | Descrição |
| --- | --- |
| `pnpm dev:all` | Frontend e backend em paralelo |
| `pnpm dev` | Somente frontend |
| `pnpm dev:backend` | Somente backend (com watch) |
| `pnpm build` / `pnpm preview` | Build de produção do frontend e preview |
| `pnpm typecheck` | Checagem de tipos em todos os pacotes |
| `pnpm test` | Testes (`node:test` via `tsx`): `normalize`, estado assinado, limite por IP e salas do modo plateia |
| `pnpm format` | Formatação com oxfmt |

Verificação rápida: `GET http://localhost:3001/api/health` deve retornar `"hasKey": true`.

Para testar o modo plateia com celulares na mesma rede, abra o jogo pelo IP do computador (ex.: `http://192.168.0.10:8443`), não por `localhost`: o QR Code usa o endereço aberto no telão.

### Rodando via Docker (desenvolvimento)

Frontend e backend sobem juntos (`pnpm dev:all`) em um único container, com hot reload.

```bash
docker compose up --build
```

- Frontend em `http://localhost:8443`, backend em `http://localhost:3001`.
- O `.env` da raiz é injetado via `env_file`; a chave **não** entra na imagem (`.dockerignore` bloqueia `.env*`).
- O código é montado via bind mount ([docker-compose.yml](docker-compose.yml)); `CHOKIDAR_USEPOLLING` está ligado porque a detecção de mudanças em bind mounts não é confiável, especialmente no Windows.
- `docker compose down` para parar; `docker compose up -d --force-recreate` depois de mudar o `.env`.

### Rodando via Docker (produção)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

[Dockerfile.prod](Dockerfile.prod) faz um build multi-stage: gera `dist/` com o Vite e roda só o backend, que serve a API e o frontend estático na porta `3001`. HTTPS, proxy reverso e operação estão em **[DEPLOY.md](DEPLOY.md)**.

### Deploy na AWS

```bash
bash deploy/aws-ec2.sh   # Git Bash, com credenciais AWS no ambiente ou em ~/.aws/credentials
```

Cria (ou reaproveita) a EC2 com Docker, envia o código, faz o build e publica com HTTPS em `https://<ip>.sslip.io`. Passo a passo, atualização e como desligar tudo: [DEPLOY.md](DEPLOY.md#aws-ec2-com-um-comando).

## 9. Configuração

Variáveis lidas do `.env` da raiz ou de `backend/.env` (os dois são carregados; o de `backend/` tem precedência).

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Obrigatória para jogar. Usada apenas pelo backend |
| `N8N_WEBHOOK_URL` | — | Opcional. Sem ela, o formulário de e-mail não aparece e `/api/game/send-summary` responde `500` |
| `SESSION_SECRET` | aleatório a cada start | Assina o estado das partidas. Sem ele, partidas salvas param de valer após um restart |
| `TRUST_PROXY` | — | Atrás de proxy reverso, quantos proxies confiar (ex.: `1`), para o limite por IP ver o IP real |
| `OPENAI_MODEL` | `gpt-4o` | Modelo do Mestre |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Modelo das ilustrações |
| `OPENAI_IMAGE_QUALITY` | `low` | Qualidade das imagens (custo e latência) |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Modelo da narração por voz |
| `BACKEND_PORT` | `3001` | Porta da API e alvo do proxy |
| `PORT` | `8443` | Porta do servidor do Vite |

Modelo comentado em [.env.example](.env.example).

> O `.env` não deve ser versionado; o [.gitignore](.gitignore) já o exclui.

## 10. Decisões de projeto

- **Dado no servidor.** Garante aleatoriedade real e impede que o modelo "escolha" o resultado. Mesmo que ele devolva outro valor, o servidor sobrescreve.
- **Function calling em vez de texto livre.** O schema força a estrutura e elimina parsing frágil; a UI consome campos tipados.
- **Base de conhecimento no prompt.** Reduz alucinação de itens e criaturas e mantém o balanceamento em um só arquivo editável.
- **Ritmo controlado pelo código.** O modelo sozinho tende a alongar ou encurtar a história. A nota de ritmo de cada turno e a rede de segurança do turno 10 garantem que toda partida termine em 10 turnos, com uma luta de 5 rodadas.
- **Janela de histórico de 10 mensagens.** Controla custo e latência; o estado relevante viaja no prompt de ação, não depende do histórico.
- **Imagem e voz desacopladas da narração.** A cena aparece na hora; ilustração e áudio chegam depois, com retry e opção de desligar ou usar a voz gratuita do navegador.
- **E-mail via n8n.** O backend só repassa os dados a um webhook; template, provedor de e-mail e envio ficam no n8n, fora do código. Sem webhook, a funcionalidade some da interface em vez de falhar.
- **Modo plateia por polling.** Telão e celulares consultam a sala a cada 1–1,5 s. É mais simples e mais robusto em redes de evento que WebSocket, e cada consulta é uma leitura barata em memória.
- **Voto anônimo por aparelho.** Cada celular gera um id aleatório e vota uma vez por rodada; não há login para não atrasar a entrada da plateia.
- **Pacote de IA separado.** A lógica do jogo é testável e reutilizável independentemente do transporte HTTP.

## 11. Limitações conhecidas e próximos passos

- **Histórico narrativo vem do cliente.** Personagem e turno são autoritativos, mas as últimas mensagens enviadas como contexto ao modelo ainda podem ser editadas pelo cliente. Isso afeta só a narrativa, não os números.
- **Itens não são validados no servidor.** O servidor limita ouro, vida e nível, mas não confere se um item novo existe na base de conhecimento.
- **Sem autenticação.** Há limite por IP, mas qualquer pessoa com acesso ao site pode jogar e consumir a cota da OpenAI. Os limites ficam em memória e valem para um único processo.
- **Texto do e-mail vem do cliente.** O envio exige uma partida terminada e acontece uma vez por partida, mas o resumo em si é montado no navegador.
- **Custo por turno.** Com uma voz da OpenAI selecionada, cada cena gera até três chamadas pagas: texto, imagem e áudio.
- **Testes cobrem só o núcleo.** Rotas HTTP completas e as notas de ritmo do prompt ainda não têm teste.
- **Conteúdo fixo em português**, com a lore em um único arquivo.
- **Voto do modo plateia não é à prova de fraude.** Quem limpar os dados do navegador ganha um id novo e pode votar de novo. Serve para apresentação, não para votação séria.
- **Salas e limites só em memória.** Um restart do servidor apaga as salas (o telão avisa e basta ativar a plateia de novo). Para várias instâncias, seria preciso Redis.
- **Hospedagem no AWS Academy.** O site sai do ar quando a sessão do Learner Lab acaba e as credenciais mudam a cada sessão. Para ficar sempre no ar, é preciso uma conta AWS comum.

As perguntas em aberto sobre esses pontos estão reunidas no documento "RPGGG — Perguntas sobre o projeto".

## Stack

React 19 · Vite 8 · Tailwind CSS 4 · TypeScript 5 · Express 5 · OpenAI API (chat com function calling, geração de imagem e text-to-speech) · qrcode · n8n (opcional, envio de e-mail) · pnpm workspaces · Docker · Caddy · AWS EC2
