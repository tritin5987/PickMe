import { spawn } from 'child_process';

const PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;

console.log("=== Bắt đầu kiểm thử giới hạn tần suất tin nhắn WebSocket (Rate Limiting) ===");

const serverProcess = spawn('bun', ['backend/server.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: 'data/pickme_test.sqlite',
    ADMIN_PASSWORD: 'test_admin_pwd'
  }
});

await new Promise((resolve) => setTimeout(resolve, 2000));

try {
  const username = `ws_rl_${Math.random().toString(36).slice(2, 7)}`;
  const password = 'password123';

  // 1. Đăng ký tài khoản
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const regData = await regRes.json();
  const token = regData.token;

  // 2. Kết nối WebSocket
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`);

  let receivedRateLimitError = false;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'error' && data.message.includes('Tốc độ gửi yêu cầu quá nhanh')) {
      receivedRateLimitError = true;
      console.log("Nhận phản hồi lỗi từ server:", data.message);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  // 3. Spam tin nhắn nhanh
  console.log("Đang spam 15 tin nhắn lên server...");
  for (let i = 0; i < 15; i++) {
    ws.send(JSON.stringify({ action: 'placeBet', amount: 10000 }));
  }

  // Chờ phản hồi
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!receivedRateLimitError) {
    throw new Error("LỖI: Server không kích hoạt rate limit khi gửi tin nhắn dồn dập!");
  }

  console.log("✅ Tính năng rate limit WebSocket hoạt động tốt.");

} finally {
  serverProcess.kill();
  console.log("Đã đóng server kiểm thử.");
}
