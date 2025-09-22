import React, { useMemo, useState, useEffect, useRef } from "react";

export default function BlackCounterApp() {
  // ====== Regras ======
  const RULES = {
    dealerStandsOn17: true,    // S17
    doubleAfterSplit: false,   // NÃO dobra após split
    maxSplits: 4,
    penetration: 0.6,
  };

  // ====== Tela inicial ======
  const [tela, setTela] = useState("inicio");
  const [baralhos, setBaralhos] = useState(1);
  const [apostaMinima, setApostaMinima] = useState(5); // 5/25/50/125

  // ====== Estado de mesa ======
  const [runningCount, setRunningCount] = useState(0); // RC
  const [dealerCards, setDealerCards] = useState([]);  // 1..10 (1 = Ás; 10 = 10/J/Q/K)
  const [hands, setHands] = useState([[]]);           // mãos do jogador (suporta split)
  const [activeHandIndex, setActiveHandIndex] = useState(0);
  const [playersDone, setPlayersDone] = useState(false); // true quando dealer abre 2ª carta OU quando todas as mãos fecham
  const [allHandsDone, setAllHandsDone] = useState(false);
  const [doubleMode, setDoubleMode] = useState(false);   // se true: próxima carta fecha a mão
  const doubleLockedRef = useRef(false);

  // Contagem por valor visto (1..10)
  const [seenCounts, setSeenCounts] = useState(() => Array(11).fill(0));
  const historyRef = useRef([]); // { type:'card'|'othersRC'|'othersZero', ... }

  // Contador de terceiros — detalhado
  const [othersRC, setOthersRC] = useState(0);    // saldo Hi‑Lo (baixa=+1, alta=−1)
  const [othersLo, setOthersLo] = useState(0);    // # baixas (2–6)
  const [othersHi, setOthersHi] = useState(0);    // # altas (10/A)
  const [othersZero, setOthersZero] = useState(0);// # neutras (7–9)

  // Apostas / lucro / placar / rounds
  const [handBets, setHandBets] = useState([0]);
  const [netProfit, setNetProfit] = useState(0);
  const [wins, setWins] = useState(0);
  const [ties, setTies] = useState(0);
  const [losses, setLosses] = useState(0);
  const [rounds, setRounds] = useState(0);
  const roundInitializedRef = useRef(false);
  const roundScoredRef = useRef(false);
  const [lastOthersSummary, setLastOthersSummary] = useState({ rc:0, lo:0, hi:0, zero:0 });

  // Flags por mão
  const [doubledFlags, setDoubledFlags] = useState([false]); // <- FIX: estado p/ controlar mãos dobradas
  const [splitOriginFlags, setSplitOriginFlags] = useState([false]); // marca mãos que vieram de split

  // Seguro (banner 3s)
  const [showInsurancePrompt, setShowInsurancePrompt] = useState(false);
  const [insurancePromptText, setInsurancePromptText] = useState("");

  // ====== Baralho / Probabilidades ======
  const initialPerDeck = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 16 };
  const initialCounts = useMemo(() => {
    const c = Array(11).fill(0);
    for (let v = 1; v <= 10; v++) c[v] = initialPerDeck[v] * baralhos;
    return c;
  }, [baralhos]);

  const remainingCountsBase = useMemo(() => {
    const r = Array(11).fill(0);
    for (let v = 1; v <= 10; v++) {
      const seen = seenCounts[v] || 0;
      r[v] = Math.max(initialCounts[v] - seen, 0);
    }
    return r;
  }, [initialCounts, seenCounts]);

  // Remove também as "terceiras" que você marcou (lo/hi/zero)
  const baseTotalRemaining = useMemo(() => remainingCountsBase.reduce((a,b)=>a+b,0), [remainingCountsBase]);
  const totalRemaining = Math.max(baseTotalRemaining - Math.min(baseTotalRemaining, othersLo + othersHi + othersZero), 1);
  const decksRestantesRaw = totalRemaining / 52;
  const decksRestantesForTC = Math.max(decksRestantesRaw, baralhos * (1 - RULES.penetration));

  // Ajuste de viés via othersRC (usa tudo ao favor)
  const beta = useMemo(() => {
    const denom = Math.max(decksRestantesForTC * 20, 1);
    return Math.max(-0.8, Math.min(0.8, othersRC / denom));
  }, [othersRC, decksRestantesForTC]);

  const tiltedCounts = useMemo(() => {
    const loMul = Math.exp(beta);   // mais baixas quando RC terceiros positivo
    const hiMul = Math.exp(-beta);  // menos altas
    const out = Array(11).fill(0);
    for (let v = 1; v <= 10; v++) {
      const base = remainingCountsBase[v];
      let mul = 1;
      if (v === 1 || v === 10) mul = hiMul;           // altas (10/A)
      else if (v >= 2 && v <= 6) mul = loMul;         // baixas (2–6)
      out[v] = base * mul;                            // 7–9 neutras
    }
    // Remove as neutras marcadas
    const neutralSum = out[7] + out[8] + out[9];
    if (othersZero > 0 && neutralSum > 0) {
      const f = Math.min(1, othersZero / neutralSum);
      out[7] *= (1 - f); out[8] *= (1 - f); out[9] *= (1 - f);
    }
    // Remove proporcionais de baixas/altas que vieram de terceiros
    const lowSum = out[2]+out[3]+out[4]+out[5]+out[6];
    if (othersLo > 0 && lowSum > 0) {
      const f = Math.min(1, othersLo / lowSum);
      for (let v = 2; v <= 6; v++) out[v] *= (1 - f);
    }
    const highSum = out[1]+out[10];
    if (othersHi > 0 && highSum > 0) {
      const f = Math.min(1, othersHi / highSum);
      out[1] *= (1 - f); out[10] *= (1 - f);
    }
    // Reescala para totalRemaining
    const sum = out.reduce((a,b)=>a+b,0) || 1;
    const scale = totalRemaining / sum;
    for (let v = 1; v <= 10; v++) out[v] *= scale;
    return out;
  }, [remainingCountsBase, totalRemaining, beta, othersZero, othersLo, othersHi]);

  const pmf = useMemo(() => {
    const p = {};
    const tot = Math.max(totalRemaining, 1);
    for (let v = 1; v <= 10; v++) p[v] = Math.max(tiltedCounts[v], 0) / tot;
    return p; // P(1..10)
  }, [tiltedCounts, totalRemaining]);

  // RC/TC
  const trueCount = runningCount / Math.max(decksRestantesForTC, 0.25);

  // ====== Utils ======
  const hiLoValue = (v) => (v === 1 || v === 10) ? -1 : (v >= 2 && v <= 6 ? +1 : 0);
  const normRank = (v) => (v >= 10 ? 10 : v);

  const handTotal = (cards) => {
    let sum = 0, aces = 0;
    for (const v of cards) {
      if (v === 1) { sum += 11; aces++; }
      else if (v >= 10) sum += 10; else sum += v;
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    const soft = aces > 0 && sum <= 21;
    return { total: sum, soft };
  };

  const dealerTotal = handTotal(dealerCards);
  const activeHand = hands[activeHandIndex] || [];
  const activeTotal = handTotal(activeHand);
  const playerTotals = hands.map(handTotal);

  const isPair = (arr) => arr.length === 2 && normRank(arr[0]) === normRank(arr[1]);

  // ====== Seguro (cálculo + prompt 3s) ======
  const insurance = useMemo(() => {
    const up = dealerCards[0] || 0;
    if (up !== 1) return { suggest: false, edge: 0, pTen: 0 };
    const pTen = pmf[10] || 0; // prob de carta oculta 10/J/Q/K
    const ev = 1.5 * pTen - 0.5;
    return { suggest: ev > 0, edge: ev, pTen };
  }, [dealerCards, pmf]);

  useEffect(() => {
    if (dealerCards.length === 1 && dealerCards[0] === 1) {
      setInsurancePromptText(insurance.suggest ? "COMPRE SEGURO (+EV)" : "NÃO COMPRE SEGURO");
      setShowInsurancePrompt(true);
      const id = setTimeout(() => setShowInsurancePrompt(false), 3000);
      return () => clearTimeout(id);
    }
  }, [dealerCards, insurance.suggest]);

  // ====== Distribuição final do dealer (S17) ======
  const dealerDist = useMemo(() => {
    const memo = new Map();
    const key = (t, s) => `${t}|${s}`;
    const add = (A, B, w = 1) => { for (const k in B) A[k] = (A[k] || 0) + B[k] * w; return A; };

    const step = (t, s) => {
      const stop = RULES.dealerStandsOn17 ? 17 : 18;
      if (t >= stop) { if (t > 21) return { bust: 1 }; return { [t]: 1 }; }
      const k = key(t, s);
      if (memo.has(k)) return memo.get(k);
      let out = {};
      for (let v = 1; v <= 10; v++) {
        const p = pmf[v]; if (p <= 0) continue;
        let nt = t, ns = s;
        if (v === 1) { if (t + 11 <= 21) { nt = t + 11; ns = true; } else { nt = t + 1; } }
        else { nt = t + (v >= 10 ? 10 : v); }
        if (nt > 21 && ns) { nt -= 10; ns = false; }
        out = add(out, step(nt, ns), p);
      }
      memo.set(k, out);
      return out;
    };

    const dist = step(dealerTotal.total, dealerTotal.soft);
    let sum = 0; for (const k in dist) sum += dist[k];
    const norm = {}; for (const k in dist) norm[k] = dist[k] / (sum || 1);
    return norm; // '17','18','19','20','21','bust'
  }, [dealerTotal.total, dealerTotal.soft, pmf, RULES.dealerStandsOn17]);

  // ====== EVs ======
  const resolveStand = (ptotal) => {
    if (ptotal > 21) return { ev: -1, pWin: 0, pTie: 0 };
    let pWin = dealerDist.bust || 0, pTie = 0;
    for (const k in dealerDist) {
      if (k === 'bust') continue; const dt = parseInt(k,10);
      if (ptotal > dt) pWin += dealerDist[k]; else if (ptotal === dt) pTie += dealerDist[k];
    }
    const pLose = Math.max(0, 1 - pWin - pTie);
    const ev = pWin * 1 + pTie * 0 - pLose * 1;
    return { ev, pWin, pTie };
  };

  const bestFromState = (ptotal, psoft, cardsCount, allowDouble) => {
    if (ptotal > 21) return { action: "BUST", ev: -1, pWin: 0, pTie: 0 };

    const stand = resolveStand(ptotal);

    // HIT recursivo
    const MAX_DEPTH = 8;
    const hitRec = (total, soft, depth) => {
      if (total > 21) return { ev: -1, pWin: 0, pTie: 0 };
      if (depth >= MAX_DEPTH) return resolveStand(total);
      const standNow = resolveStand(total);
      let sum = { ev: 0, pWin: 0, pTie: 0 };
      for (let v = 1; v <= 10; v++) {
        const p = pmf[v]; if (p <= 0) continue;
        let nt = total, ns = soft;
        if (v === 1) { if (total + 11 <= 21) { nt = total + 11; ns = true; } else { nt = total + 1; } }
        else { nt = total + (v >= 10 ? 10 : v); }
        if (nt > 21 && ns) { nt -= 10; ns = false; }
        const res = hitRec(nt, ns, depth + 1);
        sum.ev += p * res.ev; sum.pWin += p * res.pWin; sum.pTie += p * res.pTie;
      }
      return (sum.ev > standNow.ev) ? sum : standNow;
    };

    const hit = hitRec(ptotal, psoft, 0);

    // DOUBLE (apenas 2 cartas; e respeita "sem double após split")
    let double = { ev: -Infinity, pWin: 0, pTie: 0 };
    if (allowDouble && cardsCount === 2) {
      let agg = { ev: 0, pWin: 0, pTie: 0 };
      for (let v = 1; v <= 10; v++) {
        const p = pmf[v]; if (p <= 0) continue;
        let nt = ptotal, ns = psoft;
        if (v === 1) { if (ptotal + 11 <= 21) { nt = ptotal + 11; ns = true; } else { nt = ptotal + 1; } }
        else { nt = ptotal + (v >= 10 ? 10 : v); }
        if (nt > 21 && ns) { nt -= 10; ns = false; }
        const standOnce = resolveStand(nt);
        agg.ev += p * (2 * standOnce.ev);
        agg.pWin += p * standOnce.pWin; agg.pTie += p * standOnce.pTie;
      }
      double = agg;
    }

    const options = [
      { name: "PARAR", ...stand },
      { name: "COMPRAR", ...hit },
      ...(double.ev !== -Infinity ? [{ name: "DOBRAR", ...double }] : []),
    ];

    options.sort((a, b) => b.ev - a.ev);
    const best = options[0];
    return { action: best.name, ev: best.ev, pWin: best.pWin, pTie: best.pTie };
  };

  const evalSplit = (rank, splitCount = 1) => {
    const canResplit = splitCount < RULES.maxSplits;
    let perHandEV = 0;
    for (let v = 1; v <= 10; v++) {
      const p = pmf[v]; if (p <= 0) continue;
      if (canResplit && normRank(v) === rank) {
        perHandEV += p * (evalSplit(rank, splitCount + 1) / 2);
      } else {
        const cards = [rank, v];
        const h = handTotal(cards);
        const res = bestFromState(h.total, h.soft, 2, RULES.doubleAfterSplit);
        perHandEV += p * res.ev;
      }
    }
    return 2 * perHandEV; // duas mãos após split
  };

  // ====== Decisão automática da mão ativa ======
  const decideActive = useMemo(() => {
    const cards = activeHand;
    const h = activeTotal;
    if (cards.length === 0) return { action: null, pWin: 0, pTie: 0, ev: 0 };

    // Par inicial → avaliar split vs não split
    if (cards.length === 2 && isPair(cards)) {
      const rank = normRank(cards[0]);
      const noSplit = bestFromState(h.total, h.soft, 2, true);
      const splitEV = evalSplit(rank, 1);
      if (splitEV > noSplit.ev && hands.length < RULES.maxSplits) return { action: 'SEPARAR', ev: splitEV, pWin: noSplit.pWin, pTie: noSplit.pTie };
      return noSplit;
    }

    const allowDouble = (hands.length > 1) ? RULES.doubleAfterSplit : true; // sem double após split
    return bestFromState(h.total, h.soft, cards.length, allowDouble);
  }, [activeHand, activeTotal, pmf, dealerDist, RULES.doubleAfterSplit, hands.length]);

  // ====== Automatismos ======
  // Split automático
  useEffect(() => {
    if (dealerCards.length >= 2) return; // após 2ª carta do dealer, travamos decisões novas
    if (decideActive.action === 'SEPARAR' && isPair(activeHand) && hands.length < RULES.maxSplits) {
      const [c1, c2] = activeHand;
      setHands((hs) => {
        const na = [...hs];
        na.splice(activeHandIndex, 1, [c1], [c2]);
        return na;
      });
      // replica aposta/flags
      setHandBets((hb)=>{ const a=[...hb]; const v=a[activeHandIndex] ?? apostaMinima; a.splice(activeHandIndex,1,v,v); return a; });
      setDoubledFlags((df)=>{ const a=[...df]; a.splice(activeHandIndex,1,false,false); return a; });
      setSplitOriginFlags((sf)=>{ const a=[...sf]; a.splice(activeHandIndex,1,true,true); return a; });
      setDoubleMode(false);
    }
  }, [decideActive.action, activeHand, hands.length, activeHandIndex, dealerCards.length, apostaMinima]);

  // Avança automaticamente quando a melhor ação for PARAR (enquanto ainda é sua vez)
  useEffect(() => {
    if (dealerCards.length >= 2) return; // quando dealer já está jogando, não avançamos mais a decisão
    if (decideActive.action === 'PARAR' && activeHand.length > 0) {
      const id = setTimeout(() => {
        setHands((hs) => {
          const idx = activeHandIndex;
          if (idx + 1 < hs.length) setActiveHandIndex(idx + 1); else { setAllHandsDone(true); setPlayersDone(true); }
          return hs;
        });
      }, 120);
      return () => clearTimeout(id);
    }
  }, [decideActive.action, activeHand.length, activeHandIndex, dealerCards.length]);

  // Se dealer abrir a 2ª carta, o jogador não pode mais agir
  useEffect(() => { if (dealerCards.length >= 2) setPlayersDone(true); }, [dealerCards.length]);

  // Modo DOBRAR — confirmação manual e 1 carta apenas
  useEffect(() => {
    if (!doubleMode) return;
    if (activeHand.length >= 3) {
      setDoubledFlags((df)=> df.map((x,i)=> i===activeHandIndex ? true : x));
      const id = setTimeout(() => {
        setHands((hs) => {
          const idx = activeHandIndex;
          if (idx + 1 < hs.length) setActiveHandIndex(idx + 1); else { setAllHandsDone(true); setPlayersDone(true); }
          return hs;
        });
        setDoubleMode(false);
        doubleLockedRef.current = false;
      }, 80);
      return () => clearTimeout(id);
    }
  }, [activeHand.length, doubleMode, activeHandIndex]);

  // ====== Cabeçalho (Chance & Ação) ======
  const preRound = dealerCards.length === 0 && hands.every(h => h.length === 0);
  // Edge pré-rodada usa TC + composição atual (PMF)
  const baseEdge = -0.005; // ~-0.5% vantagem da casa
  const delta10 = (pmf[10] || 0) - (16/52);
  const deltaA  = (pmf[1]  || 0) - (4/52);
  const tcTerm   = 0.0045 * trueCount;                  // ~0.45% por TC
  const compTerm = 0.6 * delta10 + 0.3 * deltaA;        // composição do baralho
  const preEdge = Math.max(-0.08, Math.min(0.08, baseEdge + tcTerm + compTerm));
  const preWinPct = 0.5 + preEdge / 2;
  const apostaSugerida = preEdge < -0.02 ? 0 : apostaMinima;

  const handsWinPct = useMemo(() => {
    if (hands.length === 0) return 0;
    const ps = playerTotals.map(({ total }) => Math.max(0, Math.min(1, resolveStand(total).pWin)));
    const m = ps.reduce((a,b)=>a+b,0) / ps.length;
    return m;
  }, [playerTotals, dealerDist]);

  const HeaderInfo = () => {
    if (preRound) {
      const pct = Math.round(preWinPct * 100);
      return (
        <div className="p-4 bg-gray-800 rounded-xl flex items-center justify-between">
          <div className="text-sm">Chance: <span className="font-semibold">{pct}%</span></div>
          <div className="text-xl font-bold">Aposta: {apostaSugerida}</div>
        </div>
      );
    }
    if (dealerCards.length < 2) {
      const pct = Math.round(((decideActive.pWin || 0) * 100));
      const prefix = (dealerCards[0] === 1 && insurance.suggest) ? 'SEGURO + ' : '';
      const actionLabel = doubleMode ? 'DOBRAR (1 carta)' : (decideActive.action || '—');
      return (
        <div className="p-4 bg-gray-800 rounded-xl grid grid-cols-2 items-center">
          <div className="text-sm">Chance: <span className="font-semibold">{pct}%</span></div>
          <div className="text-2xl font-extrabold text-right">AÇÃO: {prefix}{actionLabel}</div>
        </div>
      );
    }
    const pct = Math.round(handsWinPct * 100);
    return (
      <div className="p-4 bg-gray-800 rounded-xl grid grid-cols-2 items-center">
        <div className="text-sm">Chance: <span className="font-semibold">{pct}%</span></div>
        <div className="text-xl font-bold text-right">Dealer jogando…</div>
      </div>
    );
  };

  // ====== Ações ======
  const addCard = (dest, v) => {
    // BLOQUEIO de compra após Dobrar: permitimos **uma** carta e depois travamos via effect
    if (dest === 'hand' && doubleMode) {
      if (doubleLockedRef.current) return; // já marcou a carta do double
      doubleLockedRef.current = true;      // permite **esta** carta
    }

    setRunningCount((c)=>c + hiLoValue(v));
    setSeenCounts((arr)=>{ const na=[...arr]; na[v]=(na[v]||0)+1; return na; });

    if (dest === 'dealer') {
      setDealerCards((a)=>{ const na=[...a, v]; if (na.length === 2) setPlayersDone(true); return na; });
      historyRef.current.push({ type: 'card', dest: 'dealer', v });
      return;
    }

    // Jogador
    if (!roundInitializedRef.current) {
      roundInitializedRef.current = true;
      setHandBets([apostaSugerida]);
      setDoubledFlags([false]);
      setSplitOriginFlags([false]);
    }

    setHands((hs)=> hs.map((h,i)=> i===activeHandIndex ? [...h, v] : h));
    historyRef.current.push({ type: 'card', dest: 'hand', handIndex: activeHandIndex, v });
  };

  // Ajustes do contador de terceiros
  const adjustOthersRC = (delta) => {
    setOthersRC((x)=>x+delta);
    setRunningCount((c)=>c+delta);
    if (delta > 0) setOthersLo((x)=>x+1); // +1 ⇒ baixa (2–6)
    if (delta < 0) setOthersHi((x)=>x+1); // -1 ⇒ alta (10/A)
    historyRef.current.push({ type: 'othersRC', delta });
  };
  const adjustOthersZero = (delta) => {
    setOthersZero((x)=> Math.max(0, x + delta));
    historyRef.current.push({ type: 'othersZero', delta });
  };

  // Desfazer última ação
  const undoLast = () => {
    const last = historyRef.current.pop();
    if (!last) return;
    if (last.type === 'card') {
      const { dest, v } = last;
      setRunningCount((c)=>c - hiLoValue(v));
      setSeenCounts((arr)=>{ const na=[...arr]; na[v]=Math.max(0,(na[v]||0)-1); return na; });
      if (dest === 'dealer') {
        setDealerCards((a)=>{ const na=a.slice(0,-1); if (na.length < 2) setPlayersDone(false); return na; });
      } else {
        const idx = last.handIndex ?? activeHandIndex;
        setHands((hs)=> hs.map((h,i)=> i===idx ? h.slice(0,-1) : h));
      }
      return;
    }
    if (last.type === 'othersRC') {
      setOthersRC((x)=>x - last.delta);
      setRunningCount((c)=>c - last.delta);
      if (last.delta > 0) setOthersLo((x)=> Math.max(0, x-1));
      if (last.delta < 0) setOthersHi((x)=> Math.max(0, x-1));
      return;
    }
    if (last.type === 'othersZero') {
      setOthersZero((x)=> Math.max(0, x - last.delta));
      return;
    }
  };

  const resetDeck = () => {
    setRunningCount(0); setDealerCards([]); setHands([[]]); setActiveHandIndex(0); setAllHandsDone(false); setPlayersDone(false);
    setSeenCounts(Array(11).fill(0)); setOthersRC(0); setOthersLo(0); setOthersHi(0); setOthersZero(0); setDoubleMode(false);
    setWins(0); setTies(0); setLosses(0); setNetProfit(0); setRounds(0);
    setHandBets([0]); setDoubledFlags([false]); setSplitOriginFlags([false]);
    roundInitializedRef.current = false; roundScoredRef.current = false; setLastOthersSummary({ rc:0, lo:0, hi:0, zero:0 });
  };

  const nextRound = () => {
    // Salva resumo de terceiros antes de zerar
    setLastOthersSummary({ rc: othersRC, lo: othersLo, hi: othersHi, zero: othersZero });
    setRounds((r)=> r+1);

    setDealerCards([]); setHands([[]]); setActiveHandIndex(0); setAllHandsDone(false); setPlayersDone(false); setDoubleMode(false);
    setDoubledFlags([false]); setSplitOriginFlags([false]); setHandBets([0]);
    setOthersRC(0); setOthersLo(0); setOthersHi(0); setOthersZero(0);
    roundInitializedRef.current = false; roundScoredRef.current = false; doubleLockedRef.current = false;
  };

  // ====== Liquidação (determinística) ======
  const settleRound = () => {
    let w=0,t=0,l=0; let profit=0;
    const dt = dealerTotal.total;
    const dealerBJ = (dealerCards.length===2 && dt===21);

    hands.forEach((cards, i) => {
      const { total } = handTotal(cards);
      const bet = handBets[i] ?? apostaMinima;
      const doubled = !!doubledFlags[i];
      const fromSplit = !!splitOriginFlags[i];
      const isBJ = (cards.length===2 && total===21 && !fromSplit); // BJ 3:2 só se não veio de split
      const stake = bet * (doubled ? 2 : 1);

      let res = 'T'; let delta = 0;
      if (total>21) { res='L'; delta -= stake; }
      else if (dealerBJ && !isBJ) { res='L'; delta -= stake; }
      else if (isBJ && !dealerBJ) { res='W'; delta += bet * 1.5; }
      else if (dt>21) { res='W'; delta += stake; }
      else if (total>dt) { res='W'; delta += stake; }
      else if (total<dt) { res='L'; delta -= stake; }

      if (res==='W') w++; else if (res==='T') t++; else l++;
      profit += delta;
    });

    setWins((x)=>x+w); setTies((x)=>x+t); setLosses((x)=>x+l);
    setNetProfit((x)=> Number((x + profit).toFixed(2)));
  };

  // Auto-próxima partida: apenas quando for a vez do dealer e ele atingir ≥17
  useEffect(() => {
    if (roundScoredRef.current) return;
    if (!playersDone) return;                  // ainda era sua vez
    if (dealerCards.length < 2) return;        // dealer não abriu 2ª carta
    if (dealerTotal.total < 17) return;        // dealer não fechou (S17)

    roundScoredRef.current = true;
    settleRound();
    const id = setTimeout(() => { nextRound(); roundScoredRef.current = false; }, 3000);
    return () => clearTimeout(id);
  }, [playersDone, dealerTotal.total, dealerCards.length]);

  // ====== UI ======
  const CardButton = ({ value, onClick, selectedCount, disabled }) => (
    <button
      onClick={()=> !disabled && onClick(value)}
      className={`w-10 h-14 rounded-lg border grid place-items-center shadow ${disabled?"bg-gray-700 text-gray-400 cursor-not-allowed":"bg-white text-black hover:scale-105"} ${selectedCount>0 && !disabled?"bg-yellow-300 text-black":""}`}
      title={value===1?"Ás":value===10?"10/J/Q/K":String(value)}
    >
      <span className="font-semibold">{value===1?"A":value}{selectedCount>1?`(${selectedCount})`:''}</span>
    </button>
  );

  if (tela === "inicio") {
    const optsDeck = [1,4,8];
    const optsBet  = [5,25,50,125];
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center gap-8">
        <h1 className="text-4xl font-bold">Black Counter</h1>
        <div>
          <div className="mb-2">Número de baralhos</div>
          <div className="flex gap-2">{optsDeck.map(n=> (
            <button key={n} onClick={()=>setBaralhos(n)} className={`px-4 py-2 rounded-xl border ${baralhos===n?"bg-blue-500 border-blue-700":"bg-gray-700 border-gray-500"}`}>{n}</button>
          ))}</div>
        </div>
        <div>
          <div className="mb-2">Aposta mínima</div>
          <div className="flex gap-2">{optsBet.map(v=> (
            <button key={v} onClick={()=>setApostaMinima(v)} className={`px-4 py-2 rounded-xl border ${apostaMinima===v?"bg-green-500 border-green-700":"bg-gray-700 border-gray-500"}`}>{v}</button>
          ))}</div>
        </div>
        <button onClick={()=>setTela("mesa")} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl text-lg font-semibold">Iniciar</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 flex flex-col gap-4">
      {/* Cabeçalho */}
      <HeaderInfo />

      {/* Prompt de seguro 3s */}
      {showInsurancePrompt && (
        <div className="rounded-xl bg-yellow-300 text-black px-4 py-3 text-sm font-semibold border border-yellow-500">
          {insurancePromptText}
        </div>
      )}

      {/* Contador terceiros */}
      <div className="w-full rounded-2xl bg-gray-900 border border-gray-800 p-4">
        <div className="text-sm mb-2 opacity-80">Contador terceiros</div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-80">Hi‑Lo (±1)</span>
            <button onClick={()=>adjustOthersRC(-1)} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 text-xl">−</button>
            <div className="text-2xl font-bold w-16 text-center tabular-nums">{othersRC}</div>
            <button onClick={()=>adjustOthersRC(1)} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 text-xl">+</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80">Neutras 7–9</span>
            <button onClick={()=>adjustOthersZero(-1)} className="px-2 py-1 rounded bg-gray-800 border border-gray-700">−</button>
            <span className="w-10 text-center tabular-nums">{othersZero}</span>
            <button onClick={()=>adjustOthersZero(1)} className="px-2 py-1 rounded bg-gray-800 border border-gray-700">+</button>
          </div>
        </div>
        <div className="mt-2 text-xs opacity-70">Cola Hi‑Lo: <span className="font-semibold">2–6 = +1</span> · <span className="font-semibold">7–9 = 0</span> · <span className="font-semibold">10/A = −1</span></div>
      </div>

      {/* Dealer */}
      <div className="w-full rounded-2xl bg-gray-900 border border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Dealer</div>
          <div className="text-sm opacity-80">Total: {dealerTotal.total}{dealerTotal.soft?" (soft)":""}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map((v)=>(
            <CardButton key={`d${v}`} value={v} onClick={(val)=>addCard('dealer', val)} selectedCount={dealerCards.filter(c=>c===v).length} />
          ))}
        </div>
      </div>

      {/* Jogador */}
      <div className="w-full rounded-2xl bg-gray-900 border border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Você {hands.length>1?`— Mão ${activeHandIndex+1}/${hands.length}`:""}</div>
          <div className="text-sm opacity-80">Total: {activeTotal.total}{activeTotal.soft?" (soft)":""}</div>
        </div>

        {hands.length>1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {hands.map((h, i) => (
              <div key={i} className={`px-3 py-1 rounded-full text-xs border ${i===activeHandIndex?"bg-red-600 border-red-700":"bg-gray-800 border-gray-700"}`}>
                M{i+1}: {handTotal(h).total}{handTotal(h).soft?"s":""} [{h.map(v=>v===1?"A":v).join(" ")||"—"}] {doubledFlags[i]?"· x2":""}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7,8,9,10].map((v)=>(
            <CardButton key={`p${v}`} value={v} onClick={(val)=>addCard('hand', val)} selectedCount={activeHand.filter(c=>c===v).length} disabled={dealerCards.length>=2} />
          ))}
        </div>

        {/* Utilitários da sua mão */}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button onClick={undoLast} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm">Desfazer</button>
          {decideActive.action==='DOBRAR' && dealerCards.length<2 && activeHand.length===2 && (((hands.length>1)? RULES.doubleAfterSplit : true)) && !doubleMode && (
            <button onClick={()=>setDoubleMode(true)} className="px-3 py-2 rounded-lg bg-yellow-400 text-black border border-yellow-600 text-sm font-semibold">Confirmar Dobrar (x2)</button>
          )}
          {doubleMode && (
            <span className="text-xs opacity-80">Dobro armado: marque <strong>apenas 1 carta</strong>. A mão fecha.</span>
          )}
        </div>
      </div>

      {/* Rodapé */}
      <div className="w-full rounded-2xl bg-gray-900 border border-gray-800 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>RC: <span className="font-semibold">{runningCount}</span> · TC: <span className="font-semibold">{trueCount.toFixed(2)}</span> · Restantes: {totalRemaining}</div>
          <div>P(10) seguro: {(insurance.pTen*100).toFixed(1)}% {insurance.suggest?"· +EV":""}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">Placar — <span className="text-green-400">Vitórias {wins}</span> · <span className="text-yellow-400">Empates {ties}</span> · <span className="text-red-400">Derrotas {losses}</span> · <span className="font-semibold">Lucro {netProfit.toFixed(2)}</span> · <span>Rodadas {rounds}</span></div>
          <div className="flex gap-3">
            <button onClick={resetDeck} className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm">Reinício</button>
            <button onClick={nextRound} className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 font-semibold">Próxima</button>
          </div>
        </div>
        <div className="text-xs opacity-80">3P atual — RC {othersRC} · L {othersLo} · H {othersHi} · N {othersZero} | última — RC {lastOthersSummary.rc} · L {lastOthersSummary.lo} · H {lastOthersSummary.hi} · N {lastOthersSummary.zero}</div>
      </div>
    </div>
  );
}

// ====== DEV quick-tests (não quebram a UI) ======
// Ajuda a pegar regressões rapidamente no navegador
// (executa 1x na montagem)
export function __runQuickAssertsOnce() {
  try {
    const hiLoValue = (v) => (v === 1 || v === 10) ? -1 : (v >= 2 && v <= 6 ? +1 : 0);
    console.assert(hiLoValue(2) === 1, 'hiLo 2 deve ser +1');
    console.assert(hiLoValue(7) === 0, 'hiLo 7 deve ser 0');
    console.assert(hiLoValue(10) === -1, 'hiLo 10 deve ser -1');
    const handTotal = (cards) => {
      let sum = 0, aces = 0;
      for (const v of cards) { if (v === 1) { sum += 11; aces++; } else if (v >= 10) sum += 10; else sum += v; }
      while (sum > 21 && aces > 0) { sum -= 10; aces--; }
      const soft = aces > 0 && sum <= 21; return { total: sum, soft };
    };
    const t = handTotal([10,1]);
    console.assert(t.total === 21 && t.soft, 'A + 10 deve dar 21 soft');
  } catch (e) {
    console.error('Quick asserts falharam:', e);
  }
}

if (typeof window !== 'undefined' && !window.__bcAssertsRun) {
  window.__bcAssertsRun = true;
  __runQuickAssertsOnce();
}
