# English · App Học Tiếng Anh Thương Mại

Web app (PWA) học tiếng Anh xuất nhập khẩu, tạo từ dữ liệu trong các file `EN_seed_*.txt` (2000 từ). Song song với bộ app tiếng Trung (`../CHINESE`), giao diện Việt-hoá, ưu tiên **luyện nghe + từ vựng**.

## Cách chạy
**Trên máy tính:** mở server cục bộ trong thư mục `webapp/`:
```bash
python -m http.server 8778
```
rồi mở http://localhost:8778 (mở trực tiếp `index.html` cũng chạy được, nhưng một số trình duyệt chặn `appdata.js` khi mở bằng `file://`).

**Trên điện thoại (cài như app thật, PWA):** kéo–thả cả thư mục `webapp/` vào https://app.netlify.com/drop để có link HTTPS, rồi mở link đó trên điện thoại → "Thêm vào màn hình chính". Xem chi tiết trong `DEPLOY_PHONE.md`.

## Tính năng chính

| Mục | Mô tả |
|---|---|
| 🧠 **Ôn tập ghi nhớ (SRS)** | Lặp lại ngắt quãng (SM-2). **3 kiểu kiểm tra: 🎧 Nghe & lật · ✍️ Viết chính tả · 🎤 Luyện nói (micro tự chấm).** Thống kê phiên realtime: Quên/Khó/Nhớ/Dễ. |
| 📖 **Ôn câu ví dụ (SRS câu)** | Lặp lại ngắt quãng trên **cả câu** (câu mẫu có sẵn + câu ví dụ của từ tự nhập): nghe → hiểu nghĩa → tự chấm. |
| 📈 **Tiến độ theo thời gian** | Biểu đồ 14 ngày (ôn tập · từ mới · ôn câu) trong 📊 Thống kê. |
| 🔥 **Chuỗi ngày học (streak)** | Đếm ngày học liên tiếp + kỷ lục, hiện ở trang chủ; banner nhắc khi có mục đến hạn. |
| 🔔 **Nhắc ôn tập** | Bật thông báo trình duyệt — nhắc khi mở app &amp; có từ/câu đến hạn (📊 Thống kê hoặc banner trang chủ). |
| 🎯 **Thi thử (tính giờ)** | Bài kiểm tra mô phỏng: 10–50 câu, đồng hồ đếm ngược, hết giờ tự nộp, chấm điểm % + xem lại câu sai. |
| 🔢 **Tần suất nghe/đọc** | Đếm số lần mỗi từ được phát (hiện trên thẻ 🔊×n). Nghe liên tục & Đọc lần lượt có sắp xếp **thấp→cao / cao→thấp** theo tần suất. |
| 🔆 **Nghe không tắt màn hình** | Khi Nghe liên tục, app dùng **Wake Lock** giữ màn hình sáng (tự lấy lại khi bật lại màn hình) — tiện nghe khi lái xe. |
| 🎯 **Kế hoạch hằng ngày** | Mục tiêu 100 từ + 100 câu/ngày (chỉnh được), thanh tiến độ ở trang chủ, cập nhật theo hoạt động ôn tập trong ngày. |
| 📋 **Danh sách tự động mỗi ngày** | App **tự chọn 100 từ + 100 câu mới cố định** cho hôm nay (giữ nguyên cả ngày, sang ngày mới tự đổi). Nút: Học từ / Nghe từ / Ôn câu / Xem danh sách. |
| ⏰ **Nhắc theo giờ cố định** | Đặt giờ nhắc (mặc định 08:00) — thông báo hằng ngày. Chạy khi app mở; qua giờ mới mở thì nhắc bù ngay. (Cài PWA để ổn định hơn.) |
| 📂 **Gán chủ đề khi nhập** | Khi xác nhận room, chọn **chủ đề** để gom từ mới vào 34 chủ đề có sẵn — lọc chung với kho. |
| 🎧 **Luyện nghe** | 6 chế độ: từ→nghĩa, nghe→chọn từ, câu→đáp án, **▶️ Nghe liên tục (autoplay, rảnh tay khi lái xe)**, **📖 Đoạn văn/câu chuyện (ghép câu thành đoạn liền mạch)**, **🎤 Luyện nói**. Có nghe lại, nghe chậm, đọc kèm nghĩa Việt. |
| 🎬 **Nhập từ vựng (đa nguồn)** | 5 nguồn: **📝 Văn bản · ▶️ YouTube · 🖼️ Hình ảnh (OCR) · 📄 PDF · 📱 Reel**. Quy trình: nguồn → **lọc trùng + lọc cơ bản/đơn giản vào room tạm** → kiểm tra/bỏ chọn → **✅ Xác nhận vào thư viện keyword**. Bộ lọc: bỏ từ thông dụng, **bỏ từ đơn giản**, **bắt cụm từ (collocation)**, **tự dịch sau khi lọc**. Room tạm hiển thị **loại từ · nghĩa VN · 中文 + pinyin**. Có **lịch sử nhập** (phát hiện trùng nguồn) & **quản lý room** (đổi tên / xóa / nghe cả room). OCR/PDF & dịch cần mạng lần đầu, sau đó cache offline. |
| 🔊 **Giọng đọc (Cài đặt)** | Chọn **giọng Anh · Việt · Trung** + tốc độ riêng (trong 📊 Thống kê). **Nghe lần lượt** đọc **nghĩa Việt (🇻🇳) → English → 中文 (🇨🇳)** — mặc định **đọc tiếng Việt TRƯỚC** (đổi được), giọng Việt ưu tiên Neural/Natural + làm sạch text để phát âm chuẩn hơn. Cần cài gói giọng tương ứng (Android: Cài đặt → Text-to-speech). |
| 🀄 **Câu ví dụ đa ngữ** | Câu ví dụ có thêm bản **tiếng Trung (Mandarin) + pinyin** (kèm 🇻🇳). Hiện ở chi tiết từ &amp; ôn câu; nút "🌐 Dịch 中文 + pinyin" lấy on-demand (cache lại). |
| 📖 **Tài liệu tham khảo** | Kho ~81 học liệu tiếng Anh (kênh nghe, podcast, shadowing, từ vựng, IELTS, tiếng Anh thương mại/XNK, công cụ AI, truyện, tài liệu cho trẻ em…) **gom theo chủ đề**. Tìm kiếm, lọc chủ đề, xem tóm tắt &amp; mở nguồn gốc (Facebook / bài gốc / link ngoài). Dữ liệu lấy từ kho kiến thức chia sẻ, chạy offline. |
| 🔗 **Ôn cụm từ tách biệt** | Bộ lọc **🔗 Chỉ cụm từ** ở trang Từ vựng để ôn riêng collocation; đếm cụm từ ở 📊 Thống kê. |
| 💡 **Câu ví dụ tự động** | Từ/cụm mới nhập được **tự gắn câu ví dụ lấy từ chính nguồn** (text/phụ đề), **dịch câu ví dụ sang tiếng Việt** khi bấm Tra nghĩa — hiện ở room tạm & chi tiết từ. |
| 🧹 **Dọn thư viện** | Gỡ từ trùng lặp (cùng chữ) & phát hiện **nhóm từ trùng nghĩa VN** để xóa bớt (trong 🎬 Nhập từ vựng). |
| 📤 **Xuất/Nhập thư viện keyword** | Xuất riêng các từ tự thêm ra file `.json` để **chép sang máy/điện thoại khác**, Nhập lại tự gộp & bỏ trùng (📊 Thống kê). |
| ▶️ **Đọc lần lượt (hands-free)** | Trang **Từ vựng** và **Câu ví dụ** có nút "Đọc lần lượt" — đọc trên→dưới từng mục kèm nghĩa Việt, có thanh điều khiển ⏮ ⏸ ⏭ nổi — luyện nghe/nói khi lái xe. |
| 🗣️ **Âm bồi** | Bên cạnh IPA, mọi từ đều có **âm bồi** (phiên âm tiếng Việt gần đúng, chia âm tiết bằng gạch nối: business → *bid-nâx*, negotiate → *nâ-gâusi-âyt*). |
| 🌱 **Gốc từ** | Tra bất kỳ từ nào → phân tích **tiền tố · hậu tố · gốc La-tinh** và cụm từ đi kèm. Với 2000 từ trong kho có sẵn ghi chú gốc từ chi tiết. |
| 📚 Từ vựng (2000) | Lọc cấp độ (Cơ bản/Trung cấp/Nâng cao) & 34 chủ đề, tìm kiếm, gốc từ + ví dụ, phát âm, Youglish, đánh dấu thuộc. |
| 🎴 Flashcard | Lật thẻ ôn nhanh. |
| ✍️ Luyện viết | Nhìn nghĩa + nghe, gõ lại từ tiếng Anh, chấm điểm. |
| 📝 Kiểm tra | Trắc nghiệm chọn nghĩa. |
| 📄 Câu ví dụ (2000) | Kho câu mẫu tiếng Anh thương mại, nghe & tra. |
| 📋 Phụ đề → Phiên âm | Dán tiếng Anh → tách từ + IPA (offline) + âm bồi + nghĩa Việt + dịch đoạn qua Google. |
| 📊 Thống kê | Tiến độ, điểm nghe/kiểm tra, biểu đồ, xuất/reset. |

