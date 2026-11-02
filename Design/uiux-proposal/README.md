# FitQuest: đề xuất cải tiến UI/UX (bản chờ duyệt)

> Phạm vi: mọi màn của app người dùng (client), có ghi chú ngắn cho màn Coach. Bản này **không sửa code app**. Bạn duyệt ảnh trước, sau đó mới làm theo từng giai đoạn.
> Giữ nguyên: màu, màu chữ và bảng màu trong `src/theme/quest.ts`, font Chakra Petch (`questFonts`), bo góc (`questRadius`: 12 / 16 / 14).
> Dựa trên: code ở bản 0.21.0, `Design/screens-current.md` (mục 4, 16 chỗ chưa nhất quán) và `Design/v4-fitquest`.
> Mockup "ĐỀ XUẤT" và hộp thoại theo luật thâm hụt của **0.23.0**: thâm hụt hôm nay là số dự kiến "~X" tới khi chốt, đòn boss tuần chờ chốt, ngày thiếu bữa có dòng ⚠ + "Ghi bổ sung", chưa ghi bữa thì không có số. Ảnh "HIỆN TẠI" vẽ app trước 0.23.0.

**Ảnh:** `overview.png` là bảng tổng hợp. Từng màn nằm trong `png/`, rộng 390 pt và chụp ở 2x. Mỗi ảnh là **cả màn hình theo chiều cuộn**, từ đầu tới cuối trang, không còn cắt ở 844 pt. Thanh tab và nút lưu cố định được vẽ ở cuối trang. Mã HTML nằm trong `html/` và mở được trực tiếp trong trình duyệt.
Ảnh "HIỆN TẠI" vẽ lại màn hiện có, kèm chấm đỏ đánh số đúng vấn đề nêu dưới đây. Ảnh "ĐỀ XUẤT" là thiết kế mới.

| # | Màn | Hiện tại | Đề xuất |
|---|---|---|---|
| 1 | Trại | `png/01-camp-before.png` | `png/01-camp-after.png` |
| 2 | Ghi nhanh (+) | `png/02-quickadd-before.png` | `png/02-quickadd-after.png` |
| 3 | Ghi món (AI ảnh) | `png/03-addfood-before.png` | `png/03-addfood-after.png` |
| 4 | Bản đồ → Hành trình | `png/04-map-before.png` | `png/04-map-after.png` |
| 5 | Tập | `png/05-train-before.png` | `png/05-train-after.png` |
| 6 | Cook book | `png/06-cookbook-before.png` | `png/06-cookbook-after.png` |
| 6b | Cheat day & tìm quán | (công tắc trong Cook book) | `png/06b-cheatday-after.png` |
| 7 | Lịch sử → Nhật ký | `png/07-journal-before.png` | `png/07-journal-after.png` |
| 8 | Hồ sơ | `png/08-profile-before.png` | `png/08-profile-after.png` |
| 9 | Pop-up nước | `png/09-water-before.png` | `png/09-water-after.png` |

Ảnh món ăn là ảnh thật từ Wikimedia Commons, tải về `html/img/` để mockup không bị vỡ ảnh. Nguồn và giấy phép ở cuối file. Trong app, ảnh món lấy từ hàm `dish-photo` sẵn có và ảnh người dùng chụp. Tên quán trong mockup Cheat day là dữ liệu mẫu.

---

## 1. Tóm tắt: 10 thay đổi có tác động lớn nhất

