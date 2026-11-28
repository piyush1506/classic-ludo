// ================= LUDO KING REALTIME BACKEND SERVER =================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'www')));

// ================= PERSISTENT USER DATABASE =================
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let users = {};

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      users = JSON.parse(data);
    }
  } catch (err) {
    console.error('[DB] Error loading users.json:', err);
    users = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error saving users.json:', err);
  }
}

loadUsers();

// Password & Token Utilities
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function findUserByToken(token) {
  if (!token) return null;
  return Object.values(users).find(u => u.token === token) || null;
}

function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, salt, ...safe } = u;
  return safe;
}

// ================= AUTHENTICATION REST APIS =================

// 1. REGISTER NEW USER (Manual Account)
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, avatar = '👑' } = req.body || {};
  const cleanName = (username || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ success: false, message: 'Username must be at least 2 characters.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
  }

  // Check if username or email already exists
  const existing = Object.values(users).find(
    u => u.username.toLowerCase() === cleanName.toLowerCase() || (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );
  if (existing) {
    return res.status(400).json({ success: false, message: 'Username or Email is already registered.' });
  }

  const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
  const salt = crypto.randomBytes(16).toString('hex');
  const token = generateToken();

  const newUser = {
    id: userId,
    username: cleanName,
    email: cleanEmail || null,
    avatar: avatar || '👑',
    pictureUrl: null,
    authProvider: 'manual',
    passwordHash: hashPassword(password, salt),
    salt,
    token,
    coins: 10000,
    gems: 50,
    level: 1,
    stats: { matches: 0, wins: 0, trophies: 100 },
    createdAt: new Date().toISOString()
  };

  users[userId] = newUser;
  saveUsers();
  console.log(`[Auth] Registered new user: ${cleanName} (${userId})`);

  res.json({
    success: true,
    message: 'Account created successfully!',
    token,
    user: sanitizeUser(newUser)
  });
});

// 2. LOGIN (Manual Account)
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  const cleanId = (identifier || '').trim().toLowerCase();

  if (!cleanId || !password) {
    return res.status(400).json({ success: false, message: 'Please provide username/email and password.' });
  }

  const user = Object.values(users).find(
    u => (u.username && u.username.toLowerCase() === cleanId) || (u.email && u.email.toLowerCase() === cleanId)
  );

  if (!user || !user.salt || !user.passwordHash) {
    return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
  }

  const inputHash = hashPassword(password, user.salt);
  if (inputHash !== user.passwordHash) {
    return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
  }

  user.token = generateToken();
  saveUsers();
  console.log(`[Auth] User logged in: ${user.username} (${user.id})`);

  res.json({
    success: true,
    token: user.token,
    user: sanitizeUser(user)
  });
});

// 3. GOOGLE SIGN-IN (Google Auth & One-Tap)
app.post('/api/auth/google', (req, res) => {
  const { credential, userInfo } = req.body || {};
  let email = '';
  let name = '';
  let picture = '';
  let googleId = '';

  if (userInfo && (userInfo.email || userInfo.name)) {
    email = (userInfo.email || '').toLowerCase();
    name = (userInfo.name || 'Google Player').slice(0, 14);
    picture = userInfo.picture || '';
    googleId = userInfo.sub || userInfo.id || '';
  } else if (credential) {
    try {
      // Decode JWT payload (without external libraries)
      const parts = credential.split('.');
      if (parts.length >= 2) {
        const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadStr);
        email = (payload.email || '').toLowerCase();
        name = (payload.name || payload.given_name || 'Google Player').slice(0, 14);
        picture = payload.picture || '';
        googleId = payload.sub || '';
      }
    } catch (e) {
      console.warn('[Auth] Error decoding Google credential:', e);
    }
  }

  if (!email && !googleId) {
    return res.status(400).json({ success: false, message: 'Invalid Google authentication data.' });
  }

  // Find existing user by googleId or email
  let user = Object.values(users).find(
    u => (googleId && u.googleId === googleId) || (email && u.email && u.email.toLowerCase() === email)
  );

  if (user) {
    user.googleId = googleId || user.googleId;
    user.pictureUrl = picture || user.pictureUrl;
    user.token = generateToken();
    user.authProvider = 'google';
  } else {
    // Create new Google-linked user
    const userId = 'usr_g_' + (googleId ? googleId.slice(-6) : crypto.randomUUID().slice(0, 6));
    user = {
      id: userId,
      username: name || 'Player ' + userId.slice(-4),
      email: email || null,
      avatar: '👑',
      pictureUrl: picture || null,
      googleId: googleId || null,
      authProvider: 'google',
      token: generateToken(),
      coins: 15000, // 5,000 bonus coins for connecting Google
      gems: 100,
      level: 1,
      stats: { matches: 0, wins: 0, trophies: 150 },
      createdAt: new Date().toISOString()
    };
    users[userId] = user;
  }

  saveUsers();
  console.log(`[Auth] Google login successful: ${user.username} (${user.id})`);

  res.json({
    success: true,
    token: user.token,
    user: sanitizeUser(user)
  });
});