## Youglish
Mọi từ/câu đều có nút **🌐 Youglish** — nghe **người bản xứ phát âm trong video thật**, nhúng ngay trong app (cần mạng).

## Ghi chú
- Tiến độ học, lịch ôn SRS, từ tự thêm, điểm số → lưu trong trình duyệt (localStorage) trên máy bạn.
- Phát âm dùng giọng đọc tiếng Anh của hệ điều hành (Web Speech API) — nên cài gói giọng "English (United States)" để nghe hay hơn.
- Phiên âm IPA offline lấy từ từ điển CMU (~119.000 từ) nên tính năng 🎬 Nhập video / 📋 Phụ đề gắn được phiên âm cho hầu hết từ mới ngay trên trình duyệt, không cần mạng.
- Module 🎬 Nhập video web **bổ sung** cho các script Python có sẵn (`EN_video.py` — tự tải phụ đề YouTube cần backend). App web nhận phụ đề dán vào và xử lý từ mới ngay trên trình duyệt.
- **OCR (ảnh) & đọc PDF**: dùng Tesseract.js / pdf.js tải từ CDN. **Lần đầu cần mạng**, sau đó Service Worker (`sw.js`) tự cache lại (kể cả dữ liệu ngôn ngữ ~15MB) để **dùng offline** những lần sau.
- **Tự động dịch nghĩa** (nút 🌐 trong room tạm): dùng Google Translate (fallback MyMemory) — **cần mạng**. IPA & âm bồi vẫn tạo offline.
- **Giọng tiếng Việt**: để đọc nghĩa chuẩn, cần cài giọng TTS tiếng Việt trên thiết bị (Android: Cài đặt → Text-to-speech → tải Google giọng Việt). Chưa cài → app cảnh báo trong 📊 Thống kê.

## Tệp
- `index.html`, `styles.css`, `app.js` — mã nguồn app
- `appdata.js` — toàn bộ dữ liệu đã trích xuất (nhúng sẵn: 2000 từ + từ điển IPA + tiền/hậu tố + stopwords)
- `data.json` — dữ liệu dạng JSON thuần (để tham khảo/tái sử dụng)
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` — cấu hình PWA

## Dựng lại dữ liệu
Khi sửa/thêm từ trong các file `EN_seed_*.txt` (ở thư mục cha), chạy lại từ thư mục cha:
```bash
python EN_webbuild.py
```
Script đọc seed → sinh IPA (CMU) → xuất `webapp/appdata.js` và `webapp/data.json`.
