# English — Học Tiếng Anh Thương Mại 📚

Ứng dụng web (PWA) học tiếng Anh thương mại: ghi nhớ ngắt quãng (SRS), luyện nghe/nói/viết, âm bồi, gốc từ, nhập từ vựng đa nguồn (video · text · ảnh · PDF), dịch đa ngữ (Việt · 中文), kế hoạch học hằng ngày.

## 🚀 Chạy nhanh

```bash
cd webapp
python -m http.server 8778
```

Mở http://localhost:8778

## 📁 Cấu trúc

- **`webapp/`** — ứng dụng chạy được (HTML/CSS/JS thuần, offline-first PWA). Xem [webapp/README_APP.md](webapp/README_APP.md).
- **`EN_*.py`** — script Python dựng dữ liệu từ vựng (đọc file seed → `webapp/appdata.js`).
- **`EN_seed_*.txt`** — danh sách từ nguồn.
- **`EN_Business_Vocab_2000.xlsx`** — kho 2000 từ thương mại.
- **`netlify.toml`** — cấu hình deploy Netlify (publish thư mục `webapp/`).

## ✨ Tính năng chính

Xem chi tiết đầy đủ trong [webapp/README_APP.md](webapp/README_APP.md) — bao gồm SRS (nghe/viết/nói), luyện nghe 6 chế độ, nhập từ vựng đa nguồn với room tạm & xác nhận, đọc lần lượt 3 ngôn ngữ (Anh → Việt → 中文), thi thử tính giờ, streak, kế hoạch 100 từ/câu mỗi ngày.

## 📱 Cài lên điện thoại

Xem [webapp/DEPLOY_PHONE.md](webapp/DEPLOY_PHONE.md) — hướng dẫn deploy HTTPS (Netlify/Vercel/GitHub Pages) và cài PWA vào màn hình chính.
