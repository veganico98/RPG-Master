import type { Path } from '@rpggg/ai/types';

export interface ChatMessage {
  id: string;
  role: 'narrator' | 'player' | 'system';
  content: string;
  event?: string;
  dice?: number;
  resultType?: 'ruim' | 'medio' | 'bom';
  paths?: Path[];
  isBoss?: boolean;
  imagePrompt?: string;
  imageUrl?: string;
  imageLoading?: boolean;
  audioUrl?: string;
  audioLoading?: boolean;
  timestamp: number;
}
