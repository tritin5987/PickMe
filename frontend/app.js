const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let socket = null;
let isDisconnect = false;

let token = localStorage.getItem('pickme_token') || null;
let currentPlayerName = localStorage.getItem('pickme_username') || null;
let latestState = null;
let isDevMode = false;

// --- DOM Elements ---
const currentPlayerNameEl = document.getElementById('currentPlayerName');
const currentUserBalanceEl = document.getElementById('currentUserBalance');
const lastWinnerEl = document.getElementById('lastWinner');
const totalGoldEl = document.getElementById('totalGold');
const totalPlayersEl = document.getElementById('totalPlayers');
const myGoldEl = document.getElementById('myGold');
const myChanceEl = document.getElementById('myChance');
const timeRemainingEl = document.getElementById('timeRemaining');
const roundStatusEl = document.getElementById('roundStatus');
const playersTableBody = document.getElementById('playersTableBody');
const winnerMessageEl = document.getElementById('winnerMessage');
const adminPanelEl = document.getElementById('adminPanel');
const configDurationInput = document.getElementById('configDuration');
const configMinBetInput = document.getElementById('configMinBet');
const betAmountInput = document.getElementById('betAmount');
const betErrorEl = document.getElementById('betError');

const unauthenticatedArea = document.getElementById('unauthenticatedArea');
const authenticatedArea = document.getElementById('authenticatedArea');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authErrorEl = document.getElementById('authError');

// Change Password Elements
const changePasswordToggleBtn = document.getElementById('changePasswordToggleBtn');
const changePasswordArea = document.getElementById('changePasswordArea');
const changePasswordOldInput = document.getElementById('changePasswordOld');
const changePasswordNewInput = document.getElementById('changePasswordNew');
const changePasswordSubmitBtn = document.getElementById('changePasswordSubmitBtn');
const changePasswordCancelBtn = document.getElementById('changePasswordCancelBtn');
const changePasswordStatusEl = document.getElementById('changePasswordStatus');

const adminResetUsernameInput = document.getElementById('adminResetUsername');
const adminResetPasswordInput = document.getElementById('adminResetPassword');
const adminResetPasswordBtn = document.getElementById('adminResetPasswordBtn');
const adminResetStatusEl = document.getElementById('adminResetStatus');

const adminAddBalanceUsernameInput = document.getElementById('adminAddBalanceUsername');
const adminAddBalanceAmountInput = document.getElementById('adminAddBalanceAmount');
const adminAddBalanceBtn = document.getElementById('adminAddBalanceBtn');
const adminAddBalanceStatusEl = document.getElementById('adminAddBalanceStatus');

// --- Helper Functions ---
function showBetError(msg) {
  if (!betErrorEl) return;
  betErrorEl.textContent = msg;
  betErrorEl.style.display = 'block';
  
  // Tự động ẩn thông báo lỗi sau 5 giây
  setTimeout(() => {
    betErrorEl.style.display = 'none';
    betErrorEl.textContent = '';
  }, 5000);
}

