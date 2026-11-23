// ================= LUDO KING COMPLETE ENGINE =================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Player Colors & Configurations
// 0: Red (Bottom-Left), 1: Green (Top-Left), 2: Yellow (Top-Right), 3: Blue (Bottom-Right)
const C = ['#e53935', '#2e7d32', '#fbc02d', '#1565c0'];
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

// Board Coordinates (15x15 Grid)
const P = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]
];

// Start squares for [Red, Green, Yellow, Blue]
const S = [0, 13, 26, 39];
const STAR = [8, 21, 34, 47];
const SAFE = [...S, ...STAR];

// Home paths for each color (5 squares leading to center)
const H = [
  [1,2,3,4,5].map(c => [7, c]),            // Red
  [1,2,3,4,5].map(r => [r, 7]),            // Green
  [13,12,11,10,9].map(c => [7, c]),        // Yellow
  [13,12,11,10,9].map(r => [r, 7])         // Blue
];

// Base corner offsets (r, c)
// 0: Red (Top-Left), 1: Green (Top-Right), 2: Yellow (Bottom-Right), 3: Blue (Bottom-Left)
const YO = [
  [0, 0],  // Red: Top-Left
  [0, 9],  // Green: Top-Right
  [9, 9],  // Yellow: Bottom-Right
  [9, 0]   // Blue: Bottom-Left
];

// Spawn slot positions inside bases
const SP = [[1.5, 1.5], [1.5, 4.5], [4.5, 1.5], [4.5, 4.5]];

// User State (Coins, Gems, Name)
let userState = {
  name: localStorage.getItem('lk_name') || 'Player 1',
  coins: parseInt(localStorage.getItem('lk_coins') || '10000', 10),
  gems: parseInt(localStorage.getItem('lk_gems') || '50', 10)
};

function saveUserState() {
  localStorage.setItem('lk_name', userState.name);
  localStorage.setItem('lk_coins', userState.coins.toString());
  localStorage.setItem('lk_gems', userState.gems.toString());
  $('#user-coins').textContent = userState.coins.toLocaleString();
  $('#user-gems').textContent = userState.gems.toLocaleString();
  $('#lobby-username').textContent = userState.name;
}

// ================= BOARD INITIALIZATION =================
const boardEl = $('#board');

function buildBoard() {
  boardEl.innerHTML = '';

  // 1. Draw 52 track cells
  P.forEach(([r, c], i) => {
    const d = document.createElement('div');
    d.className = 'c';
    d.style.gridArea = `${r + 1} / ${c + 1}`;
    const sIdx = S.indexOf(i);
    if (sIdx >= 0) {
      d.style.background = C[sIdx];
      d.classList.add('arrow');
      d.textContent = ['→', '↓', '←', '↑'][sIdx];
    } else if (STAR.includes(i)) {
      d.classList.add('star');
      d.textContent = '★';
    }
    boardEl.appendChild(d);
  });

  // 2. Draw colored home runways
  H.forEach((path, p) => {
    path.forEach(([r, c]) => {
      const d = document.createElement('div');
      d.className = 'c';
      d.style.gridArea = `${r + 1} / ${c + 1}`;
      d.style.background = C[p];
      boardEl.appendChild(d);
    });
  });

  // 3. Draw 4 Corner Home Bases
  YO.forEach(([r, c], p) => {
    const y = document.createElement('div');
    y.className = 'y';
    y.style.gridArea = `${r + 1} / ${c + 1} / span 6 / span 6`;
    y.style.background = C[p];
    y.innerHTML = '<i></i>' + SP.map(([a, b]) => `<b style="left:${(b / 6) * 100}%; top:${(a / 6) * 100}%; background:${C[p]}"></b>`).join('');
    boardEl.appendChild(y);
  });

  // 4. Center Finish Area
  const ctr = document.createElement('div');
  ctr.id = 'ctr';
  boardEl.appendChild(ctr);
}

