# Pick Me Game (Realtime) - Phiên bản Bun

Một trò chơi Realtime đơn giản cho phép đặt cược vàng và chọn người thắng theo tỉ lệ. Dự án sử dụng API HTTP & WebSocket native cực nhanh của **Bun** mà không cần bất kỳ thư viện bên ngoài nào (loại bỏ Express và Socket.IO).

---

## 📋 Yêu cầu hệ thống (Requirements)

- **Bun**: Đã cài đặt Bun trên hệ thống (tải tại [bun.sh](https://bun.sh)).
- **Trình duyệt Web**: Chrome, Edge, Firefox, Safari,... hỗ trợ WebSocket native.

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Khởi chạy Server

#### 1. Chế độ Phát triển (Development Mode - Tự động tải lại code)
Tự động khởi động lại server và tải lại trang trình duyệt của mọi người chơi khi bạn cập nhật code (backend/frontend):
```bash
bun dev
```
*(Hoặc chạy lệnh `bun run dev`)*

#### 2. Chế độ thông thường (Production Mode)
Khởi chạy server thông thường bằng Bun:
```bash
bun start
```
*(Hoặc chạy lệnh `bun server.js`)*

---

## 🎮 Cách chơi cùng nhau trong mạng nội bộ (LAN)

1. **Kết nối chung mạng**: Đảm bảo máy chủ (máy chạy server Bun) và tất cả người chơi khác đều kết nối vào chung một mạng Wifi hoặc mạng LAN nội bộ.
2. **Lấy link chơi**:
   - Truy cập vào game trên máy chủ (ví dụ: `http://localhost:3000`).
   - Tại ô **Tên người chơi**, nhập vào cụm từ **`admin`** và nhấn **Xác nhận / Đổi người chơi** để hiển thị **Bảng điều khiển (Admin)**.
   - Tại đây, bạn sẽ thấy ô **Link chơi mạng nội bộ (LAN)** chứa địa chỉ IP tự động nhận diện của máy chủ.
   - Nhấn nút **Copy** bên cạnh để sao chép đường dẫn.
3. **Gửi và tham gia**: Gửi link vừa copy cho những người chơi khác trong cùng mạng để họ truy cập và tham gia chơi cùng bạn.

---

## 🛠️ Các tính năng nổi bật

- **Native Bun & WebSocket**: Sử dụng `Bun.serve` và WebSocket native của Bun, mang lại hiệu năng cao vượt trội, độ trễ cực thấp và cấu trúc code cực kỳ gọn nhẹ.
- **Tự động quét cổng mạng (Smart IP Detection)**: Tự động phát hiện IP LAN nội bộ thực tế từ các cổng Wi-Fi/Ethernet vật lý và lọc bỏ các IP mạng ảo (như WSL, VirtualBox, VMware, Loopback) để đảm bảo chia sẻ chính xác.
- **Tự động Tải lại (Live Auto-Reload)**: 
  - Server tự khởi động lại khi có thay đổi code nhờ `bun --watch`.
  - Trình duyệt của tất cả người chơi tự động reload khi kết nối lại (chỉ hoạt động ở chế độ dev), hỗ trợ lập trình viên phát triển giao diện và logic nhanh chóng.