// --- WebSocket Connection ---
function connect() {
  if (!token) return;
  
  const host = window.location.host;
  const wsUrl = `${wsProto}//${host}/ws?token=${encodeURIComponent(token)}`;
  console.log('Connecting to WebSocket:', wsUrl);
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log('WebSocket connected');
    isDisconnect = false;
    winnerMessageEl.style.display = 'none';
    winnerMessageEl.textContent = '';
  };

  socket.onclose = () => {
    console.log('WebSocket disconnected');
    isDisconnect = true;
    if (token) {
      setTimeout(connect, 2000); // Tự động reconnect sau 2s
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'state') {
        latestState = data;
        isDevMode = !!data.isDev;
        renderState();
      } else if (data.type === 'winner') {
        winnerMessageEl.style.display = 'block';
        if (!data.name) {
          winnerMessageEl.textContent = '❌ Không có ai đặt vàng, ván bị hủy.';
        } else {
          winnerMessageEl.textContent =
            `🎉 Người thắng ván này là ${data.name}, đã đặt ${data.bet.toLocaleString()} vàng, ăn toàn bộ pot: ${data.pot.toLocaleString()} vàng!`;
        }
      } else if (data.type === 'error') {
        showBetError(data.message);
      } else if (data.type === 'reset_success') {
        if (adminResetStatusEl) {
          adminResetStatusEl.style.color = '#10b981'; // Green
          adminResetStatusEl.textContent = data.message;
          adminResetUsernameInput.value = '';
          adminResetPasswordInput.value = '';
          setTimeout(() => { adminResetStatusEl.textContent = ''; }, 5000);
        }
      } else if (data.type === 'reset_error') {
        if (adminResetStatusEl) {
          adminResetStatusEl.style.color = '#ef4444'; // Red
          adminResetStatusEl.textContent = data.message;
          setTimeout(() => { adminResetStatusEl.textContent = ''; }, 5000);
        }
      } else if (data.type === 'add_balance_success') {
        if (adminAddBalanceStatusEl) {
          adminAddBalanceStatusEl.style.color = '#10b981'; // Green
          adminAddBalanceStatusEl.textContent = data.message;
          adminAddBalanceUsernameInput.value = '';
          adminAddBalanceAmountInput.value = '';
          setTimeout(() => { adminAddBalanceStatusEl.textContent = ''; }, 5000);
        }
      } else if (data.type === 'add_balance_error') {
        if (adminAddBalanceStatusEl) {
          adminAddBalanceStatusEl.style.color = '#ef4444'; // Red
          adminAddBalanceStatusEl.textContent = data.message;
          setTimeout(() => { adminAddBalanceStatusEl.textContent = ''; }, 5000);
        }
      }
    } catch (err) {
      console.error('Error parsing socket message:', err);
    }
  };
}

function sendPayload(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  } else {
    console.warn('Không thể gửi dữ liệu, kết nối WebSocket chưa sẵn sàng.');
  }
}

