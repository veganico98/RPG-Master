export const GAME_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    dice: { type: 'integer', minimum: 1, maximum: 10, description: 'Resultado do dado (1-10)' },
    result_type: { type: 'string', enum: ['ruim', 'medio', 'bom'], description: '1-3=ruim, 4-7=medio, 8-10=bom' },
    event: { type: 'string', description: 'Título curto do evento (max 60 chars)' },
    description: { type: 'string', description: 'Narrativa detalhada do evento (2-4 parágrafos épicos)' },
    narrator_message: { type: 'string', description: 'Mensagem dramática do narrador sobre o resultado do dado' },
    combat_log: { type: 'string', description: 'Log de combate detalhado se houver batalha (opcional)' },
    paths: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', description: 'Nome do caminho (max 40 chars)' },
          description: { type: 'string', description: 'Descrição do que este caminho envolve (1-2 frases)' },
        },
        required: ['id', 'title', 'description'],
      },
    },
    character_status: {
      type: 'object',
      properties: {
        health: { type: 'integer', minimum: 0 },
        max_health: { type: 'integer' },
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
  required: ['dice', 'result_type', 'event', 'description', 'narrator_message', 'paths', 'character_status', 'is_boss_fight', 'is_game_over', 'is_victory'],
};
