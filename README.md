# Mnema (Cloudflare Free Tier Edition)

A high-performance, self-hosted personal knowledge library & read-it-later application, built to run **100% on Cloudflare's generous Free Tier** (0đ/month).

---

## 🚀 Tính năng nổi bật (Core Features)

1. **Smart Article & Web Ingestion**:
   - Dán URL bất kỳ $\rightarrow$ Bóc tách nội dung sạch bằng Mozilla Readability + Linkedom (tự động loại bỏ quảng cáo, giữ lại tiêu đề, tác giả, ảnh bìa, thời gian đọc).
2. **YouTube Video & Synchronized Transcript**:
   - Nhập link video YouTube $\rightarrow$ Tự động cào phụ đề và hiển thị song song với video.
   - Bấm vào câu bất kỳ trong transcript để video tự động nhảy đến mốc thời gian đó.
3. **Immersive Reader Mode & Table of Contents**:
   - Giao diện đọc tập trung cao cấp: Lora Serif hoặc Sans-serif typography.
   - Tùy chỉnh kích thước chữ, độ rộng trang, và 3 chế độ nền: **Light**, **Dark**, và **Sepia**.
   - Hỗ trợ Text-to-Speech (TTS) đọc thành tiếng bài viết ngay trên trình duyệt (Web Speech API).
   - **Table of Contents (Outline)**: Tự động bóc tách các thẻ tiêu đề (H1, H2, H3) thành mục lục để nhảy nhanh đến từng phần.
   - **AI Copilot**: Hỏi đáp, tóm tắt bài viết bằng Google Gemini / Workers AI ngay trong trình đọc.

4. **Command Palette (Spotlight ⌘K / Ctrl+K)**:
   - Nhấn `⌘K` hoặc `Ctrl+K` bất kỳ lúc nào để tìm kiếm nhanh bài viết, highlight hoặc kích hoạt các lệnh điều hướng.

5. **Social Share Quote Card Generator**:
   - Chuyển bất kỳ highlight nào thành thẻ ảnh trích dẫn với các chủ đề gradient tuyệt đẹp (Emerald Aurora, Midnight Ink, Sepia Parchment, Violet Nebula).

6. **Activity Heatmap (Lịch hoạt động học tập)**:
   - Biểu đồ nhiệt (tương tự GitHub contribution calendar) theo dõi tần suất đọc bài và ôn tập trích dẫn qua từng ngày.

7. **Export Highlights Engine**:
   - Xuất dữ liệu sang **Markdown** (tương thích Obsidian / Notion), **CSV** (cho Anki / Excel), hoặc **HTML** trang web offline.

8. **Model Context Protocol (MCP) Server**:
   - Tích hợp endpoint MCP `/api/mcp` chuẩn JSON-RPC 2.0 cho phép các trợ lý AI (như Claude Desktop, Cursor, Antigravity) tra cứu trực tiếp thư viện và highlight của bạn!

9. **Interactive Text Highlighting**:
   - Bôi đen bất kỳ đoạn văn nào trong Reader $\rightarrow$ Hiện popup chọn 4 màu highlight (Vàng, Xanh dương, Xanh lá, Hồng) và thêm ghi chú (Note).
5. **Daily Spaced Repetition Review (SRS)**:
   - Thuật toán SuperMemo SM-2 tự động tính toán thời điểm ôn tập lại từng highlight.
   - 2 chế độ ôn tập:
     - **Story Mode**: Hiển thị highlight dạng slide tự động chuyển như Instagram Stories.
     - **Flashcard Mode**: Lật thẻ kiểm tra ghi nhớ (Forgot, Remember, Discard).
   - Theo dõi chuỗi học tập liên tiếp (**Daily Streak Flame**).
6. **Kindle Highlights Import**:
   - Upload file `My Clippings.txt` từ máy đọc sách Kindle $\rightarrow$ Tự động nhận diện sách, tác giả và nhập toàn bộ highlight vào thư viện.

---

## 🛠️ Công nghệ (Tech Stack)

* **Backend**: Cloudflare Worker + [Hono](https://hono.dev/) framework (TypeScript).
* **Database**: **Cloudflare D1** (Serverless SQLite trên Edge) với schema đầy đủ bảng `sources`, `highlights`, `tags`, `reviews_log`, `streak`.
* **Frontend**: **Vite + React 19 + Tailwind CSS + Lucide Icons + TanStack Query**.
* **Storage**: Cloudflare Pages (Frontend) & Cloudflare R2 (tùy chọn cho PDF/EPUB).

---

## 💻 Chạy cục bộ (Local Development)

### 1. Khởi tạo Database D1 Local
```bash
npm --workspace=apps/api run d1:init
```

### 2. Khởi chạy Backend Worker
```bash
npm run dev:api
# API chạy tại: http://127.0.0.1:8787
```

### 3. Khởi chạy Frontend React App
Mở một terminal khác và chạy:
```bash
npm run dev:web
# Web UI chạy tại: http://localhost:5173
```

---

## ☁️ Hướng dẫn Deploy lên Cloudflare Free Tier (Production)

### Bước 1: Đăng nhập Cloudflare Wrangler
```bash
npx wrangler login
```

### Bước 2: Tạo D1 Database trên Cloudflare
```bash
npx wrangler d1 create mnema_db
```
Lấy `database_id` được in ra trên màn hình và dán vào file `apps/api/wrangler.jsonc`.

### Bước 3: Áp dụng Database Schema trên Cloudflare
```bash
npm --workspace=apps/api run d1:init:prod
```

### Bước 4: Deploy Backend Worker
```bash
npm --workspace=apps/api run deploy
```

### Bước 5: Deploy Frontend lên Cloudflare Pages
```bash
npm --workspace=apps/web run build
npx wrangler pages deploy apps/web/dist --project-name=mnema
```

---

*Chúc bạn có một thư viện cá nhân lưu trữ kiến thức đọc tuyệt vời trên Cloudflare!*

