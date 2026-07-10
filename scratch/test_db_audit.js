import { db, getTransactionHistory, getUserBalance, addUserBalance, deductUserBalance } from '../backend/database.js';
import { placeBet, round, config } from '../backend/game.js';

console.log("=== Bắt đầu kiểm thử tối ưu hóa & bảo mật Database/Game ===");

// 1. Kiểm tra PRAGMA foreign_keys
const fkStatus = db.query("PRAGMA foreign_keys;").get();
console.log("PRAGMA foreign_keys status:", fkStatus);
if (fkStatus.foreign_keys !== 1) {
  throw new Error("PRAGMA foreign_keys chưa được bật!");
}
console.log("✅ PRAGMA foreign_keys đã bật thành công.");

// 2. Kiểm tra các Indexes tồn tại
const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index';").all();
console.log("Danh sách các index hiện tại:", indexes.map(i => i.name));
const hasSessionsIndex = indexes.some(i => i.name === 'idx_sessions_user_id');
const hasTransactionsIndex = indexes.some(i => i.name === 'idx_transactions_username');

if (!hasSessionsIndex) {
  throw new Error("Thiếu index idx_sessions_user_id trên bảng sessions!");
}
if (!hasTransactionsIndex) {
  throw new Error("Thiếu index idx_transactions_username trên bảng transactions!");
}
console.log("✅ Đầy đủ các chỉ mục (Indexes) tối ưu truy vấn.");

// 3. Kiểm tra ghi sổ cái biến động số dư (Transaction Audit Ledger)
console.log("Đang giả lập giao dịch cộng/trừ tiền...");
// Đảm bảo có user test
db.query("INSERT OR IGNORE INTO users (username, password_hash, balance) VALUES ('test_audit_user', 'hash', 1000000);").run();

const balanceBefore = getUserBalance('test_audit_user');
deductUserBalance('test_audit_user', 50000, 'bet');
const balanceAfterDeduct = getUserBalance('test_audit_user');

if (balanceBefore - balanceAfterDeduct !== 50000) {
  throw new Error("Trừ tiền thất bại hoặc số dư không chính xác!");
}

addUserBalance('test_audit_user', 100000, 'win');
const balanceAfterAdd = getUserBalance('test_audit_user');

if (balanceAfterAdd - balanceAfterDeduct !== 100000) {
  throw new Error("Cộng tiền thất bại hoặc số dư không chính xác!");
}

const history = getTransactionHistory('test_audit_user');
console.log("Lịch sử giao dịch của test_audit_user:", history);

if (history.length < 2) {
  throw new Error("Không ghi nhận đủ lịch sử giao dịch vào bảng transactions!");
}
if (history[0].type !== 'win' || history[0].amount !== 100000) {
  throw new Error("Dữ liệu giao dịch thứ 1 không khớp!");
}
if (history[1].type !== 'bet' || history[1].amount !== 50000) {
  throw new Error("Dữ liệu giao dịch thứ 2 không khớp!");
}
console.log("✅ Ghi nhận sổ cái giao dịch (Transaction Audit Ledger) hoạt động chuẩn xác.");

// 4. Kiểm tra chống đặt cược muộn (Late-Betting Prevention)
console.log("Kiểm tra cơ chế chống đặt cược muộn...");
// Giả lập trạng thái ván đấu đã chạy và hết thời gian
round.status = 'running';
round.startTime = Math.floor(Date.now() / 1000) - 10;
round.endTime = Math.floor(Date.now() / 1000) - 1; // End time is in the past

const betResult = placeBet('test_audit_user', 10000);
console.log("Kết quả đặt cược muộn:", betResult);

if (betResult.success) {
  throw new Error("LỖI: Cho phép đặt cược khi thời gian ván đấu đã kết thúc!");
}
if (betResult.message !== 'Thời gian đặt cược của ván này đã kết thúc!') {
  throw new Error(`Thông báo lỗi không đúng: ${betResult.message}`);
}
console.log("✅ Đã chặn đặt cược muộn (Front-Running) thành công.");

// Khôi phục trạng thái round
round.status = 'waiting';
round.startTime = null;
round.endTime = null;

console.log("🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ THÀNH CÔNG!");
process.exit(0);
