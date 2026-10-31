# Como criar uma identidade própria, "de jogo de verdade"
2026-10-31. Resposta à pergunta do proprietário. O rascunho `identidade-visual-v0.md` (ouro + eco) **fica em revisão**: foi um ponto de partida, não uma decisão. O que já foi decidido: tom "luminoso com mistério" e visual inteiro isométrico (ADR 0007).

## 1. O que faz um jogo parecer "de verdade"
Quase nunca é uma tela bonita isolada. É **coerência**: tudo (herói, monstro, chão, interface, efeito, som, fonte) parece feito pela mesma mão, e uma pessoa reconhece o jogo numa captura de 1 segundo. Jogos grandes têm: (1) **uma silhueta marcante** nos personagens, (2) **uma paleta controlada**, (3) **uma interface com personalidade** (molduras, ícones e fonte próprias, não emojis), (4) **uma luz e uma atmosfera constantes**, (5) **um motivo gráfico repetido** (formas, símbolos).

## 2. Método (6 passos, cada um com sua aprovação)
1. **Referências (a sua parte).** Você escolhe 3 a 6 jogos/artes de que gosta (de verdade, pelo visual). Eu analiso **o que** neles funciona (silhueta, cor, UI, luz) para extrair princípios — sem copiar nenhum.
2. **Três pilares.** Três palavras que decidem qualquer dúvida de arte (ex.: *luminoso, misterioso, artesanal*). Já temos o tom; faltam os pilares finais.
3. **Uma cena-chave ("key art").** Uma única tela-modelo pronta (ex.: Vila de Lúmen com heróis, monstros, interface e atmosfera). Tudo o mais é derivado dela. É aqui que a identidade nasce; é o item mais caro e o que mais pesa.
4. **Guia de estilo extraído da cena aprovada** (paleta, formas, contornos, luz, fonte, ícones, regras de uso).
5. **Produção em série** no pipeline que já existe (conceito → 3D → atlas) para monstros, NPCs, cenário e interface.
6. **Revisões por fase** (B1–B5), sempre comparando com a cena-chave.

## 2.1 O que eu faço e o que depende de ferramenta/pessoa
| Parte | Eu consigo | Precisa de fora |
|---|---|---|
| Código: interface (CSS), atmosfera, efeitos, câmera, pipeline de personagens | **Sim** | — |
| Guia de estilo, análise de referências, organização das fases | **Sim** | suas referências |
| **Ilustração de alta qualidade** (ícones, molduras desenhadas, cenário, key art) | **Não por conta própria**: não desenho arte fina só com código (e você pediu que personagens não sejam formas geométricas) | um **gerador de imagem** (o Meshy Free já esgotou; precisaria de plano, ou de outra ferramenta com chave de API), **ou um artista** |
| Conjunto de ícones próprio | Posso montar o sistema (tamanhos, estados, brilho) | a arte dos ícones (IA ou artista) |
Realidade: a identidade "de jogo de verdade" depende de **arte feita por alguém/algo capaz de ilustrar**. Eu garanto que ela entre no jogo de forma coerente.

## 3. O que já mudou hoje (no laboratório, não no jogo)
- **Removi a luz "de sol"** (os feixes que acompanhavam a tela, vindos de cima). A atmosfera ficou com névoa baixa, sombras e véu violeta.
- **Nova barra de habilidades** (protótipo): medalhões metálicos com aro dourado, joia com a tecla na cor da classe, recarga em anel com número, brilho e pulso quando a skill fica pronta, base ornamentada. **Os ícones ainda são emojis** (provisórios): é exatamente o ponto em que falta arte própria.

## 4. Decisões que preciso de você
1. **Referências:** quais jogos (ou artes) você quer que o nosso lembre? Ex.: Summoners War (você citou), e mais 2–4.
2. **Assinatura:** manter ouro + eco, ou procurar outra? (depende das referências).
3. **Arte fina:** como produzimos ícones, molduras e cenário — plano pago de um gerador de imagem, outra ferramenta, ou artista?
4. **Quão grande é a ambição:** polir uma **cena-chave** primeiro (recomendado) ou já produzir tudo?
