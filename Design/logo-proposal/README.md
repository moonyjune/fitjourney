# Logo FitJourney · 4 phương án

Toàn bộ vẽ vector bằng tay (SVG), không dùng AI tạo ảnh. Bảng màu lấy từ `src/theme/quest.ts`.

- **Bảng so sánh:** `board.html` / `board.png`: 4 phương án, so sánh 60 / 29 px với icon hiện tại (0.27.1), mỗi thẻ dẫn tới bộ logo.
- **Bộ logo từng phương án:** `options/<X>.html` / `options/<X>.png`

## 4 phương án

| | Tên | Ý nghĩa | Ưu | Nhược |
|---|---|---|---|---|
| **A** | Lửa trại | Đốt calo, chuỗi 🔥, tab "Trại"; lõi lửa là con đường thu nhỏ dần lên đỉnh | Đơn giản nhất, rõ cả ở 16 px, màu ấm nổi bật | Con đường trong lõi chỉ thấy từ ~60 px; lửa là hình phổ biến |
| **B** ✅ đã chọn | Khiên làm gọn | Giữ đúng khiên + đường + ngọc của màn khởi động (`assets/splash-icon.png`) | Đổi ít nhất, người dùng vẫn nhận ra; ở 29 px vẫn đủ 3 thành phần | Vẫn 3 thành phần, kém "một nét là nhớ" |
| **C** | Đỉnh núi | Con đường vàng lên đỉnh có cờ: hành trình tới cân nặng mục tiêu | Kể chuyện "hành trình" rõ nhất | Là một "cảnh": ở 16–29 px chỉ còn tam giác + cờ |
| **D** | Huy hiệu cấp | Huy hiệu lục giác, chữ F, đường xu hướng đi xuống tới ngôi sao | Gọn, dễ nhớ, đơn sắc rất rõ | Đường + sao chỉ rõ từ ~40 px |

### B: chi tiết (phương án đã chọn)

Hình học lấy nguyên từ `src/components/FitJourneyLogo.tsx` (lưới 96: khiên, đường cong S thu nhỏ dần, vạch đứt, viên ngọc), cùng tỉ lệ và màu với splash. Chỉ đổi độ đậm theo cỡ:

| Biến thể | Viền khiên | Đường | Vạch đứt | Ngọc | Dùng cho |
|---|---|---|---|---|---|
| `B-mark.svg` | 4.5 | như cũ | 4 | ×1 | splash, đăng nhập (76 px), logo chữ |
| `B-icon.svg` | 5.5 | đậm hơn 0.8 | 3 (to hơn) | ×1.1 | icon app 1024; khiên cao ~88% icon (0.27.1: ~80%) |
| `B-mark-small.svg` | 7 | đậm hơn 1.8 | không | ×1.22 | ≤ 40 px, favicon, đơn sắc |

Nền icon: radial tối `#2C2140 → #1B1530 → #110D22`, giống `assets/icon.png` hiện tại.

## File (cho mỗi X = A, B, C, D) trong `svg/`

- `X-icon.svg`: icon app 1024 tràn viền, không bo góc (iOS tự bo)
- `X-mark.svg`: chỉ logo, nền trong (splash / trong app)
- `X-mark-small.svg`: bản đơn giản cho cỡ nhỏ (≤ 40 px)
- `X-android-foreground.svg`: lớp tiền cảnh 108 dp, logo nằm trong vùng an toàn 66 dp, nền trong
- `X-android-background.svg`: lớp nền Android
- `X-monochrome.svg`: hình một màu (trắng) cho icon theo chủ đề của Android 13+
- `X-favicon.svg`: favicon (ô bo góc + bản nhỏ), đọc được ở 16 / 32 px

Mã nguồn: `marks.mjs` (hình học), `build-svg.mjs` (xuất SVG), `build-pages.mjs` (trang bộ logo + bảng). Chạy `node build-svg.mjs && node build-pages.mjs`, rồi chụp các trang HTML bằng Chromium headless (playwright-core) ở 1×.

## Sẽ tạo từ phương án đã chọn (B)

Xuất PNG từ SVG (không đổi gì trong app cho tới khi duyệt):

| File trong app | Từ | Cỡ |
|---|---|---|
| `assets/icon.png` | `B-icon.svg` | 1024 × 1024, không trong suốt |
| `assets/android-icon-foreground.png` | `B-android-foreground.svg` | 1024 (108 dp), trong suốt |
| `assets/android-icon-background.png` | `B-android-background.svg` | 1024 |
| `assets/android-icon-monochrome.png` | `B-monochrome.svg` | 1024, trắng trên nền trong |
| `assets/splash-icon.png` | `B-mark.svg` | 1024, nền trong (giữ như hiện tại) |
| `assets/favicon.png` | `B-favicon.svg` | 48 (+ 32 / 16 nếu cần) |
| `public/icons/icon-192.png`, `icon-512.png` | `B-icon.svg` | 192, 512 |
| `public/icons/apple-touch-icon.png` | `B-icon.svg` | 180 |

`src/components/FitJourneyLogo.tsx`: giữ nguyên đường SHIELD / ROAD / DASHES / GEM (cùng lưới 96). Nếu muốn, thêm prop `small` dùng viền 7, đường dày thêm 1.8 (stroke cùng màu, cắt theo khiên), bỏ vạch đứt, ngọc ×1.22 cho các chỗ hiển thị ≤ 40 px.
