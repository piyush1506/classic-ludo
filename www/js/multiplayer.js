// ================= LUDO KING MULTIPLAYER CONTROLLER (V2) =================
let socket = null;
let isOnlineMatch = false;
let onlineRoomCode = null;
let myOnlineColor = 0;
let isRoomHost = false;
let roomPlayersList = [];
let roomMaxPlayers = 4;

function getServerUrl() {
  if (window.LUDO_SERVER_URL) return window.LUDO_SERVER_URL;
  return 'https://classic-ludo.onrender.com';
}

function initSocket() {
  if (socket && socket.connected) return socket;
  const url = getServerUrl();
  console.log('[Multiplayer] Connecting to:', url);

  const authUser = typeof Auth !== 'undefined' && Auth.currentUser ? Auth.currentUser : null;
  const token = typeof Auth !== 'undefined' ? Auth.token : localStorage.getItem('lk_auth_token');
  const userId = authUser ? authUser.id : (localStorage.getItem('lk_user_id') || localStorage.getItem('lk_guest_id'));
  const name = authUser ? authUser.username : (typeof userState !== 'undefined' ? userState.name : 'Player');
  const avatar = authUser ? authUser.avatar : '👑';

  try {
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 10000,
      auth: { token, userId, name, avatar }
    });

    socket.on('connect', () => {
      console.log('[Multiplayer] Connected! ID:', socket.id, 'User:', name);
    });

    socket.on('player_list_updated', (data) => {
      roomPlayersList = data.players || [];
      if (data.maxPlayers) roomMaxPlayers = data.maxPlayers;
      renderLobbyPlayers(roomPlayersList);
      renderMatchmakingSlots(roomPlayersList, roomMaxPlayers);
    });

    socket.on('game_started', (data) => {
      console.log('[Multiplayer] Game Started Event:', data);
      onOnlineGameStarted(data);
    });

    socket.on('dice_rolled', (data) => {
      console.log('[Multiplayer] Dice Rolled:', data);
      onRemoteDiceRolled(data.playerColor, data.diceVal);
    });

    socket.on('token_moved', (data) => {
      console.log('[Multiplayer] Token Moved:', data);
      onRemoteTokenMoved(data.playerColor, data.tokenIndex, data.diceVal);
    });

    socket.on('turn_changed', (data) => {
      console.log('[Multiplayer] Turn Changed:', data);
      onRemoteTurnChanged(data.nextPlayerColor);
    });

    socket.on('reaction_received', (data) => {
      if (typeof showReaction === 'function') {
        showReaction(data.playerColor, data.emoji);
      }
    });

    socket.on('player_left', () => {
      setGameStatus('A player disconnected.');
    });

    socket.on('error_msg', (msg) => {
      if (typeof setGameStatus === 'function') {
        setGameStatus(`⚠️ ${msg}`);
      } else {
        alert(`Notice: ${msg}`);
      }
    });

  } catch (e) {
    console.error('Socket init error:', e);
  }

  return socket;
}

// Render player slots in Waiting Lobby
function renderLobbyPlayers(players) {
  const listEl = $('#room-player-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  players.forEach((p) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.padding = '6px 10px';
    item.style.background = 'rgba(255,255,255,0.1)';
    item.style.borderRadius = '6px';

    const col = ['#e53935', '#2e7d32', '#fbc02d', '#1565c0'][p.color];
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">${p.flag || '🇮🇳'}</span>
        <span style="width:14px; height:14px; border-radius:50%; background:${col}; border:1.5px solid #fff;"></span>
        <span style="font-size:13px; font-weight:800; color:#fff;">${p.name} ${p.isHost ? '👑' : ''}${p.isBot ? ' 🤖' : ''}</span>
      </div>
      <span style="font-size:11px; color:#ffd700; font-weight:700;">${p.colorName}</span>
    `;
    listEl.appendChild(item);
  });

  const startBtn = $('#btn-start-room-match');
  const waitingTxt = $('#room-waiting-txt');
  if (isRoomHost) {
    startBtn.style.display = 'block';
    startBtn.textContent = players.length < 2 ? 'START MATCH (ADD BOTS)' : `START MATCH (${players.length} Players)`;
    waitingTxt.style.display = 'none';
  } else {
    startBtn.style.display = 'none';
    waitingTxt.style.display = 'block';
    waitingTxt.textContent = 'Waiting for Host to start match...';
  }
}

// Render Matchmaking Slots in Radar View
function renderMatchmakingSlots(players, maxCount = 4) {
  const slotsGrid = $('#mm-slots-container');
  if (!slotsGrid) return;

  const totalSlots = maxCount || 4;
  for (let i = 0; i < 4; i++) {
    const slot = $(`#mm-slot-${i}`);
    if (!slot) continue;
    if (i >= totalSlots) {
      slot.style.display = 'none';
      continue;
    }
    slot.style.display = 'flex';
    const p = players[i];
    if (p) {
      slot.className = 'mm-slot ready';
      slot.querySelector('.mm-avatar').textContent = p.avatar || '👑';
      slot.querySelector('.mm-flag').textContent = p.flag || '🇮🇳';
      slot.querySelector('.mm-name').textContent = p.name;
      slot.querySelector('.mm-badge').textContent = 'READY';
    } else {
      slot.className = 'mm-slot';
      slot.querySelector('.mm-avatar').textContent = '?';
      slot.querySelector('.mm-flag').textContent = '--';
      slot.querySelector('.mm-name').textContent = 'Searching...';
      slot.querySelector('.mm-badge').textContent = 'WAITING';
    }
  }
}