// ================= GAME MATCH ENGINE =================
let numPlayers = 4;
let activePlayers = [0, 1, 2, 3]; // colors playing
let isVsComputer = true;
let userColor = 0; // default Red
let currentTurnIdx = 0; // index into activePlayers
let diceVal = 1;
let consecutiveSixes = 0;
let phase = 'roll'; // 'roll' | 'move' | 'anim'
let busy = false;
let gameOver = false;
let potAmount = 2000;

// Token positions: T[p][i]: -1 = in base, 0..50 = track, 51..55 = home runway, 56 = finished
let T = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
let tokenElements = [[], [], [], []];
let validMoves = [];
let turnTimer = null;
let timerProgress = 100;

const isAI = p => isVsComputer && p !== userColor;

function cellOf(p, k) {
  if (k < 0) return null;
  if (k <= 50) return P[(S[p] + k) % 52];
  if (k < 56) return H[p][k - 51];
  return null;
}

function getPixelPos(p, i) {
  const k = T[p][i];
  if (k < 0) {
    // In home base
    return [YO[p][0] + SP[i][0], YO[p][1] + SP[i][1]];
  }
  if (k === 56) {
    // Reached center finish [7.5, 7.5]
    // 0: Red from left, 1: Green from top, 2: Yellow from right, 3: Blue from bottom
    const centerOffsets = [[0, -0.9], [-0.9, 0], [0, 0.9], [0.9, 0]];
    return [7.5 + centerOffsets[p][0] + (i - 1.5) * 0.12, 7.5 + centerOffsets[p][1] + (i - 1.5) * 0.12];
  }
  const [r, c] = cellOf(p, k);
  return [r + 0.5, c + 0.5];
}

function renderTokens() {
  const cellGroups = {};
  activePlayers.forEach(p => {
    T[p].forEach((k, i) => {
      const [r, c] = getPixelPos(p, i);
      const key = `${r.toFixed(1)},${c.toFixed(1)}`;
      cellGroups[key] = cellGroups[key] || [];
      cellGroups[key].push([p, i, r, c]);
    });
  });

  Object.values(cellGroups).forEach(group => {
    const total = group.length;
    group.forEach(([p, i, r, c], idx) => {
      const offset = total > 1 ? (idx - (total - 1) / 2) * 0.32 : 0;
      const el = tokenElements[p][i];
      if (!el) return;
      el.style.left = `${((c + offset) / 15) * 100}%`;
      el.style.top = `${(r / 15) * 100}%`;
      el.style.transform = `translate(-50%, -60%) scale(${total > 1 ? 0.82 : 1})`;
      
      const canMove = phase === 'move' && p === activePlayers[currentTurnIdx] && !isAI(p) && validMoves.includes(i);
      el.classList.toggle('m', canMove);
    });
  });

  // Update Tokens in Home counts in panels
  activePlayers.forEach(p => {
    const finished = T[p].filter(k => k === 56).length;
    const homeEl = $(`#tokens-home-${p}`);
    if (homeEl) homeEl.textContent = `Home: ${finished}/4`;
  });
}

function createTokens() {
  boardEl.querySelectorAll('.t').forEach(e => e.remove());
  tokenElements = [[], [], [], []];

  activePlayers.forEach(p => {
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 't';
      el.style.setProperty('--c', C[p]);
      el.onclick = () => onTokenClick(p, i);
      boardEl.appendChild(el);
      tokenElements[p][i] = el;
    }
  });
}

function setGameStatus(msg) {
  $('#game-status-msg').textContent = msg;
}

