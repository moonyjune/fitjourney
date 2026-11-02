# FitQuest: các hộp thoại, sheet và màn con trong thiết kế mới

> Bổ sung cho `README.md`. Bản đề xuất trước chỉ vẽ màn chính, nên chưa thấy các hộp thoại bên trong. File này liệt kê **mọi hộp thoại, sheet và màn con app đang có** (theo code 0.22.1), chỉ ra mỗi cái mở từ đâu trong thiết kế mới và chức năng có còn đủ không.
> Ảnh: `png/dialogs/NN-*.png` (rộng 390, chụp 2x, cả chiều dài). Tổng hợp: `dialogs-overview.png`. Mã HTML: `html/dialogs/`.
> Trong mỗi ảnh, khung viền xanh lá ghi rõ: giữ gì, chức năng nào chuyển sang đâu.

Ký hiệu cột cuối: **✔** = đủ chức năng · **dời → …** = chức năng vẫn còn nhưng nằm ở chỗ khác · **⚠** = cần bạn chốt (xem cuối file).

## Ghi bữa, nước, cân, cảm giác

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 01 | Chọn ngày ghi | `LogDayPicker` ‹ › (Ghi nhanh, Check-in), `DateOffsetPicker` (Cân nặng, Dinh dưỡng, Tập cũ, Kế hoạch) | Chip "📅 Hôm nay ▾" ở Trại, (+) và mọi màn ghi | `01-date-sheet` | ✔ (mới: cân và tập cũng theo ngày đã chọn) |
| 02 | Ghi cân nặng | Khối cân trong Ghi nhanh, tab Cân nặng | (+) › chip ⚖ 79.4 kg; nút + ở màn Cân nặng (31) | `02-weight-sheet` | ✔ · xoá lần cân dời → 31 |
| 03 | Cảm giác (check-in) | `/checkin`: Trại "Nghỉ ở lửa trại", (+) › Cảm giác | (+) › Cảm giác | `03-checkin-sheet` | ✔ · bỏ 2 ô Nhiệm vụ / Boss (đã có ở Trại) · ⚠ Q4 |
| 04 | Nước nhập số khác, sửa tổng, Hoàn tác, menu Ăn lại | Chip ±ml trong Ghi nhanh, chip + ô ml + "Đặt lại" trong Dinh dưỡng | Nhấn giữ chip nước; toast Hoàn tác; nhấn giữ món ở Ăn lại | `04-water-undo` | ✔ · chip −250/−500 thay bằng Hoàn tác + "Sửa tổng" |
| 05 | Ghi bữa · bước 1 (ảnh, chữ, micro) | `/add-food`, `/text-meal`, form món trong Dinh dưỡng | (+) › Chụp món / Nói-gõ món; ô "Chụp món" ở Trại | `05-meal-input` | ✔ |
| 06 | Món đã lưu (tra CSDL) | `FoodLookup` trong `/add-food` | (+) › Món đã lưu; nút ở bước 1 | `06-saved-foods-sheet` | ✔ |
| 07 | Ghi bữa · phần thêm (bữa, giờ, đọc nhãn, món thay, lời khuyên) | Cuối trang `/add-food` | Bước 2 Kiểm tra món (chạm chip Bữa / Giờ, Chi tiết ▸) | `07-meal-review-more` | ✔ |
| 08 | Sửa từng số của món | `PartEditForm` trong chi tiết bữa, bảng bữa Dinh dưỡng | Nút ✎ ở Kiểm tra món, chi tiết bữa, Nhật ký › Ngày | `08-item-edit-sheet` | ✔ |
| 09 | Bữa theo kế hoạch | `/meal/[slot]` (Ghi nhanh › Bữa ăn, Nhật ký trận), thẻ bữa + `MealRecipeSuggestion` ở Dinh dưỡng | Dòng bữa ở dòng thời gian Trại / Nhật ký › Ngày | `09-plan-meal` | ✔ |
| 10 | Chi tiết bữa đã ghi | `MealDetailDialog` (hộp giữa màn) | Chạm bữa ở dòng thời gian, Nhật ký › Ngày | `10-meal-detail-sheet` | ✔ (mới: Ăn lại, Xoá bữa + Hoàn tác) |
| 11 | Xem ảnh lớn | `PhotoViewer` (Lịch sử "📷 n ảnh", form món) | Ảnh trong chi tiết bữa, Nhật ký, màn Coach | `11-photo-viewer` | ✔ |
| 21 | Phần của các bữa còn lại + mong muốn mỗi bữa | `MealSuggestionsCard` ở Trại (3 dòng tóm tắt, `MealPrefsEditor`, Nhờ AI, cookbook chung) | Trại › Bữa kế tiếp › ⓘ; "Xem thêm 2 món" | `21-meal-budget-prefs` | ✔ |
| — | Pop-up uống nước | `WaterReminderHost` tự hiện | Tự hiện (sheet màu mana) | `png/09-water-after.png` (màn chính) | ✔ · cổ vũ dời → toast |