| # | Thay đổi | Lý do | Ưu tiên |
|---|---|---|---|
| 1 | **Một cửa ghi món, mở thẳng camera**: "Chụp món" thành nút chính ở Trại và (+). AI tự chạy sau khi chụp. Gộp `/add-food`, `/text-meal`, form món trong Dinh dưỡng và `/meal/[slot]` thành **một luồng "Ghi bữa"** | Đây là việc làm nhiều nhất trong ngày nhưng hiện có 4 cửa và mất 8 chạm + 2–3 lần cuộn. Đề xuất còn 3–4 chạm | P0 |
| 2 | **Trại thành "Hôm nay" gọn trong 1,5 màn**: vòng kcal còn ăn, gộp số liệu ngày với boss tuần trong 1 thẻ, 3 ô hành động 1 chạm (Chụp món / +250 ml / Tập), nhiệm vụ dạng 7 vòng icon, 1 gợi ý bữa kế có ảnh | Hiện ngân sách kcal nằm rải ở 3 chỗ và trang dài ≈5 màn. Người dùng cần biết "còn ăn bao nhiêu, ăn gì tiếp" mà không phải cuộn | P0 |
| 3 | **Bỏ màn trùng, bỏ "tab ẩn"**: xoá `today-classic`, đổi `workout-classic` thành sheet "Tập khác", chuyển `weight` / `nutrition` / `history` / `plan` từ tab sang stack, gộp các mục trùng giữa Kế hoạch và Hồ sơ | Ít đường đi hơn thì ít nhầm và ít code phải bảo trì (screens-current §4.1–4.5) | P0 |
| 4 | **Một màn "Nhật ký" có Ngày / Tuần / Tháng** thay cho Lịch sử, `/journal`, boss log, Tổng kết tuần, Cân nặng, Biểu đồ của Bản đồ | Hiện có 4–6 nơi xem lại và 2 biểu đồ cân khác nhau. Gom về một chỗ giúp so sánh dễ | P1 |
| 5 | **Quy tắc chữ ngắn**: mỗi gợi ý tối đa 1 dòng (≤ 60 ký tự); phần giải thích chuyển vào nút ⓘ; mỗi dòng số chỉ hiện kcal và đạm, purine / muối / đường gom vào "Chi tiết ▸" | Có màn mở đầu bằng ≈90 từ hướng dẫn. Câu "purine · muối · đường" lặp ở ≥6 chỗ | P0 |
| 6 | **Hoàn tác thay cho nút trừ và hộp xác nhận**: toast "+250 ml · Hoàn tác" (5 giây). Mọi thao tác ghi đều undo được | Bỏ được 2 chip "−250 / −500" và các bước "Bạn chắc chứ?". Sửa nhầm chỉ cần 1 chạm | P0 |
| 7 | **Hình ảnh là nội dung chính**: ảnh món thật cho gợi ý, cook book, cheat day, ăn lại; boss vẽ to (170 pt) ở Hành trình; hình bài tập 52 pt; empty state có minh hoạ | Đây là app game hoá: hình gợi động lực và nhận ra nhanh hơn chữ. Ảnh món giúp chọn món nhanh hơn | P1 |
| 8 | **Tập: buổi hôm nay đã được chọn sẵn, 1 chạm "Bắt đầu"**. Ghi chạy / bơi / ảnh đồng hồ đưa thành nút "Tập khác" ngay trên màn, bỏ chữ "màn hình cũ" | App đã biết hôm nay là nhóm A, vậy không bắt người dùng tick lại từng bài. 4 chạm còn 2 | P1 |
| 9 | **Cheat day thành chế độ riêng**: 1 ô "Thèm gì?", vị trí tự lấy, kết quả là thẻ món có ảnh và thẻ quán (sao, km, giá, độ tin cậy, nút **Chỉ đường**) | Hiện phải qua Hồ sơ › Cook book › Gợi ý › bật công tắc › địa chỉ › AI › cuộn › Tìm quán: ≈8 chạm còn 3 | P1 |
| 10 | **Hồ sơ = danh tính + cài đặt dạng danh sách có giá trị ở bên phải**. Nước, giới hạn, 16:8, nhắc nhở, AI, Coach mỗi mục mở trang con. Bỏ các khối cài đặt mở sẵn | Trang Hồ sơ đang ≈8 màn. Dạng danh sách (kiểu Settings của iOS / Android) dễ quét và cho thấy giá trị hiện tại mà không cần mở | P1 |

---

## 2. Thay đổi chung (áp dụng mọi màn)

### 2.1 Điều hướng
- **Thanh tab giữ 5 ô**: Trại · Tập · (+) · **Hành trình** · Hồ sơ. Đổi tên "Bản đồ" thành "Hành trình" vì nội dung là boss chặng và tiến độ cân, không phải bản đồ địa lý.
- **Bỏ khai báo tab của** `weight`, `nutrition`, `history`, `plan`, `today-classic`, `workout-classic`. Chuyển các màn còn dùng sang stack (`app/…`) và xoá emoji `TabIcon` không dùng trong `(tabs)/_layout.tsx`.
- **Nhật ký** mở từ dòng "Dòng thời gian · Nhật ký ▸" ở Trại và từ ô "Nhật ký" ở Hồ sơ.
- **Một bộ chọn ngày**: chip "📅 Hôm nay ▾" ở đầu Trại và (+). Bấm vào mở sheet lịch 30 ngày. Ngày đã chọn áp dụng cho mọi màn ghi, kể cả cân nặng và tập. Bỏ `DateOffsetPicker` và dòng giải thích "Áp dụng cho…" (screens-current §4.6).
- **Hai hệ boss gọi rõ tên**: "Boss tuần" (thâm hụt, reset 05:00 thứ Hai) và "Boss chặng" (mỗi 5 kg). "Nhật ký trận" chỉ còn là tên tab Ngày của Nhật ký (§4.7).

### 2.2 Khuôn màn hình thống nhất (ScreenTemplate)
- Header cao 52 pt: nút back 44×44, tiêu đề 20 pt bold, tối đa 1 nút phải. Không có phụ đề dài; eyebrow 12 pt chỉ dùng khi cần ngữ cảnh (ngày, nhóm).
- **Nút chính dính đáy** cho mọi form ("Lưu bữa · 740 kcal"). Nút luôn ghi kết quả của hành động, không chỉ ghi "Lưu".
- Sheet thay cho màn đầy đủ với việc ngắn: Ghi nhanh, nước, cân, cảm giác, chọn ngày, bộ lọc.
- Khoảng cách theo lưới 4 pt: 16 lề, 12 giữa các thẻ, 8 trong thẻ.

### 2.3 Chữ: quy tắc rút gọn
1. Gợi ý (hint) tối đa 1 dòng, ≤ 60 ký tự. Phần dài hơn chuyển vào ⓘ (sheet "Vì sao?").
2. Không nhắc lại điều giao diện đã cho thấy. Ví dụ "Không bắt buộc" thì dùng nhãn "tuỳ chọn" xám.
3. Số liệu: mặc định chỉ hiện **kcal + đạm**. Purine / muối / đường hiện dưới dạng badge chỉ khi gần hoặc vượt ngưỡng, còn lại nằm trong "Chi tiết ▸".
4. Một khái niệm một từ: "Quay lại" dùng chung một key (đang có 5 key), "Thành tích" chỉ dùng cho sticker / banner, huy hiệu chuỗi gọi là "Mốc lửa trại".
5. Tên app thống nhất là **FitQuest**. Màn đăng nhập, `auth.title` và `RELEASE_NOTES.md` vẫn ghi "FitJourney" (§4.10).
6. Lỗi AI: 1 câu ngắn + 1 nút ("Thử lại" / "Tự nhập"), thay cho 7 biến thể dài.