// 4. GUEST LOGIN (Persistent Unique Guest Account)
app.post('/api/auth/guest', (req, res) => {
  const { existingGuestId, name, avatar = '👤' } = req.body || {};

  let user = null;
  if (existingGuestId && users[existingGuestId]) {
    user = users[existingGuestId];
  } else {
    const guestSuffix = Math.floor(1000 + Math.random() * 9000);
    const userId = 'guest_' + crypto.randomUUID().slice(0, 8);
    user = {
      id: userId,
      username: (name || 'Guest ' + guestSuffix).slice(0, 14),
      email: null,
      avatar: avatar || '👤',
      pictureUrl: null,
      authProvider: 'guest',
      token: generateToken(),
      coins: 10000,
      gems: 50,
      level: 1,
      stats: { matches: 0, wins: 0, trophies: 50 },
      createdAt: new Date().toISOString()
    };
    users[userId] = user;
    saveUsers();
    console.log(`[Auth] Created persistent guest account: ${user.username} (${user.id})`);
  }

  res.json({
    success: true,
    token: user.token,
    user: sanitizeUser(user)
  });
});

// 5. CURRENT USER PROFILE (/api/auth/me)
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const user = findUserByToken(token);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
  }

  res.json({
    success: true,
    user: sanitizeUser(user)
  });
});

// 6. UPDATE PROFILE (Name, Avatar, Country)
app.post('/api/auth/update', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const user = findUserByToken(token);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { name, avatar, country, flag } = req.body || {};
  if (name && name.trim().length >= 2) user.username = name.trim().slice(0, 14);
  if (avatar) user.avatar = avatar;
  if (country) user.country = country;
  if (flag) user.flag = flag;

  saveUsers();
  res.json({ success: true, user: sanitizeUser(user) });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: Object.keys(rooms).length,
    totalRegisteredUsers: Object.keys(users).length,
    timestamp: new Date().toISOString()
  });
});

// ================= REALTIME MULTIPLAYER MATCH ENGINE =================
const rooms = {};

