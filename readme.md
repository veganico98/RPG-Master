## RPG MASTER

**Equipe:** Nicolas Linares, João Victor Olegário, Wellington Cunha

## Problema
Quem é o usuário e qual dor ele tem? (2-3 linhas)
O usuário será o jogador e nosso projeto procura proporcionar uma aventura em RPG onde cada incursão será única e guiado por uma inteligênica artificial.

## Solução
O que o sistema faz, do ponto de vista de quem usa? (3-5 linhas)
Guia a história, gera desafios e "joga os dados".

## Dados e conhecimento
De onde vêm os documentos/dados do sistema? (fictícios, públicos,
gerados por vocês) Quantos documentos, mais ou menos?
Fictícios, cada aventura procura ser única.

## Como cada técnica entra
- Prompt engineering: define as regras e o comportamento da IA como Mestre de RPG.
- Structured output: onde e com que formato? organiza a resposta da IA com o resultado do dado, evento e até 4 caminhos.
- Function calling: quais tools? permite ações como rolar o dado, atualizar vida, itens e progresso.
- RAG e/ou Agente: qual dos dois e por quê? RAG: permite que a IA consulte as regras, personagens, itens e locais do RPG. Agente: decide quais informações e ferramentas usar em cada situação. API da OpenAI: será usada para gerar a narrativa e controlar a interação com o jogador.

## Riscos e limites
O que pode dar errado? O que o sistema se recusa a fazer?
Fugir do tema, não ter fim e ficar enjoativo. Pular direto para o fim.

## Fora do escopo
O que vocês decidiram NÃO fazer (importante para caber no prazo).
Animações, front-end muito elaborado.

## Cloud (opcional)
Vão fazer a parte de AWS? Se sim, o que vai para a nuvem?
Não. Foi escolhido utilizar o localhost com docker.