### 2.4 Hình ảnh
- **Ảnh món thật** (hàm `dish-photo` + bảng `dish_photos`, đã có từ 0.20.0) cho: gợi ý bữa ở Trại, Ăn lại trong (+), Cook book (lưới 2 cột), Cheat day, thẻ món trong dòng thời gian. Khi chưa có ảnh: nền màu theo loại món + emoji lớn, không để ô xám.
- **Boss**: `StageBossArt` vẽ to ở đầu Hành trình (≥160 pt) và trong trang chi tiết boss. Avatar 40 pt ở danh sách. Boss "buồn" khi bị đánh mạnh (đã có trong mockup Nhật ký).
- **Bài tập**: `ExerciseFigure` 44–52 pt trong ô nền `raised2`, và 100 pt ở thẻ buổi hôm nay.
- **Empty state có minh hoạ** (lửa trại ngủ, boss ngáp, cook book trống) + 1 câu + 1 nút. Thay cho "Chưa có dữ liệu".
- Icon: chỉ dùng `QuestIcon` (nét 2.2) cho nút và điều hướng. Emoji chỉ dùng trong nội dung (tâm trạng, 🎉 cheat). Bỏ emoji trong nhãn nút như "🔎 Tìm quán", "📍 Vị trí của tôi".

### 2.5 Chuẩn tiếp cận (accessibility)
- Vùng chạm ≥ 44×44 pt. Hiện chưa đạt: checkbox bài tập 24 pt, chip lọc 28 pt, nút ⓘ 36 pt, mũi tên tuần 28 pt, chip `s` 36 pt.
- Chữ tối thiểu 12 pt. Hiện có 10–11 pt ở dải tuần và chú thích. Ngoại lệ 10 pt chỉ cho nhãn dưới icon và phải có `accessibilityLabel` đầy đủ.
- Tương phản (tính theo WCAG từ mã màu): `text` / `panel` 15.5:1, `textSecondary` / `panel` 7.9:1 (trên `raised` 7.2:1), `gold` / `bg` 12.3:1, `hpText` / `bossPanel` 7.4:1, `manaText` / `manaPanel` 10:1. Tất cả đều đạt AA, phần lớn đạt AAA, nên **bảng màu giữ nguyên**. `hp` / `panel` 5.5:1 vẫn đạt AA, nhưng nên dùng `hpText` cho chữ ≤ 12 pt. Chữ trên nền vàng luôn là `onGold` (12.3:1). Không bao giờ giảm `opacity` của chữ phụ xuống dưới 0.7 (ô bị khoá hiện dùng 0.55).
- Không truyền đạt chỉ bằng màu: mức thâm hụt có thêm chữ "Đạt / Tạm / Dư" (badge).
- Tôn trọng "Giảm chuyển động": tắt `FadeInUp`, `PulseRing`, `HitShake` khi hệ thống bật Reduce Motion.

### 2.6 Chuyển động
- Chỉ phần tử 1–5 có `FadeInUp` (nhanh, 180 ms). Danh sách dài hiện ngay.
- Phản hồi khi ghi: vòng kcal chạy tới giá trị mới, boss rung nhẹ khi trúng đòn, ly nước dâng. Không dùng confetti cho thao tác thường; để dành cho lên cấp và hạ boss.

### 2.7 AI tắt
Khi "Dùng AI" tắt: ẩn nút AI, hiện "Tự nhập", thay vì để người dùng bấm rồi mới báo lỗi (§4.14).

---

## 3. Từng màn

Chú thích: **P0** = làm trước (gỡ điểm nghẽn hằng ngày), **P1** = nên làm, **P2** = để sau. Effort **S** < ½ ngày agent, **M** ≈ 1 phiên, **L** = nhiều phiên.

### 3.1 Trại (`app/(tabs)/index.tsx`, `JournalView` embedded, `MealSuggestionsCard`, `BossCard`, `PlayerHeader`) — ảnh 01
**Vấn đề**
1. Kcal còn lại, thâm hụt và boss nằm ở 3 khối khác nhau (BossCard, thẻ Gợi ý bữa, 4 ô số của Nhật ký trận).
2. Thẻ Gợi ý bữa có 6+ dòng số lặp lại (purine / muối / đường cho từng bữa) và 3 đoạn giải thích.
3. Nút "Nghỉ ở lửa trại" trùng ô "Cảm giác" trong (+).
4. Trang dài ≈5 màn: dải tuần, 4 ô số, chú thích màu dài (`deficit.legend`), thanh nước, dòng thời gian, nhiệm vụ gập ở cuối.

