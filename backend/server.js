import './logger.js';
import { join, resolve } from 'path';
import { networkInterfaces } from 'os';
import {
  verifySessionToken,
  registerUser,
  loginUser,
  deleteSessionToken,
  resetUserPassword,
  checkUserExists,
  changeUserPassword,
  updateDbConfig,
  getUserBalance,
  addUserBalance
} from './database.js';
import {
  config,
  round,
  recalcTotalGold,
  getActivePlayers,
  placeBet,
  startTimerIfNeeded,
  resetRound,
  finishRound,
  logAdminConfigChange
} from './game.js';

// Đọc cấu hình từ environment variables
const PORT = Number(process.env.PORT);
if (isNaN(PORT)) {
  throw new Error("PORT environment variable is not defined in .env!");
}
const isDev = process.argv.includes('--dev');

// --- Tự động phát hiện IP LAN nội bộ ---
function getLocalIpAddress() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const interfaceName in interfaces) {
    const isVirtual = /virtual|vbox|vmware|wsl|loopback|pseudo|host-only/i.test(interfaceName);
    const isPreferredName = /wifi|wi-fi|wlan|ethernet|lan|en|eth/i.test(interfaceName);

    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({
          address: iface.address,
          name: interfaceName,
          priority: (isPreferredName ? 2 : 0) - (isVirtual ? 5 : 0)
        });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].address;
  }
  return '127.0.0.1';
}

const localIp = getLocalIpAddress();
const serverUrl = `http://${localIp}:${PORT}`;
let tunnelUrl = null;

// --- Tự động phát hiện Ngrok tunnel ---
async function checkNgrokTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (res.ok) {
      const data = await res.json();
      if (data && data.tunnels && data.tunnels.length > 0) {
        const httpsTunnel = data.tunnels.find(t => t.proto === 'https');
        if (httpsTunnel) {
          tunnelUrl = httpsTunnel.public_url;
        } else {
          tunnelUrl = data.tunnels[0].public_url;
        }
      }
    }
  } catch (e) {
    // Ngrok API not running
  }
}
setInterval(checkNgrokTunnel, 5000);
checkNgrokTunnel();

// Danh sách các kết nối WebSocket đang hoạt động
const activeConnections = new Map(); // socket.data.id -> ws

function disconnectUserSockets(username) {
  const lowercaseUsername = username.toLowerCase();
  for (const [id, ws] of activeConnections.entries()) {
    if (ws.data.name && ws.data.name.toLowerCase() === lowercaseUsername) {
      console.log(`Force closing WebSocket connection ${id} for user: ${username} due to session revocation/password change.`);
      ws.send(JSON.stringify({ type: 'error', message: 'Phiên đăng nhập của bạn đã hết hạn hoặc mật khẩu đã thay đổi. Vui lòng đăng nhập lại.' }));
      setTimeout(() => {
        try {
          ws.close();
        } catch (e) {}
      }, 100);
    }
  }
}

