export interface CharacterStatus {
  health: number;
  maxHealth: number;
  gold: number;
  inventory: string[];
  location: string;
  level: number;
  xp: number;
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
  };
  is_boss_fight: boolean;
  is_game_over: boolean;
  is_victory: boolean;
  narrator_message: string;
  combat_log?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