**Đề xuất**
- Header 1 dòng: khiên + "Cấp 7 · XP", chip 🔥 chuỗi, chip ngày.
- **Thẻ Hôm nay**: vòng "còn ăn 620 / 1,600 kcal"; bên phải Đã ăn / Tập / Thâm hụt (badge mức) / Đạm; dưới là thanh boss tuần (−640 HP hôm nay ›).
- **3 ô 1 chạm**: Chụp món (vàng) · +250 ml (mana, kèm 1.2/2.5 L) · Tập 18′ (mở thẳng buổi tập).
- **Nhiệm vụ**: 7 vòng nhỏ có icon / số. Chạm vào mở sheet chi tiết (giữ nội dung `describeMission`).
- **Bữa kế tiếp**: 1 món có ảnh + "Ghi món này" / "Món khác" (mở Cook book đã lọc theo bữa). Các nút "Nhờ AI", "cookbook chung", ô tìm kiếm chuyển vào Cook book.
- **Dòng thời gian hôm nay** có ảnh nhỏ. Dải tuần và cheat-day chuyển sang Nhật ký (Tuần); chip ngày ở header thay vai trò chọn ngày làm việc.
- Thứ Hai (và khi boss tuần vừa reset): thẻ "Tổng kết tuần (AI)" hiện 1 lần ở Trại.

**Lý do**: trả lời 3 câu hỏi hằng ngày ngay màn đầu: còn ăn bao nhiêu, đã uống đủ chưa, ăn gì tiếp. Nhiệm vụ đọc lướt bằng icon thay vì danh sách gập.
**Số chạm**: xem thâm hụt hôm nay: 0 + cuộn ≈1,5 màn → **0, không cuộn**. Ghi bữa theo gợi ý: (+) → Bữa ăn → Đã ăn = 3 → **1**. Check-in: 1 → 2 (qua +). Chấp nhận vì check-in là việc 1 lần/ngày.
**Ưu tiên** P0 · **Effort** L

### 3.2 Ghi nhanh (+) (`app/quick-add.tsx`, `LogDayPicker`) — ảnh 02
**Vấn đề**: (1) dòng giải thích dưới bộ chọn ngày; (2) "Bữa ăn" và "Ngoài kế hoạch" là 2 cửa cho cùng việc ghi món, còn ảnh thì nằm sâu bên trong; (3) 5 chip nước (3 cộng, 2 trừ); (4) khối cân nặng chiếm ⅓ sheet.
**Đề xuất**: sheet cao vừa nội dung. Nút chính **Chụp món ăn** (camera mở ngay; trên web là `<input capture>`). Hai nút phụ "Nói / gõ món" (micro) và "Món đã lưu" (CSDL + cook book). Hàng **Ăn lại**: 3–6 món gần đây có ảnh, 1 chạm là ghi luôn, có hoàn tác. Hàng nước: tiến độ + 2 chip (+250 / +500), nhấn giữ để nhập số khác. Hàng chip nhỏ: ⚖ 79.4 kg (mở sheet stepper) · Cảm giác · Tập khác. Toast "Hoàn tác" thay cho chip trừ.
**Lý do**: ảnh là cách nhập nhanh và chính xác nhất (AI đã sẵn); món lặp lại chiếm phần lớn bữa thật; cân nặng ghi 1 lần/ngày nên không cần chiếm chỗ cố định.
**Số chạm**: ghi món có ảnh (tính cả chụp): 8 + cuộn → **3–4**. Ăn lại món cũ: ≈6 (gõ tên, tra CSDL, lưu) → **2**. Nước: 3 → **2** (hoặc **1** từ Trại). Sửa nhầm nước: 3 → **1** (Hoàn tác).
**Ưu tiên** P0 · **Effort** M

### 3.3 Ghi bữa (gộp `add-food`, `text-meal`, `meal/[slot]`, form món trong `nutrition`) — ảnh 03
**Vấn đề**: (1) 4 đoạn hướng dẫn (≈90 từ) trước khi làm được gì; (2) 4 đường cho cùng một việc (Hỏi AI, Đọc nhãn, tra CSDL, tự nhập) đặt cạnh nhau; (3) mỗi món luôn hiện 6 ô số; chọn bữa, giờ, đồ ăn vặt và nút lưu nằm cuối trang (≈4 màn).
**Đề xuất – 2 bước**
1. *Nhập*: ảnh (tối đa 4), câu mô tả hoặc micro. **Một nút "Phân tích"**: AI tự nhận ra đó là món ăn hay nhãn dinh dưỡng (gộp `analyze-proof-photo` / `read-nutrition-label` phía client, hoặc thêm trường `kind` khi gọi). Món đã có trong CSDL thì điền luôn, không gọi AI.
2. *Kiểm tra* (mockup): ảnh lớn ở đầu kèm badge "AI nhận ra 3 món · ~85%"; chip Bữa / Giờ / Ngày tự điền theo giờ hiện tại; mỗi món 1 dòng có ảnh, kcal · đạm và **stepper khẩu phần** (bát / cái / g). Purine / muối / đường nằm trong "Chi tiết ▸". Thẻ tác động 1 câu ("vượt 120 kcal · boss còn trúng −520"). Badge cảnh báo chỉ hiện khi gần hoặc vượt ngưỡng. Nút dính đáy **"Lưu bữa · 740 kcal"**. Nút ✎ mở chế độ sửa từng số.
- Bữa theo kế hoạch (`meal/[slot]`) dùng chung bước 2, với danh sách món điền sẵn từ kế hoạch và nút "Đã ăn đúng kế hoạch".
- "Đồ ăn vặt" do AI gợi ý tự bật, người dùng sửa được trong Chi tiết. "Không ăn bữa này" thành nút phụ trong sheet bữa.

