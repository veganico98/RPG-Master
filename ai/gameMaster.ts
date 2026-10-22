import { randomInt } from 'node:crypto';
import { buildActionPrompt, buildOpeningPrompt, buildSystemPrompt, MAX_TURNS } from './prompts';
import { MIDDLE_REGIONS, type MiddleRegion } from './knowledgeBase';
import { GAME_RESPONSE_SCHEMA } from './schema';
import { INITIAL_CHARACTER } from './character';
import type { HeroOriginId } from './origins';
import type { CharacterStatus, GameResponse, HistoryMessage } from './types';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
const HISTORY_WINDOW = 10;

const FALLBACK_PATHS = [
  { id: 1, title: 'Seguir em frente', description: 'Continuar a jornada pelo caminho principal.' },
  { id: 2, title: 'Explorar os arredores', description: 'Procurar pistas e tesouros nas redondezas.' },
  { id: 3, title: 'Descansar e se preparar', description: 'Recuperar o fôlego antes de seguir viagem.' },
];

function resultTypeFor(dice: number): GameResponse['result_type'] {
  return dice <= 3 ? 'ruim' : dice <= 7 ? 'medio' : 'bom';
}

/** Nº do turno prestes a ser gerado (a abertura é o turno 1). */
function turnNumberFor(history: HistoryMessage[]): number {
  return history.filter((m) => m.role === 'assistant').length + 1;
}

const MAX_GOLD_GAIN_PER_TURN = 150;
const MAX_HEALTH_CAP = 200;
const MAX_LEVEL = 10;
const XP_PER_LEVEL = 100;

function intOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
}

/**
 * Aplica no código os guardrails numéricos que o prompt só pede ao modelo:
 * teto de ouro por turno, vida máxima, vida nunca acima do máximo, morte só
 * depois do aviso de vida < 20 e nível sempre derivado do XP.
 */
function clampStatus(cs: Partial<GameResponse['character_status']> | undefined, current: CharacterStatus) {
  const maxHealth = Math.min(MAX_HEALTH_CAP, Math.max(1, intOr(cs?.max_health, current.maxHealth)));
  let health = Math.min(maxHealth, Math.max(0, intOr(cs?.health, current.health)));
  // Guardrail 4: com vida ≥ 20 no início do turno, nenhum dano leva abaixo de 1.
  if (current.health >= 20) health = Math.max(1, health);

  const gold = Math.min(current.gold + MAX_GOLD_GAIN_PER_TURN, Math.max(0, intOr(cs?.gold, current.gold)));
  const xp = Math.max(0, intOr(cs?.xp, current.xp));
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(xp / XP_PER_LEVEL));

  return { health, maxHealth, gold, xp, level };
}

/**
 * Completa campos que o modelo eventualmente omite. Retorna null se não há narrativa.
 * Também funciona como rede de segurança: se o modelo ignorar o limite de turnos, força
 * o desfecho aqui mesmo (o jogo não pode depender só da IA obedecer a instrução do prompt).
 */
