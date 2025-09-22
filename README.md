# Black Counter App

## Visão Geral
O **Black Counter App** é um assistente interativo para decisões de blackjack em tempo real. Ele combina contagem de cartas Hi-Lo, probabilidade condicional e expectativa matemática (EV) para recomendar ações otimizadas a cada rodada, considerando tanto as mãos do jogador quanto as cartas vistas do dealer e de terceiros.

## Fluxo da Aplicação
1. **Configuração inicial**
   - Escolha o número de baralhos: 1, 4 ou 8.
   - Defina a aposta mínima: 5, 25, 50 ou 125.
   - Inicie a sessão tocando em **Iniciar**, avançando para a mesa de jogo.
2. **Mesa de jogo**
   - Painel superior exibe chance de vitória, aposta sugerida e ação recomendada.
   - Durante a ação do dealer, mostra apenas a chance e o aviso "Dealer jogando…".
   - Prompt de seguro aparece automaticamente quando o dealer revela um Ás, com recomendação por 3 segundos baseada no EV.
   - Contador de terceiros permite registrar cartas saídas por outros jogadores, mantendo RC, totais de cartas baixas/altas/neutras e uma cola Hi-Lo.
   - Bloco do dealer aceita marcação das cartas 1–10 e indica totais soft/hard.
   - Bloco do jogador suporta até 4 mãos (splits), mostra totais com indicações de mão soft e dobrada, inclui botões de cartas 1–10, desfazer e confirmação de dobrar.
   - Rodapé traz estatísticas completas: RC, TC, cartas restantes, probabilidade de 10, placar (V/E/D), lucro acumulado, rodadas jogadas e resumo do contador de terceiros (estado atual e da rodada anterior).
   - Botões de utilidade: **Reinício** (reset geral) e **Próxima** (nova rodada manual).

## Regras Implementadas
- Dealer para em 17 (S17).
- Split permitido até 4 vezes.
- Dobrar após split é configurável (padrão: não permitido).
- Seguro sugerido apenas quando EV positivo (geralmente Ás do dealer com alta chance de carta oculta 10).
- Penetração do baralho fixada em 60% para cálculo do TC.

## Lógica de Decisão
- **Contagem Hi-Lo**: cartas 2–6 = +1, 7–9 = 0, 10/A = −1.
- **Running Count (RC)**: saldo acumulado do Hi-Lo considerando jogador, dealer e terceiros.
- **True Count (TC)**: RC normalizado pelos baralhos restantes.
- **Distribuição de probabilidades**: ajustada dinamicamente com base em RC e cartas marcadas, com fator exponencial β para reduzir viés.
- **Motor recursivo de decisões**: avalia EV de Stand, Hit, Double e Split; recomenda Seguro quando EV > 0; executa split automático quando vantajoso; avança automaticamente ao Parar.
- **Liquidação determinística**:
  - Blackjack natural paga 3:2 (exceto mãos derivadas de split).
  - Dobro dobra a aposta e encerra após uma carta.
  - Vitória = +aposta, Empate = 0, Derrota = −aposta.

## Automatismos
- Auto-split quando EV justificar.
- Auto-parada se a ação ótima for Parar.
- Auto-avance para a próxima rodada ~3 s após o dealer completar ≥17.
- Bloqueio de ações do jogador depois que o dealer inicia sua segunda carta.

## Métricas Monitoradas
- Chance de vitória.
- Aposta sugerida baseada na expectativa atual do baralho.
- RC/TC e cartas restantes.
- Probabilidade de carta 10 (para seguro).
- Placar: vitórias, empates, derrotas, lucro acumulado e rodadas jogadas.
- Resumo do contador de terceiros: estado atual e último estado (RC · L · H · N).

## Quick Tests Internos
- `hiLoValue(2) = +1`
- `hiLoValue(7) = 0`
- `hiLoValue(10) = -1`
- `A + 10 = 21` (soft)

Use estes testes para garantir que a lógica fundamental de contagem e avaliação de mão permanece correta durante o desenvolvimento.
