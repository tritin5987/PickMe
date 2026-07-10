import { appendFile, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { getDbConfigs, getUserBalance, deductUserBalance, addUserBalance } from './database.js';

// Đọc cấu hình từ database
const initialConfigs = getDbConfigs();
const DEFAULT_MIN_BET = Number(initialConfigs.DEFAULT_MIN_BET);
const DEFAULT_BET_DURATION = Number(initialConfigs.DEFAULT_BET_DURATION);

if (isNaN(DEFAULT_MIN_BET)) {
  throw new Error("DEFAULT_MIN_BET is not defined or is not a valid number in database config!");
}
if (isNaN(DEFAULT_BET_DURATION)) {
  throw new Error("DEFAULT_BET_DURATION is not defined or is not a valid number in database config!");
}

// --- Đường dẫn ghi log ---
const DATA_DIR = join(import.meta.dir, '..', 'data');
const POT_FILE = join(DATA_DIR, 'pot');
const ADMIN_FILE = join(DATA_DIR, 'admin');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
if (!existsSync(POT_FILE)) {
  writeFileSync(POT_FILE, '', 'utf8');
}
if (!existsSync(ADMIN_FILE)) {
  writeFileSync(ADMIN_FILE, '', 'utf8');
}

// --- Cấu hình chung ---
export const config = {
  betDurationSec: DEFAULT_BET_DURATION,
  minBet: DEFAULT_MIN_BET
};

// --- Trạng thái ván chơi hiện tại ---
export const round = {
  players: [],        // { socketId, name, gold, betCount }
  totalGold: 0,
  status: 'waiting',  // 'waiting' | 'running'
  startTime: null,    // timestamp (giây)
  endTime: null,      // timestamp (giây)
  lastWinner: null
};

let timerId = null;

export function recalcTotalGold() {
  round.totalGold = round.players.reduce((s, p) => s + p.gold, 0);
}

export function getActivePlayers() {
  return round.players.filter(p => p.gold > 0);
}

// Đặt cược
export function placeBet(playerName, socketId, amount) {
  let v = Number(amount);
  if (isNaN(v) || !Number.isInteger(v) || v < config.minBet) {
    return { success: false, message: `Số vàng cược phải là số nguyên và tối thiểu là ${config.minBet}` };
  }

  // Kiểm tra số dư của tài khoản người chơi (admin được miễn phí/vô hạn số dư)
  const isAdmin = playerName && playerName.toLowerCase() === 'admin';
  if (!isAdmin) {
    const balance = getUserBalance(playerName);
    if (balance < v) {
      return { success: false, message: `Số dư tài khoản không đủ để đặt cược! Hiện tại bạn có ${balance.toLocaleString()} vàng.` };
    }
  }

  let player = round.players.find(p => p.name === playerName);
  if (!player) {
    player = { socketId, name: playerName, gold: 0, betCount: 0 };
    round.players.push(player);
  }

  if (player.betCount >= 2) {
    return { success: false, message: 'Bạn chỉ được đặt cược tối đa 2 lần mỗi ván!' };
  }

  // Khấu trừ vàng từ số dư tài khoản người chơi trong DB (admin không bị trừ)
  if (!isAdmin) {
    deductUserBalance(playerName, v);
  }

  player.gold += v;
  player.betCount += 1;
  recalcTotalGold();
  console.log(`${playerName} bet ${v} (Lần ${player.betCount})`);
  return { success: true };
}

// Bắt đầu đếm thời gian nếu đủ người
export function startTimerIfNeeded(broadcastStateFn, finishRoundFn) {
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
        finishRoundFn();
      } else {
        broadcastStateFn(); // Cập nhật countdown
      }
    }, 1000);
  }
  broadcastStateFn();
}

// Reset ván đấu
export function resetRound(broadcastStateFn) {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  // Hoàn tiền đặt cược lại cho tất cả người chơi tham gia ván này
  for (const p of round.players) {
    if (p.gold > 0) {
      addUserBalance(p.name, p.gold);
    }
  }

  round.players = [];
  round.totalGold = 0;
  round.status = 'waiting';
  round.startTime = null;
  round.endTime = null;
  
  broadcastStateFn();
}

// Tối ưu hóa thuật toán chọn người chiến thắng công bằng sử dụng CSPRNG
export function pickWinner() {
  const active = getActivePlayers();
  if (active.length === 0) return null;
  const total = active.reduce((s, p) => s + p.gold, 0);

  // Sinh số ngẫu nhiên an toàn bằng crypto (CSPRNG)
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  
  // Tránh bias modulo bằng cách lọc bỏ khoảng dư thừa (mặc dù với total nhỏ thì độ thiên lệch cực kỳ không đáng kể)
  // Nhưng làm chuẩn chỉnh 100% công bằng
  const maxPossible = 0xffffffff;
  const limit = maxPossible - (maxPossible % total);
  
  let secureRandomValue = randomValue;
  while (secureRandomValue >= limit) {
    secureRandomValue = crypto.randomBytes(4).readUInt32BE(0);
  }
  
  const r = (secureRandomValue % total) + 1; // 1..total

  let running = 0;
  for (const p of active) {
    running += p.gold;
    if (r <= running) return p;
  }
  return active[active.length - 1];
}

// Kết thúc ván, chọn người thắng, lưu log lịch sử
export function finishRound(broadcastStateFn, publishWinnerFn) {
  const winner = pickWinner();
  logRoundHistory(winner);

  if (winner) {
    // Cộng thưởng toàn bộ Pot vàng cho người thắng cuộc
    addUserBalance(winner.name, round.totalGold);

    round.lastWinner = winner.name;
    publishWinnerFn({
      type: 'winner',
      name: winner.name,
      pot: round.totalGold,
      bet: winner.gold
    });
  } else {
    publishWinnerFn({
      type: 'winner',
      name: null
    });
  }

  // Reset ván chơi mới
  const last = round.lastWinner;
  round.players = [];
  round.totalGold = 0;
  round.status = 'waiting';
  round.startTime = null;
  round.endTime = null;
  round.lastWinner = last;

  broadcastStateFn();
}

// --- Ghi lịch sử vào files ---
function logRoundHistory(winnerObj) {
  const now = Math.floor(Date.now() / 1000);
  const activePlayers = getActivePlayers();

  const record = {
    type: 'round',
    finishedAt: now,
    configAtRound: { ...config },
    startTime: round.startTime,
    endTime: round.endTime,
    actualWaitSec: round.startTime && round.endTime ? (round.endTime - round.startTime) : null,
    totalGold: round.totalGold,
    players: activePlayers.map(p => ({ name: p.name, gold: p.gold })),
    winner: winnerObj ? { name: winnerObj.name, bet: winnerObj.gold, pot: round.totalGold } : null
  };

  const line = JSON.stringify(record) + '\n';
  appendFile(POT_FILE, line, (err) => {
    if (err) console.error('Lỗi ghi lịch sử pot:', err);
  });
}

export function logAdminConfigChange(adminName, oldConfig, newConfig) {
  const now = Math.floor(Date.now() / 1000);
  const record = {
    type: 'admin_config_change',
    at: now,
    admin: adminName,
    oldConfig,
    newConfig
  };

  const line = JSON.stringify(record) + '\n';
  appendFile(ADMIN_FILE, line, (err) => {
    if (err) console.error('Lỗi ghi lịch sử admin:', err);
  });
}