export function normalize(
  raw: Partial<GameResponse>,
  current: CharacterStatus,
  forcedDice?: number,
  turnNumber?: number,
): GameResponse | null {
  const description = raw.description || raw.narrator_message || raw.event;
  if (!description) return null;

  const dice = forcedDice ?? (Number.isInteger(raw.dice) ? Math.min(10, Math.max(1, raw.dice as number)) : 5);
  const cs = raw.character_status;
  const { health, maxHealth, gold, xp, level } = clampStatus(cs, current);

  // Derrota é exatamente "vida chegou a 0" (já com os guardrails aplicados):
  // vale mesmo se o modelo esquecer de marcar, ou marcar com o herói vivo.
  let isGameOver = health === 0;
  let isVictory = !!raw.is_victory && !isGameOver;
  let isBossFight = !!raw.is_boss_fight;
  let finalDescription = description;
  let finalLocation = cs?.location || current.location;

  if (turnNumber !== undefined && turnNumber >= MAX_TURNS && !isGameOver && !isVictory) {
    // Rede de segurança: o modelo não chegou à luta a tempo. Em vez de uma
    // "vitória" instantânea sem sentido, forçamos o confronto com o Lich aqui.
    isBossFight = true;
    finalLocation = 'Torre da Perdição';
    if (health > 0) {
      isVictory = true;
      finalDescription +=
        '\n\nNum átimo, a cena se dissolve e o herói se vê diante do Lich Malachar, no topo da Torre da Perdição. Em uma sequência final de golpes decisivos, o Orbe do Caos se estilhaça e a ameaça é encerrada de uma vez por todas.';
    } else {
      isGameOver = true;
    }
  }

  const over = isGameOver || isVictory;
  const paths = Array.isArray(raw.paths) ? raw.paths.filter((p) => p?.title) : [];

  return {
    dice,
    result_type: resultTypeFor(dice),
    event: raw.event || 'Um novo capítulo',
    description: finalDescription,
    narrator_message: raw.narrator_message || '',
    combat_log: raw.combat_log,
    scene_image_prompt:
      raw.scene_image_prompt ||
      (isBossFight
        ? 'skeletal lich in tattered robes atop a dark tower, glowing orb, dramatic magical confrontation'
        : `${raw.event || 'Adventure scene'}, ${finalLocation}`),
    paths: (over ? [] : paths.length >= 2 ? paths : FALLBACK_PATHS).map((p, i) => ({
      id: Number.isInteger(p.id) ? p.id : i + 1,
      title: p.title,
      description: p.description || '',
    })),
    character_status: {
      health,
      max_health: maxHealth,
      gold,
      inventory: Array.isArray(cs?.inventory) ? cs.inventory.filter((i) => typeof i === 'string') : current.inventory,
      location: finalLocation,
      level,
      xp,
      // A origem nunca é decidida pelo modelo — sempre a mesma escolhida na abertura.
      origin: current.origin,
    },
    is_boss_fight: isBossFight,
    is_game_over: isGameOver,
    is_victory: isVictory,
  };
}

async function requestGameResponse(
  apiKey: string,
  maxTokens: number,
  messages: HistoryMessage[],
  current: CharacterStatus,
  dice?: number,
  turnNumber?: number,
): Promise<GameResponse> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const game = await requestOnce(apiKey, maxTokens, messages, current, dice, turnNumber);
    if (game) return game;
  }
  throw new Error('O Mestre não conseguiu narrar desta vez. Tente novamente.');
}

async function requestOnce(
  apiKey: string,
  maxTokens: number,
  messages: HistoryMessage[],
  current: CharacterStatus,
  dice?: number,
  turnNumber?: number,
): Promise<GameResponse | null> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.9,
      messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages],
      tools: [
        {
          type: 'function',
          function: {
            name: 'game_response',
            description: 'Estrutura a resposta do Mestre de RPG com todos os dados do jogo',
            parameters: GAME_RESPONSE_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'game_response' } },
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(error?.error?.message || `API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;

  let raw: Partial<GameResponse>;
  try {
    raw = JSON.parse(args);
  } catch {
    return null;
  }
  return normalize(raw, current, dice, turnNumber);
}

/** Sorteia a 3ª região da rota (Pântano ou Ruínas). Chamado uma vez, no início da partida. */
export function pickMiddleRegion(): MiddleRegion {
  return MIDDLE_REGIONS[randomInt(MIDDLE_REGIONS.length)];
}

/**
 * `turnNumber` e `middleRegion` devem vir de uma fonte confiável (o estado assinado pelo backend).
 * Sem o turno, cai no cálculo pelo histórico, que o cliente controla.
 */
export function callGameMaster(
  apiKey: string,
  playerAction: string,
  character: CharacterStatus,
  history: HistoryMessage[],
  turnNumber: number = turnNumberFor(history),
  middleRegion: MiddleRegion = MIDDLE_REGIONS[0],
): Promise<GameResponse> {
  // O dado é rolado aqui (aleatório de verdade); o modelo só narra o resultado.
  const dice = randomInt(1, 11);
  return requestGameResponse(
    apiKey,
    4096,
    [
      ...history.slice(-HISTORY_WINDOW),
      { role: 'user', content: buildActionPrompt(playerAction, character, dice, turnNumber, middleRegion) },
    ],
    character,
    dice,
    turnNumber,
  );
}

export function getOpeningScene(apiKey: string, origin?: HeroOriginId): Promise<GameResponse> {
  const current: CharacterStatus = { ...INITIAL_CHARACTER, origin };
  return requestGameResponse(apiKey, 2048, [{ role: 'user', content: buildOpeningPrompt(origin) }], current, 7, 1);
}