// --- Render Game State ---
function renderState() {
  if (!latestState) return;
  const { config: gameConfig, round: gameRound, serverUrl, tunnelUrl, userBalance } = latestState;

  // Cập nhật người thắng ván trước
  lastWinnerEl.textContent = gameRound.lastWinner || 'chưa có';

  // Hiển thị số dư tài khoản người chơi
  if (currentUserBalanceEl && typeof userBalance === 'number') {
    currentUserBalanceEl.textContent = userBalance.toLocaleString();
    localStorage.setItem('pickme_balance', userBalance);
  }

  // Điều kiện hiển thị thông tin dựa theo phân quyền người chơi / admin
  const isAdmin = currentPlayerName && currentPlayerName.toLowerCase() === 'admin';

  if (isAdmin) {
    totalGoldEl.textContent = gameRound.totalGold.toLocaleString();
    
    // Admin control panel
    if (adminPanelEl) {
      adminPanelEl.style.display = 'flex';
      
      const serverIpUrlEl = document.getElementById('serverIpUrl');
      if (serverIpUrlEl) serverIpUrlEl.value = serverUrl || '';

      const tunnelCard = document.getElementById('tunnelCard');
      const serverTunnelUrlEl = document.getElementById('serverTunnelUrl');
      if (tunnelUrl) {
        if (tunnelCard) tunnelCard.style.display = 'block';
        if (serverTunnelUrlEl) serverTunnelUrlEl.value = tunnelUrl;
      } else {
        if (tunnelCard) tunnelCard.style.display = 'none';
      }
    }

    // Hiển thị hai thẻ chứa pot vàng và xác suất của admin
    const statPotEl = document.getElementById('stat-pot');
    if (statPotEl) statPotEl.style.display = 'flex';
  } else {
    // Không phải admin: Ẩn bảng điều khiển và pot vàng
    if (adminPanelEl) adminPanelEl.style.display = 'none';
    
    const statPotEl = document.getElementById('stat-pot');
    if (statPotEl) statPotEl.style.display = 'none';
  }

  totalPlayersEl.textContent = gameRound.totalPlayers;

  // Tính toán thông tin cá nhân của người chơi
  let myGold = 0;
  let myChance = 0;
  if (currentPlayerName) {
    const me = gameRound.players.find(p => p.name === currentPlayerName);
    if (me) {
      myGold = me.gold;
      if (gameRound.totalGold > 0) {
        myChance = (me.gold / gameRound.totalGold) * 100;
      }
    }
  }

  // Ẩn/Hiện thông tin cá nhân của người chơi (chỉ hiện khi đã đăng nhập)
  const statMyGoldEl = document.getElementById('stat-my-gold');
  const statMyChanceEl = document.getElementById('stat-my-chance');
  
  if (currentPlayerName) {
    if (statMyGoldEl) statMyGoldEl.style.display = 'flex';
    if (statMyChanceEl) statMyChanceEl.style.display = 'flex';
    myGoldEl.textContent = myGold.toLocaleString();
    myChanceEl.textContent = myChance.toFixed(2) + '%';
  } else {
    if (statMyGoldEl) statMyGoldEl.style.display = 'none';
    if (statMyChanceEl) statMyChanceEl.style.display = 'none';
  }

  // Cập nhật đếm ngược thời gian
  if (!gameRound.startTime || !gameRound.endTime || gameRound.status === 'waiting') {
    timeRemainingEl.textContent = 'chưa bắt đầu';
    roundStatusEl.textContent = `Đang chờ người chơi... (cần ≥ 2 người cược)`;
  } else {
    const now = Math.floor(Date.now() / 1000);
    let remain = gameRound.endTime - now;
    if (remain < 0) remain = 0;
    timeRemainingEl.textContent = remain + ' giây';
    roundStatusEl.textContent = 'Đang chạy...';
  }

  // Render danh sách người chơi trong bảng
  playersTableBody.innerHTML = '';
  
  // Lấy tất cả các cột có class 'admin-only-col'
  const adminCols = document.querySelectorAll('.admin-only-col');
  adminCols.forEach(col => {
    if (isAdmin) {
      col.classList.remove('hide-col');
    } else {
      col.classList.add('hide-col');
    }
  });

  gameRound.players.forEach((p, index) => {
    const tr = document.createElement('tr');
    
    // Số thứ tự
    const tdIndex = document.createElement('td');
    tdIndex.textContent = index + 1;
    tr.appendChild(tdIndex);

    // Tên
    const tdName = document.createElement('td');
    tdName.textContent = p.name;
    // Highlight dòng của bản thân
    if (p.name === currentPlayerName) {
      tdName.innerHTML = `${p.name} <span class="badge-winner" style="padding:2px 6px; font-size:10px;">Bạn</span>`;
    }
    tr.appendChild(tdName);

    // Số vàng cược (Chỉ Admin mới thấy)
    const tdGold = document.createElement('td');
    tdGold.className = 'admin-only-col';
    tdGold.style.textAlign = 'right';
    tdGold.textContent = p.gold.toLocaleString();
    if (!isAdmin) tdGold.classList.add('hide-col');
    tr.appendChild(tdGold);

    // Tỉ lệ thắng (Chỉ Admin mới thấy)
    const tdChance = document.createElement('td');
    tdChance.className = 'admin-only-col';
    tdChance.style.textAlign = 'right';
    const chanceVal = gameRound.totalGold > 0 ? ((p.gold / gameRound.totalGold) * 100) : 0;
    tdChance.textContent = chanceVal.toFixed(2) + '%';
    if (!isAdmin) tdChance.classList.add('hide-col');
    tr.appendChild(tdChance);

    playersTableBody.appendChild(tr);
  });
}

// --- Auth UI Management ---
function updateAuthUI() {
  if (token && currentPlayerName) {
    unauthenticatedArea.style.display = 'none';
    authenticatedArea.style.display = 'block';
    currentPlayerNameEl.textContent = currentPlayerName;
    const cachedBalance = sessionStorage.getItem('pickme_balance');
    if (cachedBalance && currentUserBalanceEl) {
      currentUserBalanceEl.textContent = Number(cachedBalance).toLocaleString();
    }
  } else {
    unauthenticatedArea.style.display = 'block';
    authenticatedArea.style.display = 'none';
    currentPlayerNameEl.textContent = 'chưa chọn';
    if (currentUserBalanceEl) currentUserBalanceEl.textContent = '0';
  }
}

