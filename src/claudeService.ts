import { GameResponse, CharacterStatus, RPG_KNOWLEDGE_BASE } from './rpgData';

const API_URL = '/api/openai/responses';

const GAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dice: { type: 'integer', minimum: 1, maximum: 10 },
    result_type: { type: 'string', enum: ['ruim', 'medio', 'bom'] },
    event: { type: 'string' },
    description: { type: 'string' },
    narrator_message: { type: 'string' },
    combat_log: { type: 'string' },
    paths: {
      type: 'array', minItems: 2, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        properties: { id: { type: 'integer' }, title: { type: 'string' }, description: { type: 'string' } },
        required: ['id', 'title', 'description'],
      },
    },
    character_status: {
      type: 'object', additionalProperties: false,
      properties: {
        health: { type: 'integer', minimum: 0 },
        max_health: { type: 'integer', minimum: 1, maximum: 200 },
        gold: { type: 'integer', minimum: 0 },
        inventory: { type: 'array', items: { type: 'string' } },
        location: { type: 'string' },
        level: { type: 'integer', minimum: 1, maximum: 10 },
        xp: { type: 'integer', minimum: 0 },
      },
      required: ['health', 'max_health', 'gold', 'inventory', 'location', 'level', 'xp'],
    },
    is_boss_fight: { type: 'boolean' },
    is_game_over: { type: 'boolean' },
    is_victory: { type: 'boolean' },
  },
  required: ['dice', 'result_type', 'event', 'description', 'narrator_message', 'combat_log', 'paths', 'character_status', 'is_boss_fight', 'is_game_over', 'is_victory'],
} as const;

function buildSystemPrompt(): string {
  return `Você é o Mestre de RPG Inteligente — um narrador épico e imparcial de uma aventura de fantasia sombria.

${RPG_KNOWLEDGE_BASE}

## SUAS RESPONSABILIDADES:
- Narrar a história de forma épica e dramática em português brasileiro
- Respeitar sempre as regras e a base de conhecimento acima
- Gerar o valor do dado aleatoriamente (1-10) e honrar seu resultado
- Criar eventos coerentes com o resultado do dado e a situação atual
- Manter o status do personagem coerente e atualizado
- Criar escolhas genuinamente diferentes e interessantes

## GUARDRAILS:
1. Nunca invente itens fora da base de conhecimento
2. Nunca dê mais de 150 de ouro por turno
3. Nunca restaure mais vida do que a poção/item permite
4. Nunca mate o personagem sem antes avisá-lo quando vida < 20
5. Nunca coloque o chefe antes da região 6 (Torre da Perdição)
6. Honre o dado: ruim=1-3, médio=4-7, bom=8-10
7. Nunca deixe o personagem ter mais de 200 de vida máxima
8. Não repita o mesmo resultado do dado três vezes seguidas

Responda somente no formato JSON estruturado solicitado. Quando não houver combate, use combat_log como string vazia.`;
}

async function requestGameResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxOutputTokens: number,
): Promise<GameResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5',
      instructions: buildSystemPrompt(),
      input: messages,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          name: 'game_response',
          strict: true,
          schema: GAME_RESPONSE_SCHEMA,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Erro da API OpenAI: ${response.status}`);
  if (!data.output_text) throw new Error('A OpenAI não retornou uma resposta estruturada');

  try {
    return JSON.parse(data.output_text) as GameResponse;
  } catch {
    throw new Error('A OpenAI retornou um JSON inválido');
  }
}

export async function callGameMaster(
  playerAction: string,
  characterStatus: CharacterStatus,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<GameResponse> {
  return requestGameResponse([
    ...conversationHistory.slice(-10),
    {
      role: 'user',
      content: `AÇÃO DO JOGADOR: "${playerAction}"

STATUS ATUAL DO PERSONAGEM:
- Vida: ${characterStatus.health}/${characterStatus.maxHealth}
- Ouro: ${characterStatus.gold}
- Nível: ${characterStatus.level} (${characterStatus.xp} XP)
- Localização: ${characterStatus.location}
- Inventário: ${characterStatus.inventory.join(', ')}

Gere um dado aleatório de 1-10, narre o resultado e apresente os próximos caminhos.`,
    },
  ], 2048);
}

export async function getOpeningScene(): Promise<GameResponse> {
  return requestGameResponse([{
    role: 'user',
    content: 'Inicie a aventura. Apresente o personagem na Vila de Pedra Cinza recebendo a missão de destruir o Orbe do Caos. Na abertura use dice: 7 e result_type: "medio". Apresente 3-4 caminhos. Inventário inicial: Espada de Ferro, Escudo de Madeira, Poção de Cura x2. Ouro: 20. Vida: 100/100.',
  }], 1024);
}
