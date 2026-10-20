import type { HeroOriginId } from './origins';

export interface CharacterStatus {
  health: number;
  maxHealth: number;
  gold: number;
  inventory: string[];
  location: string;
  level: number;
  xp: number;
  /** Motivação do herói escolhida na abertura. Só afeta a narrativa, nunca as regras. */
  origin?: HeroOriginId;
}

export interface Path {
  id: number;
  title: string;
  description: string;
}

export interface GameResponse {
  dice: number;
  result_type: 'ruim' | 'medio' | 'bom';
  event: string;
  description: string;
  paths: Path[];
  character_status: {
    health: number;
    max_health: number;
    gold: number;
    inventory: string[];
    location: string;
    level: number;
    xp: number;
    origin?: HeroOriginId;
  };
  is_boss_fight: boolean;
  is_game_over: boolean;
  is_victory: boolean;
  narrator_message: string;
  combat_log?: string;
  scene_image_prompt?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