// When server starts match
async function onOnlineGameStarted(data) {
  isOnlineMatch = true;
  activePlayers = data.activeColors || [0, 1, 2, 3];
  numPlayers = activePlayers.length;
  isVsComputer = false;
  potAmount = data.pot || (500 * numPlayers);
  roomPlayersList = data.players || [];

  renderMatchmakingSlots(roomPlayersList, numPlayers);
  const mmStatus = $('#mm-status-txt');
  if (mmStatus) mmStatus.textContent = 'Match Found! Launching Board...';

  await sleep(900);

  // Close modals & screens
  $('#modal-online').classList.remove('active');
  $('#matchmaking-screen').classList.remove('active');

  // Start match
  startMatch();
  updatePlayerPanels();

  setGameStatus(`Match Started! ${COLOR_NAMES[data.currentTurnColor]}'s Turn.`);
}

// Remote Dice Roll Handler
async function onRemoteDiceRolled(playerColor, rolledVal) {
  busy = true;
  clearInterval(turnTimer);
  sounds.playDiceRoll();

  const diceEl = $(`#cube-${playerColor}`);
  if (diceEl) diceEl.classList.add('rolling');

  for (let r = 0; r < 6; r++) {
    renderMiniDice(playerColor, 1 + Math.floor(Math.random() * 6));
    await sleep(65);
  }

  diceVal = rolledVal;
  renderMiniDice(playerColor, diceVal);
  if (diceEl) diceEl.classList.remove('rolling');

  setGameStatus(`${COLOR_NAMES[playerColor]} rolled a ${diceVal}!`);

  validMoves = getLegalMoves(playerColor, diceVal);
  if (validMoves.every(idx => T[playerColor][idx] < 0)) {
    validMoves = validMoves.slice(0, 1);
  }

  if (validMoves.length === 0) {
    setGameStatus('No valid moves.');
    await sleep(800);
    busy = false;
    nextTurn();
    return;
  }

  phase = 'move';
  busy = false;
  renderTokens();

  // If this client is the current player and only 1 move, auto move
  if (playerColor === myOnlineColor) {
    if (validMoves.length === 1) {
      await sleep(350);
      onOnlineTokenMove(playerColor, validMoves[0]);
    } else {
      resetTurnTimer();
    }
  } else if (isRoomHost) {
    // If the rolling player is a bot, the Host acts on its behalf!
    const currPlayerObj = (roomPlayersList || []).find(x => x.color === playerColor);
    if (currPlayerObj && currPlayerObj.isBot) {
      await sleep(650);
      const chosen = pickBestAIMove(playerColor, validMoves, diceVal);
      onOnlineTokenMove(playerColor, chosen);
    }
  }
}

// Remote Token Move Handler
async function onRemoteTokenMoved(playerColor, tokenIndex, steps) {
  diceVal = steps;
  await moveToken(playerColor, tokenIndex);
}

// Remote Turn Changed Handler
function onRemoteTurnChanged(nextPlayerColor) {
  const newTurnIdx = activePlayers.indexOf(nextPlayerColor);
  if (newTurnIdx >= 0) {
    currentTurnIdx = newTurnIdx;
    phase = 'roll';
    busy = false;
    validMoves = [];
    consecutiveSixes = 0;
    updatePlayerPanels();
    setGameStatus(`${COLOR_NAMES[nextPlayerColor]}'s turn.`);
  }
}

// Client moves token in online game
function onOnlineTokenMove(p, i) {
  if (socket && isOnlineMatch) {
    socket.emit('move_token', {
      playerColor: p,
      tokenIndex: i,
      diceVal
    });
  }
}

