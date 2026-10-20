/** Origem/motivação do herói, escolhida pelo jogador na tela de boas-vindas. */
export type HeroOriginId = 'vinganca' | 'dever' | 'descoberta';

export interface HeroOriginInfo {
  label: string;
  /** Frase curta exibida na tela de seleção. */
  teaser: string;
}

/**
 * As três origens selecionáveis. Só afetam a narrativa (motivação e tom das
 * cenas iniciais) — nunca os atributos mecânicos do personagem, que são
 * sempre os de `INITIAL_CHARACTER`.
 */
export const HERO_ORIGINS: Record<HeroOriginId, HeroOriginInfo> = {
  vinganca: {
    label: 'Vingança',
    teaser: 'Sua vila natal foi engolida pelas Sombras Eternas. Você segue essa estrada por dor e raiva.',
  },
  dever: {
    label: 'Dever',
    teaser: 'Treinado(a) como guarda de Pedra Cinza, você aceita a missão por juramento e responsabilidade.',
  },
  descoberta: {
    label: 'Descoberta',
    teaser: 'Aprendiz da boticária Ysolda, você busca a verdade por trás do Orbe do Caos — não só glória.',
  },
};