// Setup Player Corner Panels
function updatePlayerPanels() {
  // Hide all panels initially
  for (let i = 0; i < 4; i++) {
    const panel = $(`#panel-${i}`);
    panel.style.display = activePlayers.includes(i) ? 'flex' : 'none';
    panel.classList.remove('active-turn');
  }

  // Highlight active player
  const currPlayer = activePlayers[currentTurnIdx];
  const activePanel = $(`#panel-${currPlayer}`);
  if (activePanel) {
    activePanel.classList.add('active-turn');
  }

  // Update names, flags, and coins
  activePlayers.forEach(p => {
    const nameEl = $(`#name-${p}`);
    const flagEl = $(`#flag-${p}`);
    const coinsEl = $(`#coins-${p}`);
    const avatarEl = $(`#avatar-${p}`);

    if (isOnlineMatch) {
      const found = (typeof roomPlayersList !== 'undefined' ? roomPlayersList : []).find(x => x.color === p);
      if (found) {
        if (nameEl) nameEl.textContent = p === myOnlineColor ? `${found.name} (You)` : found.name;
        if (flagEl) flagEl.textContent = `${found.flag || '🇮🇳'} ${found.country || 'India'}`;
        if (coinsEl) coinsEl.textContent = `💰 ${(12000 + p * 3420).toLocaleString()}`;
        if (avatarEl && found.avatar) avatarEl.textContent = found.avatar;
      }
    } else if (isVsComputer) {
      if (nameEl) nameEl.textContent = p === userColor ? `${userState.name} (You)` : `Bot ${COLOR_NAMES[p]}`;
      if (flagEl) flagEl.textContent = p === userColor ? '🇮🇳 India' : ['🇮🇳 India', '🇺🇸 USA', '🇬🇧 UK', '🇦🇺 Aus'][p];
      if (coinsEl) coinsEl.textContent = `💰 ${(10000 + p * 2500).toLocaleString()}`;
      if (avatarEl) avatarEl.textContent = ['👑', '🌻', '👩', '🦁'][p];
    } else {
      if (nameEl) nameEl.textContent = `${COLOR_NAMES[p]} Player`;
      if (flagEl) flagEl.textContent = '🌍 Global';
      if (coinsEl) coinsEl.textContent = `💰 10,000`;
    }
  });

  resetTurnTimer();

  // If online match and current player is a bot, Host triggers turn
  if (isOnlineMatch && typeof isRoomHost !== 'undefined' && isRoomHost) {
    const currPlayerObj = (typeof roomPlayersList !== 'undefined' ? roomPlayersList : []).find(x => x.color === currPlayer);
    if (currPlayerObj && currPlayerObj.isBot && phase === 'roll') {
      setTimeout(() => {
        if (phase === 'roll' && !busy) {
          rollDice();
        }
      }, 950);
    }
  }
}

// Circular Green Timer
function resetTurnTimer() {
  clearInterval(turnTimer);
  timerProgress = 100;
  activePlayers.forEach(p => {
    const bar = $(`#ring-${p}`);
    if (bar) bar.style.strokeDashoffset = '0';
  });

  const currPlayer = activePlayers[currentTurnIdx];
  const bar = $(`#ring-${currPlayer}`);
  const maxDash = 113; // 2 * PI * 18

  turnTimer = setInterval(() => {
    timerProgress -= 2;
    if (bar) {
      const offset = maxDash * (1 - timerProgress / 100);
      bar.style.strokeDashoffset = offset.toString();
    }

    if (timerProgress <= 0) {
      clearInterval(turnTimer);
      // Auto handle timeout
      if (phase === 'roll') {
        rollDice();
      } else if (phase === 'move' && validMoves.length > 0) {
        onTokenClick(currPlayer, validMoves[0]);
      }
    }
  }, 300);
}

// 3D Dice rendering inside player's box
const DICE_DOT_LAYOUT = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

function renderMiniDice(panelIdx, val) {
  const diceEl = $(`#cube-${panelIdx}`);
  if (!diceEl) return;
  diceEl.innerHTML = '';
  const dots = DICE_DOT_LAYOUT[val] || [4];
  for (let j = 0; j < 9; j++) {
    const d = document.createElement('div');
    if (dots.includes(j)) {
      d.className = 'dot' + (val === 1 ? ' red-dot' : '');
    }
    diceEl.appendChild(d);
  }
}

