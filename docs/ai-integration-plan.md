# Kế hoạch tích hợp AI (Claude) cho FitJourney

Cập nhật: 2026-10-26. Trạng thái từng mục ở cuối file.

## Quyết định đã chốt
- **Model:** dùng **Sonnet** cho mọi tính năng (`claude-sonnet-5-5`), đặt qua biến môi trường `AI_MODEL` của Supabase. Sau khi có dữ liệu, thử Haiku cho từng tính năng bằng bộ ca mẫu rồi mới đổi.
- **Báo cáo tuần:** chạy khi người dùng bấm nút, kết quả được lưu và mở lại không tốn thêm lượt gọi. Tự động hóa để sau.
- **Công tắc AI:** mỗi thiết bị có công tắc bật/tắt AI trong Hồ sơ (mặc định bật). Tắt thì không gửi gì lên server.
- **Push từ server:** không làm. Chỉ có thẻ gợi ý trong app.

## Nguyên tắc thiết kế prompt (ba lớp)
1. **Chặn ở đầu ra:** AI trả qua tool schema (trường bắt buộc, enum), server và app kiểm tra lại khoảng hợp lý của từng số.
2. **Tính trong code, AI chỉ diễn giải:** thâm hụt, boss, ngày lệch, kcal còn lại, khẩu phần theo nhãn đều do code tính; AI nhận số đã tính và viết nhận xét.
3. **Prompt:** vai trò và giọng văn cố định, dữ liệu người dùng đặt trong thẻ và coi là dữ liệu, ví dụ ngắn khi cần, rào y tế ("gợi ý lối sống, không thay thế bác sĩ").

`% độ chính xác` do AI tự chấm nên chưa hiệu chỉnh. App lưu cặp (số AI, số người dùng sửa cuối cùng) trên máy và hiện "sai số thường ±X%" khi đã đủ dữ liệu.

## Kiến trúc
```
App ──JWT──▶ Edge Function (mỗi tính năng một hàm mỏng)
              └─ _shared: sanitize → quota → (cache) → gọi Anthropic → validate → ghi usage
Bảng: ai_usage (số lượt, token, chi phí ước tính theo người/ngày/tính năng; chỉ server ghi)
      ai_reports (báo cáo tuần đã tạo; chỉ server ghi, người dùng đọc phần của mình)
Môi trường: AI_MODEL, AI_DISABLED (công tắc tắt khẩn cấp), AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK
```
- App chỉ gửi số và ngày, không gửi tên, email hay id.
- Quota mỗi người mỗi ngày (mặc định): ảnh 15, nhập chữ 30, đọc nhãn 15, gợi ý món 10, báo cáo tuần 3.
- AI lỗi, hết quota hoặc bị tắt thì nhập tay luôn dùng được.

## Tính năng
| # | Tính năng | Cách làm | Gọi khi |
|---|---|---|---|
| 1 | Nền móng | `_shared` (gọi Claude, xác thực, quota, usage), bảng `ai_usage`/`ai_reports`, công tắc AI, thông báo hết lượt | — |
| 2 | Đọc nhãn dinh dưỡng | Ảnh mặt sau gói → AI chỉ đọc số trên nhãn (theo 100 g hoặc theo phần); code nhân theo lượng ăn | Theo yêu cầu |
| 3 | Tổng kết tuần và boss | Code tính ngày lệch, mission hỏng, giờ ăn cuối, nước, cân nặng so với thâm hụt; AI viết nguyên nhân, thói quen, kế hoạch tuần sau; lưu `ai_reports` | Bấm nút |
| 4 | Thay món khi vượt giới hạn | Chọn từ Food database trước; AI chỉ khi thiếu ứng viên | Khi vượt giới hạn |
| 5 | Tóm tắt cho coach | Code xếp hạng học viên; AI viết 2-3 câu mỗi người; chạy theo lô | Hằng tuần |
| 6 | Nhắc đúng lúc | Phép tính kcal/đạm còn lại trong code; thẻ gợi ý bữa tối trong app (không làm push từ server) | Khi mở app, 15h-20h |

Đã làm trước đó: phân tích ảnh có `%` chính xác và gợi ý cho phần còn lại của ngày, nhập món bằng chữ, gợi ý món theo khẩu vị kèm dụng cụ.

## Chi phí ước tính (giả định giá Sonnet $3 vào / $15 ra mỗi triệu token; cần kiểm tra giá chính thức)
| Lời gọi | Chi phí |
|---|---|
| Ảnh món ăn | ~$0,020 |
| Nhập chữ | ~$0,013 |
| Đọc nhãn | ~$0,010 |
| Gợi ý món | ~$0,012 |
| Báo cáo tuần | ~$0,027 / người / tuần |
| Chat sửa plan (mỗi lượt) | ~$0,075 |

