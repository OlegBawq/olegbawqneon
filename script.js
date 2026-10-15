// game.js
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const STORAGE_KEY = 'neonplay-multiboard-v3';

  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    saved = {};
  }

  const state = {
    balance: Number.isFinite(saved.balance) ? saved.balance : 10000000,
    rounds: Array.isArray(saved.rounds) ? saved.rounds.slice(0, 40) : [],
    profit: Number(saved.profit || 0),
    bestWin: Number(saved.bestWin || 0),
    xp: Number(saved.xp || 0),
    sound: saved.sound !== false,
    view: 'roulette',
    multi: 1,
    rouletteChoice: 'red',
    wheelChoice: 2,
    coinChoice: 'heads',
    rouletteHistory: ['red', 'black', 'red', 'green', 'black', 'red'],
    crashHistory: [1.45, 3.20, 1.15, 8.50, 2.05, 1.80, 14.20],
    mines: null,
    tower: null,
    audio: null
  };

  let toastTimer;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: state.balance,
        rounds: state.rounds,
        profit: state.profit,
        bestWin: state.bestWin,
        xp: state.xp,
        sound: state.sound
      }));
    } catch {}
  }

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // Салют частиц при крупном выигрыше
  const fxParticles = [];
  let fxRAF = 0;
  function spawnConfetti() {
    const canvas = $('fx-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#b8ff5c', '#00d59a', '#9d78ff', '#ffcf4b', '#f34b70'];
    for (let i = 0; i < 55; i++) {
      fxParticles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 260,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        size: 5 + Math.random() * 5,
        color: colors[i % colors.length],
        life: 1
      });
    }
    if (!fxRAF) {
      const step = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = fxParticles.length - 1; i >= 0; i--) {
          const p = fxParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.35;
          p.life -= 0.02;
          if (p.life <= 0) {
            fxParticles.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        if (fxParticles.length) fxRAF = requestAnimationFrame(step);
        else fxRAF = 0;
      };
      fxRAF = requestAnimationFrame(step);
    }
  }

  function playSound(kind = 'click') {
    if (!state.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      state.audio ||= new AudioContext();
      if (state.audio.state === 'suspended') state.audio.resume();
      const ctx = state.audio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const freq = kind === 'win' ? 780 : kind === 'loss' ? 150 : kind === 'peg' ? 520 : 350;
      osc.type = kind === 'win' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      if (kind === 'win') osc.frequency.exponentialRampToValueAtTime(1220, now + 0.15);
      if (kind === 'loss') osc.frequency.exponentialRampToValueAtTime(75, now + 0.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'peg' ? 0.045 : 0.22));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {}
  }

  function updateTotalBetUI() {
    const bet = Math.max(1, Math.floor(Number($('bet-amount').value) || 100));
    const count = state.multi;
    $('total-bet-display').textContent = `${money(bet * count)} $ (${count}×)`;
    $('stat-boards').textContent = `${count}×`;
    $('active-boards-pill').textContent = count;
  }

  function balanceUI() {
    $('balance').textContent = money(state.balance);
    $('stat-rounds').textContent = state.rounds.length;
    $('stat-profit').textContent = `${state.profit >= 0 ? '+' : ''}${money(state.profit)} $`;
    $('stat-profit').className = state.profit >= 0 ? 'win-text' : 'loss-text';
    $('stat-best').textContent = `${money(state.bestWin)} $`;

    const wins = state.rounds.filter((r) => r.win).length;
    const rate = state.rounds.length ? Math.round((wins / state.rounds.length) * 100) : 0;
    $('stat-winrate').textContent = `${rate}%`;
    $('history-count').textContent = `${state.rounds.length} записей`;

    const level = Math.floor(state.xp / 1000) + 1;
    const ranks = ['Бронза', 'Серебро', 'Золото', 'Платина', 'Алмаз', 'Император'];
    const rankName = ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 3))];
    const curXp = state.xp % 1000;
    $('vip-rank').textContent = `VIP ${level} · ${rankName}`;
    $('vip-xp').textContent = `${curXp} / 1000 XP`;
    $('vip-fill').style.width = `${(curXp / 1000) * 100}%`;

    updateTotalBetUI();

    const body = $('history-body');
    body.replaceChildren();
    if (!state.rounds.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      tr.innerHTML = '<td colspan="4">Пока нет ставок — выбери количество полей и начни игру!</td>';
      body.append(tr);
      return;
    }

    state.rounds.slice(0, 10).forEach((r) => {
      const tr = document.createElement('tr');
      const cells = [r.game, `${money(r.bet)} $`, r.label, `${money(r.payout)} $`];
      cells.forEach((v, idx) => {
        const td = document.createElement('td');
        td.textContent = v;
        if ((idx === 2 || idx === 3) && r.win) td.className = 'win-text';
        else if (idx === 2 && !r.win) td.className = 'loss-text';
        tr.append(td);
      });
      body.append(tr);
    });
  }

  function getBet(count = state.multi) {
    const bet = Math.floor(Number($('bet-amount').value));
    if (!Number.isFinite(bet) || bet < 1 || bet > 10000000) {
      toast('Введите целую ставку от 1 до 10 000 000 $.');
      return null;
    }
    if (bet * count > state.balance) {
      toast(`Недостаточно баланса для ${count} полей (${money(bet * count)} $).`);
      return null;
    }
    return bet;
  }

  function beginBet(totalBet) {
    state.balance = Math.round((state.balance - totalBet) * 100) / 100;
    state.xp += Math.max(5, Math.min(400, Math.floor(totalBet / 15)));
    balanceUI();
  }

  function finishRound(game, bet, payout, label) {
    const net = payout - bet;
    state.balance = Math.round((state.balance + payout) * 100) / 100;
    state.profit = Math.round((state.profit + net) * 100) / 100;
    if (payout > state.bestWin) state.bestWin = payout;
    if (payout >= bet * 3 && payout > 0) spawnConfetti();
    state.rounds.unshift({ game, bet, payout, label, win: payout > 0, at: Date.now() });
    state.rounds = state.rounds.slice(0, 40);
    persist();
    balanceUI();
  }

  // Переключение количества одновременных игровых полей (1, 2, 3, 5, 10)
  function applyMultiBoardsLayout() {
    const n = state.multi;
    document.querySelectorAll('.multi-boards-container').forEach((el) => {
      el.className = `multi-boards-container boards-${n}`;
    });
    buildRouletteBoards(n);
    buildCrashBoards(n);
    buildSlotsBoards(n);
    buildMinesBoards(n);
    buildDiceBoards(n);
    buildWheelBoards(n);
    buildCoinBoards(n);
    buildTowerBoards(n);
    updateTotalBetUI();
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.game-view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
    const titles = {
      roulette: ['МУЛЬТИ-ДОРОЖКИ', 'Рулетка', 'Дабл'],
      crash: ['МУЛЬТИ-МОНИТОРЫ', 'Краш', 'Иксы'],
      plinko: ['ЛАВИНА ШАРОВ', 'Плинко', 'Без задержек'],
      slots: ['МУЛЬТИ-БАРАБАНЫ', 'Слоты', '777'],
      mines: ['САПЁР НА ДЕНЬГИ', 'Мины', '5×5'],
      dice: ['МУЛЬТИ-БРОСКИ', 'Кости', '1–100'],
      wheel: ['СЕКТОРА УДАЧИ', 'Колесо', 'Фортуны ×50'],
      coinflip: ['ОРЁЛ ИЛИ РЕШКА', 'Монетка', '3D'],
      tower: ['ШТУРМ ЭТАЖЕЙ', 'Башня', 'Сокровищ']
    };
    $('game-kicker').textContent = titles[view][0];
    $('game-title').replaceChildren(document.createTextNode(titles[view][1] + ' '));
    const span = document.createElement('span');
    span.textContent = titles[view][2];
    $('game-title').append(span);
    if (view === 'plinko') drawPlinkoFrame();
    if (view === 'crash') crashBoards.forEach((b) => drawMiniCrash(b));
  }

  // ================= 1. РУЛЕТКА (НЕСКОЛЬКО ДОРОЖЕК СРАЗУ) =================
  const rouletteColors = (p) => (p === 14 ? 'green' : p < 7 ? 'red' : 'black');
  const colorNames = { red: 'Красное', black: 'Чёрное', green: 'Зеро' };

  function renderRouletteBadges() {
    const wrap = $('roulette-history');
    if (!wrap) return;
    wrap.replaceChildren();
    state.rouletteHistory.slice(0, 14).forEach((c) => {
      const span = document.createElement('span');
      span.className = `badge-item badge-${c}`;
      span.textContent = colorNames[c];
      wrap.append(span);
    });
  }

  function fillTrackPockets(track, winningPocket = null) {
    track.replaceChildren();
    const winIndex = 28;
    for (let i = 0; i < 38; i++) {
      const p = i === winIndex && winningPocket !== null ? winningPocket : Math.floor(Math.random() * 15);
      const el = document.createElement('div');
      el.className = `roulette-pocket roulette-${rouletteColors(p)}`;
      el.textContent = p === 14 ? '0' : String(p + 1);
      track.append(el);
    }
    return winIndex;
  }

  function buildRouletteBoards(n) {
    const container = $('roulette-boards');
    container.replaceChildren();
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `
        <div class="board-tag"><span>Дорожка #${i + 1}</span><b class="board-status">Готово</b></div>
        <div class="roulette-wrap">
          <div class="roulette-pointer"></div>
          <div class="roulette-window"><div class="roulette-track"></div></div>
          <div class="roulette-center-line"></div>
        </div>
      `;
      container.append(card);
      fillTrackPockets(card.querySelector('.roulette-track'));
    }
  }

  function playRoulette() {
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const turbo = $('turbo-mode').checked;
    const cards = Array.from($('roulette-boards').children);
    let totalPayout = 0;
    let wins = 0;

    playSound('click');

    cards.forEach((card, idx) => {
      card.classList.remove('win-card', 'loss-card');
      const statusEl = card.querySelector('.board-status');
      const winEl = card.querySelector('.roulette-window');
      const track = card.querySelector('.roulette-track');

      const pocket = Math.floor(Math.random() * 15);
      const color = rouletteColors(pocket);
      state.rouletteHistory.unshift(color);

      const mult = color === state.rouletteChoice ? (color === 'green' ? 14 : 2) : 0;
      const payout = bet * mult;
      totalPayout += payout;
      if (payout > 0) wins++;

      const winIdx = fillTrackPockets(track, pocket);
      track.style.transition = 'none';
      track.style.transform = 'translateX(0px)';
      void track.offsetWidth;

      const samplePocket = track.children[0];
      const pw = samplePocket ? samplePocket.offsetWidth : 56;
      const gap = n >= 5 ? 4 : 6;
      const pad = n >= 5 ? 6 : 10;
      const step = pw + gap;
      const target = winEl.clientWidth / 2 - (winIdx * step + pw / 2 + pad);
      const dur = turbo ? 0.18 : 1.15 + idx * 0.06;

      statusEl.textContent = 'Крутим...';
      track.style.transition = `transform ${dur}s cubic-bezier(0.08, 0.8, 0.14, 1)`;
      requestAnimationFrame(() => {
        track.style.transform = `translateX(${target}px)`;
      });

      setTimeout(() => {
        const hit = track.children[winIdx];
        if (hit) {
          hit.style.outline = '2px solid var(--lime)';
          hit.style.outlineOffset = '2px';
        }
        card.classList.add(payout > 0 ? 'win-card' : 'loss-card');
        statusEl.textContent = payout > 0 ? `+${money(payout)} $` : `${colorNames[color]}`;
      }, dur * 1000);
    });

    state.rouletteHistory = state.rouletteHistory.slice(0, 18);
    const waitMs = (turbo ? 0.22 : 1.2 + n * 0.05) * 1000;
    setTimeout(() => {
      renderRouletteBadges();
      finishRound('Рулетка', bet * n, totalPayout, `${n} полей · Побед: ${wins}`);
      $('roulette-result').textContent = `Сыграно полей: ${n} · Выиграло: ${wins} · Общая выплата: ${money(totalPayout)} $`;
      playSound(totalPayout > 0 ? 'win' : 'loss');
    }, waitMs);
  }

  // ================= 2. КРАШ (НЕСКОЛЬКО ЭКРАНОВ ОДНОВРЕМЕННО) =================
  let crashBoards = [];
  let crashRAF = 0;

  function renderCrashBadges() {
    const wrap = $('crash-history');
    if (!wrap) return;
    wrap.replaceChildren();
    state.crashHistory.slice(0, 12).forEach((m) => {
      const span = document.createElement('span');
      span.className = `badge-item ${m >= 2 ? 'badge-high' : 'badge-black'}`;
      span.textContent = `${m.toFixed(2)}×`;
      wrap.append(span);
    });
  }

  function buildCrashBoards(n) {
    cancelAnimationFrame(crashRAF);
    crashRAF = 0;
    const container = $('crash-boards');
    container.replaceChildren();
    crashBoards = [];

    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `
        <div class="board-tag"><span>Монитор #${i + 1}</span><b class="board-status">Ожидание</b></div>
        <div class="crash-mini-stage">
          <canvas></canvas>
          <div class="crash-mini-overlay">
            <strong class="crash-val">1.00×</strong>
            <small class="crash-sub">Готов</small>
          </div>
        </div>
        <button class="btn btn-secondary crash-mini-btn" disabled>Забрать</button>
      `;
      container.append(card);
      const bObj = {
        index: i,
        card,
        canvas: card.querySelector('canvas'),
        valEl: card.querySelector('.crash-val'),
        subEl: card.querySelector('.crash-sub'),
        statusEl: card.querySelector('.board-status'),
        btn: card.querySelector('.crash-mini-btn'),
        running: false,
        cashed: false,
        crashed: false,
        bet: 0,
        mult: 1,
        crashAt: 1,
        start: 0
      };
      bObj.btn.addEventListener('click', () => cashoutSingleCrash(bObj));
      crashBoards.push(bObj);
      drawMiniCrash(bObj);
    }
  }

  function drawMiniCrash(b) {
    const canvas = b.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#1f1f30';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    const prog = Math.min(1, Math.max(0.05, (b.mult - 1) / 5));
    const ex = 12 + (w - 26) * prog;
    const ey = h - 14 - (h - 30) * Math.min(1, (b.mult - 1) / 4.5);

    ctx.beginPath();
    ctx.moveTo(12, h - 14);
    for (let i = 1; i <= 30; i++) {
      const t = i / 30;
      ctx.lineTo(12 + (ex - 12) * t, h - 14 - (h - 14 - ey) * t * t);
    }
    ctx.strokeStyle = b.crashed ? '#f34b70' : b.cashed ? '#00d59a' : '#b8ff5c';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ex, ey, 4, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  function cashoutSingleCrash(b) {
    if (!b.running || b.cashed || b.crashed) return;
    b.cashed = true;
    b.running = false;
    const payout = b.bet * b.mult;
    b.card.classList.add('win-card');
    b.statusEl.textContent = `+${money(payout)} $`;
    b.subEl.textContent = `Выведено ${b.mult.toFixed(2)}×`;
    b.btn.disabled = true;
    b.btn.textContent = 'Выведено ✓';
    b.btn.className = 'btn btn-secondary crash-mini-btn';
    finishRound(`Краш #${b.index + 1}`, b.bet, payout, `Вывод ${b.mult.toFixed(2)}×`);
    playSound('win');
    drawMiniCrash(b);
  }

  function playCrashMulti() {
    const activeSome = crashBoards.some((b) => b.running);
    if (activeSome) {
      crashBoards.forEach((b) => cashoutSingleCrash(b));
      return;
    }

    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const now = performance.now();
    crashBoards.forEach((b) => {
      b.card.classList.remove('win-card', 'loss-card');
      b.running = true;
      b.cashed = false;
      b.crashed = false;
      b.bet = bet;
      b.mult = 1;
      const r = Math.random();
      b.crashAt = r < 0.05 ? 1.00 : Number((1 + Math.pow(Math.random(), 2.1) * 16).toFixed(2));
      b.start = now;
      b.statusEl.textContent = 'В полёте';
      b.subEl.textContent = 'Растёт...';
      b.btn.disabled = false;
      b.btn.className = 'btn btn-cashout crash-mini-btn';
    });

    playSound('click');

    const tick = (tNow) => {
      const turbo = $('turbo-mode').checked;
      const speed = turbo ? 0.95 : 0.38;
      const autoOn = $('crash-auto-check').checked;
      const autoTarget = Math.max(1.1, Number($('crash-auto-val').value) || 2);

      let stillFlying = false;
      crashBoards.forEach((b) => {
        if (!b.running) return;
        const elapsed = (tNow - b.start) / 1000;
        b.mult = Math.exp(elapsed * speed);

        if (autoOn && b.mult >= autoTarget && b.crashAt >= autoTarget) {
          b.mult = autoTarget;
          cashoutSingleCrash(b);
          return;
        }

        if (b.mult >= b.crashAt) {
          b.mult = b.crashAt;
          b.running = false;
          b.crashed = true;
          b.valEl.textContent = `${b.mult.toFixed(2)}×`;
          b.subEl.textContent = 'КРАШ!';
          b.statusEl.textContent = 'Сгорело';
          b.card.classList.add('loss-card');
          b.btn.disabled = true;
          b.btn.textContent = 'Краш';
          b.btn.className = 'btn btn-secondary crash-mini-btn';
          state.crashHistory.unshift(b.mult);
          finishRound(`Краш #${b.index + 1}`, b.bet, 0, `Краш на ${b.mult.toFixed(2)}×`);
          playSound('loss');
          drawMiniCrash(b);
          return;
        }

        stillFlying = true;
        b.valEl.textContent = `${b.mult.toFixed(2)}×`;
        b.btn.textContent = `Забрать ${money(b.bet * b.mult)} $`;
        drawMiniCrash(b);
      });

      state.crashHistory = state.crashHistory.slice(0, 14);
      renderCrashBadges();

      if (stillFlying) {
        crashRAF = requestAnimationFrame(tick);
      } else {
        crashRAF = 0;
      }
    };

    crashRAF = requestAnimationFrame(tick);
  }

  // ================= 3. ПЛИНКО (ЗАЛПЫ ДО 50 ШАРОВ БЕЗ ЗАДЕРЖКИ) =================
  const plinkoRisks = {
    low: [2.5, 1.8, 1.3, 1.1, 0.9, 0.7, 0.9, 1.1, 1.3, 1.8, 2.5],
    medium: [6, 3, 1.6, 1.1, 0.7, 0.4, 0.7, 1.1, 1.6, 3, 6],
    high: [29, 8, 3, 1.4, 0.5, 0.2, 0.5, 1.4, 3, 8, 29]
  };
  const plinkoBalls = [];
  let plinkoRAF = 0;

  function setupPockets() {
    const el = $('plinko-pockets');
    el.replaceChildren();
    const risk = $('plinko-risk').value || 'medium';
    plinkoRisks[risk].forEach((v, i) => {
      const d = document.createElement('div');
      d.className = 'plinko-pocket';
      d.textContent = `${v}×`;
      d.dataset.index = i;
      el.append(d);
    });
  }

  function drawPlinkoFrame() {
    const canvas = $('plinko-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const rows = 9;
    const top = 22;
    const bottom = h - 20;
    const gapY = (bottom - top) / rows;
    const gapX = Math.min(44, (w - 36) / (rows + 1));

    for (let r = 0; r < rows; r++) {
      const cnt = r + 3;
      const span = (cnt - 1) * gapX;
      const sx = (w - span) / 2;
      for (let c = 0; c < cnt; c++) {
        ctx.beginPath();
        ctx.arc(sx + c * gapX, top + r * gapY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#b8ff5c';
        ctx.fill();
      }
    }

    plinkoBalls.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function dropPlinkoBalls(customCount = null) {
    const count = customCount !== null ? customCount : state.multi;
    const bet = getBet(count);
    if (bet === null) return;
    beginBet(bet * count);

    const risk = $('plinko-risk').value || 'medium';
    const values = plinkoRisks[risk];
    const turbo = $('turbo-mode').checked;
    const colors = ['#ffffff', '#b8ff5c', '#00d59a', '#9d78ff', '#ffcf4b'];

    for (let i = 0; i < count; i++) {
      let idx = 0;
      for (let s = 0; s < values.length - 1; s++) {
        if (Math.random() < 0.5) idx++;
      }
      const mult = values[idx];
      plinkoBalls.push({
        bet,
        payout: bet * mult,
        mult,
        idx,
        total: values.length,
        start: performance.now() + i * (turbo ? 10 : 38),
        duration: turbo ? 240 : 860 + Math.random() * 180,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
        x: 280,
        y: 14
      });
    }

    $('plinko-active-count').textContent = plinkoBalls.length;
    playSound('click');

    if (!plinkoRAF) {
      const loop = (now) => {
        const canvas = $('plinko-canvas');
        const rect = canvas ? canvas.getBoundingClientRect() : { width: 540, height: 300 };
        const w = rect.width || 540;
        const h = rect.height || 300;

        for (let i = plinkoBalls.length - 1; i >= 0; i--) {
          const b = plinkoBalls[i];
          if (now < b.start) continue;
          const t = Math.min(1, (now - b.start) / b.duration);
          const endX = ((b.idx + 0.5) / b.total) * w;
          b.y = 14 + (h - 28) * t;
          b.x = w / 2 + (endX - w / 2) * t + Math.sin(t * 28 + b.phase) * (1 - t) * 15;

          if (t >= 1) {
            const pock = $('plinko-pockets').children[b.idx];
            if (pock) {
              pock.classList.add('hit');
              setTimeout(() => pock.classList.remove('hit'), 200);
            }
            finishRound('Плинко', b.bet, b.payout, `${b.mult}×`);
            $('plinko-result').textContent = `Шарик попал в ${b.mult}× · Выплата ${money(b.payout)} $`;
            playSound(b.mult >= 1 ? 'win' : 'peg');
            plinkoBalls.splice(i, 1);
          }
        }
        $('plinko-active-count').textContent = plinkoBalls.length;
        drawPlinkoFrame();
        if (plinkoBalls.length) plinkoRAF = requestAnimationFrame(loop);
        else plinkoRAF = 0;
      };
      plinkoRAF = requestAnimationFrame(loop);
    }
  }

  // ================= 4. СЛОТЫ 777 (ДО 10 АВТОМАТОВ СРАЗУ) =================
  const slotSymbols = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];
  const slotTripleMult = { '7️⃣': 50, '💎': 20, '🔔': 10, '🍇': 5, '🍋': 4, '🍒': 3 };

  function buildSlotsBoards(n) {
    const container = $('slots-boards');
    container.replaceChildren();
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `
        <div class="board-tag"><span>Слот #${i + 1}</span><b class="board-status">777</b></div>
        <div class="slot-machine-reels">
          <div class="slot-reel">7️⃣</div>
          <div class="slot-reel">💎</div>
          <div class="slot-reel">7️⃣</div>
        </div>
      `;
      container.append(card);
    }
  }

  function playSlots() {
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const turbo = $('turbo-mode').checked;
    const cards = Array.from($('slots-boards').children);
    let totalPayout = 0;
    let wins = 0;

    playSound('click');

    cards.forEach((card, idx) => {
      card.classList.remove('win-card', 'loss-card');
      const statusEl = card.querySelector('.board-status');
      const reels = Array.from(card.querySelectorAll('.slot-reel'));
      reels.forEach((r) => r.classList.add('spinning'));
      statusEl.textContent = 'Крутим...';

      const s1 = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
      const s2 = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
      const s3 = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];

      let mult = 0;
      if (s1 === s2 && s2 === s3) mult = slotTripleMult[s1] || 5;
      else if (s1 === s2 || s2 === s3 || s1 === s3) mult = 1.5;

      const payout = bet * mult;
      totalPayout += payout;
      if (payout > 0) wins++;

      const delay = turbo ? 140 : 520 + idx * 55;
      setTimeout(() => {
        reels.forEach((r, ri) => {
          r.classList.remove('spinning');
          r.textContent = [s1, s2, s3][ri];
        });
        card.classList.add(payout > 0 ? 'win-card' : 'loss-card');
        statusEl.textContent = payout > 0 ? `${mult}× (+${money(payout)} $)` : 'Мимо';
      }, delay);
    });

    const totalWait = turbo ? 180 : 550 + n * 55;
    setTimeout(() => {
      finishRound('Слоты 777', bet * n, totalPayout, `${n} авт. · Побед: ${wins}`);
      $('slots-result').textContent = `Сыграно автоматов: ${n} · Выигрышных: ${wins} · Выплата: ${money(totalPayout)} $`;
      playSound(totalPayout > 0 ? 'win' : 'loss');
    }, totalWait);
  }

  // ================= 5. МИНЫ (ИНТЕРАКТИВ + МУЛЬТИ-ПОЛЯ) =================
  function buildMinesBoards(n) {
    const container = $('mines-boards');
    container.replaceChildren();
    for (let b = 0; b < n; b++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `<div class="board-tag"><span>Поле #${b + 1}</span><b class="board-status">5×5</b></div><div class="mines-grid"></div>`;
      const grid = card.querySelector('.mines-grid');
      for (let i = 0; i < 25; i++) {
        const cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.textContent = '✦';
        if (b === 0) cell.addEventListener('click', () => pickSingleMine(i));
        grid.append(cell);
      }
      container.append(card);
    }
  }

  function mineMultiplier(opened, mines) {
    let m = 1;
    for (let i = 0; i < opened; i++) {
      m *= (25 - i) / (25 - mines - i);
    }
    return m * 0.97;
  }

  function startInteractiveMines() {
    if (state.multi > 1) {
      playMultiMines();
      return;
    }
    if (state.mines?.running) {
      cashoutInteractiveMines();
      return;
    }
    const bet = getBet(1);
    if (bet === null) return;
    const count = Math.min(24, Number($('mine-count').value) || 3);
    const positions = new Set();
    while (positions.size < count) positions.add(Math.floor(Math.random() * 25));

    beginBet(bet);
    state.mines = { bet, count, positions, opened: new Set(), running: true };
    buildMinesBoards(1);
    $('mines-play').textContent = 'Забрать выигрыш';
    $('mines-play').className = 'btn btn-cashout play-button';
    $('mines-random').disabled = false;
    $('mines-result').textContent = 'Поле активно! Открывай клетки за алмазами.';
  }

  function pickSingleMine(i) {
    const m = state.mines;
    if (!m?.running || m.opened.has(i)) return;
    const grid = $('mines-boards').querySelector('.mines-grid');
    const btn = grid.children[i];
    m.opened.add(i);
    btn.disabled = true;

    if (m.positions.has(i)) {
      btn.textContent = '💣';
      btn.classList.add('mine');
      m.running = false;
      Array.from(grid.children).forEach((c, idx) => {
        c.disabled = true;
        if (m.positions.has(idx)) { c.textContent = '💣'; c.classList.add('mine'); }
      });
      finishRound('Мины', m.bet, 0, 'Взрыв на мине');
      $('mines-result').textContent = 'БАБАХ! Вы попали на мину.';
      $('mines-play').innerHTML = 'Начать игру в Мины <span>💣</span>';
      $('mines-play').className = 'btn btn-primary play-button';
      $('mines-random').disabled = true;
      playSound('loss');
    } else {
      btn.textContent = '💎';
      btn.classList.add('safe');
      const mult = mineMultiplier(m.opened.size, m.count);
      $('mines-opened').textContent = m.opened.size;
      $('mines-multiplier').textContent = `${mult.toFixed(2)}×`;
      $('mines-potential').textContent = `${money(m.bet * mult)} $`;
      playSound('peg');
      if (m.opened.size >= 25 - m.count) cashoutInteractiveMines();
    }
  }

  function cashoutInteractiveMines() {
    const m = state.mines;
    if (!m?.running || !m.opened.size) return;
    const mult = mineMultiplier(m.opened.size, m.count);
    const payout = m.bet * mult;
    m.running = false;
    finishRound('Мины', m.bet, payout, `Вывод ${mult.toFixed(2)}×`);
    $('mines-result').textContent = `Забрано ${money(payout)} $ (${mult.toFixed(2)}×)!`;
    $('mines-play').innerHTML = 'Начать игру в Мины <span>💣</span>';
    $('mines-play').className = 'btn btn-primary play-button';
    $('mines-random').disabled = true;
    playSound('win');
  }

  function playMultiMines() {
    if (state.mines?.running) state.mines.running = false;
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const minesCount = Math.min(20, Number($('mine-count').value) || 3);
    const steps = Math.min(25 - minesCount, Number($('mine-steps').value) || 3);
    const mult = mineMultiplier(steps, minesCount);

    buildMinesBoards(n);
    const cards = Array.from($('mines-boards').children);
    let totalPayout = 0;
    let wins = 0;

    cards.forEach((card) => {
      const statusEl = card.querySelector('.board-status');
      const cells = Array.from(card.querySelectorAll('.mine-cell'));
      const bombs = new Set();
      while (bombs.size < minesCount) bombs.add(Math.floor(Math.random() * 25));
      const picks = new Set();
      while (picks.size < steps) picks.add(Math.floor(Math.random() * 25));

      let hit = false;
      picks.forEach((idx) => { if (bombs.has(idx)) hit = true; });

      cells.forEach((c, idx) => {
        c.disabled = true;
        if (picks.has(idx) && bombs.has(idx)) {
          c.textContent = '💥';
          c.classList.add('mine');
        } else if (picks.has(idx)) {
          c.textContent = '💎';
          c.classList.add('safe');
        } else if (bombs.has(idx)) {
          c.textContent = '💣';
          c.classList.add('mine');
        }
      });

      if (!hit) {
        wins++;
        const pay = bet * mult;
        totalPayout += pay;
        card.classList.add('win-card');
        statusEl.textContent = `+${money(pay)} $`;
      } else {
        card.classList.add('loss-card');
        statusEl.textContent = 'Взрыв';
      }
    });

    $('mines-opened').textContent = steps;
    $('mines-multiplier').textContent = `${mult.toFixed(2)}×`;
    $('mines-potential').textContent = `${money(totalPayout)} $`;
    finishRound('Мины', bet * n, totalPayout, `${n} полей · Побед: ${wins}`);
    $('mines-result').textContent = `Проверено полей: ${n} (по ${steps} кл.) · Выжило: ${wins} · Выплата: ${money(totalPayout)} $`;
    playSound(totalPayout > 0 ? 'win' : 'loss');
  }

  // ================= 6. КОСТИ (ДО 10 ДОРОЖЕК ОДНОВРЕМЕННО) =================
  function buildDiceBoards(n) {
    const container = $('dice-boards');
    container.replaceChildren();
    const target = Number($('dice-target')?.value || 50);
    const dir = $('dice-direction')?.value || 'under';
    const clip = dir === 'under' ? `inset(0 ${100 - target}% 0 0)` : `inset(0 0 0 ${target}%)`;

    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `
        <div class="board-tag"><span>Бросок #${i + 1}</span><b class="board-status">Готов</b></div>
        <div class="dice-mini-num">50.00</div>
        <div class="dice-track">
          <div class="dice-track-fill" style="clip-path:${clip}"></div>
          <div class="dice-needle" style="left:50%"></div>
        </div>
      `;
      container.append(card);
    }
  }

  function updateDiceOdds() {
    const target = Number($('dice-target').value);
    const dir = $('dice-direction').value;
    const chance = Math.max(1, dir === 'under' ? target : 100 - target);
    const mult = 0.98 / (chance / 100);
    const bet = Number($('bet-amount').value) || 100;

    $('dice-target-label').textContent = target;
    $('dice-chance').textContent = `${chance}%`;
    $('dice-multiplier').textContent = `${mult.toFixed(2)}×`;
    $('dice-win-preview').textContent = `${money(bet * mult)} $`;

    const clip = dir === 'under' ? `inset(0 ${100 - target}% 0 0)` : `inset(0 0 0 ${target}%)`;
    document.querySelectorAll('#dice-boards .dice-track-fill').forEach((el) => {
      el.style.clipPath = clip;
    });
  }

  function playDice() {
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const target = Number($('dice-target').value);
    const dir = $('dice-direction').value;
    const chance = Math.max(1, dir === 'under' ? target : 100 - target);
    const mult = 0.98 / (chance / 100);

    let totalPayout = 0;
    let wins = 0;
    const cards = Array.from($('dice-boards').children);

    cards.forEach((card) => {
      card.classList.remove('win-card', 'loss-card');
      const roll = Number((Math.random() * 100).toFixed(2));
      const won = dir === 'under' ? roll < target : roll > target;
      const pay = won ? bet * mult : 0;
      totalPayout += pay;
      if (won) wins++;

      const numEl = card.querySelector('.dice-mini-num');
      const needle = card.querySelector('.dice-needle');
      const status = card.querySelector('.board-status');

      needle.style.left = `${roll}%`;
      numEl.textContent = roll.toFixed(2);
      numEl.style.color = won ? 'var(--lime)' : 'var(--red)';
      card.classList.add(won ? 'win-card' : 'loss-card');
      status.textContent = won ? `+${money(pay)} $` : 'Мимо';
    });

    finishRound('Кости', bet * n, totalPayout, `${n} полей · Побед: ${wins}`);
    $('dice-result').textContent = `Брошено полей: ${n} · Побед: ${wins} · Выплата: ${money(totalPayout)} $`;
    playSound(totalPayout > 0 ? 'win' : 'loss');
  }

  // ================= 7. КОЛЕСО ФОРТУНЫ X50 (ДО 10 КОЛЁС) =================
  const wheelSegments = [2, 3, 2, 5, 2, 3, 2, 5, 2, 3, 2, 50];
  const wheelColors = { 2: '#4e4e68', 3: '#00d59a', 5: '#9d78ff', 50: '#b8ff5c' };

  function buildWheelBoards(n) {
    const container = $('wheel-boards');
    container.replaceChildren();
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      let paths = '';
      const count = wheelSegments.length;
      const angle = 360 / count;
      for (let s = 0; s < count; s++) {
        const a1 = ((s * angle - 90) * Math.PI) / 180;
        const a2 = (((s + 1) * angle - 90) * Math.PI) / 180;
        const x1 = 50 + 46 * Math.cos(a1);
        const y1 = 50 + 46 * Math.sin(a1);
        const x2 = 50 + 46 * Math.cos(a2);
        const y2 = 50 + 46 * Math.sin(a2);
        const col = wheelColors[wheelSegments[s]];
        paths += `<path d="M50,50 L${x1.toFixed(2)},${y1.toFixed(2)} A46,46 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${col}" stroke="#0d0d17" stroke-width="1.2"/>`;
      }
      card.innerHTML = `
        <div class="board-tag"><span>Колесо #${i + 1}</span><b class="board-status">×50</b></div>
        <div class="wheel-box">
          <div class="wheel-pin"></div>
          <svg class="wheel-svg" viewBox="0 0 100 100">
            ${paths}
            <circle cx="50" cy="50" r="14" fill="#14141f" stroke="#b8ff5c" stroke-width="2"/>
          </svg>
        </div>
      `;
      card.dataset.rot = '0';
      container.append(card);
    }
  }

  function playWheel() {
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const turbo = $('turbo-mode').checked;
    const cards = Array.from($('wheel-boards').children);
    let totalPayout = 0;
    let wins = 0;
    playSound('click');

    cards.forEach((card) => {
      card.classList.remove('win-card', 'loss-card');
      const svg = card.querySelector('.wheel-svg');
      const status = card.querySelector('.board-status');

      const segIdx = Math.floor(Math.random() * wheelSegments.length);
      const mult = wheelSegments[segIdx];
      const won = mult === state.wheelChoice;
      const pay = won ? bet * mult : 0;
      totalPayout += pay;
      if (won) wins++;

      const segAngle = 360 / wheelSegments.length;
      const targetAngle = 360 - (segIdx * segAngle + segAngle / 2);
      const currentRot = Number(card.dataset.rot || 0);
      const nextRot = currentRot + 360 * 4 + ((targetAngle - (currentRot % 360) + 360) % 360);
      card.dataset.rot = String(nextRot);

      const dur = turbo ? 0.18 : 1.1;
      svg.style.transition = `transform ${dur}s cubic-bezier(0.12, 0.8, 0.18, 1)`;
      svg.style.transform = `rotate(${nextRot}deg)`;
      status.textContent = 'Вращение...';

      setTimeout(() => {
        card.classList.add(won ? 'win-card' : 'loss-card');
        status.textContent = won ? `+${money(pay)} $ (${mult}×)` : `Выпало ${mult}×`;
      }, dur * 1000);
    });

    setTimeout(() => {
      finishRound('Колесо ×50', bet * n, totalPayout, `${n} колёс · Побед: ${wins}`);
      $('wheel-result').textContent = `Колёс: ${n} · Совпадений: ${wins} · Выплата: ${money(totalPayout)} $`;
      playSound(totalPayout > 0 ? 'win' : 'loss');
    }, (turbo ? 0.22 : 1.15) * 1000);
  }

  // ================= 8. МОНЕТКА 3D (ДО 10 МОНЕТ СРАЗУ) =================
  function buildCoinBoards(n) {
    const container = $('coin-boards');
    container.replaceChildren();
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `
        <div class="board-tag"><span>Монета #${i + 1}</span><b class="board-status">1.96×</b></div>
        <div class="coin-arena"><div class="coin-3d">🦅</div></div>
      `;
      card.dataset.flips = '0';
      container.append(card);
    }
  }

  function playCoinflip() {
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    const turbo = $('turbo-mode').checked;
    const cards = Array.from($('coin-boards').children);
    let totalPayout = 0;
    let wins = 0;
    playSound('click');

    cards.forEach((card) => {
      card.classList.remove('win-card', 'loss-card');
      const coin = card.querySelector('.coin-3d');
      const status = card.querySelector('.board-status');

      const side = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = side === state.coinChoice;
      const pay = won ? bet * 1.96 : 0;
      totalPayout += pay;
      if (won) wins++;

      const flips = Number(card.dataset.flips || 0) + 1080;
      card.dataset.flips = String(flips);
      const dur = turbo ? 0.15 : 0.6;
      coin.style.transition = `transform ${dur}s cubic-bezier(0.2, 0.85, 0.3, 1)`;
      coin.style.transform = `rotateY(${flips}deg)`;

      setTimeout(() => {
        coin.textContent = side === 'heads' ? '🦅' : '⚡';
        coin.classList.toggle('tails-look', side === 'tails');
        card.classList.add(won ? 'win-card' : 'loss-card');
        status.textContent = won ? `+${money(pay)} $` : (side === 'heads' ? 'Орёл' : 'Решка');
      }, dur * 1000);
    });

    setTimeout(() => {
      finishRound('Монетка', bet * n, totalPayout, `${n} монет · Побед: ${wins}`);
      $('coin-result').textContent = `Подброшено монет: ${n} · Угадано: ${wins} · Выплата: ${money(totalPayout)} $`;
      playSound(totalPayout > 0 ? 'win' : 'loss');
    }, (turbo ? 0.2 : 0.65) * 1000);
  }

  // ================= 9. БАШНЯ (ИНТЕРАКТИВ + АВТО-ШТУРМ НА 10 БАШНЯХ) =================
  function buildTowerBoards(n) {
    const container = $('tower-boards');
    container.replaceChildren();
    for (let b = 0; b < n; b++) {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.innerHTML = `<div class="board-tag"><span>Башня #${b + 1}</span><b class="board-status">8 этажей</b></div><div class="tower-grid"></div>`;
      const grid = card.querySelector('.tower-grid');
      for (let f = 0; f < 8; f++) {
        const row = document.createElement('div');
        row.className = 'tower-row';
        for (let c = 0; c < 3; c++) {
          const btn = document.createElement('button');
          btn.className = 'tower-cell';
          btn.textContent = `${(Math.pow(1.45, f + 1)).toFixed(2)}×`;
          if (b === 0) btn.addEventListener('click', () => pickTowerStep(f, c));
          row.append(btn);
        }
        grid.append(row);
      }
      container.append(card);
    }
  }

  function startTowerGame() {
    if (state.multi > 1) {
      playAutoTower();
      return;
    }
    if (state.tower?.running) {
      cashoutTower();
      return;
    }
    const bet = getBet(1);
    if (bet === null) return;
    beginBet(bet);
    const bombs = Array.from({ length: 8 }, () => Math.floor(Math.random() * 3));
    state.tower = { bet, bombs, floor: 0, running: true };
    buildTowerBoards(1);
    highlightTowerFloor();
    $('tower-play').textContent = 'Забрать выигрыш';
    $('tower-play').className = 'btn btn-cashout play-button';$('tower-result').textContent = 'Выбери безопасную плиту на 1-м этаже!';
  }

  function highlightTowerFloor() {
    const rows = $('tower-boards').querySelectorAll('.tower-row');
    rows.forEach((r, idx) => r.classList.toggle('active-floor', idx === state.tower?.floor));
  }

  function pickTowerStep(floor, col) {
    const t = state.tower;
    if (!t?.running || floor !== t.floor) return;
    const row = $('tower-boards').querySelectorAll('.tower-row')[floor];
    const cell = row.children[col];

    if (t.bombs[floor] === col) {
      cell.textContent = '💀';
      cell.classList.add('mine');
      t.running = false;
      highlightTowerFloor();
      finishRound('Башня', t.bet, 0, `Падение на ${floor + 1} эт.`);
      $('tower-result').textContent = `Ловушка на ${floor + 1}-м этаже!`;
      $('tower-play').innerHTML = 'Начать штурм Башни <span>🏰</span>';
      $('tower-play').className = 'btn btn-primary play-button';
      playSound('loss');
    } else {
      cell.textContent = '👑';
      cell.classList.add('safe');
      t.floor++;
      playSound('peg');
      if (t.floor >= 8) {
        cashoutTower();
      } else {
        highlightTowerFloor();
        const mult = Math.pow(1.45, t.floor);
        $('tower-play').textContent = `Забрать ${money(t.bet * mult)} $ (${mult.toFixed(2)}×)`;
      }
    }
  }

  function cashoutTower() {
    const t = state.tower;
    if (!t?.running || t.floor === 0) return;
    const mult = Math.pow(1.45, t.floor);
    const pay = t.bet * mult;
    t.running = false;
    highlightTowerFloor();
    finishRound('Башня', t.bet, pay, `Этаж ${t.floor} (${mult.toFixed(2)}×)`);
    $('tower-result').textContent = `Башня пройдена до ${t.floor} этажа! Выигрыш: ${money(pay)} $`;
    $('tower-play').innerHTML = 'Начать штурм Башни <span>🏰</span>';
    $('tower-play').className = 'btn btn-primary play-button';
    playSound('win');
  }

  function playAutoTower() {
    if (state.tower?.running) state.tower.running = false;
    const n = state.multi;
    const bet = getBet(n);
    if (bet === null) return;
    beginBet(bet * n);

    buildTowerBoards(n);
    const cards = Array.from($('tower-boards').children);
    const targetFloors = 3;
    const mult = Math.pow(1.45, targetFloors);
    let totalPayout = 0;
    let wins = 0;

    cards.forEach((card) => {
      const rows = card.querySelectorAll('.tower-row');
      const status = card.querySelector('.board-status');
      let survived = true;
      for (let f = 0; f < targetFloors; f++) {
        const bomb = Math.floor(Math.random() * 3);
        const pick = Math.floor(Math.random() * 3);
        const cell = rows[f].children[pick];
        if (pick === bomb) {
          cell.textContent = '💀';
          cell.classList.add('mine');
          survived = false;
          break;
        } else {
          cell.textContent = '👑';
          cell.classList.add('safe');
        }
      }
      if (survived) {
        wins++;
        const pay = bet * mult;
        totalPayout += pay;
        card.classList.add('win-card');
        status.textContent = `+${money(pay)} $`;
      } else {
        card.classList.add('loss-card');
        status.textContent = 'Ловушка';
      }
    });

    finishRound('Башня', bet * n, totalPayout, `${n} башен · Побед: ${wins}`);
    $('tower-result').textContent = `Штурм ${n} башен (3 этажа · ${mult.toFixed(2)}×) · Успешно: ${wins} · Выплата: ${money(totalPayout)} $`;
    playSound(totalPayout > 0 ? 'win' : 'loss');
  }

  // ================= ЖИВАЯ ЛЕНТА ОНЛАЙНА =================
  const botNicks = ['S1mple_RU', 'NeonKing', 'КриптоКит', 'VegasPro', 'Lucky_777', 'Мажор_МСК', 'GhostRider', 'Азартный_Кот', 'WhaleBet', 'Cyberilla'];
  const gameList = ['Рулетка', 'Краш', 'Плинко', 'Слоты 777', 'Мины', 'Кости', 'Колесо ×50', 'Монетка', 'Башня'];

  function addLiveRow() {
    const tbody = $('live-feed-body');
    if (!tbody) return;
    const nick = botNicks[Math.floor(Math.random() * botNicks.length)];
    const g = gameList[Math.floor(Math.random() * gameList.length)];
    const mult = Number((1.4 + Math.pow(Math.random(), 2.4) * 28).toFixed(2));
    const bet = [100, 250, 500, 1000, 5000, 10000][Math.floor(Math.random() * 6)];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${nick}</td><td>${g}</td><td class="win-text">${mult}×</td><td class="win-text">+${money(Math.round(bet * mult))} $</td>`;
    tbody.prepend(tr);
    while (tbody.children.length > 10) tbody.lastElementChild.remove();
  }

  setInterval(() => {
    const online = 7840 + Math.floor(Math.sin(Date.now() / 8000) * 240 + (Math.random() - 0.5) * 60);
    $('online-count').textContent = money(online);
    const pool = 284950000 + Math.floor((Date.now() % 10000000) * 1.6);
    $('jackpot-pool').textContent = `${money(pool)} $`;
    addLiveRow();
  }, 1900);

  // ================= СОБЫТИЯ =================
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  document.querySelectorAll('.multi-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.multi-btn').forEach((x) => x.classList.toggle('active', x === b));
      state.multi = Number(b.dataset.multi) || 1;
      $('multi-count').value = state.multi;
      playSound('click');
      applyMultiBoardsLayout();
    });
  });

  document.querySelectorAll('[data-bet]').forEach((b) => {
    b.addEventListener('click', () => {
      $('bet-amount').value = b.dataset.bet;
      updateDiceOdds();
      updateTotalBetUI();
    });
  });

  document.querySelectorAll('[data-mod]').forEach((b) => {
    b.addEventListener('click', () => {
      const cur = Number($('bet-amount').value) || 100;
      const mod = b.dataset.mod;
      let next = cur;
      if (mod === 'half') next = Math.max(1, Math.floor(cur / 2));
      if (mod === 'double') next = Math.min(10000000, cur * 2);
      if (mod === 'plus1k') next = Math.min(10000000, cur + 1000);
      if (mod === 'max') next = Math.min(10000000, Math.max(1, Math.floor(state.balance / state.multi)));
      $('bet-amount').value = next;
      updateDiceOdds();
      updateTotalBetUI();
    });
  });

  $('bet-amount').addEventListener('input', () => {
    updateDiceOdds();
    updateTotalBetUI();
  });

  $('claim-bonus').addEventListener('click', () => {
    state.balance += 100000;
    persist();
    balanceUI();
    spawnConfetti();
    playSound('win');
    toast('Начислен бонус +100 000 $!');
  });

  $('sound-toggle').addEventListener('click', () => {
    state.sound = !state.sound;
    $('sound-toggle').textContent = state.sound ? '🔊' : '🔇';
    persist();
  });

  $('reset-demo').addEventListener('click', () => {
    state.balance = 10000000;
    state.profit = 0;
    state.bestWin = 0;
    state.rounds = [];
    persist();
    balanceUI();
    toast('Баланс сброшен до 10 000 000 $.');
  });

  document.querySelectorAll('[data-color]').forEach((b) => {
    b.addEventListener('click', () => {
      state.rouletteChoice = b.dataset.color;
      document.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('selected', x === b));
    });
  });

  document.querySelectorAll('[data-wheel]').forEach((b) => {
    b.addEventListener('click', () => {
      state.wheelChoice = Number(b.dataset.wheel);
      document.querySelectorAll('[data-wheel]').forEach((x) => x.classList.toggle('selected', x === b));
    });
  });

  document.querySelectorAll('[data-coin]').forEach((b) => {
    b.addEventListener('click', () => {
      state.coinChoice = b.dataset.coin;
      document.querySelectorAll('[data-coin]').forEach((x) => x.classList.toggle('selected', x === b));
    });
  });

  $('roulette-spin').addEventListener('click', playRoulette);
  $('crash-play').addEventListener('click', playCrashMulti);$('crash-cashout-all').addEventListener('click', () => crashBoards.forEach((b) => cashoutSingleCrash(b)));
  $('plinko-play').addEventListener('click', () => dropPlinkoBalls(null));$('plinko-risk').addEventListener('change', setupPockets);
  document.querySelectorAll('[data-plinko-burst]').forEach((b) => {
    b.addEventListener('click', () => dropPlinkoBalls(Number(b.dataset.plinkoBurst)));
  });

  $('slots-play').addEventListener('click', playSlots);$('mines-play').addEventListener('click', startInteractiveMines);
  $('mines-instant').addEventListener('click', playMultiMines);$('mines-random').addEventListener('click', () => {
    const m = state.mines;
    if (!m?.running) return;
    const avail = [];
    for (let i = 0; i < 25; i++) if (!m.opened.has(i)) avail.push(i);
    if (avail.length) pickSingleMine(avail[Math.floor(Math.random() * avail.length)]);
  });

  $('dice-play').addEventListener('click', playDice);
  $('dice-target').addEventListener('input', updateDiceOdds);$('dice-direction').addEventListener('change', updateDiceOdds);

  $('wheel-play').addEventListener('click', playWheel);$('coin-play').addEventListener('click', playCoinflip);
  $('tower-play').addEventListener('click', startTowerGame);$('tower-auto').addEventListener('click', playAutoTower);

  window.addEventListener('resize', () => {
    if (state.view === 'plinko') drawPlinkoFrame();
    if (state.view === 'crash') crashBoards.forEach((b) => drawMiniCrash(b));
  });

  $('sound-toggle').textContent = state.sound ? '🔊' : '🔇';
  for (let i = 0; i < 8; i++) addLiveRow();
  renderRouletteBadges();
  renderCrashBadges();
  setupPockets();
  applyMultiBoardsLayout();
  updateDiceOdds();
  balanceUI();
  drawPlinkoFrame();
})();

