# FitJourney QA · releases 1.4.0–1.6.2

Screenshot pass made on 19/11/2026 at commit `443cc6d` (v1.6.2).

## How it was done

- Web dev build: `npx expo export -p web --dev`. The build used **dummy** `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and a dummy anon key; the worktree has no `.env`. The production URL does not appear in the bundle.
- The build was served as static files on localhost. Playwright-core 1.56.1 drove chrome-headless-shell-1248 at 390 × 844 with device scale 2, touch on, `vi-VN`, Asia/Ho_Chi_Minh.
- The session is **Login Dev**: offline dummy data in `src/dev/devLogin.ts`, with `devMode` set. All AI answers came from the dev fakes in `src/ai/devPhotoAnalysis.ts`, which are labelled "giả lập" / "Mẫu Dev".
- A Playwright route aborted every request that was not to localhost, except plain image, font and stylesheet GETs. The only requests it caught were 31 × `POST 127.0.0.1:9/functions/v1/dish-photo`. They went to the dummy host and were aborted, so nothing reached Supabase or any AI provider.
- The photo test used `Design/uiux-proposal/html/img/pho.jpg`.
- The dev session is held in memory, so every script logs in again and navigates on the client side with `history.pushState`.
- Note on photos: in dev every dish photo is the same sample picture (bean sprouts and herbs), so "wrong" photos in these shots come from the dev data.

`png/` holds 73 shots; `-full` files are full-page captures. `overview.png` is a labelled grid of the 62 viewport shots.

## Results

| # | Item | Result | Screens | Notes |
|---|---|---|---|---|
| 1a | Ghi bữa: "Món & lượng" + "Ghi chú cho AI" with placeholders | PASS | 01, 02 | Both placeholders exactly as the release notes. |
| 1b | "1 bát bún bò, 100g thịt bò, ít đường" → one dish, grams for count units | PASS | 03, 06 | One row: "1 bát bún bò (≈300 g)". + gives "1.5 bát (≈450 g)". Database path: "1 hộp Sữa chua không đường (≈100 g)", "2 quả Trứng gà (≈100 g)"; + gives ≈150 g (11, 11b). |
| 1c | Per-item "Ăn vặt" toggle on rows | PASS | 07 | When on, the chip turns gold and the mission panel shows "Sẽ vượt ngưỡng Đồ ăn vặt". |
| 1d | Cheat chip → sheet: cheat meal ×1.3 and cheat-day numbers | PASS (minor issues) | 08, 08b, 09, 10 | The numbers check out (244×1.3=317, +73; TDEE 2707−1100=1607; 2707−985=1722; 1100/7700≈14%; 4806/4≈1202; 3×300=900, rest 200). Issues A and B below. |
| 1e | "Không nhớ đã ăn gì" → result | ISSUE | 13, 14, 15 | The sheet shows Sáng/Trưa/Tối, 540 kcal (1607/3 = 536, rounded) and saves "Bữa không nhớ (ước tính)" with a toast. Bữa 3 still counts as not eaten: issue C. |
| 2a | Photo analyses at once (no description step) | PASS | 16, 17 | Choosing the photo goes straight to "Bước 2/2 · Kiểm tra", with the photo header, "AI nhận ra 2 món" and "Ảnh là nhãn dinh dưỡng? Đọc nhãn". |
| 2b | Notes + "Phân tích lại với ghi chú" | ISSUE | 18, 18b, 19 | Re-analysis runs, but the new row reads "Món trong ảnh 1 (≈300 g)" while its stepper shows **"1 g"**: issue D. That the dish becomes generic is a dev-fake limit (photo + notes go to the text fake). |
| 3a | Accuracy sheet: AI meal and AI row | PASS (content nit) | 04, 05 | Shows the level (Trung bình), Vì sao, Còn thiếu with "Thêm vào ghi chú", Mẹo, "Phân tích lại với ghi chú" and "Đã hiểu". Issue E. |
| 3b | Accuracy sheet: database row | PASS | 12 | "Từ cơ sở dữ liệu của bạn ⓘ" opens a "Số liệu chuẩn" sheet with its reason and 2 tips. |
| 3c | Accuracy sheet: photo | PASS | 20 | Shows "Mẹo chụp để chính xác hơn" with 4 photo tips. |
| 3d | Accuracy: meal ideas | ISSUE | 30b, 32 | Cookbook and cheat-day dish cards show a plain "AI 50%" badge with no ⓘ. Tapping it opens the dish detail, not the accuracy sheet: issue F. The Camp next-meal card had only database foods, so no badge showed there. RecipeView, which has the badge, was not reached: "Nhờ AI viết công thức" has no dev fake. |
| 4 | Journal › Ngày swipe | PASS | 21, 22, 23 | A touch swipe right goes to Thứ Tư 18/11 ("Hôm qua"). Swiping left comes back, and a second left swipe stays on today. A mouse drag does nothing on desktop web (touch only). |
| 5 | Workout detail "Ngày & giờ" chip + form | PASS | 24, 25, 26, 27 | The chip opens a form with "Ngày tập" and "Giờ bắt đầu". Saving 07:30 shows the toast "Đã chuyển Buổi tập C sang Hôm qua lúc 07:30 · Hoàn tác". |
| 6 | "Ảnh sai?" (Camp next meal, cookbook, cheat day) + after tap | PASS (issue G) | 28, 29, 33, 34, 52b, 53 | After a tap the emoji appears with the toast "Đã ẩn ảnh của … Sẽ tìm ảnh khác cho món này · Hoàn tác". In the cookbook the chip is a `<button>` inside the card's `<button>`, which triggers the dev error overlay (34): issue G. Hiding is keyed by picture URL, so all dev cards hid together (expected with the single sample picture). |
| 7 | Temptation pop-up, "Ảnh sai?", AI chat 3 turns | PASS (issues H, I) | 38, 39, 40×3, 41 | Triggered with "Thử ngay (luyện tập)" in Nhắc nhở & cám dỗ, with AI tương tác on. The fake chat counts "Còn 2/3", then "Còn 1/3", then closes after the 3rd turn. |
| 8 | Logged meal detail: per-food Ăn vặt + accuracy badge | ISSUE | 45, 47, 49, 50 | The Ăn vặt toggle works: "Đã tách … thành món ăn vặt riêng", and the snack count goes to 1 món / Vượt. No "chính xác ~XX%" badge appears in the detail, whether opened from Journal or Camp, for a 1-food or a 2-food AI meal: issue J. |

## Issues

- **A. Cheat chip emoji (10).** When cheat meal is on, the chip shows the 🔥 icon plus 🎉, which is the cheat-day emoji; the sheet uses 🍔 for cheat meal. The row still reads 244 kcal while the save button reads 317 kcal, and nothing on the row shows the ×1.3.
- **B. Mixed number formats in the cheat sheet (08).** Decimals use a comma ("× 1,3") while thousands also use a comma ("2,707", "1,307"), so "1,3" and "1,307" can be confused.
- **C. Meals marked "Tối" do not count as Bữa 3 (14, 15, 43, 44).** This affects "Không nhớ đã ăn gì → Tối" (540 kcal) and an ordinary meal saved with slot Tối. Camp and Journal still show "Bữa 3 - Tối · Chờ ăn 713 kcal", "Dự kiến ~713" and "Bỏ Bữa 3". The forecast adds both, so the day reads 1,281 + 713. The release notes say the estimate "counts as that meal being logged". After the forgot-meal save, the "Bỏ Bữa 2" button disappeared from Camp, but Bữa 2 still shows "Chưa ghi".
- **D. Wrong unit after re-analysis (19).** The row title says ≈300 g but the stepper says "1 g". It looks like the "1" in the name "Món trong ảnh 1" is read as the amount instead of the AI's amount of 300 g. A real AI name that contains a number could hit the same bug.
- **E. Contradiction in the accuracy sheet (04, 05).** "Vì sao" lists "✓ Có ghi khối lượng (g/ml)" while "Còn thiếu" lists "Khối lượng từng món (g)". The ✓ comes from the app because "100g" was typed; the missing item comes from the AI (fake). There are also large gaps between the "Còn thiếu" rows.
- **F. Meal-idea badge not tappable (30b, 32).** DishCard (`src/components/quest/DishCard.tsx:59`) renders `Badge` "AI {pct}%" instead of `AccuracyBadge`. Tapping it opens the dish, not the accuracy sheet.
- **G. Nested buttons (34).** The "Ảnh sai?" `<button>` sits inside the DishCard `<button>`, which logs "<button> cannot contain a nested <button>" and "In HTML, button cannot be a descendant of button" (cookbook, Camp). The dev error overlay is visible in 34.
- **H. Undo toast hidden under overlays (41, 50).** After "Ảnh sai?" in the temptation pop-up, the "Hoàn tác" toast is drawn under the pop-up's dimmed backdrop and cannot be tapped (41). After splitting a snack in the meal detail sheet, the toast is in the DOM but cannot be seen while the sheet is open (50).
- **I. Temptation pop-up details (39, 40-turn2/3).** A stray 💧 emoji sits on the right edge of the dish photo (39, 41). The "Thắng rồi, đi đây 👋" button wraps, leaving the emoji alone on the second line (40-turn2). At the 3rd turn the fake boss does not give up; it repeats "Thật sự không?…". The real Haiku reply was not tested, and practice mode shows no give-up line.
- **J. No accuracy badge in logged meal detail (45, 47, 49).** `MealDetailDialog` only renders the badge when `detail.accuracy` is set, and it stays unset for meals just logged from Ghi bữa with AI rows at 55%.
- **Minor.** After the cookbook AI suggestion saved 3 dishes, the finder still says "Trong cook book của bạn (0)" (30b). In dev mode, `dish-photo` is still POSTed: 31 calls, to the dummy host in this build.

## Console

There were no page errors. Apart from the nested-button errors (G), the console showed:

- `Failed to load resource` (×31): the aborted dish-photo POSTs.
- WebSocket `/hot` and `/message` failures: an artefact of serving the dev export statically.
- Warnings: two require cycles (`food/remember ↔ dbLookup`, `ai/dinner ↔ cookbook/recipes`), "component named 'o' for screen __root", deprecated `shadow*` and `pointerEvents`.

## Not reached

- RecipeView accuracy badge (needs `generate-meal-recipe`, which has no dev fake).
- The real Haiku temptation chat (paid call, skipped).
- Cheat-day "Tìm quán" places (not in scope).