// ================= MULTIPLAYER UI EVENT BINDINGS =================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Open Online Modal
  const btnOnline = $('#btn-mode-online');
  if (btnOnline) {
    btnOnline.onclick = () => {
      sounds.playClick();
      initSocket();
      $('#modal-online').classList.add('active');
    };
  }

  // 2. Tab Navigation
  $$('#online-tabs .seg-btn').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#online-tabs .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.dataset.tab;
      $$('.online-tab-content').forEach(tab => {
        tab.style.display = tab.id === targetTab ? 'block' : 'none';
      });
    };
  });

  // 3. Quick Match Setup
  let quickPlayersCount = 4;
  let quickBetCoins = 500;

  $$('#seg-quick-players .seg-btn').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#seg-quick-players .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quickPlayersCount = parseInt(btn.dataset.val, 10);
    };
  });

  $$('#tab-quick .bet-chip').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#tab-quick .bet-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quickBetCoins = parseInt(btn.dataset.bet, 10);
    };
  });

  // START QUICK MATCHMAKING (FIND REAL PLAYERS OR AUTO-FILL BOTS)
  $('#btn-start-quick').onclick = () => {
    sounds.playClick();
    const s = initSocket();
    if (!s) return alert('Connecting to server... please try in a moment.');

    // Show Matchmaking Screen
    $('#modal-online').classList.remove('active');
    $('#lobby-screen').classList.remove('active');
    $('#matchmaking-screen').classList.add('active');

    // Slot 0 is You
    renderMatchmakingSlots([{
      name: userState.name,
      avatar: '👑',
      flag: '🇮🇳'
    }], quickPlayersCount);
    $('#mm-status-txt').textContent = `Searching for ${quickPlayersCount}-Player online match...`;

    s.emit('quick_match', {
      name: userState.name,
      numPlayers: quickPlayersCount,
      bet: quickBetCoins,
      flag: '🇮🇳'
    }, (res) => {
      if (res && res.success) {
        onlineRoomCode = res.roomCode;
        myOnlineColor = res.yourColor;
        isRoomHost = res.yourColor === 0;
        renderMatchmakingSlots(res.players, quickPlayersCount);
      }
    });
  };

  // CANCEL MATCHMAKING
  $('#btn-cancel-matchmaking').onclick = () => {
    sounds.playClick();
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    $('#matchmaking-screen').classList.remove('active');
    $('#lobby-screen').classList.add('active');
  };

  // 4. Create Room
  let createMaxPlayers = 4;
  let createBetCoins = 500;

  $$('#seg-create-players .seg-btn').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#seg-create-players .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      createMaxPlayers = parseInt(btn.dataset.val, 10);
    };
  });

  $$('#tab-create .bet-chip').forEach(btn => {
    btn.onclick = () => {
      sounds.playClick();
      $$('#tab-create .bet-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      createBetCoins = parseInt(btn.dataset.bet, 10);
    };
  });

  $('#btn-create-room').onclick = () => {
    sounds.playClick();
    const s = initSocket();
    if (!s) return alert('Connecting to server...');

    s.emit('create_room', {
      name: userState.name,
      numPlayers: createMaxPlayers,
      bet: createBetCoins,
      flag: '🇮🇳'
    }, (res) => {
      if (res && res.success) {
        onlineRoomCode = res.roomCode;
        myOnlineColor = res.yourColor;
        isRoomHost = true;

        $('#display-room-code').textContent = res.roomCode;
        $$('.online-tab-content').forEach(t => t.style.display = 'none');
        $('#tab-room-lobby').style.display = 'block';
        renderLobbyPlayers(res.players);
      }
    });
  };

  // 5. Join Room
  $('#btn-join-room').onclick = () => {
    sounds.playClick();
    const code = $('#input-room-code').value.trim().toUpperCase();
    if (!code || code.length < 4) {
      alert('Please enter a valid 4-character Room Code!');
      return;
    }

    const s = initSocket();
    if (!s) return alert('Connecting to server...');

    s.emit('join_room', {
      code,
      name: userState.name,
      flag: '🇮🇳'
    }, (res) => {
      if (res && res.success) {
        onlineRoomCode = res.roomCode;
        myOnlineColor = res.yourColor;
        isRoomHost = false;

        $('#display-room-code').textContent = res.roomCode;
        $$('.online-tab-content').forEach(t => t.style.display = 'none');
        $('#tab-room-lobby').style.display = 'block';
        renderLobbyPlayers(res.players);
      } else {
        alert(res?.message || 'Could not join room!');
      }
    });
  };

  // 6. Host starts match
  $('#btn-start-room-match').onclick = () => {
    sounds.playClick();
    if (socket && isRoomHost) {
      socket.emit('start_game');
    }
  };

  $('#btn-close-online').onclick = () => {
    sounds.playClick();
    $('#modal-online').classList.remove('active');
  };
});
