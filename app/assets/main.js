// Configurações fixas da mesa para manter todas as regras em um só lugar.
const RULES = {
  dealerStandsOn17: true,
  doubleAfterSplit: false,
  maxSplits: 4,
  penetration: 0.6,
};

// Valores padrão expostos na tela inicial.
const DEFAULT_DECK_OPTIONS = [1, 4, 8];
const DEFAULT_BET_OPTIONS = [5, 25, 50, 125];

// Base de cartas por baralho — usada em todas as projeções.
const initialPerDeck = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 16 };

// Temporizadores centralizados para mensagens, avanço automático e acerto da rodada.
const timers = {
  insurance: null,
  autoAdvance: null,
  settle: null,
};

// Utilitário centralizado para evitar disparos atrasados após resets.
function clearAllTimers() {
  for (const key of Object.keys(timers)) {
    if (timers[key]) {
      clearTimeout(timers[key]);
      timers[key] = null;
    }
  }
}

// Estado global inicializado com todas as variáveis controladas pela UI.
const state = createInitialState();

// Controle de escala responsiva para manter o app sempre visível sem barras.
let scaleUpdateId = null;

// Limites e ajustes usados pela escala automática para caber em qualquer janela.
const SCALE_CONSTRAINTS = {
  minScale: 0.16,
  minDensity: 0.18,
  densityBoost: 1.08,
  overscan: 0.985,
};

function scheduleScaleUpdate() {
  if (scaleUpdateId !== null) return;
  scaleUpdateId = requestAnimationFrame(() => {
    scaleUpdateId = null;
    applyResponsiveScale();
  });
}

function applyResponsiveScale() {
  const rootElement = document.documentElement;
  const appElement = document.getElementById('app');
  if (!rootElement || !appElement) return;
  const stage = appElement.querySelector('.app-stage');
  if (!stage) return;

  rootElement.style.setProperty('--layout-scale', '1');
  rootElement.style.setProperty('--density-factor', '1');
  stage.classList.remove('is-condensed');

  const availableWidth = Math.max(appElement.clientWidth, 1);
  const availableHeight = Math.max(appElement.clientHeight, 1);
  const naturalWidth = Math.max(stage.scrollWidth, 1);
  const naturalHeight = Math.max(stage.scrollHeight, 1);

  const rawScale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
  const needsShrink = rawScale < 0.999;
  let scale = rawScale;
  if (needsShrink) scale = rawScale * SCALE_CONSTRAINTS.overscan;
  scale = Math.max(SCALE_CONSTRAINTS.minScale, Math.min(1, scale));

  // A densidade segue a escala com leve reforço para manter legibilidade.
  const density = Math.max(
    SCALE_CONSTRAINTS.minDensity,
    Math.min(1, scale * SCALE_CONSTRAINTS.densityBoost),
  );

  rootElement.style.setProperty('--layout-scale', scale.toFixed(3));
  rootElement.style.setProperty('--density-factor', density.toFixed(3));
  if (scale < 0.999) stage.classList.add('is-condensed');

  // Checagem final: se mesmo assim houver sobra, corrigimos com base no retângulo renderizado.
  const bounds = stage.getBoundingClientRect();
  const overflowWidth = bounds.width - availableWidth;
  const overflowHeight = bounds.height - availableHeight;
  if ((overflowWidth > 0.5 || overflowHeight > 0.5) && scale > SCALE_CONSTRAINTS.minScale) {
    const correction = Math.min(
      1,
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
    );
    const correctedScale = Math.max(
      SCALE_CONSTRAINTS.minScale,
      Math.min(1, scale * correction * SCALE_CONSTRAINTS.overscan),
    );
    if (correctedScale < scale - 0.001) {
      const correctedDensity = Math.max(
        SCALE_CONSTRAINTS.minDensity,
        Math.min(1, correctedScale * SCALE_CONSTRAINTS.densityBoost),
      );
      rootElement.style.setProperty('--layout-scale', correctedScale.toFixed(3));
      rootElement.style.setProperty('--density-factor', correctedDensity.toFixed(3));
      if (correctedScale < 0.999) stage.classList.add('is-condensed');
      scale = correctedScale;
    }
  }
}

// Monta o estado padrão de uma nova sessão.
function createInitialState() {
  // Etapa 1: declarar todas as fatias necessárias para renderização e lógica.
  return {
    screen: 'intro',
    decks: 1,
    minBet: 5,
    runningCount: 0,
    seenCounts: Array(11).fill(0),
    dealerCards: [],
    hands: [[]],
    activeHand: 0,
    playersDone: false,
    doubleMode: false,
    doubleLocked: false,
    pendingSplit: false,
    others: { rc: 0, lo: 0, hi: 0, zero: 0, last: { rc: 0, lo: 0, hi: 0, zero: 0 } },
    bets: [0],
    doubledFlags: [false],
    splitFlags: [false],
    history: [],
    netProfit: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    rounds: 0,
    roundInitialized: false,
    roundScored: false,
    showInsurancePrompt: false,
    insuranceText: '',
  };
}

// Conversão Hi-Lo do valor da carta para manter o contador em tempo real.
function hiLoValue(v) {
  if (v === 1 || v === 10) return -1;
  if (v >= 2 && v <= 6) return 1;
  return 0;
}

