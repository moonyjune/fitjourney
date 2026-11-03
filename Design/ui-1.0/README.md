# FitJourney 1.0 · Sơ đồ chuyển màn hình (giao diện đang chạy)

Bản **1.0.1**, làm ngày **03/11/2026**. Tài liệu này tả giao diện **đã triển khai** sau đợt redesign 0.28.0–1.0.1, không phải giao diện cũ (`Design/v4-fitquest/`, `Design/screens*`) và không phải mockup đề xuất (`Design/uiux-proposal/`).

## Trong thư mục

| Tệp | Nội dung |
|---|---|
| `FitJourney-UI-1.0-screen-flow.pdf` | PDF A4 ngang, 71 trang: bìa; sơ đồ tổng (2 trang); 10 mục (Trại, (+) Ghi nhanh, Tập, Hành trình, Hồ sơ, Nhật ký, Cook book / Cheat day, Cài đặt, Tự hiện / vào app, Coach), mỗi mục có sơ đồ phóng to của cột, bảng "Màn / sheet · Route · Mở từ · Thao tác" và ảnh chụp (3 ảnh một trang, ảnh dài được cắt tối đa 3 đoạn); trang cuối: chuyển hướng URL cũ, cổng vào, màn tự hiện và những gì chưa chụp được. |
| `flow.html` | Sơ đồ chuyển màn hình: mỗi cột một tab / màn chính, mỗi ô là ảnh thu nhỏ + tên + route, chữ xám phía trên là thao tác mở ô đó, mũi tên xanh nét đứt là chuyển sang cột khác. Mở bằng trình duyệt; `flow.html?cols=camp,plus` chỉ hiện các cột đó, thêm `&wide=1` (một cột, nhiều ảnh) hoặc `&compact=1` (chỉ tên + route). |
| `flow.png` | Ảnh toàn bộ `flow.html` (3120 px). |
| `png/` | 89 ảnh chụp thật (JPEG, rộng 780 px = 390 pt × 2), đánh số theo thứ tự xuất hiện trên sơ đồ. Màn dài được chụp cả trang. |

Phạm vi: 109 ô trên sơ đồ (8 tab, 57 trang, 29 sheet, 3 sheet nền mờ, 3 toast "Hoàn tác", 3 hộp xác nhận, 6 màn tự hiện), phủ mọi route trong `app/` (route chỉ còn chuyển hướng như `/history`, `/today-classic` ghi ở trang cuối) và mọi sheet mở trong các màn.

## Cách làm

1. **Danh sách màn** lấy từ code: mọi file trong `app/` (tab, trang, redirect), các `router.push / replace`, `href`, `<Redirect>`, và các `BottomSheet` / `QuestSheet` / `ConfirmSheet` / dialog trong `app/**`, `src/components/quest/**`, `src/screens/**`, cùng nút mở chúng. Đối chiếu với `RELEASE_NOTES.md` (0.28.0–1.0.1) và `Design/screens-current.md` §0. Cổng vào theo `app/_layout.tsx` và `app/(tabs)/_layout.tsx`; thông báo đẩy theo `public/sw.js` (chạm → mở `/`).
2. **Ảnh chụp**: bản web dev (`npx expo export -p web --dev`), phục vụ tĩnh, đăng nhập "Login Dev" (dữ liệu mẫu 3 tuần, `src/dev/devLogin.ts`), điều khiển bằng Playwright ở 390 × 844, tỉ lệ 2. Thêm dữ liệu mẫu ngay trong trình duyệt: 6 món trong cook book, 1 lần tìm cheat day, quán đã lưu, kết quả tìm quán. Thẻ "Bữa kế tiếp" ở Trại được chụp với đồng hồ giả lúc 13:30 (buổi tối thẻ này ẩn vì đang nhịn ăn). Pop-up uống nước, thử thách cám dỗ và màn lên cấp được gọi thẳng qua store của app. Màn Coach dùng phiên giả và mọi lời gọi Supabase được trả lời ngay trong trình duyệt (không gửi gì lên server), với một học viên mẫu "Minh Anh".
3. **Sơ đồ và PDF** sinh bằng script (Python + Playwright, chữ và bảng là HTML in ra PDF). Đã xem lại các trang bằng `pdftoppm`.

## Chưa chụp được

- Xem ảnh lớn (PhotoViewer): dữ liệu mẫu không có ảnh bữa ăn / buổi tập.
- Camera khi chạm "Chụp món": trình duyệt mở hộp chọn tệp / camera của hệ điều hành.
- Thông báo đẩy: do hệ điều hành vẽ.
- AI & chi phí (`/ai-admin`): tài khoản dev không phải admin AI, ảnh là màn "chưa được cấp quyền".
- RecipeDialog ("Xem công thức" trong sheet "Phần của các bữa còn lại") và toast "Coach đã cập nhật kế hoạch".

Ghi chú: bản dev có thêm nút "Login Dev" ở màn đăng nhập; email tài khoản trong ảnh Cài đặt / Coach đã được thay bằng "(email tài khoản)".