// Dice Roll Logic
async function rollDice() {
  const currPlayer = activePlayers[currentTurnIdx];
  if (busy || phase !== 'roll' || gameOver) return;

  if (isOnlineMatch) {
    const currPlayerObj = (typeof roomPlayersList !== 'undefined' ? roomPlayersList : []).find(x => x.color === currPlayer);
    const isThisBotTurn = currPlayerObj && currPlayerObj.isBot && (typeof isRoomHost !== 'undefined' && isRoomHost);

    if (currPlayer !== myOnlineColor && !isThisBotTurn) return;
    if (socket) socket.emit('roll_dice', { playerColor: currPlayer });
    return;
  }

  busy = true;
  clearInterval(turnTimer);

  sounds.playDiceRoll();

  // Trigger roll animation on the active player's dice
  const diceEl = $(`#cube-${currPlayer}`);
  if (diceEl) diceEl.classList.add('rolling');

  for (let r = 0; r < 7; r++) {
    const tempVal = 1 + Math.floor(Math.random() * 6);
    renderMiniDice(currPlayer, tempVal);
    await sleep(65);
  }

  diceVal = 1 + Math.floor(Math.random() * 6);
  renderMiniDice(currPlayer, diceVal);
  if (diceEl) diceEl.classList.remove('rolling');

  setGameStatus(`${COLOR_NAMES[currPlayer]} rolled a ${diceVal}!`);

  // Rule: Three 6s in a row loses turn
  consecutiveSixes = diceVal === 6 ? consecutiveSixes + 1 : 0;
  if (consecutiveSixes === 3) {
    setGameStatus('Three 6s! Turn passed.');
    consecutiveSixes = 0;
    await sleep(800);
    busy = false;
    return nextTurn();
  }

  // Calculate legal moves
  validMoves = getLegalMoves(currPlayer, diceVal);
  if (validMoves.every(idx => T[currPlayer][idx] < 0)) {
    validMoves = validMoves.slice(0, 1);
  }

  if (validMoves.length === 0) {
    setGameStatus('No valid moves.');
    await sleep(800);
    busy = false;
    return nextTurn();
  }

  phase = 'move';
  busy = false;
  renderTokens();

  // Auto move if only 1 move available (Ludo King style)
  if (isAI(currPlayer)) {
    await sleep(550);
    const chosen = pickBestAIMove(currPlayer, validMoves, diceVal);
    moveToken(currPlayer, chosen);
  } else if (validMoves.length === 1) {
    await sleep(350);
    moveToken(currPlayer, validMoves[0]);
  } else {
    resetTurnTimer();
  }
}

function getLegalMoves(p, d) {
  const res = [];
  T[p].forEach((k, i) => {
    if (k < 0) {
      if (d === 6) res.push(i);
    } else if (k + d <= 56) {
      res.push(i);
    }
  });
  return res;
}

// Token Click
function onTokenClick(p, i) {
  if (phase !== 'move' || busy || gameOver) return;
  const currPlayer = activePlayers[currentTurnIdx];

  if (isOnlineMatch) {
    const currPlayerObj = (typeof roomPlayersList !== 'undefined' ? roomPlayersList : []).find(x => x.color === currPlayer);
    const isThisBotTurn = currPlayerObj && currPlayerObj.isBot && (typeof isRoomHost !== 'undefined' && isRoomHost);

    if (p !== myOnlineColor && !isThisBotTurn) return;
    if (currPlayer !== myOnlineColor && !isThisBotTurn) return;
    if (!validMoves.includes(i)) return;
    onOnlineTokenMove(p, i);
    return;
  }

  if (p !== currPlayer || isAI(p)) return;
  if (!validMoves.includes(i)) return;
  moveToken(p, i);
}