// Normaliza as figuras em 10 para simplificar comparações.
function normRank(v) {
  return v >= 10 ? 10 : v;
}

// Calcula total e flag soft de uma mão dada.
function handTotal(cards) {
  let sum = 0;
  let aces = 0;
  // Etapa 1: somar valores tratando Ás como 11 inicialmente.
  for (const v of cards) {
    if (v === 1) { sum += 11; aces++; }
    else if (v >= 10) { sum += 10; }
    else { sum += v; }
  }
  // Etapa 2: reduzir Ás até evitar estouro.
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return { total: sum, soft: aces > 0 && sum <= 21 };
}

// Cria a matriz de cartas disponíveis multiplicando pelo número de baralhos.
function computeInitialCounts(decks) {
  const counts = Array(11).fill(0);
  for (let v = 1; v <= 10; v++) counts[v] = initialPerDeck[v] * decks;
  return counts;
}

// Subtrai as cartas vistas pelo jogador para obter o restante bruto.
function computeRemainingCounts(initialCounts, seenCounts) {
  const rem = Array(11).fill(0);
  for (let v = 1; v <= 10; v++) {
    rem[v] = Math.max(initialCounts[v] - (seenCounts[v] || 0), 0);
  }
  return rem;
}

// Ajusta a composição removendo cartas de terceiros e calculando a penetração.
function computeTiltedCounts(baseCounts, others) {
  // Etapa 1: clonar o vetor base para evitar mutações externas.
  const counts = baseCounts.slice();

  // Etapa 2: remover cartas por faixa proporcionalmente.
  const removeFromRange = (range, qty) => {
    if (qty <= 0) return 0;
    const available = range.reduce((acc, rank) => acc + counts[rank], 0);
    if (available <= 0) return 0;
    const toRemove = Math.min(qty, available);
    const fallbackShare = 1 / range.length;
    for (const rank of range) {
      const share = counts[rank] / available || fallbackShare;
      const delta = toRemove * share;
      counts[rank] = Math.max(0, counts[rank] - delta);
    }
    return toRemove;
  };

  const removedLow = removeFromRange([2, 3, 4, 5, 6], others.lo);
  const removedHigh = removeFromRange([1, 10], others.hi);
  const removedNeutral = removeFromRange([7, 8, 9], others.zero);
  const removedByOthers = removedLow + removedHigh + removedNeutral;

  // Etapa 3: consolidar métricas finais considerando o corte de 60%.
  const totalRemaining = counts.reduce((a, b) => a + b, 0);
  const seenPersonal = state.seenCounts.reduce((a, b) => a + b, 0);
  const totalCards = state.decks * 52;
  const cutLimit = Math.max(0, Math.round(totalCards * RULES.penetration));
  const seenTotal = Math.min(totalCards, seenPersonal + removedByOthers);
  const cardsAboveCut = Math.max(0, cutLimit - seenTotal);
  const cardsBehindCut = Math.max(0, totalRemaining - cardsAboveCut);
  const liveDecks = totalRemaining / 52; // Usa o baralho inteiro para seguir operando após o corte.
  const decksForTC = Math.max(liveDecks, 0.25);
  const penetration = totalCards > 0 ? seenTotal / totalCards : 0;

  return {
    counts,
    decksForTC,
    totalRemaining,
    removedByOthers,
    cardsAboveCut,
    cardsBehindCut,
    penetration,
    cutLimit,
    seenTotal,
  };
}

// Calcula a distribuição de probabilidade de cada carta restante.
function computePMF(tiltedCounts, totalRemaining) {
  const pmf = {};
  const denom = Math.max(totalRemaining, 1);
  for (let v = 1; v <= 10; v++) pmf[v] = Math.max(tiltedCounts[v], 0) / denom;
  return pmf;
}

// Calcula EV, chance de vitória e empate caso o jogador pare.
function resolveStand(dealerDist, playerTotal) {
  if (playerTotal > 21) return { ev: -1, pWin: 0, pTie: 0 };
  let pWin = dealerDist.bust || 0;
  let pTie = 0;
  // Etapa única: percorrer totais possíveis do dealer comparando com o jogador.
  for (const key of Object.keys(dealerDist)) {
    if (key === 'bust') continue;
    const dt = parseInt(key, 10);
    if (playerTotal > dt) pWin += dealerDist[key];
    else if (playerTotal === dt) pTie += dealerDist[key];
  }
  const pLose = Math.max(0, 1 - pWin - pTie);
  const ev = pWin * 1 + pTie * 0 - pLose * 1;
  return { ev, pWin, pTie };
}

