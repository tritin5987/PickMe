// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- Đảm bảo thư mục / file log tồn tại ---
const DATA_DIR = path.join(__dirname, 'data');
const POT_FILE = path.join(DATA_DIR, 'pot');     // lịch sử vòng chơi
const ADMIN_FILE = path.join(DATA_DIR, 'admin'); // lịch sử chỉnh cấu hình

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(POT_FILE)) {
  fs.writeFileSync(POT_FILE, '', 'utf8');
}
if (!fs.existsSync(ADMIN_FILE)) {
  fs.writeFileSync(ADMIN_FILE, '', 'utf8');
}

// --- Cấu hình chung (admin có thể chỉnh) ---
const config = {
  betDurationSec: 60, // thời gian 1 ván (giây)
  minBet: 1           // min vàng mỗi lần đặt
};

// --- Trạng thái ván chơi hiện tại ---
const round = {
  players: [],        // { socketId, name, gold }
  totalGold: 0,
  status: 'waiting',  // 'waiting' | 'running'
  startTime: null,    // timestamp (giây)
  endTime: null,      // timestamp (giây)
  lastWinner: null
};

let timerId = null;

// --- Helper: tính toán & ghi log ---

function recalcTotalGold() {
  round.totalGold = round.players.reduce((s, p) => s + p.gold, 0);
}

function getActivePlayers() {
  return round.players.filter(p => p.gold > 0);
}

// Chọn người thắng theo tỉ lệ vàng
function pickWinner() {
  const active = getActivePlayers();
  if (active.length === 0) return null;
  const total = active.reduce((s, p) => s + p.gold, 0);
  let r = Math.floor(Math.random() * total) + 1; // 1..total
  let running = 0;
  for (const p of active) {
    running += p.gold;
    if (r <= running) return p;
  }
  return active[active.length - 1];
}

// Gửi state xuống tất cả client
function broadcastState() {
  recalcTotalGold();

  const active = getActivePlayers();

  const state = {
    config,
    round: {
      status: round.status,
      totalGold: round.totalGold,
      totalPlayers: active.length,
      lastWinner: round.lastWinner,
      startTime: round.startTime,
      endTime: round.endTime,
      players: round.players.map(p => ({
        name: p.name,
        gold: p.gold
      }))
    }
  };

  io.emit('state', state);
}

// Ghi lịch sử 1 ván vào file data/pot
function logRoundHistory(winnerObj) {
  const now = Math.floor(Date.now() / 1000);
  const activePlayers = getActivePlayers();

  const record = {
    type: 'round',
    finishedAt: now,                 // thời điểm kết thúc ván
    configAtRound: {                 // cấu hình áp dụng cho ván này
      betDurationSec: config.betDurationSec,
      minBet: config.minBet
    },
    startTime: round.startTime,      // thời gian bắt đầu đếm
    endTime: round.endTime,          // thời gian kết thúc dự kiến
    actualWaitSec: round.startTime && round.endTime
      ? (round.endTime - round.startTime)
      : null,                        // thời gian chờ cấu hình (có thể trùng betDurationSec)
    totalGold: round.totalGold,
    players: activePlayers.map(p => ({
      name: p.name,
      gold: p.gold
    })),
    winner: winnerObj
      ? {
          name: winnerObj.name,
          bet: winnerObj.gold,
          pot: round.totalGold
        }
      : null
  };

  // ghi dạng JSON mỗi dòng (JSONL)
  const line = JSON.stringify(record) + '\n';
  fs.appendFile(POT_FILE, line, (err) => {
    if (err) console.error('Lỗi ghi lịch sử pot:', err);
  });
}

// Ghi lịch sử admin đổi cấu hình vào data/admin
function logAdminConfigChange(adminName, oldConfig, newConfig) {
  const now = Math.floor(Date.now() / 1000);
  const record = {
    type: 'admin_config_change',
    at: now,
    admin: adminName,
    oldConfig,
    newConfig
  };
  const line = JSON.stringify(record) + '\n';
  fs.appendFile(ADMIN_FILE, line, (err) => {
    if (err) console.error('Lỗi ghi lịch sử admin:', err);
  });
}

// Bắt đầu đếm thời gian nếu đủ người
function startTimerIfNeeded() {
  if (round.status !== 'waiting') return;

  const active = getActivePlayers();
  if (active.length >= 2) {
    round.status = 'running';
    round.startTime = Math.floor(Date.now() / 1000);
    round.endTime = round.startTime + config.betDurationSec;

    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      if (round.endTime && now >= round.endTime) {
        clearInterval(timerId);
        timerId = null;
        finishRound();
      } else {
        broadcastState(); // cập nhật countdown
      }
    }, 1000);
  }
  broadcastState();
}

// Kết thúc ván, chọn winner, ghi lịch sử, reset ván mới
function finishRound() {
  const winner = pickWinner();

  // ghi history trước khi reset
  logRoundHistory(winner);

  if (winner) {
    round.lastWinner = winner.name;
    io.emit('winner', {
      name: winner.name,
      pot: round.totalGold,
      bet: winner.gold   // số vàng winner đã đặt
    });
  } else {
    io.emit('winner', null);
  }

  // reset ván, giữ lại lastWinner
  const last = round.lastWinner;
  round.players = [];
  round.totalGold = 0;
  round.status = 'waiting';
  round.startTime = null;
  round.endTime = null;
  round.lastWinner = last;

  broadcastState();
}

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.data.name = null;

  // gửi state ban đầu cho client mới
  broadcastState();

  // client đặt tên
  socket.on('setName', (name) => {
    name = String(name || '').trim();
    if (!name) return;
    socket.data.name = name;
    console.log(`Socket ${socket.id} setName = ${name}`);
    broadcastState();
  });

  // client đặt cược
  socket.on('placeBet', (amount) => {
    if (!socket.data.name) return;
    let v = parseInt(amount, 10);
    if (isNaN(v) || v < config.minBet) return;

    let player = round.players.find(p => p.name === socket.data.name);
    if (!player) {
      player = { socketId: socket.id, name: socket.data.name, gold: 0 };
      round.players.push(player);
    }
    player.gold += v;
    console.log(`${player.name} bet ${v}`);

    broadcastState();
    startTimerIfNeeded();
  });

  // admin chỉnh cấu hình
  socket.on('saveConfig', (data) => {
    if (socket.data.name && socket.data.name.toLowerCase() === 'admin') {
      const oldConfig = { ...config };

      let dur = parseInt(data.betDurationSec, 10);
      let minB = parseInt(data.minBet, 10);
      if (!isNaN(dur) && dur >= 5) config.betDurationSec = dur;
      if (!isNaN(minB) && minB >= 1) config.minBet = minB;

      console.log('Admin updated config:', config);

      // log lịch sử thay đổi
      logAdminConfigChange(socket.data.name, oldConfig, { ...config });

      broadcastState();
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // hiện tại không xóa player khỏi ván khi disconnect
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
});
