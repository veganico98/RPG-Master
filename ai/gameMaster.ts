import { buildActionPrompt, buildSystemPrompt, OPENING_PROMPT } from './prompts';
import { GAME_RESPONSE_SCHEMA } from './schema';
import type { CharacterStatus, GameResponse, HistoryMessage } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5';
const HISTORY_WINDOW = 10;

async function requestGameResponse(
  apiKey: string,
  maxTokens: number,
  messages: HistoryMessage[],
): Promise<GameResponse> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: buildSystemPrompt(),
      tools: [
        {
          name: 'game_response',
          description: 'Estrutura a resposta do Mestre de RPG com todos os dados do jogo',
          input_schema: GAME_RESPONSE_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'game_response' },
      messages,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(error?.error?.message || `API error: ${response.status}`);
  }

  const data = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const toolUse = data.content?.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('No structured response from game master');

  return toolUse.input as GameResponse;
}

export function callGameMaster(
  apiKey: string,
  playerAction: string,
  character: CharacterStatus,
  history: HistoryMessage[],
): Promise<GameResponse> {
  return requestGameResponse(apiKey, 2048, [
    ...history.slice(-HISTORY_WINDOW),
    { role: 'user', content: buildActionPrompt(playerAction, character) },
  ]);
}

export function getOpeningScene(apiKey: string): Promise<GameResponse> {
  return requestGameResponse(apiKey, 1024, [{ role: 'user', content: OPENING_PROMPT }]);
}