// --- Phát sóng trạng thái ván đấu ---
function broadcastState() {
  recalcTotalGold();
  const active = getActivePlayers();

  for (const [id, ws] of activeConnections.entries()) {
    try {
      if (ws.readyState === 1) { // 1 is OPEN
        const userBalance = ws.data.name && ws.data.name.toLowerCase() === 'admin'
          ? 'Vô hạn'
          : (ws.data.name ? getUserBalance(ws.data.name) : 0);
        const state = {
          type: 'state',
          config,
          serverUrl,
          tunnelUrl,
          isDev,
          userBalance, // Gửi riêng số dư tài khoản của người chơi này
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
        ws.send(JSON.stringify(state));
      }
    } catch (e) {
      console.error('Lỗi khi gửi trạng thái cho connection:', id, e);
    }
  }
}

// Helper kết thúc ván đấu
function finishRoundHelper() {
  finishRound(
    broadcastState,
    (winnerPayload) => server.publish('game-room', JSON.stringify(winnerPayload))
  );
}

// --- Khởi tạo Bun Serve ---
const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req, serverInstance) {
    const url = new URL(req.url);

    // Phát hiện tunnel của localtunnel hoặc ngrok từ header
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    if (host && (host.includes('ngrok-free.app') || host.includes('loca.lt'))) {
      const proto = req.headers.get('x-forwarded-proto') || 'https';
      const detectedUrl = `${proto}://${host}`;
      if (tunnelUrl !== detectedUrl) {
        tunnelUrl = detectedUrl;
        broadcastState();
      }
    }

    // --- HTTP APIs ---
    if (req.method === 'POST') {
      // 1. API Đăng ký
      if (url.pathname === '/api/register') {
        try {
          const body = await req.json();
          const username = String(body.username || '').trim();
          const password = String(body.password || '').trim();

          if (username.length < 3 || password.length < 6) {
            return new Response(JSON.stringify({ success: false, error: 'Tên đăng nhập ≥ 3 ký tự, mật khẩu ≥ 6 ký tự' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          if (username.toLowerCase() === 'admin') {
            return new Response(JSON.stringify({ success: false, error: 'Không được phép đăng ký tên tài khoản admin' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          if (checkUserExists(username)) {
            return new Response(JSON.stringify({ success: false, error: 'Tên đăng nhập đã được sử dụng' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const authData = await registerUser(username, password);
          return new Response(JSON.stringify({ success: true, ...authData }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: 'Lỗi đăng ký: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // 2. API Đăng nhập
      if (url.pathname === '/api/login') {
        try {
          const body = await req.json();
          const username = String(body.username || '').trim();
          const password = String(body.password || '').trim();

          const authData = await loginUser(username, password);
          if (!authData) {
            return new Response(JSON.stringify({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ success: true, ...authData }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: 'Lỗi đăng nhập: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // 3. API Đăng xuất
      if (url.pathname === '/api/logout') {
        try {
          const authHeader = req.headers.get('authorization') || '';
          const token = authHeader.replace('Bearer ', '').trim();
          if (token) {
            deleteSessionToken(token);
          }
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: 'Lỗi đăng xuất' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // 4. API Đổi mật khẩu (Người chơi)
      if (url.pathname === '/api/change-password') {
        try {
          const authHeader = req.headers.get('authorization') || '';
          const token = authHeader.replace('Bearer ', '').trim();
          const session = token ? verifySessionToken(token) : null;
          if (!session) {
            return new Response(JSON.stringify({ success: false, error: 'Chưa đăng nhập hoặc phiên hết hạn' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const body = await req.json();
          const oldPassword = String(body.oldPassword || '').trim();
          const newPassword = String(body.newPassword || '').trim();

          if (!oldPassword || !newPassword) {
            return new Response(JSON.stringify({ success: false, error: 'Vui lòng cung cấp mật khẩu cũ và mới' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          if (newPassword.length < 6) {
            return new Response(JSON.stringify({ success: false, error: 'Mật khẩu mới phải từ 6 ký tự trở lên' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const result = await changeUserPassword(session.user_id, oldPassword, newPassword);
          if (!result.success) {
            return new Response(JSON.stringify({ success: false, error: result.error }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          disconnectUserSockets(session.username);

          return new Response(JSON.stringify({ success: true, message: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: 'Lỗi đổi mật khẩu: ' + err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // --- WebSocket Upgrade Route ---
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token');
      const session = token ? verifySessionToken(token) : null;
      if (!session) {
        return new Response('Unauthorized', { status: 401 });
      }

      const success = serverInstance.upgrade(req, {
        data: {
          id: crypto.randomUUID().slice(0, 8),
          name: session.username,
          msgCount: 0,
          lastReset: Date.now()
        }
      });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // --- Serve frontend/ static assets ---
    let filePath = url.pathname;
    if (filePath === '/') {
      filePath = '/index.html';
    }

    const frontendDir = resolve(join(import.meta.dir, '..', 'frontend'));
    const staticPath = resolve(frontendDir, '.' + filePath);

    // Prevent Path Traversal attacks
    if (!staticPath.startsWith(frontendDir)) {
      return new Response('Access Denied', { status: 403 });
    }

    const file = Bun.file(staticPath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response('Not Found', { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log('Client connected to WebSocket:', ws.data.id);
      ws.subscribe('game-room');
      activeConnections.set(ws.data.id, ws);

      // Gửi state ban đầu cho client mới
      recalcTotalGold();
      const active = getActivePlayers();
      const userBalance = ws.data.name && ws.data.name.toLowerCase() === 'admin'
        ? 'Vô hạn'
        : (ws.data.name ? getUserBalance(ws.data.name) : 0);
      const state = {
        type: 'state',
        config,
        serverUrl,
        tunnelUrl,
        isDev,
        userBalance,
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
      ws.send(JSON.stringify(state));
    },
    async message(ws, message) {
      try {
        // Tích hợp rate limit chống spam tin nhắn qua WebSocket
        const now = Date.now();
        if (!ws.data.lastReset || now - ws.data.lastReset > 1000) {
          ws.data.msgCount = 0;
          ws.data.lastReset = now;
        }
        ws.data.msgCount = (ws.data.msgCount || 0) + 1;
        if (ws.data.msgCount > 10) {
          ws.send(JSON.stringify({ type: 'error', message: 'Tốc độ gửi yêu cầu quá nhanh, vui lòng đợi một lát!' }));
          return;
        }

        const data = JSON.parse(message);

        // 1. Đặt cược
        if (data.action === 'placeBet') {
          if (!ws.data.name) return;
          const result = placeBet(ws.data.name, data.amount);
          if (!result.success) {
            ws.send(JSON.stringify({ type: 'error', message: result.message }));
            return;
          }
          broadcastState();
          startTimerIfNeeded(broadcastState, finishRoundHelper);
        }

        // 2. Lưu cấu hình (Admin)
        if (data.action === 'saveConfig') {
          if (ws.data.name && ws.data.name.toLowerCase() === 'admin') {
            const oldConfig = { ...config };
            let dur = parseInt(data.betDurationSec, 10);
            let minB = parseInt(data.minBet, 10);
            if (!isNaN(dur) && dur >= 5) {
              config.betDurationSec = dur;
              updateDbConfig('DEFAULT_BET_DURATION', dur);
            }
            if (!isNaN(minB) && minB >= 1) {
              config.minBet = minB;
              updateDbConfig('DEFAULT_MIN_BET', minB);
            }

            console.log('Admin updated config:', config);
            logAdminConfigChange(ws.data.name, oldConfig, { ...config });
            broadcastState();
          }
        }

        // 3. Xóa ván hiện tại (Admin)
        if (data.action === 'resetRound') {
          if (ws.data.name && ws.data.name.toLowerCase() === 'admin') {
            console.log('Admin forced reset of the current round');
            resetRound(broadcastState);
          }
        }

        // 4. Cấp lại mật khẩu người chơi (Admin)
        if (data.action === 'resetPlayerPassword') {
          if (ws.data.name && ws.data.name.toLowerCase() === 'admin') {
            const username = data.username ? data.username.trim() : '';
            const newPassword = data.newPassword ? data.newPassword.trim() : '';
            if (!username || !newPassword) {
              ws.send(JSON.stringify({ type: 'reset_error', message: 'Tên và mật khẩu không được để trống!' }));
              return;
            }
            if (newPassword.length < 6) {
              ws.send(JSON.stringify({ type: 'reset_error', message: 'Mật khẩu mới phải từ 6 ký tự trở lên!' }));
              return;
            }
            if (!checkUserExists(username)) {
              ws.send(JSON.stringify({ type: 'reset_error', message: `Người dùng '${username}' không tồn tại!` }));
              return;
            }
            await resetUserPassword(username, newPassword);
            disconnectUserSockets(username);
            console.log(`Admin reset password for user: ${username}`);
            ws.send(JSON.stringify({ type: 'reset_success', message: `Đã đổi mật khẩu cho '${username}' thành công!` }));
          }
        }

        // 5. Cộng số dư người chơi (Admin)
        if (data.action === 'addPlayerBalance') {
          if (ws.data.name && ws.data.name.toLowerCase() === 'admin') {
            const username = data.username ? data.username.trim() : '';
            const amount = parseInt(data.amount, 10);
            if (!username || isNaN(amount) || amount <= 0) {
              ws.send(JSON.stringify({ type: 'add_balance_error', message: 'Tên tài khoản và số vàng cược hợp lệ phải lớn hơn 0!' }));
              return;
            }
            if (amount > 1000000000000) {
              ws.send(JSON.stringify({ type: 'add_balance_error', message: 'Số vàng cộng tối đa cho phép là 1,000,000,000,000!' }));
              return;
            }
            if (!checkUserExists(username)) {
              ws.send(JSON.stringify({ type: 'add_balance_error', message: `Người dùng '${username}' không tồn tại!` }));
              return;
            }
            addUserBalance(username, amount, 'admin_add');
            console.log(`Admin added ${amount} balance to user: ${username}`);
            ws.send(JSON.stringify({ type: 'add_balance_success', message: `Đã cộng ${amount.toLocaleString()} vàng cho '${username}' thành công!` }));
            broadcastState();
          }
        }
      } catch (err) {
        console.error('Error handling websocket message:', err);
      }
    },
    close(ws) {
      console.log('Client disconnected from WebSocket:', ws.data.id);
      activeConnections.delete(ws.data.id);
    }
  }
});

console.log(`Server listening on:
  - Local: http://localhost:${PORT}
  - LAN:   ${serverUrl}`);
