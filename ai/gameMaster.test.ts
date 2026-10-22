import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, pickMiddleRegion } from './gameMaster';
import { buildActionPrompt, MAX_TURNS } from './prompts';
import { MIDDLE_REGIONS } from './knowledgeBase';
import { INITIAL_CHARACTER } from './character';
import type { CharacterStatus, GameResponse } from './types';

const current: CharacterStatus = { ...INITIAL_CHARACTER, origin: 'dever' };

function raw(status: Partial<GameResponse['character_status']> = {}, extra: Partial<GameResponse> = {}): Partial<GameResponse> {
  return {
    dice: 9,
    event: 'Emboscada',
    description: 'Goblins saltam da mata.',
    paths: [
      { id: 1, title: 'Lutar', description: '' },
      { id: 2, title: 'Fugir', description: '' },
    ],
    character_status: {
      health: current.health,
      max_health: current.maxHealth,
      gold: current.gold,
      inventory: current.inventory,
      location: current.location,
      level: current.level,
      xp: current.xp,
      ...status,
    },
    ...extra,
  };
}

test('sem narrativa devolve null (dispara nova tentativa)', () => {
  assert.equal(normalize({}, current), null);
});

test('o dado do servidor sobrescreve o do modelo', () => {
  const game = normalize(raw({}, { dice: 10, result_type: 'bom' }), current, 2)!;
  assert.equal(game.dice, 2);
  assert.equal(game.result_type, 'ruim');
});

test('ouro não sobe mais de 150 por turno', () => {
  const game = normalize(raw({ gold: 999 }), current, 9)!;
  assert.equal(game.character_status.gold, current.gold + 150);
});

test('vida não passa do máximo e o máximo não passa de 200', () => {
  const game = normalize(raw({ health: 500, max_health: 300 }), current, 9)!;
  assert.equal(game.character_status.max_health, 200);
  assert.equal(game.character_status.health, 200);
});

test('com vida ≥ 20, um turno não mata o herói', () => {
  const game = normalize(raw({ health: 0 }, { is_game_over: true }), { ...current, health: 50 }, 1)!;
  assert.equal(game.character_status.health, 1);
  assert.equal(game.is_game_over, false);
});

test('com vida < 20, vida zerada vira derrota mesmo sem o modelo marcar', () => {
  const game = normalize(raw({ health: 0 }), { ...current, health: 10 }, 1)!;
  assert.equal(game.is_game_over, true);
  assert.equal(game.is_victory, false);
  assert.deepEqual(game.paths, []);
});

test('nível é sempre derivado do XP, com teto 10', () => {
  assert.equal(normalize(raw({ xp: 250, level: 7 }), current, 5)!.character_status.level, 3);
  assert.equal(normalize(raw({ xp: 5000, level: 1 }), current, 5)!.character_status.level, 10);
});

test('a origem nunca vem do modelo', () => {
  const game = normalize(raw({ origin: 'vinganca' }), current, 5)!;
  assert.equal(game.character_status.origin, 'dever');
});

test('menos de 2 caminhos usa os caminhos de fallback', () => {
  const game = normalize(raw({}, { paths: [{ id: 1, title: 'Único', description: '' }] }), current, 5)!;
  assert.equal(game.paths.length, 3);
});

test('a partida tem 5 turnos', () => {
  assert.equal(MAX_TURNS, 5);
});

test('no último turno sem desfecho, a rede de segurança encerra a partida', () => {
  const game = normalize(raw(), current, 5, MAX_TURNS)!;
  assert.equal(game.is_victory, true);
  assert.equal(game.is_boss_fight, true);
  assert.equal(game.character_status.location, 'Torre da Perdição');
  assert.deepEqual(game.paths, []);
});

test('antes do último turno a partida segue aberta', () => {
  const game = normalize(raw(), current, 5, MAX_TURNS - 1)!;
  assert.equal(game.is_victory, false);
  assert.equal(game.is_game_over, false);
});

test('o sorteio da 3ª região só devolve Pântano ou Ruínas, e as duas saem', () => {
  const seen = new Set(Array.from({ length: 200 }, () => pickMiddleRegion()));
  assert.deepEqual([...seen].sort(), [...MIDDLE_REGIONS].sort());
});

test('o prompt de ação leva a rota da partida, sem a região que não foi sorteada', () => {
  const prompt = buildActionPrompt('Seguir viagem', current, 5, 3, 'Ruínas de Aldrath');
  assert.match(prompt, /Vila de Pedra Cinza → Floresta de Sussurros → Ruínas de Aldrath → Montanha do Trovão → Torre da Perdição/);
  assert.doesNotMatch(prompt, /Pântano da Podridão/);
});

test('no turno 4 o prompt leva o herói até o Lich', () => {
  const prompt = buildActionPrompt('Seguir viagem', { ...current, location: 'Pântano da Podridão' }, 5, 4, 'Pântano da Podridão');
  assert.match(prompt, /Turno 4\/5/);
  assert.match(prompt, /cara a cara com o Lich Malachar/);
});
