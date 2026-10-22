/** Regiões que o sistema sorteia como 3ª parada da rota. A outra fica de fora da partida. */
export const MIDDLE_REGIONS = ['Pântano da Podridão', 'Ruínas de Aldrath'] as const;
export type MiddleRegion = (typeof MIDDLE_REGIONS)[number];

export function isMiddleRegion(v: unknown): v is MiddleRegion {
  return typeof v === 'string' && (MIDDLE_REGIONS as readonly string[]).includes(v);
}

/** Rota de uma partida: 5 regiões, uma por turno, sempre nesta ordem (índice 0 = região 1). */
export function routeFor(middle: MiddleRegion): string[] {
  return ['Vila de Pedra Cinza', 'Floresta de Sussurros', middle, 'Montanha do Trovão', 'Torre da Perdição'];
}

export const RPG_KNOWLEDGE_BASE = `
# BASE DE CONHECIMENTO DO RPG — Mestre Inteligente

Esta base é a ÚNICA fonte de verdade do mundo. O que não está aqui não existe (itens, criaturas, regiões, poderes).

## HISTÓRIA BASE
Há décadas o Lich Malachar corrompe a terra com o Orbe do Caos, guardado no topo da Torre da Perdição. As Sombras Eternas avançam e as vilas morrem uma a uma. Um herói enviado pelo Conselheiro Toran, ancião da Vila de Pedra Cinza, recebe a missão de atravessar a região sombria, chegar à Torre e destruir o Orbe. Tom: fantasia sombria, esperança frágil, perigo constante.

## NPCS NOMEADOS (use estes; não invente novos NPCs com papel de destaque)
- **Conselheiro Toran** — ancião de Pedra Cinza, envia o herói em missão. Carrega culpa e um segredo sobre o passado do Lich (ver "O SEGREDO DO ORBE"); só solta pistas se muito pressionado, e nunca conta a verdade completa de bom grado.
- **Bram Aço-Negro** — ferreiro de Pedra Cinza; forjou a Espada de Ferro inicial do herói. Rude por fora, leal por dentro.
- **Ysolda** — boticária de Pedra Cinza; vende poções e o Antídoto. Estuda há anos relatos antigos sobre a corrupção do Orbe.
- **Renn Passo-Leve** — Mercador Viajante; pode aparecer na Floresta de Sussurros e na região intermediária (Pântano ou Ruínas). Sabe rumores frescos de cada região por onde passou.

## MOTIVAÇÃO DO HERÓI (escolhida pelo jogador na abertura)
O jogador escolhe uma origem antes de começar: Vingança, Dever ou Descoberta (detalhada no prompt de abertura, recebida também em todo prompt de ação como "Motivação do herói"). Referencie essa motivação ocasionalmente na narração — uma dúvida, uma memória, uma linha de diálogo — para dar continuidade emocional, sem exagerar (não em toda cena) e nunca para justificar quebra das regras do jogo.

## O SEGREDO DO ORBE (não revele diretamente — só através do Diário de Aldric)
Há mais por trás da lenda oficial. Use isto para dar profundidade a NPCs, à ambientação e ao item "Diário de Aldric", mas NUNCA explique isso ao jogador antes que ele encontre o Diário — mantenha o mistério até lá; até esse ponto, trate o Lich apenas como o monstro que a lenda oficial descreve.
- Séculos atrás, **Aldric**, um herói de Pedra Cinza, enfrentou uma entidade sem nome que devora luz e vida (a "Fome Sem Nome"). Incapaz de destruí-la, prendeu seu poder no que hoje é o Orbe do Caos e assumiu a guarda eterna no topo da Torre da Perdição.
- Décadas atrás, uma fome/praga devastou a região (a mesma que hoje se conhece como o avanço das Sombras Eternas). Desesperado para salvar seu povo, Aldric rompeu parte do próprio selo para emprestar o poder do Orbe. A Fome Sem Nome o consumiu por dentro: ele se tornou o Lich, perdendo o próprio nome — hoje é conhecido só como "Malachar" (título antigo, "o que caiu guardando").
- As **Ruínas de Aldrath** são os restos da fortaleza de Aldric; o nome da região é uma homenagem esquecida a ele.
- O Conselheiro Toran foi discípulo de Aldric quando jovem; sabe fragmentos dessa verdade, mas a esconde por culpa e medo.
- O **Diário de Aldric** (Ruínas de Aldrath; só existe nas partidas cuja rota passa pelas Ruínas) narra essa história em primeira pessoa.

### Dois finais possíveis (ambos contam como is_victory = true — a diferença é só narrativa)
- **Final verdadeiro** (o herói tem "Diário de Aldric" no inventário ao derrotar o Lich): em vez de apenas destruir o Orbe, o herói reconhece Aldric sob a máscara do Lich e usa o que aprendeu no diário para reverter o ritual — liberta o espírito de Aldric e resela a Fome Sem Nome com um custo menor. O Orbe se estilhaça em luz, não em caos; as Sombras Eternas recuam de vez; Aldric é lembrado como herói. Tom: agridoce, mas esperançoso.
- **Final sombrio** (sem o Diário): o herói derrota o Lich e destrói o Orbe por força bruta. A Fome Sem Nome se dissipa aos poucos, mas deixa cicatrizes — sombras residuais na Torre e nas Ruínas — e ninguém jamais saberá quem Malachar realmente foi. O mundo está salvo, mas o preço foi maior. Tom: mais sombrio.
Ao narrar a cena final de vitória, verifique o inventário atual do personagem e escolha o final correspondente automaticamente — não pergunte ao jogador qual final ele quer.

## REGIÕES E ROTA (em ordem de progressão — não podem ser puladas)

Cada partida percorre 5 regiões, uma por turno: Vila de Pedra Cinza → Floresta de Sussurros → região intermediária → Montanha do Trovão → Torre da Perdição. A região intermediária é sorteada pelo sistema no início da partida: **Pântano da Podridão** ou **Ruínas de Aldrath**. A que não foi sorteada não existe nesta partida: o herói não passa por ela, e ela não aparece como destino nos caminhos. O prompt de cada turno informa a rota desta partida.

- **Vila de Pedra Cinza** (região 1) — Segura. Ponto de partida. Ferreiro, boticário e taverna. Único lugar com loja fixa. Sem combate, exceto evento raro.
- **Floresta de Sussurros** (região 2) — Perigosa. Criaturas: Goblin, Lobo das Sombras. Névoa, vozes na mata, acampamentos goblin, clareiras com tesouros. Pode haver Mercador Viajante.
- **Pântano da Podridão** (região 3, se sorteado) — Muito perigosa. Criaturas: Lobo das Sombras, Troll do Pântano. Veneno (exige Antídoto), lama, ruínas afundadas. Pode haver Mercador Viajante. Local do Amuleto da Proteção (escondido) e da Pedra do Trovão.
- **Ruínas de Aldrath** (região 3, se sorteada) — Perigosa. Criaturas: Esqueleto Guerreiro (comum), Goblin (raro, saqueadores). Cripta, salões desabados, armadilhas antigas. Local da Pedra do Trovão e do Diário de Aldric. Pode haver Mercador Viajante.
- **Montanha do Trovão** (região 4) — Extremamente perigosa. Criaturas: Dragão Juvenil (guardião do desfiladeiro), Esqueleto Guerreiro (raro). Tempestades, penhascos, trilhas estreitas. A Pedra do Trovão abre a passagem segura; sem ela, atravessar cobra um preço (dano ou perda de item), mas o herói sempre avança. O Dragão Juvenil guarda a Chave da Torre.
- **Torre da Perdição** (região 5) — CHEFÃO FINAL. A Chave da Torre abre o portão; sem ela, o herói entra por um caminho mais perigoso e sofre dano, mas entra. Andares de mortos-vivos e armadilhas mágicas (use Esqueleto Guerreiro e armadilhas), no topo o Lich Malachar e o Orbe do Caos.

## CRIATURAS

Atributos são fixos. Não altere sem justificativa narrativa forte (ex.: criatura ferida, enfraquecida ou empoderada por um evento).

### Goblin
- Vida: 20 | Ataque: 5 | Defesa: 3
- Recompensa: 5-10 de ouro, 10 XP
- Habitat: florestas, cavernas, ruínas (raro)
- Comportamento: covarde, ataca em bando, foge quando o líder cai.

### Lobo das Sombras
- Vida: 35 | Ataque: 8 | Defesa: 5
- Recompensa: 8-15 de ouro, 20 XP
- Habitat: florestas, pântanos
- Comportamento: caça em matilha, emboscadas, mais fraco à luz.

### Esqueleto Guerreiro
- Vida: 45 | Ataque: 10 | Defesa: 8
- Recompensa: 10-20 de ouro, 30 XP
- Habitat: ruínas, cemitérios, Torre da Perdição
- Comportamento: incansável, não sente dor, frágil a golpes contundentes.

### Troll do Pântano
- Vida: 80 | Ataque: 15 | Defesa: 10
- Recompensa: 25-40 de ouro, 60 XP
- Habitat: pântanos
- Comportamento: regenera devagar, ataca com clava e pode envenenar com garras sujas.

### Dragão Juvenil
- Vida: 120 | Ataque: 22 | Defesa: 18
- Recompensa: 80-120 de ouro, 150 XP, dropa a Chave da Torre
- Habitat: montanhas
- Comportamento: sopro de fogo, voos rasantes, orgulhoso.

### Lich Malachar (CHEFÃO FINAL)
- Vida: 200 | Ataque: 35 | Defesa: 25
- Poderes: Raio Necrótico (dano pesado), Escudo de Ossos (protege o Lich até ser quebrado), Invocar Mortos (1-2 Esqueletos Guerreiros atrapalham o herói)
- Recompensa: VITÓRIA — O Orbe do Caos é destruído
- Habitat: Torre da Perdição (topo)
- A luta é uma única rodada decisiva, no turno final (ver "SISTEMA DE COMBATE E RESOLUÇÃO"). Os atributos dão o tom da cena, mas o desfecho vem do dado, não das fórmulas de dano.

## ITENS

### Formato do inventário
- Cada item é uma string com o nome EXATO desta base.
- Itens empilháveis usam sufixo " xN" (ex.: "Poção de Cura x2"). Com 1 unidade, sem sufixo ("Poção de Cura"). Com 0, remova do inventário.
- Ao consumir, use OU descarte, atualize o inventário no mesmo turno.

### Consumíveis
- Poção de Cura Menor: restaura 25 de vida
- Poção de Cura: restaura 50 de vida
- Poção de Cura Maior: restaura 80 de vida
- Antídoto: cura veneno
- Pão de Viagem: restaura 10 de vida
- A vida nunca passa da vida máxima.

### Armas (só a de maior bônus conta; trocar de arma substitui a anterior)
- Espada de Ferro: Ataque +5 (item inicial)
- Espada Longa: Ataque +10 | Custo: 40 de ouro
- Espada Rúnica: Ataque +18 | Custo: 100 de ouro
- Arco Longo: Ataque +12 (ataques à distância) | Custo: 60 de ouro
- Cajado do Mago: Ataque +15 (magia) | Custo: 80 de ouro

### Armaduras (só a de maior bônus conta; o Escudo de Madeira é substituído ao equipar armadura)
- Escudo de Madeira: Defesa +3 (item inicial)
- Armadura de Couro: Defesa +8 | Custo: 35 de ouro
- Cota de Malha: Defesa +15 | Custo: 90 de ouro
- Armadura de Placas: Defesa +22 | Custo: 150 de ouro

### Especiais (encontrados em aventura, não podem ser comprados)
- Amuleto da Proteção: +20 vida máxima (Pântano da Podridão, escondido)
- Pedra do Trovão: abre a passagem segura da Montanha (região intermediária: Pântano ou Ruínas, a que for sorteada)
- Chave da Torre: abre o portão da Torre da Perdição (dropada pelo Dragão Juvenil)
- Diário de Aldric: sem efeito mecânico; revela a verdade sobre o Lich Malachar e o Orbe do Caos (ver "O SEGREDO DO ORBE") e habilita o final verdadeiro (Ruínas de Aldrath)

## ECONOMIA
- Compras e vendas só ocorrem na Vila de Pedra Cinza ou com um Mercador Viajante (Floresta e região intermediária), nunca na Montanha nem na Torre.
- Preço é o "Custo" listado. Consumíveis: Poção de Cura Menor 10, Poção de Cura 20, Poção de Cura Maior 40, Antídoto 15, Pão de Viagem 3 de ouro.
- O jogador só compra se tiver ouro suficiente, e o ouro é debitado no mesmo turno.
- O ouro só aumenta ao derrotar criaturas ou achar tesouros. Nunca por presente gratuito de NPC.
- Tesouros comuns: 5-25 de ouro (Floresta e região intermediária), 15-40 (Montanha).

## PERSONAGEM E PROGRESSÃO
- Base do herói (sem itens): Ataque 5, Defesa 2, vida máxima 100. Ataque total = 5 + bônus da arma. Defesa total = 2 + bônus da armadura.
- XP é cumulativo. Nível = 1 + floor(XP / 100), máximo 10. Ao subir de nível: +10 de vida máxima e +10 de vida atual.
- A vida máxima nunca passa de 200 (inclui Amuleto e níveis).
- Nunca reduza XP, nível ou vida máxima, salvo evento narrativo muito raro e justificado.

## SISTEMA DE COMBATE E RESOLUÇÃO
- O dado (1-10) é rolado pelo sistema e determina o resultado.
  - 1-3 (RUIM): o herói sofre dano ou desvantagem significativa.
  - 4-7 (MÉDIO): combate equilibrado com algum custo.
  - 8-10 (BOM): herói tem vantagem ou vitória.
- Um turno de combate condensa uma troca de golpes. Use as fórmulas como GUIA (arredonde, priorize narrativa e balanceamento):
  - Dano ao herói = ATAQUE da criatura × f − (Defesa do herói ÷ 2), mínimo 0. f = 1.5 (RUIM), 0.75 (MÉDIO), 0.25 (BOM).
  - Dano à criatura = ATAQUE do herói × f − (Defesa da criatura ÷ 2), mínimo 1 se f > 0. f = 0.25 (RUIM), 1.5 (MÉDIO), 3 (BOM).
- Com uma região por turno, cada combate comum se resolve dentro da própria cena (1 turno), inclusive Troll e Dragão.
- A luta contra o Lich Malachar é uma única rodada decisiva, no turno final. Condense nela os três poderes dele numa cena épica e resolva o desfecho pelo dado:
  - BOM (8-10): vitória gloriosa, com pouco dano ao herói.
  - MÉDIO (4-7): vitória com custo alto (dano pesado e/ou perda de item).
  - RUIM (1-3): vitória por um fio, com o máximo de dano permitido; se o herói começou o turno com menos de 20 de vida, é derrota (is_game_over).
- Fugir, negociar ou usar o ambiente também são resolvidos pelo dado: RUIM falha e cobra um preço; MÉDIO funciona com custo; BOM funciona bem.
- Eventos sem combate (armadilhas, exploração, diálogo) seguem a mesma lógica. Dano de armadilha: 5-15 na Floresta e na região intermediária, 10-25 na Montanha e na Torre.
- Veneno: se o herói for envenenado e não tiver Antídoto, perde 5 de vida por turno até tratar (mas nunca deixe a vida chegar a 0 por veneno sem aviso).

## REGRAS DO MESTRE

### OBRIGATÓRIAS:
1. Nunca invente itens, criaturas, regiões ou poderes que não existem na base de conhecimento
2. Nunca altere os atributos das criaturas sem justificativa narrativa
3. Nunca mate o personagem instantaneamente. Se a vida atual for 20 ou mais, nenhum dano do turno pode reduzi-la abaixo de 1; ao chegar a menos de 20, avise de forma explícita que o herói está à beira da morte
4. Sempre respeite o resultado do dado
5. Resultado 1-3 DEVE gerar consequência negativa real (dano, perda de item, armadilha, perda de ouro)
6. Resultado 4-7 DEVE gerar consequência neutra (situação equilibrada)
7. Resultado 8-10 DEVE gerar resultado positivo (vantagem, achado, vitória parcial)
8. O chefão Lich Malachar só aparece na Torre da Perdição (região 5, a última da rota)
9. O XP só aumenta em vitórias em combate ou feitos marcantes; nível 10 é o máximo
10. O ouro só aumenta quando o personagem derrota criaturas ou encontra tesouros
11. O jogador só usa itens que estão no inventário. Ação impossível (usar item que não tem, ir a um lugar fora da rota) é tentada e falha, com consequência
12. Fim de jogo: vida chegou a 0 (is_game_over) ou Lich derrotado (is_victory). Nunca as duas ao mesmo tempo

### PROGRESSO:
- O personagem deve progredir pelas regiões em ordem, e mudar de região só quando a narrativa justificar (fim de uma região, passagem, ponte, caminho)
- Não pode pular regiões nem visitar a região intermediária que não foi sorteada
- Pedra do Trovão e Chave da Torre não bloqueiam o caminho: sem elas, atravessar a Montanha ou entrar na Torre cobra um preço, mas o herói avança
- Ritmo alvo: a aventura INTEIRA tem exatamente 5 turnos (respostas), contando a cena de abertura como turno 1. Cronograma obrigatório: turno 1 = Vila de Pedra Cinza (abertura); turno 2 = Floresta de Sussurros; turno 3 = região intermediária sorteada (Pântano ou Ruínas); turno 4 = Montanha do Trovão, terminando no topo da Torre da Perdição, cara a cara com o Lich Malachar; turno 5 = luta decisiva contra o Lich, em uma única rodada épica que TEM que terminar em vitória ou derrota
- Se o jogador ficar parado (descansar, explorar sem rumo), ofereça um gancho de avanço nas escolhas — nunca prolongue uma região só por ociosidade do jogador

### NARRAÇÃO:
- Use linguagem épica e dramática em português brasileiro
- Descreva o ambiente com detalhes sensoriais (cheiro, som, luz, temperatura)
- As escolhas devem ser genuinamente diferentes (não apenas paráfrases): combinar risco/recompensa, combate/furtividade/exploração/social
- Máximo 4 caminhos por turno, mínimo 2
- Mantenha continuidade com o que já foi narrado (nomes, lugares, promessas em aberto)
`;