// Step-by-Step Jumping Token Movement
async function moveToken(p, i) {
  if (busy) return;
  busy = true;
  phase = 'anim';
  validMoves = [];
  clearInterval(turnTimer);

  const startK = T[p][i];
  if (startK < 0) {
    // Coming out of home base
    T[p][i] = 0;
    sounds.playStep();
    renderTokens();
    await sleep(220);
  } else {
    // Hop square by square
    for (let step = 0; step < diceVal; step++) {
      T[p][i]++;
      sounds.playStep();
      renderTokens();
      await sleep(140);
    }
  }

  const endK = T[p][i];
  let captured = false;

  // Check capture on opponent pawns (if on track 0..50 and not on a SAFE square)
  if (endK <= 50) {
    const landingSquare = (S[p] + endK) % 52;
    if (!SAFE.includes(landingSquare)) {
      activePlayers.forEach(opp => {
        if (opp === p) return;
        T[opp].forEach((oppK, oppIdx) => {
          if (oppK >= 0 && oppK <= 50 && (S[opp] + oppK) % 52 === landingSquare) {
            T[opp][oppIdx] = -1; // Send back to base!
            captured = true;
          }
        });
      });
    }
  }

  if (captured) {
    sounds.playCapture();
    setGameStatus(`Boom! ${COLOR_NAMES[p]} captured an opponent pawn!`);
    await sleep(400);
  }

  // Check if pawn reached home
  if (endK === 56) {
    sounds.playHome();
    setGameStatus(`Pawn reached Home! Extra roll!`);
  }

  renderTokens();

  // Check Game Winner (All 4 tokens reached 56)
  if (T[p].every(k => k === 56)) {
    return handleVictory(p);
  }

  // Extra roll rule: Six rolled, captured opponent, or reached home!
  if (diceVal === 6 || captured || endK === 56) {
    phase = 'roll';
    busy = false;
    updatePlayerPanels();
    if (!isOnlineMatch && isAI(p)) {
      await sleep(650);
      rollDice();
    }
  } else {
    nextTurn();
  }
}

function nextTurn() {
  currentTurnIdx = (currentTurnIdx + 1) % activePlayers.length;
  phase = 'roll';
  busy = false;
  validMoves = [];
  consecutiveSixes = 0;
  updatePlayerPanels();
  const nextPlayer = activePlayers[currentTurnIdx];
  setGameStatus(`${COLOR_NAMES[nextPlayer]}'s turn. Roll the dice!`);

  if (!isOnlineMatch && isAI(nextPlayer)) {
    setTimeout(rollDice, 700);
  }
}

// AI Heuristic Decision
function pickBestAIMove(p, moves, d) {
  let bestMove = moves[0];
  let bestScore = -1e9;

  moves.forEach(i => {
    const k = T[p][i];
    const targetK = k < 0 ? 0 : k + d;
    let score = Math.random() * 5 + (k < 0 ? 0 : k) * 0.2;

    // Check if captures
    if (targetK <= 50) {
      const land = (S[p] + targetK) % 52;
      if (!SAFE.includes(land)) {
        const canCapture = activePlayers.some(q => q !== p && T[q].some(x => x >= 0 && x <= 50 && (S[q] + x) % 52 === land));
        if (canCapture) score += 120;
      }
      if (SAFE.includes(land)) score += 30;
    }

    if (targetK === 56) score += 90; // reach finish
    if (k < 0) score += 60;          // leave base
    if (targetK > 50) score += 25;   // inside safe home runway

    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  });

  return bestMove;
}

// ================= VICTORY & CELEBRATION =================
function handleVictory(winnerColor) {
  gameOver = true;
  clearInterval(turnTimer);
  sounds.playWin();

  // If user won, award coins
  if (!isVsComputer || winnerColor === userColor) {
    userState.coins += potAmount;
    saveUserState();
    $('#win-prize-txt').textContent = `+${potAmount.toLocaleString()} Coins Won! 💰`;
  } else {
    $('#win-prize-txt').textContent = `Better luck next time!`;
  }

  $('#win-player-name').textContent = `${COLOR_NAMES[winnerColor].toUpperCase()} WINS! 👑`;
  $('#win-player-name').style.color = C[winnerColor];
  $('#modal-win').classList.add('active');

  startConfetti();
}