**Lý do**: luồng 2 bước tuyến tính, các thao tác phụ ẩn đi, số liệu tự tính lại khi đổi khẩu phần (logic `food.qtyHint` đã có).
**Số chạm**: xem 3.2. Sửa khẩu phần 1 món: gõ lại số → **1 chạm stepper**.
**Ưu tiên** P0 · **Effort** L

### 3.4 Hành trình (`app/(tabs)/map.tsx`, `StageBossArt`, `TrailMap`, `BossDamageLog`, `BattleBanter`, `app/boss.tsx`) — ảnh 04
**Vấn đề**: (1) chế độ Bản đồ / Biểu đồ, trong đó biểu đồ cân là bản thứ hai khác với màn Cân nặng; (2) hai hệ boss mà tên gọi gần như trùng nhau; (3) trang ≈6 màn, ảnh boss chỉ 64 pt.
**Đề xuất**: hero boss chặng 170 pt trên nền gradient `bossPanel` + thanh HP (kg) + "còn 1.6 kg nữa để hạ". 3 badge thống kê. Con đường dọc: các boss là nút tròn (đã hạ ✓, đang đánh có viền vàng, khoá 🔒) theo vùng. 1 câu khẩu chiến gần nhất. Nhật ký sát thương, hội thoại đầy đủ, kỹ năng boss đưa vào **trang chi tiết boss** (chạm vào nút). Chip "Cân nặng" mở Nhật ký › Tháng (biểu đồ cân duy nhất). Boss tuần: chỉ ở Trại và Nhật ký › Tuần.
**Lý do**: đây là phần "game" hấp dẫn nhất nên nên to, rõ và ít chữ. Gộp biểu đồ giúp bớt 1 thư viện chart.
**Số chạm**: xem boss đang đánh: 0 (giữ nguyên). Xem hội thoại hôm qua: cuộn ≈4 màn → **0** (hiện sẵn 1 câu) / **1** (đầy đủ).
**Ưu tiên** P1 · **Effort** M

### 3.5 Tập (`app/(tabs)/workout.tsx`, `train/detail`, `train/session`, `workout-classic`) — ảnh 05
**Vấn đề**: (1) chọn nhóm → tick từng bài → Bắt đầu: tối thiểu 4 chạm dù đã có gợi ý; (2) checkbox 24 pt, nút ⓘ 36 pt; (3) ghi chạy / bơi / ảnh đồng hồ / AI ước tính kcal chỉ có ở "màn hình cũ".
**Đề xuất**: thẻ **buổi hôm nay** (nhóm gợi ý, phút, kcal, hình lớn) với nút **"Bắt đầu · giọng HLV"**. Đổi nhóm bằng 3 chip A / B / C 44 pt. Danh sách bài đã tick sẵn (ô tick 32 pt trong vùng chạm 44); chạm vào dòng để mở cách tập. Nút "+ Chạy, bơi, ảnh đồng hồ" mở sheet **Tập khác** (chuyển `WorkoutEntryForm` + `ProofCapture` + `wkai` từ `workout-classic` vào đây). Màn session giữ nguyên (đã tốt), chỉ tăng cỡ nút "Xong set" lên ≥ 64 pt.
**Số chạm**: bắt đầu buổi gợi ý: 4 → **2** (Tập → Bắt đầu) hoặc **1** từ ô "Tập 18′" ở Trại. Ghi buổi chạy: Tập → cuộn → link cũ → form = 4+ → **3**.
**Ưu tiên** P1 · **Effort** M

### 3.6 Cook book (`app/cookbook.tsx`, `CookbookFinder`, `DishCard`, `RecipeDialog`) — ảnh 06
**Vấn đề**: (1) tab mặc định là bộ lọc chứ không phải danh sách món; (2) 24 chip lọc luôn mở, mỗi chip cao 28 pt; (3) Cheat day là một công tắc lẫn trong bộ lọc; nút "Gợi ý" và tìm quán ở cuối trang; danh sách món không có ảnh.
**Đề xuất**: ô tìm kiếm + nút lọc (badge số bộ lọc đang bật, mở sheet chứa 4 nhóm chip 44 pt). Segment "Món của tôi · 12 | 🎉 Cheat day · 3". Hàng chip nhanh (Vừa bữa trưa, Ít purine, ≤ 20′, ★). **Lưới 2 cột thẻ ảnh** (tên, kcal · đạm, badge Vừa / +20 / Purine cao). Nút dính đáy "✨ Gợi ý món mới cho bữa trưa" (AI, gồm cả cookbook chung). Sửa gợi ý sai ở Hồ sơ (§4.9).
**Số chạm**: tìm món hợp bữa tới: Hồ sơ → Cook book → Của tôi → bật "Vừa bữa tới" = 4 → **2** (Trại "Món khác" mở sẵn bộ lọc).
**Ưu tiên** P1 · **Effort** M

### 3.7 Cheat day & tìm quán (`CookbookFinder` phần cheat, `CheatPlacesList`) — ảnh 06b
**Đề xuất**: màn riêng. 1 ô "thèm gì?" (gõ hoặc nói) + nút tìm; chip vị trí tự lấy (sửa được) + Ăn ngoài / Tự nấu. Dòng "AI hiểu là…". Băng chuyền món có ảnh; chọn món nào thì danh sách quán ở dưới đổi theo. **Thẻ quán**: tên, badge độ tin cậy (1 badge thay cho 5 dòng), ★ (số đánh giá) · km · giá · đang mở, 1 câu review, nút **Chỉ đường** (Google Maps) + ⓘ (nguồn, ngày kiểm tra, cảnh báo quảng cáo). Các dòng "AI đã tìm web n lần" và mã lỗi chuyển vào ⓘ.
**Số chạm**: ≈8 → **3** (🎉 → gõ → tìm). Mở chỉ đường: 2 → **1**.
**Ưu tiên** P1 · **Effort** M