## Tập luyện

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 12 | Chi tiết buổi tập | `WorkoutDetailDialog` (Nhật ký trận) | Dòng thời gian, Nhật ký › Ngày, Tập › Tuần này | `12-workout-detail-sheet` | ✔ · sửa / ảnh / xoá từ `workout-classic` dời vào đây |
| 13 | Tập khác (chạy, bơi, ảnh đồng hồ, ✨ AI ước tính kcal) | `workout-classic` ("màn hình cũ") | Tập › "Chạy, bơi, ảnh đồng hồ"; (+) › Tập khác | `13-other-workout-sheet` | ✔ · "Sửa bằng AI" dời → 34 · danh sách đã tập dời → Tập / Nhật ký |
| 14 | Cách tập 1 bài + chọn bài | `/train/detail`, lưới chọn bài ở Tập | Chạm dòng bài; "Thêm / bớt bài" | `14-train-detail` | ✔ |
| 15 | Buổi tập đang chạy, nghỉ, thoát, hoàn thành | `/train/session` | "Bắt đầu · giọng HLV"; ô "Tập 18′" ở Trại | `15-train-session` | ✔ (giữ nguyên, chỉ nút Xong set to hơn) |

## Game: cấp, nhiệm vụ, boss

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 16 | Lên cấp | `/level-up` tự mở | Tự mở | `16-level-up` | ✔ |
| 17 | Nhiệm vụ hôm nay | Danh sách gập cuối Trại | Chạm hàng 7 vòng ở Trại | `17-missions-sheet` | ✔ · ⚠ Q6 |
| 18 | Boss tuần | `/boss` (thẻ boss ở Trại) | Thanh boss ở Trại; thẻ boss ở Nhật ký › Tuần | `18-weekly-boss-sheet` | ✔ · log 7 ngày cũng có ở Nhật ký › Tuần · ⚠ Q7 |
| 19 | Tổng kết tuần (AI) | `/weekly-report` (Boss, Hồ sơ) | Thẻ ở Trại (thứ Hai), Nhật ký › Tuần, sheet Boss tuần | `19-weekly-report` | ✔ · lối Hồ sơ bỏ |
| 20 | Chi tiết boss chặng + khẩu chiến + nhật ký sát thương | `StageBossDetail`, `BattleBanter`, `BossDamageLog` (Bản đồ) | Hành trình › chạm nút boss | `20-stage-boss-detail` | ✔ |
| 27 | Thử thách cám dỗ | `TemptationHost` tự hiện | Tự hiện (sheet) | `27-temptation-popup` | ✔ |
| 32 | Thành tích | `/achievements` (Hồ sơ) | Hồ sơ › ô Thành tích; sheet lên cấp | `32-achievements` | ✔ (mới: chip lọc nhóm) |

## Cook book và Cheat day

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 22 | Công thức | `RecipeDialog` (Cook book, gợi ý bữa) | Chạm thẻ món ở Cook book, gợi ý, "Muốn đổi món?" | `22-recipe` | ✔ |
| 23 | Bộ lọc + sắp xếp | `CookbookFinder` tab ✨ Gợi ý (24 chip mở sẵn) | Cook book › nút lọc | `23-cookbook-filter-sheet` | ✔ · công tắc 🎉 dời → segment Cheat day |
| 24 | Gợi ý món mới (cook book, cookbook chung, AI) | Kết quả `CookbookFinder`; ô "Tìm trong cookbook chung" ở Trại | Cook book › "✨ Gợi ý món mới cho bữa trưa"; Trại › Món khác | `24-cookbook-suggest` | ✔ |
| 25 | Thông tin quán (ⓘ) | Thẻ quán dài trong `CheatPlacesList` | Cheat day › thẻ quán › ⓘ | `25-cheat-place-info` | ✔ |
| 26 | Vị trí tìm quán, lịch sử "Xem lại", xoá lịch sử | Ô địa chỉ + "📍 Vị trí của tôi"; `CheatPlacesSaved` | Cheat day › chip vị trí; Lịch sử › Xem lại | `26-cheat-location-history` | ✔ |
| 30 | CSDL món | `/food-db` (Hồ sơ, add-food) | Món đã lưu › Mở CSDL; Cook book ⋯ | `30-food-db` | ✔ |

