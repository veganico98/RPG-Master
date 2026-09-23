import type { CharacterStatus } from './types';

export const INITIAL_CHARACTER: CharacterStatus = {
  health: 100,
  maxHealth: 100,
  gold: 20,
  inventory: ['Espada de Ferro', 'Escudo de Madeira', 'Poção de Cura x2'],
  location: 'Vila de Pedra Cinza',
  level: 1,
  xp: 0,
};