### 3.8 Nhật ký (gộp `HistoryView`, `JournalView`, `/journal`, `weight`, `boss` log, `weekly-report`, `insights`) — ảnh 07
**Vấn đề**: (1) 4–6 nơi xem lại số liệu; (2) chữ "Thành tích" mang 2 nghĩa; (3) ≈11 mục xếp dọc (≈7 màn), nhiều mục rỗng.
**Đề xuất**: segment **Ngày | Tuần | Tháng**.
- *Ngày* = dòng thời gian hiện tại (ảnh, sửa món, đánh dấu cheat day) + 4 số trong ngày.
- *Tuần* (mockup) = dải 7 ngày (ô 44×76 pt, có số thâm hụt và màu) + thẻ boss tuần + biểu đồ cột thâm hụt có vạch mục tiêu + 3 thẻ nhỏ (cân, nước, tâm trạng) + thẻ "Tổng kết tuần (AI)".
- *Tháng* = lịch nhiệt (heatmap) + **biểu đồ cân duy nhất** (có đường dự đoán) + mốc lửa trại + phản hồi Coach.
- Mục rỗng thì ẩn, không hiện "chưa có dữ liệu".

**Số chạm**: xem tuần này: Hồ sơ → Lịch sử → cuộn = 2 + cuộn → **2**, không cuộn. Ghi cân ngày cũ: Hồ sơ → Cân nặng → chọn ngày → nhập → Lưu = 5 → **4** (+ → chip ngày → cân → Lưu).
**Ưu tiên** P1 · **Effort** L

### 3.9 Hồ sơ (`app/(tabs)/profile.tsx`, `plan.tsx`, `WaterSettings`, `TemptationSettings`, …) — ảnh 08
**Vấn đề**: (1) Cân nặng / Dinh dưỡng / Lịch sử / Kế hoạch là "tab ẩn" chỉ vào được từ đây; Kế hoạch lặp lại Ngôn ngữ, Nhắc nhở, Coach, Đăng xuất (§4.3); (2) gợi ý Cook book sai; (3) 5 khối cài đặt mở sẵn với đoạn giải thích dài, tổng ≈8 màn.
**Đề xuất**: thẻ danh tính (khiên có số cấp, tên, danh hiệu, chuỗi, XP). 3 ô thống kê. 3 ô lối tắt có icon (Nhật ký, Thành tích, Cook book). Danh sách **Cài đặt** 6 dòng, mỗi dòng có icon màu, tên và **giá trị hiện tại** ở bên phải, mở trang con: Mục tiêu & kế hoạch · Nước uống · Giới hạn & 16:8 · Nhắc nhở & cám dỗ · AI · Coach & tài khoản (ngôn ngữ, nhập nhật ký, AI admin, đăng xuất, phiên bản). `plan.tsx` chỉ còn mục tiêu, thể trạng, ngày bắt đầu và trợ lý AI.
**Số chạm**: đổi mục tiêu nước: Hồ sơ → cuộn ≈2 màn → ± = 2 + cuộn → **3**, không cuộn.
**Ưu tiên** P1 · **Effort** M

### 3.10 Pop-up nước (`WaterReminderDialog`) — ảnh 09
**Vấn đề**: (1) 4 câu số mâu thuẫn nhau (uống 500 / thiếu 250 / bù 750 / 15:00…); (2) lịch 8 dòng chiếm nửa pop-up; (3) nút chính "Đã uống đủ 1,750 ml" khác con số "Uống 500 ml" ở trên và không chọn được lượng thật.
**Đề xuất**: bottom sheet màu mana: ly nước dâng theo tiến độ, **"Uống 500 ml"**, 1 dòng "1.0 / 2.5 L · đang chậm 250 ml". Lịch thu gọn thành 8 chấm có giờ (✓ / lỡ / bây giờ). Nút chính "Đã uống 500 ml"; chip 250 / 750; "Nhắc sau 30′". Câu cổ vũ: 1 câu ngắn, xoay vòng, đặt trong toast sau khi ghi.
**Số chạm**: giữ 1 chạm, nhưng lượng ghi đúng với lượng thật.
**Ưu tiên** P0 · **Effort** S