// Confetti Particle System
let confettiReq = null;
function startConfetti() {
  const canvas = $('#confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: Math.random() * 6 + 3,
    d: Math.random() * 50 + 10,
    color: ['#ffd700', '#e53935', '#2e7d32', '#1565c0', '#fbc02d', '#ff4081'][Math.floor(Math.random() * 6)],
    tilt: Math.random() * 10 - 10,
    tiltAngleIncremental: Math.random() * 0.07 + 0.05,
    tiltAngle: 0
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();

      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.d);
      p.tilt = Math.sin(p.tiltAngle) * 15;

      if (p.y > canvas.height) {
        p.x = Math.random() * canvas.width;
        p.y = -20;
      }
    });
    confettiReq = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (confettiReq) cancelAnimationFrame(confettiReq);
  const canvas = $('#confetti-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Start New Match
function startMatch() {
  gameOver = false;
  currentTurnIdx = 0;
  phase = 'roll';
  busy = false;
  consecutiveSixes = 0;

  activePlayers = numPlayers === 2 ? [0, 2] : numPlayers === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  T = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];

  buildBoard();
  createTokens();
  updatePlayerPanels();
  renderTokens();

  // Set initial dice faces
  activePlayers.forEach(p => renderMiniDice(p, 6));

  $('#pot-display').textContent = `💰 ${potAmount.toLocaleString()}`;
  setGameStatus('Match started! Tap your dice to roll.');

  // Bind dice box clicks
  activePlayers.forEach(p => {
    const box = $(`#dice-box-${p}`);
    if (box) box.onclick = () => {
      if (isOnlineMatch) {
        if (p === myOnlineColor && activePlayers[currentTurnIdx] === myOnlineColor) {
          rollDice();
        }
      } else if (p === activePlayers[currentTurnIdx] && !isAI(p)) {
        rollDice();
      }
    };
  });

  // Switch screens
  $('#lobby-screen').classList.remove('active');
  $('#game-screen').classList.add('active');
  $('#modal-mode').classList.remove('active');
  $('#modal-win').classList.remove('active');
  stopConfetti();
}

// ================= LUCKY SPIN WHEEL =================
const WHEEL_ITEMS = [
  { label: '100 Coins', color: '#e53935', coins: 100, gems: 0 },
  { label: '500 Coins', color: '#1e88e5', coins: 500, gems: 0 },
  { label: '2 Gems', color: '#8e24aa', coins: 0, gems: 2 },
  { label: '1,000 Coins', color: '#43a047', coins: 1000, gems: 0 },
  { label: '5 Gems', color: '#f57c00', coins: 0, gems: 5 },
  { label: '2,500 Coins', color: '#d32f2f', coins: 2500, gems: 0 },
  { label: '5,000 Coins', color: '#ffd600', coins: 5000, gems: 0 },
  { label: '10 Gems', color: '#00b0ff', coins: 0, gems: 10 }
];

let wheelAngle = 0;
let isSpinning = false;

