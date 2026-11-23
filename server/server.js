// ================= LUDO KING REALTIME BACKEND SERVER =================
const express = require('express');
const http = require('http');
const path = require('path');
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

// Serve static frontend files (accessible at http://localhost:3000)
app.use(express.static(path.join(__dirname, '..', 'www')));

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: Object.keys(rooms).length,
    timestamp: new Date().toISOString()
  });
});

// Rooms Memory Store
const rooms = {};

// Pool of Realistic Human Names & Flags for Auto-Fill Bots
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

// Helper: 4-character Room Code Generator
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

// 0: Red (Top-Left), 1: Green (Top-Right), 2: Yellow (Bottom-Right), 3: Blue (Bottom-Left)
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

// Helper to fill remaining empty slots in room with realistic bots
function fillRoomWithBotsAndStart(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.status !== 'waiting') return;

  const usedColors = room.players.map(p => p.color);
  const usedNames = room.players.map(p => p.name.toLowerCase());
  const availableBots = HUMAN_BOTS.filter(b => !usedNames.includes(b.name.toLowerCase()));

  // 2-player mode uses colors [0, 2] (Red & Yellow)
  // 4-player mode uses colors [0, 1, 2, 3]
  let requiredColors = room.maxPlayers === 2 ? [0, 2] : [0, 1, 2, 3];
  if (room.maxPlayers === 3) requiredColors = [0, 1, 2];

  requiredColors.forEach((col, idx) => {
    if (!usedColors.includes(col)) {
      const botProfile = availableBots[idx % availableBots.length] || { name: `Player ${col + 1}`, flag: '🌍', country: 'Global', avatar: '🤖' };
      const botPlayer = {
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

  console.log(`[Auto-Filled Match] Room ${roomCode} started with players:`, room.players.map(p => `${p.name} (${p.colorName}${p.isBot ? ' - Bot' : ''})`));

  io.to(roomCode).emit('player_list_updated', { players: room.players, maxPlayers: room.maxPlayers });
  io.to(roomCode).emit('game_started', {
    players: room.players,
    activeColors,
    currentTurnColor: activeColors[0],
    pot: room.betAmount * room.players.length
  });
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // 1. RANDOM MATCHMAKING (QUICK COMPETITION)
  socket.on('quick_match', (data, callback) => {
    const { name = 'Player', numPlayers = 4, bet = 500, flag = '🇮🇳' } = data || {};
    const wantedCount = parseInt(numPlayers, 10);

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
      // Assign next slot color (2 players: [0, 2], 3 players: [0, 1, 2], 4 players: [0, 1, 2, 3])
      const targetColors = wantedCount === 2 ? [0, 2] : wantedCount === 3 ? [0, 1, 2] : [0, 1, 2, 3];
      const usedColors = foundRoom.players.map(p => p.color);
      let assignedColor = targetColors.find(c => !usedColors.includes(c)) || 0;

      const player = {
        id: socket.id,
        name: (name || 'Player').slice(0, 12),
        flag: flag || '🇮🇳',
        country: 'India',
        avatar: '👑',
        color: assignedColor,
        colorName: COLOR_NAMES[assignedColor],
        isHost: false,
        isBot: false
      };

      foundRoom.players.push(player);
      socket.join(foundRoom.code);
      socket.currentRoom = foundRoom.code;

      console.log(`[Quick Match] ${name} joined room ${foundRoom.code} (${foundRoom.players.length}/${foundRoom.maxPlayers})`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: foundRoom.code,
          players: foundRoom.players,
          yourColor: assignedColor
        });
      }

      io.to(foundRoom.code).emit('player_list_updated', { players: foundRoom.players, maxPlayers: foundRoom.maxPlayers });

      // If room is now full of real players, cancel bot timer & start immediately!
      if (foundRoom.players.length >= foundRoom.maxPlayers) {
        if (foundRoom.botTimer) clearTimeout(foundRoom.botTimer);
        foundRoom.status = 'in_game';
        const activeColors = foundRoom.players.map(p => p.color);
        io.to(foundRoom.code).emit('game_started', {
          players: foundRoom.players,
          activeColors,
          currentTurnColor: activeColors[0],
          pot: foundRoom.betAmount * foundRoom.players.length
        });
      }
    } else {
      // Create new Quick Match Room with a 5-second Smart Fallback to Human Bots
      const code = generateRoomCode();
      const room = {
        code,
        hostId: socket.id,
        maxPlayers: wantedCount,
        betAmount: parseInt(bet, 10),
        status: 'waiting',
        isQuickMatch: true,
        players: [
          {
            id: socket.id,
            name: (name || 'Player').slice(0, 12),
            flag: flag || '🇮🇳',
            country: 'India',
            avatar: '👑',
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

      console.log(`[Quick Match Created] Room: ${code} by ${name}. Starting 5s matchmaking search...`);

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: code, players: room.players, yourColor: 0 });
      }

      // 5-Second Search: If real players not found, fill with realistic bots!
      room.botTimer = setTimeout(() => {
        if (rooms[code] && rooms[code].status === 'waiting') {
          console.log(`[Matchmaking Timeout] Filling room ${code} with human-named bots...`);
          fillRoomWithBotsAndStart(code);
        }
      }, 5000);
    }
  });

  // 2. CREATE PRIVATE ROOM
  socket.on('create_room', (data, callback) => {
    const { name = 'Player', numPlayers = 4, bet = 500, flag = '🇮🇳' } = data || {};
    const code = generateRoomCode();

    const room = {
      code,
      hostId: socket.id,
      maxPlayers: parseInt(numPlayers, 10),
      betAmount: parseInt(bet, 10),
      status: 'waiting',
      isQuickMatch: false,
      players: [
        {
          id: socket.id,
          name: (name || 'Host').slice(0, 12),
          flag: flag || '🇮🇳',
          country: 'India',
          avatar: '👑',
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

    console.log(`[Private Room Created] Code: ${code} by ${name}`);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: code, players: room.players, yourColor: 0 });
    }
  });

  // 3. JOIN PRIVATE ROOM
  socket.on('join_room', (data, callback) => {
    const { code, name = 'Player', flag = '🇮🇳' } = data || {};
    const cleanCode = (code || '').trim().toUpperCase();
    const room = rooms[cleanCode];

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

    const targetColors = room.maxPlayers === 2 ? [0, 2] : [0, 1, 2, 3];
    const usedColors = room.players.map(p => p.color);
    let assignedColor = targetColors.find(c => !usedColors.includes(c)) || 1;

    const newPlayer = {
      id: socket.id,
      name: (name || 'Guest').slice(0, 12),
      flag: flag || '🇮🇳',
      country: 'India',
      avatar: '💙',
      color: assignedColor,
      colorName: COLOR_NAMES[assignedColor],
      isHost: false,
      isBot: false
    };

    room.players.push(newPlayer);
    socket.join(cleanCode);
    socket.currentRoom = cleanCode;

    console.log(`[Player Joined] ${name} joined room ${cleanCode} as ${COLOR_NAMES[assignedColor]}`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: cleanCode,
        players: room.players,
        yourColor: assignedColor,
        betAmount: room.betAmount
      });
    }

    io.to(cleanCode).emit('player_list_updated', { players: room.players });
  });

  // 4. HOST STARTS THE MATCH
  socket.on('start_game', () => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error_msg', 'Only the host can start the match.');
      return;
    }

    // If host starts with unfilled slots, fill remaining with bots!
    if (room.players.length < room.maxPlayers) {
      fillRoomWithBotsAndStart(code);
    } else {
      room.status = 'in_game';
      const activeColors = room.players.map(p => p.color);
      io.to(code).emit('game_started', {
        players: room.players,
        activeColors,
        currentTurnColor: activeColors[0],
        pot: room.betAmount * room.players.length
      });
    }
  });

  // 5. SYNCHRONIZED DICE ROLL
  socket.on('roll_dice', (data) => {
    const code = socket.currentRoom;
    const room = rooms[code];
    if (!room || room.status !== 'in_game') return;

    const diceVal = Math.floor(Math.random() * 6) + 1;
    console.log(`[Dice Roll] Room: ${code}, Player: ${data.playerColor}, Value: ${diceVal}`);

    io.to(code).emit('dice_rolled', {
      playerColor: data.playerColor,
      diceVal
    });
  });

  // 6. SYNCHRONIZED TOKEN MOVE
  socket.on('move_token', (data) => {
    const code = socket.currentRoom;
    if (!code) return;

    io.to(code).emit('token_moved', {
      playerColor: data.playerColor,
      tokenIndex: data.tokenIndex,
      diceVal: data.diceVal
    });
  });

  // 7. SYNCHRONIZED TURN CHANGE
  socket.on('change_turn', (data) => {
    const code = socket.currentRoom;
    if (!code) return;

    io.to(code).emit('turn_changed', {
      nextPlayerColor: data.nextPlayerColor
    });
  });

  // 8. EMOJI & CHAT REACTIONS
  socket.on('send_reaction', (data) => {
    const code = socket.currentRoom;
    if (!code) return;

    io.to(code).emit('reaction_received', {
      playerColor: data.playerColor,
      emoji: data.emoji
    });
  });

  // 9. PLAYER DISCONNECT
  socket.on('disconnect', () => {
    const code = socket.currentRoom;
    if (code && rooms[code]) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      console.log(`[-] Player left room: ${code}`);

      if (room.players.every(p => p.isBot) || room.players.length === 0) {
        if (room.botTimer) clearTimeout(room.botTimer);
        delete rooms[code];
        console.log(`[x] Room closed: ${code}`);
      } else {
        io.to(code).emit('player_left', {
          socketId: socket.id,
          players: room.players
        });
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`  👑 LUDO KING MULTIPLAYER SERVER (V2 READY)`);
  console.log(`  🚀 Port: ${PORT}`);
  console.log(`  🌐 Web Access: http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