### 3.11 Các màn khác (ngắn)
| Màn | Đề xuất | Lý do | Ưu tiên / Effort |
|---|---|---|---|
| Check-in (`checkin.tsx`) | Sheet 1 màn: 5 mặt tâm trạng 56 pt, thèm / đói dạng thanh trượt 5 nấc, tình trạng tập dạng chip, ghi chú tuỳ chọn. Bỏ khối "Nhiệm vụ / Boss hôm nay" lặp từ Trại | Lặp số liệu, form dài | P1 / S |
| Lên cấp, Thành tích | Giữ. Thêm ảnh banner lớn khi trang bị; "Thành tích" chỉ dùng cho sticker / banner | Nhất quán tên gọi | P2 / S |
| Thói quen, Axit uric, Kiến thức, Phân tích, CSDL món | Áp dụng ScreenTemplate, chữ ngắn, empty state minh hoạ; đặt lối vào trong Hồ sơ › Mục tiêu (uric) / Cook book (CSDL) / Nhật ký (Phân tích) | Hiện mỗi màn một kiểu | P2 / M |
| Onboarding, Đăng nhập, Chọn vai trò | Đổi "FitJourney" thành FitQuest; onboarding 3 bước có minh hoạ boss; `Alert` liên kết coach đưa sang i18n | Ấn tượng đầu tiên, §4.10–4.11 | P2 / M |
| Coach (`clients`, `client/[id]`, `coach-account`) | Danh sách học viên có avatar + badge trạng thái (Tốt / Chậm / Cần nhắc) + ảnh bữa gần nhất; chi tiết học viên dùng lại Nhật ký (Ngày / Tuần) chế độ chỉ đọc | Tái dùng màn Nhật ký mới, bớt code riêng | P2 / M |
| Thử thách cám dỗ (`TemptationDialog`) | Giữ dạng chat; ảnh món to; 2 nút 56 pt; câu phản ứng ngắn | Đã khá tốt | P2 / S |

---

## 4. Những gì xoá hoặc gộp

| Hiện có | Xử lý |
|---|---|
| `app/(tabs)/today-classic.tsx`, theme sáng `tokens.ts` / `Card` / `Badge` dùng riêng cho nó | **Xoá** |
| `app/(tabs)/workout-classic.tsx` | **Gộp** vào sheet "Tập khác" của Tập |
| `app/text-meal.tsx`, form "Thêm món ăn ngoài kế hoạch" trong `nutrition.tsx` | **Gộp** vào luồng Ghi bữa |
| `app/meal/[slot].tsx` | **Gộp**: bước Kiểm tra của Ghi bữa, điền sẵn theo kế hoạch |
| `app/(tabs)/nutrition.tsx` (nước, TDEE, bảng bữa) | **Gộp**: nước ở Trại / (+) / pop-up; TDEE ở Mục tiêu; bảng bữa ở Nhật ký › Ngày |
| `app/(tabs)/weight.tsx`, `WeightChart` ở Bản đồ › Biểu đồ | **Gộp**: một biểu đồ ở Nhật ký › Tháng; ghi cân qua (+) |
| `app/(tabs)/history.tsx`, `app/journal.tsx`, log trong `app/boss.tsx`, `weekly-report.tsx`, `insights.tsx` | **Gộp** vào Nhật ký (Ngày / Tuần / Tháng); `boss.tsx` chỉ còn là trang chi tiết boss |
| Ngôn ngữ / Nhắc nhở / Coach / Đăng xuất trong `plan.tsx` | **Xoá** bản trùng, giữ ở Hồ sơ › Coach & tài khoản |
| Chip nước −250 / −500, hộp xác nhận xoá | **Thay** bằng Hoàn tác |
| `DateOffsetPicker` | **Thay** bằng chip ngày + sheet lịch |
| Đoạn chữ: `food.subtitle`, `food.aiHint`, `food.db.hint`, `photo.more.hint`, `text.photos.hint`, `meals.replacedNote`, `deficit.legend`, `water.setting.hint`, `limits.hint`, `profile.aiEnabledHint`, `banter.hint`, `banter.quotaNote`, `cheat.wishHint`… | **Rút** ≤ 60 ký tự hoặc chuyển vào ⓘ |
| Các component sáng ở chế độ `dark` (`ProgressBar`, `TdeeCard`, `WaterTimeline`, `DailyMealBreakdownTable`, `ProofCapture`, `MealRecipeSuggestion`, `PlanChatAssistant`) | **Đổi** sang bản `quest/` khi màn chứa nó được làm lại |

---

## 5. Kế hoạch triển khai và ước tính token

### 5.1 Giai đoạn
| GĐ | Nội dung | File chạm (ước tính) | Lượt tool (agent) | Token xử lý¹ | Token output² |
|---|---|---|---|---|---|
| 0 | Nền tảng: `ScreenTemplate`, `BottomSheet`, `Toast` + Hoàn tác, `Stepper`, `DishThumb`, chip ngày; dọn điều hướng (bỏ tab ẩn, xoá `today-classic`); lượt rút gọn chữ trong `strings.ts` vi + en | ~20 | 60–90 | 4.2–9.9 M | 60–120 k |
| 1 | Trại + Ghi nhanh + pop-up nước | ~12 | 50–80 | 3.5–8.8 M | 50–100 k |
| 2 | Luồng Ghi bữa hợp nhất (add-food, text-meal, meal/[slot], form Dinh dưỡng, Ăn lại / món gần đây, một nút Phân tích) | ~14 | 70–110 | 5.6–12.1 M | 80–150 k |
| 3 | Tập (thẻ hôm nay, sheet Tập khác) + Hành trình / trang chi tiết boss | ~12 | 50–80 | 3.5–8.8 M | 50–100 k |
| 4 | Cook book (lưới ảnh, sheet lọc) + màn Cheat day | ~8 | 40–60 | 2.8–6.6 M | 40–80 k |
| 5 | Nhật ký Ngày / Tuần / Tháng (gộp History, Journal, Cân nặng, boss log, Tổng kết tuần, Phân tích) | ~14 | 70–110 | 5.6–12.1 M | 80–150 k |
| 6 | Hồ sơ + 6 trang cài đặt con + dọn `plan.tsx` | ~12 | 50–80 | 3.5–8.8 M | 50–100 k |
| 7 | Kiểm thử: cập nhật test, `tsc`, build web, chụp màn so với mockup, release notes, chuỗi en | — | 40–70 | 2.8–7.7 M | 30–60 k |
| | **Tổng** | **~90 lượt sửa file** | **430–680** | **≈ 31–75 triệu** | **≈ 0.44–0.86 triệu** |

