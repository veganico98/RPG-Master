# @rpggg/ai

Mestre de RPG (Claude): base de conhecimento, prompts, guardrails, schema da resposta e cliente da API.

- `knowledgeBase.ts` — lore, criaturas, itens e regras
- `prompts.ts` / `schema.ts` — prompt do sistema e schema estruturado
- `gameMaster.ts` — chamadas ao Claude (`callGameMaster`, `getOpeningScene`)
- `types.ts` / `character.ts` — tipos e personagem inicial (usados também pelo frontend, só tipos/constantes)

Consumido por `@rpggg/backend` (lógica) e `@rpggg/frontend` (`@rpggg/ai/types`, `@rpggg/ai/character`).

```
pnpm --filter @rpggg/ai typecheck
```