## Nhật ký và phân tích

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 28 | Phần còn lại của Lịch sử (cảm giác, biểu đồ, mốc, danh sách ngày) | `(tabs)/history` (Hồ sơ) | Cuối Nhật ký › Tuần / Tháng | `28-journal-more` | ✔ |
| 29 | Phân tích | `/insights` (Hồ sơ) | Nhật ký › Tháng › "Phân tích sâu ▸" | `29-insights` | ✔ · ⚠ Q8 |
| 31 | Cân nặng (biểu đồ duy nhất + lần cân) | Tab Cân nặng; Bản đồ › Biểu đồ | Nhật ký › Tháng › Cân nặng; chip Cân nặng ở Hành trình | `31-weight-log` | ✔ · "Boss theo tuần" dời → Nhật ký › Tuần |

## Hồ sơ và cài đặt

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 33 | Mục tiêu & kế hoạch (mục tiêu, cơ thể / TDEE, ngày bắt đầu) | `(tabs)/plan`; `TdeeCard` ở Dinh dưỡng | Hồ sơ › Mục tiêu & kế hoạch | `33-settings-goals` | ✔ · bản trùng (ngôn ngữ, nhắc nhở, coach, đăng xuất) bỏ, còn ở 36 / 37 |
| 34 | Thực đơn, đổi món, Trợ lý AI, đi chợ | `(tabs)/plan` (giữa trang); "Sửa bằng AI" ở Tập cũ | Mục tiêu & kế hoạch › Thực đơn / Đi chợ / Trợ lý AI | `34-plan-ai-shopping` | ✔ |
| 35 | Nước uống · Giới hạn & 16:8 · ⓘ "Vì sao?" | Khối mở sẵn trong Hồ sơ | Hồ sơ › Nước uống; Hồ sơ › Giới hạn & 16:8 | `35-settings-water-limits` | ✔ · Axit uric dời vào đây |
| 36 | Nhắc nhở & cám dỗ | Công tắc + `TemptationSettings` trong Hồ sơ; công tắc trùng ở Kế hoạch | Hồ sơ › Nhắc nhở & cám dỗ | `36-settings-reminders-tempt` | ✔ · ⚠ Q9 |
| 37 | AI · Coach & tài khoản · xác nhận đăng xuất | Khối AI, Tài khoản & dữ liệu trong Hồ sơ; `AiUsageCard` | Hồ sơ › AI; Hồ sơ › Coach & tài khoản | `37-settings-ai-account` | ✔ · ⚠ Q10 |
| 38 | Nhập nhật ký + xoá trước ngày | `/import-diary` (Hồ sơ) | Coach & tài khoản › Nhập nhật ký | `38-import-diary` | ✔ |
| 39 | AI & chi phí (admin) | `/ai-admin` (Hồ sơ, chỉ admin) | Hồ sơ › AI › AI & chi phí | `39-ai-admin` | ✔ |
| 40 | Thói quen + thêm / sửa | `/habits` (Hồ sơ) | Hồ sơ › Thêm › Thói quen | `40-habits` | ✔ |
| 41 | Axit uric + ghi kết quả | `/uric` (Hồ sơ) | Giới hạn & 16:8 › Axit uric | `41-uric` | ✔ |
| 42 | Kiến thức | `/learn` (Hồ sơ, Phân tích) | Hồ sơ › Thêm › Kiến thức; Phân tích › Nhận xét | `42-learn` | ✔ |

## Chung, Coach, vào app