¹ **Token xử lý** = số lượt tool × ngữ cảnh trung bình mỗi lượt (≈70–110 k: hệ thống + lịch sử + file đang đọc). Agent gửi lại toàn bộ ngữ cảnh ở mỗi lượt, nên con số này lớn hơn nhiều so với độ dài code; khoảng 85–90 % là cache read.
² **Token output** = code mới / sửa (≈3–8 k mỗi file lớn) + suy nghĩ + báo cáo.
Cơ sở: mỗi file cần đọc ≈5–15 k token (file 200–950 dòng cùng các file phụ thuộc), sửa ≈3–8 k token, chạy test / tsc ≈5–10 k token; cộng 15–25 lượt cố định mỗi giai đoạn (khảo sát, chạy test, build, commit). Khoảng biên trên đã tính 20–30 % sửa lại sau khi bạn xem.

### 5.2 Chi phí tham khảo (giá API Anthropic hiện hành, USD / 1 triệu token)
- **Claude Opus 5.5**: input $4 · cache read $0.20 · cache write ≈$5 · output $20.
  Giả định 85 % cache read, 10 % cache write, 5 % input mới → ≈ $0.87 / 1 triệu token xử lý.
  → Input ≈ $27–65 + output ≈ $9–17 = **≈ $36–82**. Cộng ≈20 % chi phí phát sinh khi chạy 2 agent song song (giới hạn tối đa 2 agent): **≈ $45–100 cho toàn bộ**.
- **Claude Sonnet 5.5** (input $2, cache read $0.20, output $10): ≈ **$20–48**, nhưng cần duyệt kỹ hơn ở các GĐ 2 và 5.
- Nếu bạn dùng gói Claude Code (thuê bao) thay vì API, con số trên quy đổi thành hạn mức sử dụng: dự kiến **8–14 phiên agent dài**.

### 5.3 Thứ tự đề xuất
GĐ 0 → 1 → 2 (giá trị lớn nhất cho việc dùng hằng ngày, ≈ 40 % tổng token) → 7 (kiểm thử một lượt, phát hành bản B mới, ví dụ 0.22.0) → GĐ 3–6 theo thứ tự bạn chọn, mỗi giai đoạn là một bản phát hành riêng.
Không cần thay đổi `schema.sql`. Phía server chỉ cần đổi nếu muốn **một nút Phân tích** gọi chung (tuỳ chọn: thêm `kind: "auto"` vào `analyze-proof-photo`, redeploy 1 hàm).

---

## 6. Đã chốt (2026-11-02)
Câu 3, 4 bạn trả lời (qua `dialogs.md` Q1, Q2); câu 1, 2, 5 là đề xuất của Claude, có thể đổi lại.
1. *(đề xuất)* Đổi tên tab "Bản đồ" thành **"Hành trình"**: nói đúng nội dung (cân nặng theo thời gian, mốc, boss), "Bản đồ" dễ hiểu nhầm là bản đồ địa lý.
2. *(đề xuất)* Ô "Tập 18′" ở Trại **mở thẳng buổi tập** (1 chạm); mũi tên › nhỏ bên phải mở màn Tập để chọn bài khác.
3. "Ăn lại" 1 chạm **ghi luôn** + Hoàn tác, nhấn giữ mở menu.
4. Check-in trong (+) **và có lối tắt buổi tối** trên Trại (sau 19:00, khi chưa check-in).
5. *(đề xuất)* **Làm theo thứ tự GĐ 0 → 1 → 2**, mỗi giai đoạn là một bản phát hành riêng để dễ kiểm tra và quay lại.

---

### Nguồn ảnh (Wikimedia Commons, dùng trong mockup)
- `pho.jpg`: "Pho-Beef-Noodles-2008.jpg" — Kham Tran, CC BY-SA 3.0
- `banhmi.jpg`: "Bánh mì thịt nguội.jpg" — Minh Nguyen, CC BY-SA 4.0
- `buncha.jpg`: "Bun cha Hanoi.jpg" — Weetjesman, CC BY-SA 4.0
- `comtam.jpg`: "Com-Tam-2008.jpg" — Kham Tran, CC BY-SA 3.0
- `bunbo.jpg`: "Bun-Bo-Hue-from-Huong-Giang-2011.jpg" — Kham Tran, CC BY 3.0
- `trasua.jpg`: "Pearl Milk Tea in Chun Shui Tang.jpg" — Battlesnake1, CC0
- `goicuon.jpg`: "Vietnamese spring rolls.jpg" (chả giò) — Wikimedia Commons, xem trang file để biết tác giả và giấy phép
- `salad.jpg`: "Salad platter.jpg" — Wikimedia Commons, xem trang file để biết tác giả và giấy phép

Boss, hình bài tập và icon là SVG vẽ riêng cho mockup (`html/kit.js`), mô phỏng `StageBossArt`, `ExerciseFigure` và `QuestIcon`.