const HUMAN_BOTS = [
  { name: 'Aravind', flag: '🇮🇳', country: 'India', avatar: '👨' },
  { name: 'Surya Reddy', flag: '🇮🇳', country: 'India', avatar: '🌻' },
  { name: 'Queen B', flag: '🇺🇸', country: 'USA', avatar: '👩' },
  { name: 'Rohan J.', flag: '🇮🇳', country: 'India', avatar: '👑' },
  { name: 'Alex M.', flag: '🇬🇧', country: 'UK', avatar: '⚡' },
  { name: 'David K.', flag: '🇦🇺', country: 'Australia', avatar: '🦁' },
  { name: 'Priya S.', flag: '🇮🇳', country: 'India', avatar: '🌸' },
  { name: 'Vikram S.', flag: '🇮🇳', country: 'India', avatar: '🐯' },
  { name: 'Sophia L.', flag: '🇨🇦', country: 'Canada', avatar: '💎' },
  { name: 'Kabir Khan', flag: '🇮🇳', country: 'India', avatar: '🎯' }
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

// Helper to fill remaining empty slots in room with realistic bots
function fillRoomWithBotsAndStart(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.status !== 'waiting') return;

  const usedColors = room.players.map(p => p.color);
  const usedNames = room.players.map(p => p.name.toLowerCase());
  const availableBots = HUMAN_BOTS.filter(b => !usedNames.includes(b.name.toLowerCase()));

  let requiredColors = room.maxPlayers === 2 ? [0, 2] : room.maxPlayers === 3 ? [0, 1, 2] : [0, 1, 2, 3];

  requiredColors.forEach((col, idx) => {
    if (!usedColors.includes(col)) {
      const botProfile = availableBots[idx % availableBots.length] || { name: `Player ${col + 1}`, flag: '🌍', country: 'Global', avatar: '👑' };
      const botPlayer = {
        userId: `bot_${col}_${Date.now()}`,
        id: `bot_${col}_${Date.now()}`,
        name: botProfile.name,
        flag: botProfile.flag,
        country: botProfile.country,
        avatar: botProfile.avatar,
        color: col,
        colorName: COLOR_NAMES[col],
        isHost: false,
        isBot: true
      };
      room.players.push(botPlayer);
    }
  });

  room.status = 'in_game';
  const activeColors = room.players.map(p => p.color);
  room.activeColors = activeColors;
  room.currentTurnColor = activeColors[0];

  console.log(`[Auto-Filled Match] Room ${roomCode} started with players:`, room.players.map(p => `${p.name} (${p.colorName}${p.isBot ? ' - Bot' : ''})`));

  io.to(roomCode).emit('player_list_updated', { players: room.players, maxPlayers: room.maxPlayers });
  io.to(roomCode).emit('game_started', {
    players: room.players,
    activeColors,
    currentTurnColor: room.currentTurnColor,
    pot: room.betAmount * room.players.length
  });
}