// --- Auth API Actions ---
async function register() {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value.trim();
  authErrorEl.textContent = '';

  if (username.length < 3 || password.length < 6) {
    authErrorEl.textContent = 'Tên tài khoản ≥ 3 ký tự, mật khẩu ≥ 6 ký tự.';
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      token = data.token;
      currentPlayerName = data.username;
      localStorage.setItem('pickme_token', token);
      localStorage.setItem('pickme_username', currentPlayerName);
      if (typeof data.balance === 'number') {
        localStorage.setItem('pickme_balance', data.balance);
      }
      authUsernameInput.value = '';
      authPasswordInput.value = '';
      updateAuthUI();
      connect();
    } else {
      authErrorEl.textContent = data.error || 'Đăng ký thất bại.';
    }
  } catch (err) {
    authErrorEl.textContent = 'Lỗi kết nối máy chủ.';
  }
}

async function login() {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value.trim();
  authErrorEl.textContent = '';

  if (!username || !password) {
    authErrorEl.textContent = 'Hãy nhập cả tên tài khoản và mật khẩu.';
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      token = data.token;
      currentPlayerName = data.username;
      localStorage.setItem('pickme_token', token);
      localStorage.setItem('pickme_username', currentPlayerName);
      if (typeof data.balance === 'number') {
        localStorage.setItem('pickme_balance', data.balance);
      }
      authUsernameInput.value = '';
      authPasswordInput.value = '';
      updateAuthUI();
      connect();
    } else {
      authErrorEl.textContent = data.error || 'Sai thông tin đăng nhập.';
    }
  } catch (err) {
    authErrorEl.textContent = 'Lỗi kết nối máy chủ.';
  }
}