| # | Hộp thoại / màn con | Mở từ (hiện tại) | Mở từ (thiết kế mới) | Mockup | Còn đủ? |
|---|---|---|---|---|---|
| 43 | Xác nhận, xin quyền, toast, lỗi nhập, lỗi AI | `Alert.alert` (≈25 chỗ), `window.confirm`, `FlashNotice`, "bấm lần nữa để xoá" | Hộp trong app (chỉ khi không hoàn tác được), toast Hoàn tác, dòng đỏ dưới ô | `43-confirms-toasts` | ✔ (đổi hình thức) |
| 44 | Màn Coach: học viên, tóm tắt AI, chi tiết, nhận xét | `(tabs)/clients`, `/client/[id]`, `/client-journal`, `/client-history`, `coach-account` | Như cũ; xem nhật ký học viên = tab Ngày / Tuần / Tháng chỉ xem | `44-coach` | ✔ |
| 45 | Đăng nhập, chọn vai trò, bắt đầu 4 bước | `/auth`, `/role-select`, `/onboarding` | Như cũ | `45-onboarding-auth` | ✔ · ⚠ Q11 |

Tổng: **45 mockup** (01–45) + pop-up nước ở màn chính 09. Không có chức năng nào bị bỏ hẳn; những gì bỏ là **bản trùng** (công tắc, ngôn ngữ, đăng xuất ở Kế hoạch; chip −250/−500; 2 ô lặp trong check-in) và **màn cũ** (`today-classic`, `/journal`, `/text-meal`, `workout-classic`, tab Dinh dưỡng / Cân nặng / Lịch sử).

## Đã chốt (2026-11-02)

Câu 1–5, 11, 12 do bạn trả lời; câu 6–10 là đề xuất của Claude (bạn bảo tự chọn), có thể đổi lại.

1. **Ăn lại 1 chạm**: ghi luôn + Hoàn tác, nhấn giữ mở menu. ✔ Đồng ý.
2. **Check-in** nằm trong (+) **và có lối tắt buổi tối trên Trại** (thẻ nhỏ chỉ hiện sau 19:00 khi hôm nay chưa check-in, ẩn khi đã check-in).
3. **Chỉ giữ 2 hộp xác nhận** (Xoá nhật ký trước ngày, Đăng xuất); các xoá khác thành Hoàn tác. ✔ Đồng ý.
4. **Sheet cân (02) không có nút xoá**; xoá lần cân chỉ ở màn Cân nặng (vuốt trái).
5. **Chi tiết bữa / buổi tập / Cám dỗ** thành bottom sheet, **Công thức** thành trang cuộn. ✔ Đồng ý.
6. *(đề xuất)* Chạm nhiệm vụ Đạm / Purine / Muối / Đường / Ăn vặt mở **Nhật ký › Ngày**, cuộn tới bảng dinh dưỡng và tô sáng dòng đó (nhiệm vụ nói về cái đã ăn hôm nay). Dưới dòng có link phụ "Gợi ý món …" mở Cook book lọc sẵn (vd "Nhiều đạm").
7. *(đề xuất)* **Boss tuần là sheet** (xem nhanh: HP, đòn hôm nay "chờ chốt ~X", dải 7 chấm theo ngày). Log 7 ngày đầy đủ **chỉ ở Nhật ký › Tuần**; sheet có nút "Xem cả tuần" mở tới đó. `/boss` giữ làm đường dẫn cũ, chuyển hướng sang Nhật ký › Tuần.
8. *(đề xuất)* **Không gộp**. Nhật ký › Tháng giữ thẻ tóm tắt ngắn + nút mở Phân tích, để Tháng không dài thêm.
9. *(đề xuất)* **Tách** công tắc "Pop-up uống nước" khỏi "Nhắc nhở": pop-up hiện trong app và dày hơn, nhiều người muốn nhắc nhở nhưng không muốn pop-up.
10. *(đề xuất)* **Có** báo "còn n thay đổi chưa đồng bộ sẽ được gửi trước" khi đăng xuất, và gửi xong mới đăng xuất (n = 0 thì không hiện). Tránh mất dữ liệu khi đăng xuất lúc mạng chập chờn.
11. **Giữ tên "Fatty"**.
12. **Còn dùng bài tập riêng trong kế hoạch**: chip "Bài kế hoạch" giữ lại cạnh nhóm A / B / C.
