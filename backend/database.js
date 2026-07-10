import { Database } from 'bun:sqlite';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!DB_PATH) {
  throw new Error("DB_PATH environment variable is not defined in .env!");
}
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD environment variable is not defined in .env!");
}

// Đảm bảo thư mục lưu trữ database tồn tại
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Khởi tạo Database
const db = new Database(DB_PATH);

// Tạo bảng users
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    balance INTEGER DEFAULT 1000000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Di chuyển an toàn: Thêm cột balance vào bảng users nếu chưa tồn tại
try {
  db.run("ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 1000000");
} catch (e) {
  // Cột đã tồn tại hoặc có lỗi khác, bỏ qua
}

// Tạo bảng sessions
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Tạo bảng configs
db.run(`
  CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Khởi tạo các cấu hình mặc định trong database
const seedConfig = (key, val) => {
  db.query("INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)").run(key, String(val));
};
if (!process.env.DEFAULT_MIN_BET) {
  throw new Error("DEFAULT_MIN_BET environment variable is not defined in .env!");
}
if (!process.env.DEFAULT_BET_DURATION) {
  throw new Error("DEFAULT_BET_DURATION environment variable is not defined in .env!");
}

seedConfig("DEFAULT_MIN_BET", process.env.DEFAULT_MIN_BET);
seedConfig("DEFAULT_BET_DURATION", process.env.DEFAULT_BET_DURATION);
seedConfig("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD);

// Tạo tài khoản admin mặc định dựa trên cấu hình database
const seedAdmin = async () => {
  try {
    const adminPassRow = db.query("SELECT value FROM configs WHERE key = 'ADMIN_PASSWORD'").get();
    const adminPassword = adminPassRow ? adminPassRow.value : null;
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD config is not defined in configs table!");
    }

    const adminExists = db.query("SELECT 1 FROM users WHERE username = 'admin'").get();
    if (!adminExists) {
      const adminPasswordHash = await Bun.password.hash(adminPassword);
      db.query("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("admin", adminPasswordHash);
      console.log(`Đã khởi tạo tài khoản admin mặc định: admin / ${adminPassword}`);
    } else {
      // Luôn đồng bộ mật khẩu admin trong database để khớp với ADMIN_PASSWORD ở configs
      const adminPasswordHash = await Bun.password.hash(adminPassword);
      db.query("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(adminPasswordHash);
      console.log(`Đã đồng bộ mật khẩu admin với configs thành công: admin / ${adminPassword}`);
    }
  } catch (err) {
    console.error("Lỗi khởi tạo tài khoản admin:", err);
  }
};
await seedAdmin();

export { db };

// Lấy toàn bộ cấu hình từ database
export function getDbConfigs() {
  const rows = db.query("SELECT key, value FROM configs").all();
  const res = {};
  for (const r of rows) {
    res[r.key] = r.value;
  }
  return res;
}

// Cập nhật cấu hình vào database
export function updateDbConfig(key, value) {
  db.query("INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)").run(key, String(value));
}

// --- Các hàm tiện ích xác thực người dùng ---

export function checkUserExists(username) {
  return !!db.query("SELECT 1 FROM users WHERE username = ?").get(username);
}

export async function registerUser(username, password) {
  if (username.toLowerCase() === 'admin') {
    throw new Error("Không được phép đăng ký tên tài khoản admin");
  }
  const hash = await Bun.password.hash(password);
  db.query("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
  const user = db.query("SELECT id, username, balance FROM users WHERE username = ?").get(username);
  const token = crypto.randomUUID();
  db.query("INSERT INTO sessions (token, user_id, username) VALUES (?, ?, ?)").run(token, user.id, user.username);
  return { token, username: user.username, balance: user.username.toLowerCase() === 'admin' ? 'Vô hạn' : user.balance };
}

export async function loginUser(username, password) {
  const user = db.query("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return null;
  
  const isMatch = await Bun.password.verify(password, user.password_hash);
  if (!isMatch) return null;

  const token = crypto.randomUUID();
  db.query("INSERT INTO sessions (token, user_id, username) VALUES (?, ?, ?)").run(token, user.id, user.username);
  return { token, username: user.username, balance: user.username.toLowerCase() === 'admin' ? 'Vô hạn' : user.balance };
}

export function verifySessionToken(token) {
  return db.query("SELECT * FROM sessions WHERE token = ?").get(token);
}

export function deleteSessionToken(token) {
  db.query("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function resetUserPassword(username, newPassword) {
  const hash = await Bun.password.hash(newPassword);
  db.query("UPDATE users SET password_hash = ? WHERE username = ?").run(hash, username);
  
  // Thu hồi tất cả session của người dùng để bắt họ đăng nhập lại
  const userRow = db.query("SELECT id FROM users WHERE username = ?").get(username);
  if (userRow) {
    db.query("DELETE FROM sessions WHERE user_id = ?").run(userRow.id);
  }
}

export async function changeUserPassword(userId, oldPassword, newPassword) {
  const user = db.query("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return { success: false, error: 'Người dùng không tồn tại' };

  const isMatch = await Bun.password.verify(oldPassword, user.password_hash);
  if (!isMatch) return { success: false, error: 'Mật khẩu cũ không chính xác' };

  const newHash = await Bun.password.hash(newPassword);
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, userId);

  // Xóa mọi sessions của người dùng này để bắt đăng nhập lại từ đầu
  db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);

  return { success: true };
}

export function getUserBalance(username) {
  const row = db.query("SELECT balance FROM users WHERE username = ?").get(username);
  return row ? row.balance : 0;
}

export function deductUserBalance(username, amount) {
  db.query("UPDATE users SET balance = balance - ? WHERE username = ?").run(amount, username);
}

export function addUserBalance(username, amount) {
  db.query("UPDATE users SET balance = balance + ? WHERE username = ?").run(amount, username);
}
