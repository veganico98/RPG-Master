import type { CharacterStatus, GameResponse } from './types';

/** Converte o status devolvido pelo Mestre (snake_case) para o formato do jogo. */
export function characterFromResponse(cs: GameResponse['character_status']): CharacterStatus {
  return {
    health: cs.health,
    maxHealth: cs.max_health,
    gold: cs.gold,
    inventory: cs.inventory,
    location: cs.location,
    level: cs.level,
    xp: cs.xp,
    origin: cs.origin,
  };
}

export const INITIAL_CHARACTER: CharacterStatus = {
  health: 100,
  maxHealth: 100,
  gold: 20,
  inventory: ['Espada de Ferro', 'Escudo de Madeira', 'Poção de Cura x2'],
  location: 'Vila de Pedra Cinza',
  level: 1,
  xp: 0,
};
