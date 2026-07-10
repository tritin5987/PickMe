import { spawn } from 'child_process';

const PORT = 3001; // use separate port for test
const BASE_URL = `http://127.0.0.1:${PORT}`;

console.log("=== Bắt đầu kiểm thử ngắt kết nối WebSocket khi đổi mật khẩu ===");

// Khởi động server ở cổng test
const serverProcess = spawn('bun', ['backend/server.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: 'data/pickme_test.sqlite',
    ADMIN_PASSWORD: 'test_admin_pwd'
  }
});

// Chờ server khởi động
await new Promise((resolve) => setTimeout(resolve, 2000));

try {
  const username = `ws_test_${Math.random().toString(36).slice(2, 7)}`;
  const password = 'password123';

  // 1. Đăng ký tài khoản
  console.log(`Đăng ký tài khoản kiểm thử: ${username}`);
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const regData = await regRes.json();
  if (!regData.success) {
    throw new Error(`Đăng ký thất bại: ${JSON.stringify(regData)}`);
  }
  const token = regData.token;
  console.log("Đăng ký thành công, nhận token:", token);

  // 2. Kết nối WebSocket
  console.log("Đang kết nối WebSocket...");
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`);

  let gotCloseEvent = false;
  let gotErrorMessage = false;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'error' && data.message.includes('Phiên đăng nhập của bạn đã hết hạn')) {
      gotErrorMessage = true;
      console.log("Nhận tin nhắn lỗi từ server thông báo phiên hết hạn.");
    }
  };

  ws.onclose = () => {
    gotCloseEvent = true;
    console.log("WebSocket đã bị đóng bởi server.");
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });
  console.log("Kết nối WebSocket thành công.");

  // 3. Đổi mật khẩu tài khoản
  console.log("Gửi yêu cầu đổi mật khẩu tài khoản...");
  const changeRes = await fetch(`${BASE_URL}/api/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ oldPassword: password, newPassword: 'new_password123' })
  });
  const changeData = await changeRes.json();
  console.log("Kết quả đổi mật khẩu:", changeData);

  if (!changeData.success) {
    throw new Error(`Đổi mật khẩu thất bại: ${JSON.stringify(changeData)}`);
  }

  // Chờ WebSocket đóng
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!gotCloseEvent) {
    throw new Error("LỖI: WebSocket vẫn mở sau khi người dùng đổi mật khẩu!");
  }
  if (!gotErrorMessage) {
    throw new Error("LỖI: Không nhận được tin nhắn thông báo phiên hết hạn!");
  }

  console.log("✅ Tính năng đóng kết nối WebSocket cũ hoạt động hoàn hảo.");

} finally {
  serverProcess.kill();
  console.log("Đã đóng server kiểm thử.");
}