// Socket Authentication Middleware
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  let token = auth.token;
  let user = findUserByToken(token);

  if (!user && auth.userId && users[auth.userId]) {
    user = users[auth.userId];
  }

  if (user) {
    socket.user = sanitizeUser(user);
  } else {
    // Ephemeral or guest fallback
    socket.user = {
      id: auth.userId || 'anon_' + socket.id.slice(0, 6),
      username: auth.name || 'Player',
      avatar: auth.avatar || '👑',
      flag: auth.flag || '🇮🇳'
    };
  }

  next();
});

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id} (User: ${socket.user.username} | ${socket.user.id})`);

  // 1. RANDOM MATCHMAKING (QUICK COMPETITION)
  socket.on('quick_match', (data, callback) => {
    const { numPlayers = 4, bet = 500, flag = '🇮🇳' } = data || {};
    const wantedCount = parseInt(numPlayers, 10);
    const user = socket.user;

    // Look for an existing waiting room with matching player count
    let foundRoom = null;
    for (const code in rooms) {
      const r = rooms[code];
      if (r.isQuickMatch && r.status === 'waiting' && r.maxPlayers === wantedCount && r.players.length < wantedCount) {
        foundRoom = r;
        break;
      }
    }

    if (foundRoom) {
      // Assign next slot color (2: [0,2], 3: [0,1,2], 4: [0,1,2,3])
      const targetColors = wantedCount === 2 ? [0, 2] : wantedCount === 3 ? [0, 1, 2] : [0, 1, 2, 3];
      const usedColors = foundRoom.players.map(p => p.color);
      let assignedColor = targetColors.find(c => !usedColors.includes(c)) || 0;

      const player = {
        userId: user.id,
        id: socket.id,
        name: (user.username || 'Player').slice(0, 14),
        flag: flag || user.flag || '🇮🇳',
        country: 'India',
        avatar: user.avatar || '👑',
        pictureUrl: user.pictureUrl || null,
        color: assignedColor,
        colorName: COLOR_NAMES[assignedColor],
        isHost: false,
        isBot: false
      };

      foundRoom.players.push(player);
      socket.join(foundRoom.code);
      socket.currentRoom = foundRoom.code;

      console.log(`[Quick Match] ${player.name} (${user.id}) joined room ${foundRoom.code} (${foundRoom.players.length}/${foundRoom.maxPlayers})`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: foundRoom.code,
          players: foundRoom.players,
          yourColor: assignedColor
        });
      }

      io.to(foundRoom.code).emit('player_list_updated', { players: foundRoom.players, maxPlayers: foundRoom.maxPlayers });

      // If room is full, cancel bot timer & start immediately!
      if (foundRoom.players.length >= foundRoom.maxPlayers) {
        if (foundRoom.botTimer) clearTimeout(foundRoom.botTimer);
        foundRoom.status = 'in_game';
        const activeColors = foundRoom.players.map(p => p.color);
        foundRoom.activeColors = activeColors;
        foundRoom.currentTurnColor = activeColors[0];
        io.to(foundRoom.code).emit('game_started', {
          players: foundRoom.players,
          activeColors,
          currentTurnColor: foundRoom.currentTurnColor,
          pot: foundRoom.betAmount * foundRoom.players.length
        });
      }
    } else {
      // Create new Quick Match Room with 5-Second Fallback to Bots
      const code = generateRoomCode();
      const room = {
        code,
        hostId: socket.id,
        hostUserId: user.id,
        maxPlayers: wantedCount,
        betAmount: parseInt(bet, 10),
        status: 'waiting',
        isQuickMatch: true,
        activeColors: [],
        currentTurnColor: 0,
        players: [
          {
            userId: user.id,
            id: socket.id,
            name: (user.username || 'Player').slice(0, 14),
            flag: flag || user.flag || '🇮🇳',
            country: 'India',
            avatar: user.avatar || '👑',
            pictureUrl: user.pictureUrl || null,
            color: 0, // Host is Red
            colorName: COLOR_NAMES[0],
            isHost: true,
            isBot: false
          }
        ]
      };

      rooms[code] = room;
      socket.join(code);
      socket.currentRoom = code;

      console.log(`[Quick Match Created] Room: ${code} by ${user.username} (${user.id}) for ${wantedCount} players.`);

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: code, players: room.players, yourColor: 0 });
      }

      // 5-Second Bot Fallback
      room.botTimer = setTimeout(() => {
        if (rooms[code] && rooms[code].status === 'waiting') {
          console.log(`[Matchmaking Timeout] Auto-filling room ${code} with bots...`);
          fillRoomWithBotsAndStart(code);
        }
      }, 5000);
    }
  });

  // 2. CREATE PRIVATE ROOM
  socket.on('create_room', (data, callback) => {
    const { numPlayers = 4, bet = 500, flag = '🇮🇳' } = data || {};
    const code = generateRoomCode();
    const user = socket.user;

    const room = {
      code,
      hostId: socket.id,
      hostUserId: user.id,
      maxPlayers: parseInt(numPlayers, 10),
      betAmount: parseInt(bet, 10),
      status: 'waiting',
      isQuickMatch: false,
      activeColors: [],
      currentTurnColor: 0,
      players: [
        {
          userId: user.id,
          id: socket.id,
          name: (user.username || 'Host').slice(0, 14),
          flag: flag || user.flag || '🇮🇳',
          country: 'India',
          avatar: user.avatar || '👑',
          pictureUrl: user.pictureUrl || null,
          color: 0, // Red
          colorName: COLOR_NAMES[0],
          isHost: true,
          isBot: false
        }
      ]
    };

    rooms[code] = room;
    socket.join(code);
    socket.currentRoom = code;

    console.log(`[Private Room Created] Code: ${code} by ${user.username} (${user.id})`);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: code, players: room.players, yourColor: 0 });
    }
  });

  // 3. JOIN PRIVATE ROOM
  socket.on('join_room', (data, callback) => {
    const { code, flag = '🇮🇳' } = data || {};
    const cleanCode = (code || '').trim().toUpperCase();
    const room = rooms[cleanCode];
    const user = socket.user;

    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room not found! Check code.' });
      return;
    }

    if (room.status !== 'waiting') {
      if (typeof callback === 'function') callback({ success: false, message: 'Game already in progress!' });
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room is full!' });
      return;
    }

    const targetColors = room.maxPlayers === 2 ? [0, 2] : room.maxPlayers === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    const usedColors = room.players.map(p => p.color);
    let assignedColor = targetColors.find(c => !usedColors.includes(c)) || 1;

    const newPlayer = {
      userId: user.id,
      id: socket.id,
      name: (user.username || 'Guest').slice(0, 14),
      flag: flag || user.flag || '🇮🇳',
      country: 'India',
      avatar: user.avatar || '💙',
      pictureUrl: user.pictureUrl || null,
      color: assignedColor,
      colorName: COLOR_NAMES[assignedColor],
      isHost: false,
      isBot: false
    };

    room.players.push(newPlayer);
    socket.join(cleanCode);
    socket.currentRoom = cleanCode;

    console.log(`[Player Joined] ${user.username} (${user.id}) joined ${cleanCode} as ${COLOR_NAMES[assignedColor]}`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: cleanCode,
        players: room.players,
        yourColor: assignedColor,
        betAmount: room.betAmount
      });
    }

    io.to(cleanCode).emit('player_list_updated', { players: room.players, maxPlayers: room.maxPlayers });
  });

  // 4. HOST STARTS THE MATCH
  socket.on('start_game', () => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!room) return;

    if (room.hostId !== socket.id && room.hostUserId !== socket.user.id) {
      socket.emit('error_msg', 'Only the host can start the match.');
      return;
    }

    if (room.players.length < room.maxPlayers) {
      fillRoomWithBotsAndStart(code);
    } else {
      room.status = 'in_game';
      const activeColors = room.players.map(p => p.color);
      room.activeColors = activeColors;
      room.currentTurnColor = activeColors[0];
      io.to(code).emit('game_started', {
        players: room.players,
        activeColors,
        currentTurnColor: room.currentTurnColor,
        pot: room.betAmount * room.players.length
      });
    }
  });

  // 5. SYNCHRONIZED & TURN-VALIDATED DICE ROLL
  socket.on('roll_dice', (data) => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!room || room.status !== 'in_game') return;

    const requestedColor = data.playerColor;
    const currentTurnColor = room.currentTurnColor !== undefined ? room.currentTurnColor : requestedColor;

    // Validate turn ownership: Ensure the person rolling actually owns this turn!
    const activePlayer = room.players.find(p => p.color === currentTurnColor);
    if (!activePlayer) return;

    // If it's a real player's turn, only that player's user account can roll
    if (!activePlayer.isBot) {
      if (activePlayer.userId !== socket.user.id && activePlayer.id !== socket.id) {
        console.warn(`[Turn Check Blocked] ${socket.user.username} tried rolling for ${COLOR_NAMES[currentTurnColor]} out of turn!`);
        return socket.emit('error_msg', `Not your turn! It's ${activePlayer.name}'s turn.`);
      }
    } else {
      // If it's a bot's turn, only the Host client can trigger it
      if (room.hostId !== socket.id && room.hostUserId !== socket.user.id) {
        return;
      }
    }

    const diceVal = Math.floor(Math.random() * 6) + 1;
    console.log(`[Dice Roll Approved] Room: ${code}, Player: ${activePlayer.name} (${COLOR_NAMES[currentTurnColor]}), Val: ${diceVal}`);

    io.to(code).emit('dice_rolled', {
      playerColor: currentTurnColor,
      diceVal,
      userId: activePlayer.userId
    });
  });

  // 6. SYNCHRONIZED & TURN-VALIDATED TOKEN MOVE
  socket.on('move_token', (data) => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!code || !room) return;

    const currentTurnColor = room.currentTurnColor !== undefined ? room.currentTurnColor : data.playerColor;
    const activePlayer = room.players.find(p => p.color === currentTurnColor);
    if (!activePlayer) return;

    if (!activePlayer.isBot) {
      if (activePlayer.userId !== socket.user.id && activePlayer.id !== socket.id) {
        return socket.emit('error_msg', "Not your turn to move!");
      }
    }

    io.to(code).emit('token_moved', {
      playerColor: currentTurnColor,
      tokenIndex: data.tokenIndex,
      diceVal: data.diceVal,
      userId: activePlayer.userId
    });
  });

  // 7. SYNCHRONIZED TURN CHANGE
  socket.on('change_turn', (data) => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!code || !room) return;

    room.currentTurnColor = data.nextPlayerColor;
    const nextPlayer = room.players.find(p => p.color === data.nextPlayerColor);

    console.log(`[Turn Advance] Room: ${code} -> Turn now: ${nextPlayer ? nextPlayer.name : data.nextPlayerColor} (${COLOR_NAMES[data.nextPlayerColor]})`);

    io.to(code).emit('turn_changed', {
      nextPlayerColor: data.nextPlayerColor,
      userId: nextPlayer ? nextPlayer.userId : null
    });
  });

  // 8. WINNER REWARD / PERSISTENCE
  socket.on('player_won', (data) => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!room) return;

    const winnerColor = data.playerColor;
    const winnerPlayer = room.players.find(p => p.color === winnerColor);
    if (!winnerPlayer) return;

    const potWon = (room.betAmount || 500) * room.players.length;
    console.log(`[Game Won] ${winnerPlayer.name} won room ${code}! Prize: ${potWon}`);

    // If real user won, credit persistent coins & wins!
    if (winnerPlayer.userId && users[winnerPlayer.userId]) {
      const u = users[winnerPlayer.userId];
      u.coins = (u.coins || 0) + potWon;
      u.stats = u.stats || { matches: 0, wins: 0 };
      u.stats.wins = (u.stats.wins || 0) + 1;
      u.stats.matches = (u.stats.matches || 0) + 1;
      saveUsers();
      console.log(`[DB Award] Credited ${potWon} coins to ${u.username}. New balance: ${u.coins}`);
    }

    io.to(code).emit('game_over', {
      winnerColor,
      winnerName: winnerPlayer.name,
      userId: winnerPlayer.userId,
      prizePot: potWon
    });
  });

  // 9. EMOJI & CHAT REACTIONS
  socket.on('send_reaction', (data) => {
    const code = socket.currentRoom;
    if (!code) return;

    io.to(code).emit('reaction_received', {
      playerColor: data.playerColor,
      emoji: data.emoji,
      userId: socket.user.id
    });
  });

  // 10. DISCONNECT & CLEANUP
  socket.on('disconnect', () => {
    const code = socket.currentRoom;
    if (code && rooms[code]) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      console.log(`[-] Player left room: ${code} (${socket.user.username})`);

      if (room.players.every(p => p.isBot) || room.players.length === 0) {
        if (room.botTimer) clearTimeout(room.botTimer);
        delete rooms[code];
        console.log(`[x] Room closed: ${code}`);
      } else {
        io.to(code).emit('player_left', {
          socketId: socket.id,
          userId: socket.user.id,
          players: room.players
        });
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`  👑 LUDO KING MULTIPLAYER + AUTH SERVER (ONLINE)`);
  console.log(`  🚀 Port: ${PORT}`);
  console.log(`  🌐 Web Access: http://localhost:${PORT}`);
  console.log(`  👥 Total Registered Users: ${Object.keys(users).length}`);
  console.log(`=================================================\n`);
});
