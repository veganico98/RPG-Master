# @rpggg/ai

Pacote de domínio do jogo. Não depende de Express, React nem de nenhum framework HTTP — é só lore, prompts, schema e chamadas cruas (`fetch`) à API da OpenAI. É consumido pelo [`@rpggg/backend`](../backend) (lógica completa) e pelo [`@rpggg/frontend`](../frontend) (somente tipos e constantes, via subpaths).

Para o contexto completo do jogo (regiões, bestiário, regras de progressão) veja o [README da raiz](../README.md#2-o-jogo).

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| [knowledgeBase.ts](knowledgeBase.ts) | Fonte única de verdade do mundo: história, regiões, bestiário, itens e regras fixas do Mestre. Editar o jogo (balanceamento, lore, itens) começa aqui. |
| [prompts.ts](prompts.ts) | `buildSystemPrompt()` monta o prompt de sistema (papel do Mestre + base de conhecimento + guardrails). `buildActionPrompt(action, character, dice, turnNumber)` monta o prompt de cada turno, com o dado classificado, o progresso entre regiões, a motivação do herói e a nota de ritmo (10 turnos; luta contra o Lich nos turnos 6 a 10). `buildOpeningPrompt(origin)` monta a cena inicial, com uma variação de texto por origem escolhida. |
| [schema.ts](schema.ts) | `GAME_RESPONSE_SCHEMA`: JSON Schema usado como parâmetros da function tool `game_response`, com limites embutidos (2–4 caminhos, nível 1–10, etc). |
| [gameMaster.ts](gameMaster.ts) | Cliente da API de chat da OpenAI: `callGameMaster`, `getOpeningScene`, `normalize` (exportada para testes) e a lógica de retry. |
| [imageGen.ts](imageGen.ts) | `generateSceneImage`: chama a API de imagens da OpenAI e devolve um data URL JPEG (base64). |
| [voiceGen.ts](voiceGen.ts) | `generateSpeech`, `TTS_VOICES` e `isTtsVoice`: narração com voz da OpenAI, devolve um data URL MP3. |
| [gameMaster.test.ts](gameMaster.test.ts) | Testes de `normalize` (rodam com `pnpm test` na raiz). |
| [types.ts](types.ts) | Contratos TypeScript: `CharacterStatus`, `GameResponse`, `Path`, `HistoryMessage`. |
| [character.ts](character.ts) | `characterFromResponse` (converte `character_status` para `CharacterStatus`) e `INITIAL_CHARACTER`: estado inicial do personagem (100/100 de vida, 20 de ouro, nível 1, Espada de Ferro + Escudo de Madeira + 2 Poções de Cura). |
| [room.ts](room.ts) | Tipos do modo plateia: `RoomState` (fase, rodada, cena, dado, opções com votos, cronômetro, plateia), `RoomOption` e `RoomPhase`. Só tipos, compartilhados entre backend e frontend. |
| [origins.ts](origins.ts) | `HERO_ORIGINS` e o tipo `HeroOriginId`: as três motivações selecionáveis na tela de boas-vindas (Vingança, Dever, Descoberta). Só afetam a narrativa — nunca atributos mecânicos. |
| [index.ts](index.ts) | Ponto de entrada público do pacote (ver **Exports** abaixo). |

## Exports

O `package.json` declara subpaths para permitir que o frontend importe só tipos/constantes, sem puxar código de servidor (que usa `fetch` para a OpenAI e nunca deveria rodar no browser):

```jsonc
{
  "exports": {
    ".": "./index.ts",           // callGameMaster, getOpeningScene, generateSceneImage, INITIAL_CHARACTER, HERO_ORIGINS, tipos
    "./types": "./types.ts",     // só tipos
    "./character": "./character.ts", // INITIAL_CHARACTER e characterFromResponse
    "./origins": "./origins.ts", // só HERO_ORIGINS / HeroOriginId
    "./room": "./room.ts"        // só tipos do modo plateia
  }
}
```

- **Backend** importa de `@rpggg/ai` (raiz): `callGameMaster`, `getOpeningScene`, `generateSceneImage`, `generateSpeech`, `isTtsVoice`, `characterFromResponse`, `HERO_ORIGINS` (para validar a origem recebida em `/api/game/start`), além dos tipos.
- **Frontend** importa de `@rpggg/ai/types` (tipos como `CharacterStatus`, `GameResponse`, `Path`), `@rpggg/ai/character` (`INITIAL_CHARACTER`) e `@rpggg/ai/origins` (`HERO_ORIGINS`, para renderizar os botões de origem na tela de boas-vindas) e `@rpggg/ai/room` (`RoomState`), nunca da raiz — assim o bundle do cliente não carrega `gameMaster.ts`/`imageGen.ts`, que fazem chamadas autenticadas à OpenAI.

## Como funciona cada chamada

### `callGameMaster(apiKey, playerAction, character, history, turnNumber?)`

O backend passa `turnNumber` a partir do estado assinado. Sem ele, o turno é calculado pelas respostas do Mestre no histórico.

1. Rola o dado no servidor com `randomInt(1, 11)` (do `node:crypto`) — **nunca** confia em um valor vindo do modelo.
2. Monta as mensagens: `buildSystemPrompt()` como `system`, as últimas `HISTORY_WINDOW` (10) mensagens do histórico, e um prompt de usuário com a ação, o status atual do personagem e o dado já classificado (ruim/médio/bom).
3. Chama `POST https://api.openai.com/v1/chat/completions` com:
   - `model`: `process.env.OPENAI_MODEL` (padrão `gpt-4o`)
   - `temperature: 0.9`, `max_tokens: 4096`
   - **function calling forçado**: `tool_choice` fixado em `game_response`, cujos `parameters` são o `GAME_RESPONSE_SCHEMA`
4. Faz o parse do JSON dos `tool_calls` e passa por `normalize`.
5. Se a resposta vier vazia, malformada ou sem `tool_calls`, tenta **mais uma vez** (`requestGameResponse` tem 2 tentativas); se falhar de novo, lança erro amigável.

### `normalize(raw, current, forcedDice?, turnNumber?)`

Função interna que blinda o backend contra respostas incompletas do modelo:

- Se não houver `description`/`narrator_message`/`event`, retorna `null` (aciona o retry).
- **Sempre sobrescreve `dice` e `result_type`** com o valor rolado pelo servidor — o modelo nunca decide o resultado, só narra.
- Preenche qualquer campo de `character_status` ausente com o valor atual do personagem (evita que vida/ouro/inventário "zerem" por omissão do modelo).
- Aplica os guardrails numéricos no código: ouro sobe no máximo 150 por turno, vida máxima até 200, vida entre 0 e o máximo, com vida ≥ 20 no início do turno o herói não cai abaixo de 1, e nível = 1 + floor(XP / 100), até 10.
- `is_game_over` é exatamente "vida chegou a 0", independentemente do que o modelo marcar.
- No turno 10 sem desfecho, força o confronto com o Lich e encerra a partida (vitória se a vida for maior que 0).
- Garante pelo menos 2 caminhos (usa `FALLBACK_PATHS` se o modelo mandar poucos ou nenhum, exceto quando é fim de jogo).
- Gera um `scene_image_prompt` de fallback se o modelo não mandar um.

### `getOpeningScene(apiKey, origin?)`

Mesma pipeline, mas com dado **fixo em 7** (resultado médio) e usando `INITIAL_CHARACTER` — a abertura não deve depender de sorte nem gastar aleatoriedade. `origin` (`HeroOriginId` opcional: `'vinganca' | 'dever' | 'descoberta'`) muda o texto de `buildOpeningPrompt` e é gravado em `character_status.origin` — a partir daí, `normalize` sempre propaga esse valor de turno em turno a partir de `current.origin`, **nunca** do que o modelo devolve (o `origin` não faz parte do `GAME_RESPONSE_SCHEMA`), então é impossível a IA alterá-lo por conta própria. Sem `origin`, cai no padrão `'dever'`.

### Motivação persistente entre turnos

Como a origem não está no schema, ela não depende da janela de histórico (10 mensagens) para não ser esquecida: `buildActionPrompt` → `progressNotes` (em [prompts.ts](prompts.ts)) reinjeta `HERO_ORIGINS[character.origin].teaser` em **todo** prompt de ação, então o Mestre sempre tem a motivação do herói disponível, mesmo em campanhas longas.

### `generateSceneImage(apiKey, scenePrompt)`

Chama `POST https://api.openai.com/v1/images/generations` com um prefixo de estilo fixo (dark fantasy, cinematográfico, sem texto/UI), modelo `OPENAI_IMAGE_MODEL` (padrão `gpt-image-1`), tamanho `1536x1024` e qualidade `OPENAI_IMAGE_QUALITY` (padrão `low`, pra controlar custo). Retorna `data:image/jpeg;base64,...` pronto para o `<img src>`.

## Variáveis de ambiente usadas aqui

| Variável | Padrão | Onde é lida |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4o` | [gameMaster.ts](gameMaster.ts) |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | [imageGen.ts](imageGen.ts) |
| `OPENAI_IMAGE_QUALITY` | `low` | [imageGen.ts](imageGen.ts) |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | [voiceGen.ts](voiceGen.ts) |

Nenhuma chave é lida diretamente por este pacote — `apiKey` sempre chega por parâmetro, vindo do backend (que é quem lê `OPENAI_API_KEY`). Isso mantém o pacote sem acesso a segredos por conta própria.

## Rodando

Pacote só de tipos/lógica, sem processo próprio — é usado via import pelos outros workspaces.

```bash
pnpm --filter @rpggg/ai typecheck
```

Para testar as chamadas de verdade, rode o backend (`pnpm dev:backend`, na raiz) com `OPENAI_API_KEY` configurada e bata em `/api/game/start` — veja o [README do backend](../backend/README.md).

## Decisões de projeto relevantes aqui

- **Dado no servidor, nunca no modelo** — é a garantia central de que o jogo é justo mesmo com um LLM "criativo" narrando.
- **Function calling em vez de texto livre** — elimina parsing frágil de markdown/texto e força um contrato tipado ponta a ponta.
- **Base de conhecimento em um único arquivo** ([knowledgeBase.ts](knowledgeBase.ts)) — todo o balanceamento e lore do jogo fica num lugar só, fácil de revisar e versionar.
- **Retry único e silencioso** — cobre o caso comum de o modelo devolver `tool_calls` vazio; depois disso, o erro sobe para o usuário em vez de ficar tentando indefinidamente (custo e latência).
- **Reviravolta de enredo e final duplo sem mudar o schema** — o Lich Malachar tem uma verdade escondida (ver "O SEGREDO DO ORBE" em [knowledgeBase.ts](knowledgeBase.ts)) revelada só pelo item "Diário de Aldric", e a vitória tem duas narrações possíveis dependendo do inventário. Ambos os casos continuam sendo só `is_victory: true` — a ramificação é inteiramente narrativa (decidida pela IA lendo o inventário), sem precisar de um novo campo no `GAME_RESPONSE_SCHEMA` nem lógica extra no backend.
- **Origem do herói fora do schema, mas persistente** — em vez de fazer o modelo carregar `origin` a cada resposta (o que arriscaria ele "esquecer" ou alterar), o valor é decidido uma única vez pelo jogador e sempre reimposto pelo servidor (`normalize`) e reinjetado no prompt (`progressNotes`). O modelo só lê, nunca escreve.

Veja também as [limitações conhecidas](../README.md#11-limitações-conhecidas-e-próximos-passos) no README da raiz (ex.: o servidor ainda não confere se itens novos existem na base de conhecimento).