async function logout() {
  try {
    if (token) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (e) {
    console.error('Logout error:', e);
  }
  token = null;
  currentPlayerName = null;
  localStorage.removeItem('pickme_token');
  localStorage.removeItem('pickme_username');
  localStorage.removeItem('pickme_balance');
  updateAuthUI();
  window.location.reload();
}

// --- Action Listeners ---
loginBtn.addEventListener('click', login);
registerBtn.addEventListener('click', register);
logoutBtn.addEventListener('click', logout);

// Nhấn Enter để gửi đăng nhập/đăng ký nhanh
authPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

// Đặt cược
document.getElementById('betBtn').addEventListener('click', () => {
  if (!token) {
    showBetError('Bạn cần đăng nhập tài khoản trước khi đặt cược.');
    return;
  }

  const val = Number(betAmountInput.value);
  if (isNaN(val) || !Number.isInteger(val)) {
    showBetError('Số vàng đặt phải là số nguyên (không chứa phần thập phân).');
    return;
  }
  
  if (latestState && latestState.config && val < latestState.config.minBet) {
    showBetError(`Số vàng đặt cược tối thiểu là ${latestState.config.minBet.toLocaleString()} vàng.`);
    return;
  }

  sendPayload({ action: 'placeBet', amount: val });
});

// Admin: Lưu cấu hình
document.getElementById('saveConfigBtn').addEventListener('click', () => {
  const dur = parseInt(configDurationInput.value, 10);
  const minB = parseInt(configMinBetInput.value, 10);
  sendPayload({
    action: 'saveConfig',
    betDurationSec: dur,
    minBet: minB
  });
  alert('Đã gửi cấu hình mới lên server.');
});

// Admin: Xóa ván
document.getElementById('resetRoundBtn').addEventListener('click', () => {
  if (confirm('Bạn có chắc chắn muốn xóa ván hiện tại và hoàn lại mọi đặt cược không?')) {
    sendPayload({ action: 'resetRound' });
  }
});

// Admin: Cấp mật khẩu
if (adminResetPasswordBtn) {
  adminResetPasswordBtn.addEventListener('click', () => {
    const user = adminResetUsernameInput.value.trim();
    const pass = adminResetPasswordInput.value.trim();
    if (!user || !pass) {
      if (adminResetStatusEl) {
        adminResetStatusEl.style.color = '#ef4444';
        adminResetStatusEl.textContent = 'Vui lòng nhập đầy đủ tên và mật khẩu mới.';
      }
      return;
    }
    sendPayload({ action: 'resetPlayerPassword', username: user, newPassword: pass });
  });
}

// Admin: Cộng số dư
if (adminAddBalanceBtn) {
  adminAddBalanceBtn.addEventListener('click', () => {
    const user = adminAddBalanceUsernameInput.value.trim();
    const amount = parseInt(adminAddBalanceAmountInput.value, 10);
    if (!user || isNaN(amount) || amount <= 0) {
      if (adminAddBalanceStatusEl) {
        adminAddBalanceStatusEl.style.color = '#ef4444';
        adminAddBalanceStatusEl.textContent = 'Vui lòng nhập tên tài khoản và số vàng lớn hơn 0.';
      }
      return;
    }
    sendPayload({ action: 'addPlayerBalance', username: user, amount });
  });
}

// Toggle Đổi mật khẩu
if (changePasswordToggleBtn) {
  changePasswordToggleBtn.addEventListener('click', () => {
    const isHidden = changePasswordArea.style.display === 'none';
    changePasswordArea.style.display = isHidden ? 'block' : 'none';
    changePasswordOldInput.value = '';
    changePasswordNewInput.value = '';
    changePasswordStatusEl.textContent = '';
  });
}

if (changePasswordCancelBtn) {
  changePasswordCancelBtn.addEventListener('click', () => {
    changePasswordArea.style.display = 'none';
    changePasswordOldInput.value = '';
    changePasswordNewInput.value = '';
    changePasswordStatusEl.textContent = '';
  });
}

if (changePasswordSubmitBtn) {
  changePasswordSubmitBtn.addEventListener('click', async () => {
    const oldPassword = changePasswordOldInput.value.trim();
    const newPassword = changePasswordNewInput.value.trim();
    changePasswordStatusEl.textContent = '';

    if (!oldPassword || !newPassword) {
      changePasswordStatusEl.style.color = '#ef4444';
      changePasswordStatusEl.textContent = 'Vui lòng điền đủ mật khẩu cũ và mới.';
      return;
    }

    if (newPassword.length < 6) {
      changePasswordStatusEl.style.color = '#ef4444';
      changePasswordStatusEl.textContent = 'Mật khẩu mới phải ≥ 6 ký tự.';
      return;
    }

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        changePasswordStatusEl.style.color = '#10b981';
        changePasswordStatusEl.textContent = 'Đổi mật khẩu thành công! Đang đăng xuất...';
        changePasswordOldInput.value = '';
        changePasswordNewInput.value = '';
        setTimeout(async () => {
          await logout();
        }, 2000);
      } else {
        changePasswordStatusEl.style.color = '#ef4444';
        changePasswordStatusEl.textContent = data.error || 'Đổi mật khẩu thất bại.';
      }
    } catch (err) {
      changePasswordStatusEl.style.color = '#ef4444';
      changePasswordStatusEl.textContent = 'Lỗi kết nối máy chủ.';
    }
  });
}

// Copy URL links
function setupCopyBtn(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (btn && input) {
    btn.addEventListener('click', () => {
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value)
        .then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.background = '#059669';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#10b981';
          }, 1500);
        })
        .catch(err => console.error('Failed to copy text: ', err));
    });
  }
}
setupCopyBtn('copyIpBtn', 'serverIpUrl');
setupCopyBtn('copyTunnelBtn', 'serverTunnelUrl');

// --- Initialization ---
updateAuthUI();
if (token) {
  connect();
}

// Tick countdown client-side every second
setInterval(() => {
  if (latestState && latestState.round && latestState.round.status === 'running' && !isDisconnect) {
    const { round: gameRound } = latestState;
    const now = Math.floor(Date.now() / 1000);
    let remain = gameRound.endTime - now;
    if (remain < 0) remain = 0;
    timeRemainingEl.textContent = remain + ' giây';
  }
}, 1000);

// Admin tabs navigation
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    
    // Deactivate all buttons & content panels
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(p => p.classList.remove('active'));
    
    // Activate current
    btn.classList.add('active');
    const targetPanel = document.getElementById(`tab-${tabName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  });
});