function drawWheel() {
  const canvas = $('#wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 140, cy = 140, r = 130;
  const step = (Math.PI * 2) / WHEEL_ITEMS.length;

  ctx.clearRect(0, 0, 280, 280);

  WHEEL_ITEMS.forEach((item, i) => {
    const a = wheelAngle + i * step;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + step);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + step / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Trebuchet MS';
    ctx.fillText(item.label, r - 16, 4);
    ctx.restore();
  });

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd700';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

function spinWheel() {
  if (isSpinning) return;
  isSpinning = true;
  sounds.playClick();

  const extraSpins = 5 + Math.random() * 4;
  const targetRad = extraSpins * Math.PI * 2;
  const startAngle = wheelAngle;
  const duration = 3500;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    wheelAngle = startAngle + targetRad * ease;
    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      // Calculate prize
      const step = (Math.PI * 2) / WHEEL_ITEMS.length;
      const normalized = (Math.PI * 1.5 - (wheelAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const prizeIdx = Math.floor(normalized / step) % WHEEL_ITEMS.length;
      const prize = WHEEL_ITEMS[prizeIdx];

      sounds.playWin();
      userState.coins += prize.coins;
      userState.gems += prize.gems;
      saveUserState();

      alert(`🎉 You won: ${prize.label}!`);
      $('#modal-spin').classList.remove('active');
    }
  }
  requestAnimationFrame(animate);
}

// ================= 7 UP 7 DOWN MINI GAME =================
let sevenTarget = 'seven';
let sevenBetAmt = 100;
let isSevenRolling = false;

function rollSeven() {
  if (isSevenRolling) return;
  if (userState.coins < sevenBetAmt) {
    alert('Not enough coins!');
    return;
  }
  isSevenRolling = true;
  userState.coins -= sevenBetAmt;
  saveUserState();
  sounds.playDiceRoll();

  const d1El = $('#sd-1');
  const d2El = $('#sd-2');
  const resEl = $('#seven-result');

  let counter = 0;
  const iv = setInterval(() => {
    counter++;
    const v1 = 1 + Math.floor(Math.random() * 6);
    const v2 = 1 + Math.floor(Math.random() * 6);
    d1El.textContent = v1;
    d2El.textContent = v2;
    resEl.textContent = `Sum: ${v1 + v2}`;

    if (counter > 12) {
      clearInterval(iv);
      const f1 = 1 + Math.floor(Math.random() * 6);
      const f2 = 1 + Math.floor(Math.random() * 6);
      const sum = f1 + f2;
      d1El.textContent = f1;
      d2El.textContent = f2;
      resEl.textContent = `Total: ${sum}`;

      let won = false;
      let winAmt = 0;
      if (sevenTarget === 'down' && sum < 7) {
        won = true;
        winAmt = sevenBetAmt * 2;
      } else if (sevenTarget === 'seven' && sum === 7) {
        won = true;
        winAmt = sevenBetAmt * 3;
      } else if (sevenTarget === 'up' && sum > 7) {
        won = true;
        winAmt = sevenBetAmt * 2;
      }

      if (won) {
        sounds.playWin();
        userState.coins += winAmt;
        saveUserState();
        resEl.textContent = `🎉 Won +${winAmt} Coins!`;
        resEl.style.color = '#4caf50';
      } else {
        resEl.textContent = `Try Again! Sum was ${sum}`;
        resEl.style.color = '#ff5252';
      }
      isSevenRolling = false;
    }
  }, 75);
}

// ================= EVENT LISTENERS & UI SETUP =================
document.addEventListener('DOMContentLoaded', () => {
  saveUserState();
  buildBoard();
  drawWheel();

  // Lobby Mode Clicks
  $('#btn-mode-computer').onclick = () => {
    sounds.playClick();
    isVsComputer = true;
    $('#modal-mode-title').textContent = 'VS COMPUTER';
    $('#sec-your-color').style.display = 'flex';
    $('#modal-mode').classList.add('active');
  };

  $('#btn-mode-local').onclick = () => {
    sounds.playClick();
    isVsComputer = false;
    $('#modal-mode-title').textContent = 'PASS N PLAY';
    $('#sec-your-color').style.display = 'none';
    $('#modal-mode').classList.add('active');
  };

  $('#btn-mode-spin').onclick = () => {
    sounds.playClick();
    drawWheel();
    $('#modal-spin').classList.add('active');
  };

  $('#btn-mode-seven').onclick = () => {
    sounds.playClick();
    $('#modal-seven').classList.add('active');
  };

  // Mode Modal Controls
  $('#btn-close-mode').onclick = () => $('#modal-mode').classList.remove('active');
  $('#btn-close-spin').onclick = () => $('#modal-spin').classList.remove('active');
  $('#btn-close-seven').onclick = () => $('#modal-seven').classList.remove('active');

  $$('#seg-players .seg-btn').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#seg-players .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      numPlayers = parseInt(btn.dataset.val, 10);
    };
  });

  $$('.col-pick').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('.col-pick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      userColor = parseInt(btn.dataset.color, 10);
    };
  });

  $$('.bet-chip').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('.bet-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      potAmount = parseInt(btn.dataset.bet, 10) * numPlayers;
    };
  });

  $('#btn-start-match').onclick = () => {
    sounds.playClick();
    startMatch();
  };

  // In-Game Buttons
  $('#btn-game-exit').onclick = () => {
    sounds.playClick();
    if (confirm('Leave current match?')) {
      clearInterval(turnTimer);
      $('#game-screen').classList.remove('active');
      $('#lobby-screen').classList.add('active');
    }
  };

  $('#btn-game-sound').onclick = () => {
    const s = sounds.toggleSound();
    $('#btn-game-sound').textContent = s ? '🔊' : '🔇';
  };

  // Victory Buttons
  $('#btn-play-again').onclick = () => {
    sounds.playClick();
    $('#modal-win').classList.remove('active');
    startMatch();
  };

  $('#btn-win-home').onclick = () => {
    sounds.playClick();
    $('#modal-win').classList.remove('active');
    stopConfetti();
    $('#game-screen').classList.remove('active');
    $('#lobby-screen').classList.add('active');
  };

  // Spin Wheel & 7 Up Buttons
  $('#btn-spin-wheel').onclick = spinWheel;
  $('#btn-roll-seven').onclick = rollSeven;

  $$('.seven-box').forEach(box => {
    box.onclick = () => {
      sounds.playClick();
      $$('.seven-box').forEach(b => b.classList.remove('selected'));
      box.classList.add('selected');
      sevenTarget = box.dataset.target;
    };
  });

  $$('.chip-btn').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sevenBetAmt = parseInt(btn.dataset.amt, 10);
    };
  });

  // Settings Modal
  $('#btn-settings').onclick = () => {
    sounds.playClick();
    $('#modal-settings').classList.add('active');
  };

  $('#btn-save-settings').onclick = () => {
    sounds.playClick();
    const newName = $('#input-edit-name').value.trim();
    if (newName) {
      userState.name = newName;
      saveUserState();
    }
    $('#modal-settings').classList.remove('active');
  };

  $('#chk-sound').onchange = e => {
    sounds.soundEnabled = e.target.checked;
  };

  $('#chk-vib').onchange = e => {
    sounds.vibEnabled = e.target.checked;
  };

  $('#btn-sound-toggle').onclick = () => {
    const s = sounds.toggleSound();
    $('#btn-sound-toggle').textContent = `🔊 Sound: ${s ? 'ON' : 'OFF'}`;
  };

function showReaction(playerColor, emoji) {
  const bubble = $(`#bubble-${playerColor}`);
  if (!bubble) return;
  sounds.playClick();
  bubble.textContent = emoji;
  bubble.classList.add('pop');
  setTimeout(() => bubble.classList.remove('pop'), 2000);
}
window.showReaction = showReaction;

  $$('.reactions-bar .emoji-btn').forEach(btn => {
    btn.onclick = () => {
      const emoji = btn.dataset.emoji;
      const myColor = isOnlineMatch ? myOnlineColor : activePlayers[currentTurnIdx];
      showReaction(myColor, emoji);
      if (isOnlineMatch && socket) {
        socket.emit('send_reaction', { playerColor: myColor, emoji });
      }
    };
  });

  $('#btn-rules').onclick = () => {
    alert("👑 LUDO KING RULES:\n\n1. Roll a 6 to bring a pawn out of home.\n2. Rolling 6, capturing an opponent's pawn, or reaching home grants an EXTRA ROLL.\n3. Safe squares marked with Stars (★) protect your pawns from capture.\n4. Three consecutive 6s will forfeit your turn.\n5. The first player to bring all 4 pawns to the center wins the match!");
  };
});