Người dùng hoạt động (3 ảnh, 2 nhập chữ, 1 gợi ý món mỗi ngày): ~$0,11/ngày, ~$3,3/tháng. Ngân sách $20/ngày đủ cho khoảng 180 người hoạt động mỗi ngày.

## Theo dõi chi phí (đã làm)
- **Ghi nhận:** mỗi lời gọi thành công cộng vào `ai_usage` (người dùng, ngày giờ Việt Nam, tính năng): số lượt, token vào/ra, chi phí ước tính, model gần nhất. Chỉ Edge Function ghi (service role).
- **Giới hạn:** quota lượt mỗi tính năng/ngày; trần chi phí mỗi người mỗi ngày (`AI_USER_DAILY_BUDGET_USD`, mặc định $0,60, `0` = tắt); trần toàn hệ thống mỗi ngày (`AI_DAILY_BUDGET_USD`, mặc định không giới hạn); công tắc tắt khẩn cấp `AI_DISABLED=1`.
- **Màn "AI & chi phí"** (Hồ sơ): chỉ hiện cho tài khoản nằm trong bảng `ai_admins` (hiện chỉ một tài khoản; thêm/gỡ bằng SQL, không ghi email vào repo). Hiển thị lượt dùng hôm nay của chính tài khoản, tổng toàn ứng dụng theo ngày (14 ngày) và chi tiết từng người của ngày được chọn. Quyền được kiểm tra ở server (hàm `is_ai_admin`, các hàm `ai_admin_by_day` / `ai_admin_by_user`), app chỉ ẩn/hiện lối vào.
- **Truy vấn cho chủ ứng dụng:** `supabase/queries/ai-cost.sql` (theo ngày, theo người, theo tính năng, theo tháng, người chạm hạn mức).
- **Phân quyền sau:** thay `ai_admins` bằng vai trò thật khi có hệ thống phân quyền; app chỉ gọi `is_ai_admin()`.

## AI cho Coach đang tắt
Tạm thời tắt hai phần AI dành cho coach: thẻ tóm tắt tuần của học viên (tab Học viên) và trợ lý AI chỉnh kế hoạch cho học viên (trang học viên). Hai lớp công tắc:
- **App:** `aiFlags.aiForCoach` trong `src/ai/featureFlags.ts` (đang `false`).
- **Server:** biến `AI_COACH_ENABLED=1` cho hàm `coach-digest` và cho `suggest-plan-update` khi sửa kế hoạch của người khác (đặt bằng `npx supabase secrets set AI_COACH_ENABLED=1`).
Bật lại cần cả hai. AI của học viên (ảnh, nhập chữ, đọc nhãn, tổng kết tuần, thay món, gợi ý bữa tối, trợ lý chỉnh kế hoạch của chính mình) không bị ảnh hưởng.

## Trạng thái
- [x] Ảnh + `%` + gợi ý cuối ngày
- [x] Nhập món bằng chữ
- [x] Gợi ý món theo khẩu vị
- [x] 1 Nền móng (hàm dùng chung `_shared/ai.ts`, quota, usage, công tắc AI, `%` hiệu chỉnh trên máy)
- [x] Theo dõi token / chi phí theo người dùng và ngày (xem mục dưới)
- [x] 2 Đọc nhãn (hàm `read-nutrition-label`, nút "Đọc nhãn dinh dưỡng" ở Thêm món; AI chỉ đọc số in trên nhãn, phép nhân khẩu phần do code làm)
- [x] 3 Tổng kết tuần (hàm `weekly-report`, màn "Tổng kết tuần" mở từ Boss và Hồ sơ; số liệu tính trên máy, AI chỉ viết nhận xét; lưu `ai_reports` theo tuần)
- [x] 4 Thay món (hàm `suggest-swap`, thẻ gợi ý ở màn Thêm món khi món làm vượt purine/muối/đường; chọn từ Food database trước, AI chỉ khi dưới 3 món; mọi gợi ý AI được code kiểm tra lại)
- [x] 5 Tóm tắt coach (hàm `coach-digest`, thẻ ở tab Học viên; mỗi lượt gửi tối đa 12 học viên một lần; trạng thái và số liệu tính trên máy coach, AI chỉ viết tóm tắt và gợi ý lời nhắn; lưu trên máy)
- [x] 6a Thẻ gợi ý bữa tối trong app (hàm `suggest-dinner`, thẻ ở màn Camp từ 15h đến 20h; số còn lại tính trên máy, ý tưởng từ Food database trước, AI theo yêu cầu)
- [x] 6b Push nhắc từ server: **không làm** (quyết định 2026-10-26). Giữ thẻ gợi ý bữa tối trong app; thông báo đẩy cần bảng token thiết bị và lịch chạy trên server, có thể xét lại sau.