// Expande a jogada do dealer considerando TODAS as cartas restantes.
function buildDealerDistribution(pmf, dealerCards) {
  const total = handTotal(dealerCards);
  const memo = new Map();
  const stop = RULES.dealerStandsOn17 ? 17 : 18;

  const step = (t, soft) => {
    if (t >= stop) {
      if (t > 21) return { bust: 1 };
      return { [t]: 1 };
    }
    const key = `${t}|${soft ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);
    let out = {};
    for (let v = 1; v <= 10; v++) {
      const p = pmf[v];
      if (p <= 0) continue;
      let nt = t;
      let ns = soft;
      if (v === 1) {
        if (t + 11 <= 21) { nt = t + 11; ns = true; }
        else { nt = t + 1; }
      } else {
        nt = t + (v >= 10 ? 10 : v);
      }
      if (nt > 21 && ns) {
        nt -= 10;
        ns = false;
      }
      const branch = step(nt, ns);
      for (const k of Object.keys(branch)) {
        out[k] = (out[k] || 0) + branch[k] * p;
      }
    }
    memo.set(key, out);
    return out;
  };

  const raw = step(total.total, total.soft);
  let sum = 0;
  for (const k of Object.keys(raw)) sum += raw[k];
  const normalized = {};
  for (const k of Object.keys(raw)) normalized[k] = raw[k] / (sum || 1);
  return normalized;
}

// Avalia todas as ações possíveis para uma mão (parar, comprar, dobrar).
function bestFromState({ pmf, dealerDist, allowDouble, playerTotal, playerSoft, cardsCount }) {
  if (playerTotal > 21) return { action: 'BUST', ev: -1, pWin: 0, pTie: 0 };

  const stand = resolveStand(dealerDist, playerTotal);

  const MAX_DEPTH = 8;
  const hitRec = (total, soft, depth) => {
    if (total > 21) return { ev: -1, pWin: 0, pTie: 0 };
    if (depth >= MAX_DEPTH) return resolveStand(dealerDist, total);
    const standNow = resolveStand(dealerDist, total);
    let sum = { ev: 0, pWin: 0, pTie: 0 };
    for (let v = 1; v <= 10; v++) {
      const p = pmf[v];
      if (p <= 0) continue;
      let nt = total;
      let ns = soft;
      if (v === 1) {
        if (total + 11 <= 21) { nt = total + 11; ns = true; }
        else { nt = total + 1; }
      } else {
        nt = total + (v >= 10 ? 10 : v);
      }
      if (nt > 21 && ns) {
        nt -= 10;
        ns = false;
      }
      const res = hitRec(nt, ns, depth + 1);
      sum.ev += p * res.ev;
      sum.pWin += p * res.pWin;
      sum.pTie += p * res.pTie;
    }
    return sum.ev > standNow.ev ? sum : standNow;
  };

  const hit = hitRec(playerTotal, playerSoft, 0);

  let double = { ev: -Infinity, pWin: 0, pTie: 0 };
  if (allowDouble && cardsCount === 2) {
    let agg = { ev: 0, pWin: 0, pTie: 0 };
    for (let v = 1; v <= 10; v++) {
      const p = pmf[v];
      if (p <= 0) continue;
      let nt = playerTotal;
      let ns = playerSoft;
      if (v === 1) {
        if (playerTotal + 11 <= 21) { nt = playerTotal + 11; ns = true; }
        else { nt = playerTotal + 1; }
      } else {
        nt = playerTotal + (v >= 10 ? 10 : v);
      }
      if (nt > 21 && ns) {
        nt -= 10;
        ns = false;
      }
      const standOnce = resolveStand(dealerDist, nt);
      agg.ev += p * (2 * standOnce.ev);
      agg.pWin += p * standOnce.pWin;
      agg.pTie += p * standOnce.pTie;
    }
    double = agg;
  }

  const options = [
    { name: 'PARAR', ...stand },
    { name: 'COMPRAR', ...hit },
  ];
  if (double.ev !== -Infinity) options.push({ name: 'DOBRAR', ...double });
  options.sort((a, b) => b.ev - a.ev);
  const best = options[0];
  return { action: best.name, ev: best.ev, pWin: best.pWin, pTie: best.pTie };
}

// Trata o cenário de separação recursiva respeitando o número máximo permitido.
function evalSplit({ pmf, dealerDist, rank, splitCount }) {
  const canResplit = splitCount < RULES.maxSplits;
  let perHandEV = 0;
  for (let v = 1; v <= 10; v++) {
    const p = pmf[v];
    if (p <= 0) continue;
    if (canResplit && normRank(v) === rank) {
      perHandEV += p * (evalSplit({ pmf, dealerDist, rank, splitCount: splitCount + 1 }) / 2);
    } else {
      const cards = [rank, v];
      const total = handTotal(cards);
      const res = bestFromState({
        pmf,
        dealerDist,
        allowDouble: RULES.doubleAfterSplit,
        playerTotal: total.total,
        playerSoft: total.soft,
        cardsCount: 2,
      });
      perHandEV += p * res.ev;
    }
  }
  return 2 * perHandEV;
}

// Reúne todos os derivados necessários para renderização e decisões.
function computeDerived() {
  const initialCounts = computeInitialCounts(state.decks);
  const remaining = computeRemainingCounts(initialCounts, state.seenCounts);
  const tilted = computeTiltedCounts(remaining, state.others);
  const pmf = computePMF(tilted.counts, tilted.totalRemaining);
  const decksForTC = tilted.decksForTC > 0 ? tilted.decksForTC : 0.25;
  const trueCount = state.runningCount / decksForTC;
  const dealerCards = state.dealerCards;
  const hasDealerCard = dealerCards.length > 0;
  const dealerDist = hasDealerCard ? buildDealerDistribution(pmf, dealerCards) : null;
  const handSummaries = state.hands.map((hand) => handTotal(hand));
  const activeHand = state.hands[state.activeHand] || [];
  const activeTotal = handSummaries[state.activeHand] || handTotal(activeHand);
  const allowDouble = state.hands.length > 1 ? RULES.doubleAfterSplit : true;
  const needsDealerCard = !hasDealerCard && state.hands.some((hand) => hand.length >= 2);
  const lockPlayerActions = needsDealerCard && !state.playersDone;
  let best = { action: null, ev: 0, pWin: 0, pTie: 0 };
  if (activeHand.length > 0 && dealerDist) {
    if (activeHand.length === 2 && normRank(activeHand[0]) === normRank(activeHand[1])) {
      const rank = normRank(activeHand[0]);
      const noSplit = bestFromState({
        pmf,
        dealerDist,
        allowDouble: true,
        playerTotal: activeTotal.total,
        playerSoft: activeTotal.soft,
        cardsCount: 2,
      });
      const splitEV = evalSplit({ pmf, dealerDist, rank, splitCount: 1 });
      if (splitEV > noSplit.ev && state.hands.length < RULES.maxSplits) {
        best = { action: 'SEPARAR', ev: splitEV, pWin: noSplit.pWin, pTie: noSplit.pTie };
      } else {
        best = noSplit;
      }
    } else {
      best = bestFromState({
        pmf,
        dealerDist,
        allowDouble,
        playerTotal: activeTotal.total,
        playerSoft: activeTotal.soft,
        cardsCount: activeHand.length,
      });
    }
  }

  const dealerUp = state.dealerCards[0] || 0;
  let insurance = { suggest: false, edge: 0, pTen: 0 };
  if (hasDealerCard && dealerUp === 1) {
    const pTen = pmf[10] || 0;
    const ev = 1.5 * pTen - 0.5;
    insurance = { suggest: ev > 0, edge: ev, pTen };
  }

  const preRound = state.dealerCards.length === 0 && state.hands.every((h) => h.length === 0);
  const baseEdge = -0.005;
  const delta10 = (pmf[10] || 0) - (16 / 52);
  const deltaA = (pmf[1] || 0) - (4 / 52);
  const tcTerm = 0.0045 * trueCount;
  const compTerm = 0.6 * delta10 + 0.3 * deltaA;
  const preEdge = Math.max(-0.08, Math.min(0.08, baseEdge + tcTerm + compTerm));
  const preWinPct = 0.5 + preEdge / 2;
  const suggestedBet = preEdge < -0.02 ? 0 : state.minBet;

  const handsWinPct = handSummaries.length === 0 ? 0 : handSummaries
    .map((summary) => dealerDist ? Math.max(0, Math.min(1, resolveStand(dealerDist, summary.total).pWin)) : 0)
    .reduce((a, b) => a + b, 0) / Math.max(handSummaries.length, 1);

  return {
    initialCounts,
    remaining,
    tilted,
    pmf,
    trueCount,
    dealerDist,
    handSummaries,
    activeHand,
    activeTotal,
    best,
    insurance,
    preRound,
    preWinPct,
    suggestedBet,
    handsWinPct,
    needsDealerCard,
    lockPlayerActions,
  };
}

// Mantém histórico limitado para operações de desfazer.
function pushHistory(entry) {
  state.history.push(entry);
  if (state.history.length > 500) state.history.shift();
}

// Registra cartas tanto do jogador quanto do dealer, respeitando dobrar e corte.
function addCard(dest, value) {
  if (dest === 'hand') {
    const idx = state.activeHand;
    const currentHand = state.hands[idx] || [];
    if (state.doubledFlags[idx] && currentHand.length >= 3) {
      return;
    }
    if (state.doubleMode) {
      if (state.doubleLocked) return;
      state.doubleLocked = true;
    }
  }

  state.runningCount += hiLoValue(value);
  state.seenCounts[value] = (state.seenCounts[value] || 0) + 1;

  if (dest === 'dealer') {
    state.dealerCards.push(value);
    if (state.dealerCards.length >= 2) state.playersDone = true;
    pushHistory({ type: 'card', dest: 'dealer', value });
    finalizeUpdate();
    return;
  }

  if (!state.roundInitialized) {
    state.roundInitialized = true;
    state.bets = [state.minBet];
    state.doubledFlags = [false];
    state.splitFlags = [false];
  }

  const idx = state.activeHand;
  state.hands[idx] = [...state.hands[idx], value];
  pushHistory({ type: 'card', dest: 'hand', handIndex: idx, value });
  finalizeUpdate();
}

// Ajuste rápido do contador informado por terceiros (+1/-1 no Hi-Lo).
function adjustOthersRC(delta) {
  state.others.rc += delta;
  state.runningCount += delta;
  if (delta > 0) state.others.lo += 1;
  if (delta < 0) state.others.hi += 1;
  pushHistory({ type: 'othersRC', delta });
  finalizeUpdate();
}

// Registra cartas neutras (7-9) anunciadas por terceiros.
function adjustOthersZero(delta) {
  const next = Math.max(0, state.others.zero + delta);
  const applied = next - state.others.zero;
  state.others.zero = next;
  pushHistory({ type: 'othersZero', delta: applied });
  finalizeUpdate();
}

// Desfaz a última operação atualizando contadores e histórico.
function undoLast() {
  const last = state.history.pop();
  if (!last) return;
  if (last.type === 'card') {
    state.runningCount -= hiLoValue(last.value);
    state.seenCounts[last.value] = Math.max(0, (state.seenCounts[last.value] || 0) - 1);
    if (last.dest === 'dealer') {
      state.dealerCards.pop();
      if (state.dealerCards.length < 2) state.playersDone = false;
    } else {
      const idx = last.handIndex ?? state.activeHand;
      state.hands[idx] = state.hands[idx].slice(0, -1);
      state.activeHand = idx;
      if (state.hands[idx].length <= 2) state.doubledFlags[idx] = false;
      state.doubleMode = false;
      state.doubleLocked = false;
    }
  } else if (last.type === 'othersRC') {
    state.others.rc -= last.delta;
    state.runningCount -= last.delta;
    if (last.delta > 0) state.others.lo = Math.max(0, state.others.lo - 1);
    if (last.delta < 0) state.others.hi = Math.max(0, state.others.hi - 1);
  } else if (last.type === 'othersZero') {
    state.others.zero = Math.max(0, state.others.zero - last.delta);
  }
  state.pendingSplit = false;
  finalizeUpdate();
}

// Troca de sapata: limpa apenas cartas mantendo configurações e placar.
function swapDeck() {
  clearAllTimers();
  const keep = {
    decks: state.decks,
    minBet: state.minBet,
    netProfit: state.netProfit,
    wins: state.wins,
    ties: state.ties,
    losses: state.losses,
    rounds: state.rounds,
  };
  Object.assign(state, createInitialState(), keep);
  state.screen = 'table';
  state.history = [];
  finalizeUpdate();
}

// Reinício total: zera placar, históricos e prepara nova sessão.
function resetSession() {
  clearAllTimers();
  const keep = { decks: state.decks, minBet: state.minBet };
  Object.assign(state, createInitialState(), keep);
  state.screen = 'table';
  state.history = [];
  finalizeUpdate();
}

// Avança para a próxima rodada preservando o histórico do round anterior.
function nextRound() {
  state.others.last = { rc: state.others.rc, lo: state.others.lo, hi: state.others.hi, zero: state.others.zero };
  state.rounds += 1;
  state.dealerCards = [];
  state.hands = [[]];
  state.activeHand = 0;
  state.playersDone = false;
  state.doubleMode = false;
  state.doubleLocked = false;
  state.pendingSplit = false;
  state.bets = [0];
  state.doubledFlags = [false];
  state.splitFlags = [false];
  state.others.rc = 0;
  state.others.lo = 0;
  state.others.hi = 0;
  state.others.zero = 0;
  state.roundInitialized = false;
  state.roundScored = false;
  state.history = [];
  finalizeUpdate();
}

// Calcula resultados e atualiza placares quando o dealer termina.
function settleRound() {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  let profit = 0;
  const dealerTotal = handTotal(state.dealerCards).total;
  const dealerBJ = state.dealerCards.length === 2 && dealerTotal === 21;

  state.hands.forEach((cards, i) => {
    const total = handTotal(cards).total;
    const bet = state.bets[i] || state.minBet;
    const doubled = !!state.doubledFlags[i];
    const fromSplit = !!state.splitFlags[i];
    const isBJ = cards.length === 2 && total === 21 && !fromSplit;
    const stake = bet * (doubled ? 2 : 1);
    let result = 'T';
    let delta = 0;
    if (total > 21) { result = 'L'; delta -= stake; }
    else if (dealerBJ && !isBJ) { result = 'L'; delta -= stake; }
    else if (isBJ && !dealerBJ) { result = 'W'; delta += bet * 1.5; }
    else if (dealerTotal > 21) { result = 'W'; delta += stake; }
    else if (total > dealerTotal) { result = 'W'; delta += stake; }
    else if (total < dealerTotal) { result = 'L'; delta -= stake; }
    if (result === 'W') wins += 1; else if (result === 'T') ties += 1; else losses += 1;
    profit += delta;
  });

  state.wins += wins;
  state.ties += ties;
  state.losses += losses;
  state.netProfit = Number((state.netProfit + profit).toFixed(2));
  state.roundScored = true;
  finalizeUpdate();
}

// Liga/desliga o modo de dobrar mantendo o bloqueio coerente.
function toggleDoubleMode() {
  const next = !state.doubleMode;
  state.doubleMode = next;
  state.doubleLocked = false;
  finalizeUpdate();
}

// Permite alternar mãos durante splits sem carregar estados anteriores.
function changeActiveHand(index) {
  state.activeHand = index;
  state.doubleMode = false;
  state.doubleLocked = false;
  state.pendingSplit = false;
  finalizeUpdate();
}

// Agenda avisos contextuais (seguro, avanço automático, encerramento).
function schedulePrompts(derived) {
  if (state.dealerCards.length === 1 && state.dealerCards[0] === 1) {
    state.showInsurancePrompt = true;
    state.insuranceText = derived.insurance.suggest ? 'COMPRE SEGURO (+EV)' : 'NÃO COMPRE SEGURO';
    if (timers.insurance) clearTimeout(timers.insurance);
    timers.insurance = setTimeout(() => {
      state.showInsurancePrompt = false;
      timers.insurance = null;
      render();
    }, 3000);
  } else if (state.showInsurancePrompt) {
    state.showInsurancePrompt = false;
    if (timers.insurance) {
      clearTimeout(timers.insurance);
      timers.insurance = null;
    }
  }

  const canAutoAdvanceHand = !state.playersDone
    && derived.best.action === 'PARAR'
    && state.hands[state.activeHand].length > 0
    && (state.activeHand + 1 < state.hands.length);

  if (canAutoAdvanceHand) {
    if (timers.autoAdvance) clearTimeout(timers.autoAdvance);
    timers.autoAdvance = setTimeout(() => {
      state.activeHand += 1;
      finalizeUpdate();
    }, 150);
  } else if (timers.autoAdvance) {
    clearTimeout(timers.autoAdvance);
    timers.autoAdvance = null;
  }

  if (!state.roundScored && state.playersDone && state.dealerCards.length >= 2) {
    const dealerTotal = handTotal(state.dealerCards).total;
    if (dealerTotal >= 17) {
      if (timers.settle) clearTimeout(timers.settle);
      timers.settle = setTimeout(() => {
        settleRound();
        setTimeout(() => nextRound(), 3000);
      }, 400);
    }
  } else if (timers.settle) {
    clearTimeout(timers.settle);
    timers.settle = null;
  }
}

// Confirma e executa a separação quando o usuário autoriza.
function commitSplitRequest() {
  if (!state.pendingSplit) return false;
  state.pendingSplit = false;
  if (state.dealerCards.length === 0) return false;
  const activeHand = state.hands[state.activeHand] || [];
  if (activeHand.length !== 2) return false;
  if (normRank(activeHand[0]) !== normRank(activeHand[1])) return false;
  if (state.hands.length >= RULES.maxSplits) return false;
  const [c1, c2] = activeHand;
  const bet = state.bets[state.activeHand] || state.minBet;
  state.hands.splice(state.activeHand, 1, [c1], [c2]);
  state.bets.splice(state.activeHand, 1, bet, bet);
  state.doubledFlags.splice(state.activeHand, 1, false, false);
  state.splitFlags.splice(state.activeHand, 1, true, true);
  state.doubleMode = false;
  state.doubleLocked = false;
  return true;
}

// Dispara o pedido de split garantindo apenas um clique necessário.
function requestSplit() {
  if (state.pendingSplit) return;
  if (state.dealerCards.length === 0) return;
  state.pendingSplit = true;
  finalizeUpdate();
}

// Consolida a dobra após a 3ª carta e avança para a próxima mão, se existir.
function handleDoubleCompletion() {
  if (!state.doubleMode) return false;
  const active = state.hands[state.activeHand] || [];
  if (active.length < 3) return false;
  state.doubledFlags[state.activeHand] = true;
  state.doubleMode = false;
  state.doubleLocked = false;
  if (state.activeHand + 1 < state.hands.length) {
    state.activeHand += 1;
  }
  return true;
}

// Fecha um ciclo de atualização: recalcula derivados, trata split/dobra e renderiza.
function finalizeUpdate() {
  const splitChanged = commitSplitRequest();
  const doubleChanged = handleDoubleCompletion();
  const derived = computeDerived();
  if (doubleChanged || splitChanged) {
    finalizeUpdate();
    return;
  }
  schedulePrompts(derived);
  render(derived);
}

// Renderiza a tela adequada (intro ou mesa) com os eventos vinculados.
function render(derived = computeDerived()) {
  const root = document.getElementById('app');
  if (!root) return;

  if (state.screen === 'intro') {
    root.innerHTML = renderIntro();
    scheduleScaleUpdate();
    bindIntroEvents();
    return;
  }

  root.innerHTML = renderTable(derived);
  scheduleScaleUpdate();
  bindTableEvents(derived);
}

// Componente da tela inicial com seleção de baralhos e aposta mínima.
function renderIntro() {
  const deckBtns = DEFAULT_DECK_OPTIONS.map((n) => `
    <button class="chip ${state.decks === n ? 'chip-active' : ''}" data-decks="${n}">${n}</button>
  `).join('');
  const betBtns = DEFAULT_BET_OPTIONS.map((v) => `
    <button class="chip ${state.minBet === v ? 'chip-active' : ''}" data-minbet="${v}">${v}</button>
  `).join('');
  return `
    <div class="app-stage app-stage--intro">
      <section class="intro">
        <h1>Black Counter</h1>
        <div>
          <h2>Baralhos</h2>
          <div class="chip-row">${deckBtns}</div>
        </div>
        <div>
          <h2>Aposta mínima</h2>
          <div class="chip-row">${betBtns}</div>
        </div>
        <button class="primary" id="start-btn">Iniciar</button>
      </section>
    </div>
  `;
}

// Componente principal da mesa agregando métricas, ações e histórico.
function renderTable(derived) {
  const {
    activeTotal,
    best,
    activeHand,
    handSummaries,
    insurance,
    preRound,
    preWinPct,
    suggestedBet,
    trueCount,
    tilted,
    needsDealerCard,
    lockPlayerActions,
  } = derived;
  const totalRemaining = Math.round(tilted.totalRemaining);
  const playableCards = Math.max(0, Math.round(tilted.cardsAboveCut));
  const postCutCards = Math.max(0, Math.round(tilted.cardsBehindCut));
  const decksForTC = tilted.decksForTC.toFixed(2);
  const penetrationPct = Math.round((tilted.penetration || 0) * 100);
  const cutTarget = Math.round(tilted.cutLimit || 0);
  const seenTotal = Math.round(tilted.seenTotal || 0);
  const removedByOthers = Math.round(tilted.removedByOthers || 0);

  let headerHTML = '';
  if (needsDealerCard) {
    headerHTML = `
      <div class="header-card">
        <div>Informe a carta do dealer para liberar as decisões.</div>
      </div>`;
  } else if (preRound) {
    headerHTML = `
      <div class="header-card">
        <div>Chance: <strong>${Math.round(preWinPct * 100)}%</strong></div>
        <div>Aposta sugerida: <strong>${suggestedBet}</strong></div>
      </div>`;
  } else if (!state.playersDone) {
    headerHTML = `
      <div class="header-card">
        <div>Chance: <strong>${Math.round((best.pWin || 0) * 100)}%</strong></div>
        <div>Ação: <strong>${state.doubleMode ? 'DOBRAR (1 carta)' : (best.action || '—')}</strong></div>
      </div>`;
  } else {
    headerHTML = `
      <div class="header-card">
        <div>Chance média: <strong>${Math.round((derived.handsWinPct || 0) * 100)}%</strong></div>
        <div>Dealer jogando…</div>
      </div>`;
  }

  const handsList = state.hands.map((cards, i) => `
    <div class="hand-chip ${i === state.activeHand ? 'hand-active' : ''}" data-hand="${i}">
      M${i + 1}: ${handSummaries[i].total}${handSummaries[i].soft ? 's' : ''} [${cards.map((v) => (v === 1 ? 'A' : v)).join(' ') || '—'}]
      ${state.doubledFlags[i] ? ' · x2' : ''}
    </div>
  `).join('');

  const dealerSummary = handTotal(state.dealerCards);
  const dealerButtons = renderCardButtons('dealer', state.dealerCards);
  const lockPlayerCards = state.playersDone || lockPlayerActions;
  const playerButtons = renderCardButtons('hand', state.hands[state.activeHand] || [], lockPlayerCards);
  const showDoubleButton = best.action === 'DOBRAR'
    && !state.doubleMode
    && state.dealerCards.length < 2
    && (state.hands.length === 1 || RULES.doubleAfterSplit)
    && !lockPlayerCards;
  const showSplitButton = best.action === 'SEPARAR'
    && !state.pendingSplit
    && (activeHand.length === 2)
    && state.hands.length < RULES.maxSplits
    && !lockPlayerCards;
  const actionNotes = [
    state.doubleMode ? '<span class="note">Dobro armado: marque apenas 1 carta.</span>' : '',
    lockPlayerActions ? '<span class="note">Informe a carta do dealer antes de continuar.</span>' : '',
  ].filter(Boolean).join(' ');

  const metricsLine = [
    `RC <strong>${state.runningCount}</strong>`,
    `TC <strong>${trueCount.toFixed(2)}</strong>`,
    `Restantes <strong>${totalRemaining}</strong>` + (playableCards > 0 ? ` (${playableCards} até corte)` : ''),
    `Após corte <strong>${postCutCards}</strong>`,
    `Penetração <strong>${penetrationPct}%</strong>`,
    `Decks p/ TC <strong>${decksForTC}</strong>`,
    `P(10) <strong>${(insurance.pTen * 100).toFixed(1)}%</strong>${insurance.suggest ? ' · +EV' : ''}`,
  ].map((text) => `<span class="metric-item">${text}</span>`).join('');

  const scoreLine = `
    <span class="score-chip score-win" title="Vitórias">V ${state.wins}</span>
    <span class="score-chip score-tie" title="Empates">E ${state.ties}</span>
    <span class="score-chip score-loss" title="Derrotas">D ${state.losses}</span>
    <span class="score-chip score-profit" title="Lucro">Lucro ${state.netProfit.toFixed(2)}</span>
    <span class="score-chip score-rounds" title="Rodadas">R ${state.rounds}</span>
  `;

  return `
    <div class="app-stage app-stage--table">
      <section class="table">
        ${headerHTML}
        ${state.showInsurancePrompt ? `<div class="insurance">${state.insuranceText}</div>` : ''}
        <div class="panel-stack">
          <!-- Layout histórico: manter terceiros, dealer, jogador e métricas em sequência vertical -->
          <article class="panel">
            <header>Contador terceiros</header>
            <div class="others">
              <div class="others-group">
                <span class="others-label">Hi-Lo (±1)</span>
                <div class="stepper" data-action="othersRC">
                  <button data-delta="-1" aria-label="Diminuir Hi-Lo">−</button>
                  <div>${state.others.rc}</div>
                  <button data-delta="1" aria-label="Aumentar Hi-Lo">+</button>
                </div>
              </div>
              <span class="others-divider" aria-hidden="true"></span>
              <div class="others-group others-group--neutral">
                <span class="others-label">Neutras 7–9</span>
                <div class="stepper stepper-neutral" data-action="othersZero">
                  <div class="others-neutral-value">${state.others.zero}</div>
                  <button data-delta="1" aria-label="Adicionar carta neutra">+</button>
                </div>
              </div>
            </div>
            <p class="hint">2–6 = +1 · 7–9 = 0 · 10/A = −1</p>
          </article>
        <article class="panel">
          <header>Dealer — Total ${dealerSummary.total}${dealerSummary.soft ? ' (soft)' : ''}</header>
          <div class="cards" data-target="dealer">${dealerButtons}</div>
        </article>
        <article class="panel">
          <header>Você — Total ${activeTotal.total}${activeTotal.soft ? ' (soft)' : ''}</header>
          ${state.hands.length > 1 ? `<div class="hand-list">${handsList}</div>` : ''}
          <div class="cards" data-target="hand">${playerButtons}</div>
          <div class="actions">
            <button class="secondary" id="undo-btn">Desfazer</button>
            ${showDoubleButton ? '<button class="primary" id="double-btn">Confirmar Dobrar</button>' : ''}
            ${showSplitButton ? '<button class="primary" id="split-btn">Confirmar Separar</button>' : ''}
            ${actionNotes}
          </div>
        </article>
          <article class="panel">
            <header>Métricas e Placar</header>
            <div class="metrics-row" aria-label="Métricas principais">${metricsLine}</div>
            <div class="score-row" aria-label="Placar e progresso">${scoreLine}</div>
            <footer class="panel-footer">
              <button class="secondary" id="swap-deck-btn">Troca baralho</button>
              <button class="primary" id="next-btn">Próxima</button>
              <button class="secondary push-end" id="full-reset-btn">Reiniciar</button>
            </footer>
            <p class="hint">Corte 60%: ${cutTarget} cartas · Vistas: ${seenTotal} · 3P retiradas: ${removedByOthers}${playableCards <= 0 ? ' · Corte ultrapassado — troque quando desejar' : ''} · 3P anterior — RC ${state.others.last.rc} · L ${state.others.last.lo} · H ${state.others.last.hi} · N ${state.others.last.zero}</p>
          </article>
        </div>
      </section>
    </div>
  `;
}

// Renderiza os botões de carta reaproveitando frequências para marcar repetições.
function renderCardButtons(target, selectedCards, disabled = false) {
  const freq = selectedCards.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  return Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
    const count = freq[value] || 0;
    const label = value === 1 ? 'A' : (value === 10 ? '10/J/Q/K' : value);
    const classes = ['card-btn'];
    if (count > 0 && !disabled) classes.push('card-active');
    if (disabled) classes.push('card-disabled');
    return `
      <button class="${classes.join(' ')}" data-card-target="${target}" data-card-value="${value}" ${disabled ? 'disabled' : ''}>
        <span>${label}${count > 1 ? ` (${count})` : ''}</span>
      </button>
    `;
  }).join('');
}

// Liga os eventos da tela inicial (configurações e início de jogo).
function bindIntroEvents() {
  document.querySelectorAll('[data-decks]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.decks = Number(btn.dataset.decks);
      render();
    });
  });
  document.querySelectorAll('[data-minbet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.minBet = Number(btn.dataset.minbet);
      render();
    });
  });
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      state.screen = 'table';
      finalizeUpdate();
    });
  }
}

// Liga os eventos da mesa interativa para cada botão renderizado.
function bindTableEvents(derived) {
  document.querySelectorAll('[data-card-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.cardTarget;
      const value = Number(btn.dataset.cardValue);
      addCard(target, value);
    });
  });

  document.querySelectorAll('.stepper[data-action="othersRC"] button').forEach((btn) => {
    btn.addEventListener('click', () => adjustOthersRC(Number(btn.dataset.delta)));
  });
  document.querySelectorAll('.stepper[data-action="othersZero"] button').forEach((btn) => {
    btn.addEventListener('click', () => adjustOthersZero(Number(btn.dataset.delta)));
  });

  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) undoBtn.addEventListener('click', undoLast);

  const doubleBtn = document.getElementById('double-btn');
  if (doubleBtn) doubleBtn.addEventListener('click', toggleDoubleMode);

  const splitBtn = document.getElementById('split-btn');
  if (splitBtn) splitBtn.addEventListener('click', requestSplit);

  document.querySelectorAll('.hand-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const index = Number(chip.dataset.hand);
      changeActiveHand(index);
    });
  });

  const swapDeckBtn = document.getElementById('swap-deck-btn');
  if (swapDeckBtn) swapDeckBtn.addEventListener('click', swapDeck);

  const fullResetBtn = document.getElementById('full-reset-btn');
  if (fullResetBtn) fullResetBtn.addEventListener('click', resetSession);

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.addEventListener('click', nextRound);
}

window.addEventListener('resize', scheduleScaleUpdate);

render();
