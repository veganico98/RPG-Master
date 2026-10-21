import type { GameResponse, HistoryMessage } from '@rpg-master/ai/types';
import type { HeroOriginId } from '@rpg-master/ai/origins';
import type { TtsVoice } from '@rpg-master/ai';

/** Resposta do Mestre + o estado assinado que o servidor exige no próximo turno. */
export type GameTurn = GameResponse & { state_token: string };

async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getOpeningScene(origin?: HeroOriginId): Promise<GameTurn> {
  return post<GameTurn>('/api/game/start', origin ? { origin } : undefined);
}

export async function generateSceneImage(prompt: string): Promise<string> {
  const { image } = await post<{ image: string }>('/api/game/image', { prompt });
  return image;
}

export async function generateSpeech(text: string, voice?: TtsVoice, speed?: number): Promise<string> {
  const { audio } = await post<{ audio: string }>('/api/game/speech', { text, voice, speed });
  return audio;
}

/** O personagem e o turno vêm do `stateToken`; o servidor ignora qualquer outro estado. */
export function callGameMaster(action: string, history: HistoryMessage[], stateToken: string): Promise<GameTurn> {
  return post<GameTurn>('/api/game/action', { action, history, state_token: stateToken });
}

/** O envio de resumo por e-mail só existe se o servidor tiver o webhook do n8n. */
export async function isEmailEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    const health = (await response.json()) as { hasEmail?: boolean };
    return !!health.hasEmail;
  } catch {
    return false;
  }
}

export type StoryOutcome = 'vitoria' | 'derrota' | 'em_andamento';

/** Só funciona com o token de uma partida terminada, e uma vez por partida. */
export async function sendStorySummary(email: string, summary: string, stateToken: string): Promise<void> {
  await post<{ ok: true }>('/api/game/send-summary', { email, summary, state_token: stateToken });
}
