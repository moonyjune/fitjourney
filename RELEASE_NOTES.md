# Release notes — FitJourney

Version numbers are `A.BC`, counting up from 0.01 (0.99 is followed by 1.00). The current number is `APP_VERSION` in `src/utils/buildInfo.ts` and is shown in
Profile ("Phiên bản"). Every release adds an entry here, newest first, and bumps `APP_VERSION` to match (a test checks they agree).

## Server steps

What each release needs on the server, so it is clear whether anything really has to be run again. Every release adds a row (a test checks it).
- **schema.sql**: `yes` = run `supabase/schema.sql` again in the Supabase SQL Editor (it is safe to run more than once); `no` = no database change.
- **Redeploy**: the Edge Functions whose code changed: `npx supabase functions deploy <name> …`; `—` = none.
- Skipped a few releases? Run schema.sql once if any skipped row says `yes`, and deploy the union of their functions once: both always take the latest code.

| Version | schema.sql | Redeploy |
|---|---|---|
| 0.28 | no | — |
| 0.27 | no | — |
| 0.26 | no | suggest-dinner |
| 0.25 | yes | — |
| 0.24 | yes | — |
| 0.23 | no | — |
| 0.22 | no | — |
| 0.21 | no | — |
| 0.20 | no | — |
| 0.19 | no | — |
| 0.18 | no | — |
| 0.17 | no | — |
| 0.16 | no | — |
| 0.15 | no | — |
| 0.14 | no | analyze-proof-photo, parse-meal-text |
| 0.13 | yes | analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-dinner, suggest-swap, weekly-report, coach-digest |
| 0.12 | no | — |
| 0.11 | yes | — |
| 0.10 | yes | — |
| 0.09 | yes | analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-dinner, suggest-swap, weekly-report, coach-digest |
| 0.08 | no | suggest-dinner, generate-meal-recipe |
| 0.07 | no | — |
| 0.06 | no | — |
| 0.05 | no | — |
| 0.04 | no | — |
| 0.03 | no | — |
| 0.02 | no | suggest-dinner |
| 0.01 | no | — |

## 0.28
- Daily calorie deficit in colour, against your daily deficit target (e.g. 1000 kcal):
  - green "Đạt": ≥ 90 % (900 kcal or more);
  - yellow "Tạm chấp nhận": 50–90 % (500–900);
  - orange "Không đạt": 10–50 % (100–500);
  - red "Quá lố": under 10 %, no deficit, or a surplus.

  Shown in the battle log (week strip, the day's deficit, and a chip with the level and a colour key) and in History (each day's deficit line and the calendar).
- Cheat day: tick "Cheat day" under the battle log's figures for a day (today or earlier). That day is never "Quá lố" and shows as "Cheat day" in blue. The marks are saved to the cloud.

## 0.27
- History, daily diary: a day's workouts fold into one line, e.g. "6 buổi tập · 45 phút · đốt 320 kcal · 06:00–06:05, …". Tapping it lists each workout with its time range and, for a guided session, each exercise with the plan and what every set reached; tap again to fold it.
- History: the meal count ("x/3 bữa") now counts the meals you logged, not the plan's meals you ticked. Every meal time with food counts as one (breakfast, a snack, lunch…), so a day of 4 meals shows 4/3. A food logged without a meal counts by its time, and a "Không ăn" mark is not a meal.

## 0.26
- Cook book: a "Hôm nay muốn ăn gì?" panel with chips you can tick several of:
  - meal or occasion: breakfast, lunch, dinner, snack, drink, coffee, dessert/sweet;
  - craving: sweet, salty, sour & spicy, crunchy, light, warm, high protein, low calorie;
  - dish type: soup, rice, noodles, salad, grilled, steamed/boiled, smoothie/juice, tea, cake;
  - ingredients to use ("Có sẵn") or to avoid ("Tránh"), typed or picked from your cook book and food database.

  A line shows what is left of today's kcal, protein, purine, salt and sugar for that meal or snack. The chips are remembered.
- "Gợi ý" (no AI, instant) ranks your own cook book by how many choices each dish matches. It drops dishes with an avoided ingredient, puts dishes that still fit today first, and flags high-purine ones. It then adds matching dishes from the shared cook book.
- "Gợi ý bằng AI" asks for 3 dishes that follow the choices and today's remaining budget, with the gout rules: no organ meat, shellfish, small oily fish, bone broth or beer, and a warning when a chosen ingredient is high in purine. A snack, drink or coffee gets a small snack budget instead of a meal's. It uses the same daily AI limit as the meal ideas, and the results are saved to your cook book.

## 0.25
- Camp: the battle log (Nhật ký trận) is now on Camp itself: the week strip, the day's figures, the timeline and the meal and workout dialogs. You no longer need a button to open it. Today's missions are folded by default; tap their heading to open them.
- Training count: the last rep was cut off. The set ended in the same instant "8" was said, so the rest announcement drowned it out and 8 reps sounded like 7. The last number now stays on screen and is heard for 1.5 s before the rest starts.
- Training count: "Go!" is called when the lead-in ends, and "1" comes one rep later. In the browser, a sentence that cuts off the one before it now waits a moment, because browsers sometimes dropped it (the count skipped "1").
- Habits: each habit shows whether it is formed, worked out from the ✔/✘ ticks over the last 28 days:
  - "Đã thành thói quen": tracked ≥ 21 days, ≥ 14 ticks and ≥ 80 % done;
  - "Đang hình thành", with its progress;
  - "Chưa ổn định": < 50 %, or 3 misses in a row;
  - "Mới bắt đầu".

  A formed habit that slips is flagged. You can mark a habit yourself ("Đã thành thói quen" / "Chưa thành" / "Theo dữ liệu"), and when your mark and the data disagree, both are shown.
- Habits: a "Phân tích thói quen" card built only from the ticks, each comment with its numbers: this week against last week, the weekday that fails most, streaks and misses in a row, habits that slip together, and auto-tracked habits checked against the logged data.
- Habits: a "Gợi ý Kaizen" card. A struggling habit gets a smaller step and an anchor on the day it fails. A formed habit gets its next step up. There are up to 3 new habits to add with one tap, skipping ones you already have.
- Server: run `supabase/schema.sql` again. It adds `habits.formed_mark`, plus the 0.24 workout columns if not run yet. Until then, a "formed" mark stays on the device only.

## 0.24
- Training: set the number of sets, the length of each set (reps, or seconds for holds) and the rest between sets. Do it on the exercise screen, or in a session before a set starts or while resting. Lengthening the rest while resting also extends the countdown. The numbers are kept for the next sessions at that level; "Về mặc định" goes back to the level's own.
- Battle log (Nhật ký trận): workouts showed the wrong time. The cloud kept only the date, so a restored workout got a made-up time, and the date was the UTC one, a day early before 7 am. A workout now keeps its start time, is logged at the time it started, and is filed under the local date.
- Battle log: workouts close together (less than an hour apart) are one row: "15:00–15:26 · 20 min · burned 460 kcal · 2 workouts". Tapping it opens their history. It lists each workout with its time range and, for a guided session, each exercise with the plan (level, sets × amount, rest), what every set reached, and how it felt.
- Server: run `supabase/schema.sql` again. It adds `started_at` and `details` to `workout_entries`. Until then, workouts still sync without them.

## 0.23
- Training: pick as many exercises as you like (2 or more; the old limit of 3 is gone).
- Training: a "Tự bắt đầu set mới khi hết giờ nghỉ" checkbox. When a rest ends (or is skipped), the next set starts counting by itself after a short intro. Before a new exercise, its steps are read during the rest.
- Training voice says which side goes first and which side comes next. Lunge and single-leg bridge do every rep on the right leg, then switch to the left. Dead bug and bird-dog alternate: right arm + left leg, then left arm + right leg, and one rep is both sides. The written steps say so too.
- Training: a "Diễn biến" list under the counter. It shows every set of the current exercise, step by step: get ready, start, switch side, end of set, with times from the start of the set, and the rests in between. The row in progress is highlighted and scrolled into view. Each row has its own drawing, with letters for the working side (L / R) and the direction of the move (↑T up / ↓B down). The large drawing above it follows the current row.
- Training voice: male and female now sound clearly different. Vietnamese voices whose name contains "Việt Nam" were taken for male voices. When the device has no voice of the chosen gender, the pitch is moved further, and a line under the picker says which device voice is used.
- Analysis (Phân tích): every tab, week/month card and comment day shows when it was analysed ("Phân tích lúc …"). It is marked as outdated when the data changed afterwards.
- Analysis: a new "Cập nhật phân tích" setting, Tự động (default) / Thủ công, synced to the cloud. Auto re-analyses a changed day at once and rewrites the current week's AI review after the edits stop, at most once per 30 minutes. Manual keeps everything as analysed until you tap "Phân tích lại tất cả", "Phân tích lại tab này", or the button on a week or day.
- Analysis: food logged without a meal now counts for the meal its time falls in. Before, a day could still say "missing breakfast" after breakfast was logged.

## 0.22
- Camp's battle log (Nhật ký trận / timeline): a plan meal with nothing logged at its main meal (sáng, trưa, tối) has a "Không ăn bữa này" chip under its card. It records the meal as not eaten, so it is no longer counted as missing. The card then shows "Không ăn" as its status instead of a separate row, and "Bỏ "Không ăn"" undoes it. Shown for today and past days of your own diary, not for future days or a coach's view.

## 0.21
- Photos: the larger view now says which meal and when, e.g. "Tối · 19:30". This covers History's "📷 n ảnh minh chứng" (each photo labelled with its meal or workout and time), the thumbnails in Journal and History, and the meal detail dialog (meal and time under the title).
- Several photos of one meal: the "1/2" counter follows the photo actually in view while you swipe. On the web it used to stay on the previous number after a drag. The view still opens on the first photo.

## 0.20
- "Nhập bằng chữ" is merged into the add-food screen (Món ngoài kế hoạch): one screen with the description ("Bạn đã ăn gì?"), up to 3 photos and "Hỏi AI" (text only, photos only, or both, sent together to the AI). Foods your database knows are still taken from it without the AI. The same screen keeps the food-database lookup, "Đọc nhãn", manual entry ("Thêm món tự nhập"), meal time, exact time, junk switch, live comments and swaps. The old /text-meal link now opens this screen.
- Every food line (from the AI, the database, a label or typed) has an amount field ("Lượng", unit read from the name: g, ml, quả, bát…). Changing it works out calories, protein, purine, salt and sugar again in proportion, offline. A figure typed by hand still wins, and the next amount change starts from it.
- History / Journal: a meal saved as one food now shows its detail too (total kcal on top, the food below with the pencil to change its amount); editing it rescales the food's name and figures.
- Skipping a meal: "Không ăn <bữa>" on the add-food screen (after choosing breakfast, lunch or dinner), and "Bữa chưa ghi: Không ăn …" chips in History's day table for main meals with nothing logged, so a skipped meal is not counted as one missing by mistake.

## 0.19
- Quick add (+): a "Ghi cho ngày" row with ‹ › picks the day (today back to 30 days ago, never the future). Meals, off-plan food (including "Nhập bằng chữ" opened from there) and water go to that day; the screens show "Đang ghi cho: …" and the add button names the day. Weight, check-in and workouts still log for today.
- Off-plan food: the photo box and the "more photos" box are one list (up to 3 photos, the first is the main one) with one pair of "Chụp ảnh" / "Chọn ảnh" buttons, and "Hỏi AI" / "Đọc nhãn" sit side by side under it instead of two more full-width buttons.

## 0.18
- Recipe dialog: "Xóa khỏi cook book" is now a red delete button; pressing it closes the dialog (before, it stayed open and showed "Lưu vào cook book" again) and a message confirms "Đã xóa "…" khỏi cook book." on the Cook book screen and under the meal ideas.

## 0.17
- Meal ideas: "Nhờ AI gợi ý" and "Gợi ý từ cookbook" no longer both show a spinner. Only the button pressed shows it is working; the other one is greyed out until the answer comes (both replace the same 3 dishes, so one request runs at a time).

## 0.16
- History > Nhật ký hằng ngày: every meal already logged on a day (an off-plan food, or a plan meal marked eaten) has a camera button in the day's table. It opens the meal's photos: add up to 3 (camera or library), view them side by side with ‹ ›, or remove the one in view. Photos are saved straight away (no need to press "Lưu"). A plan meal's photo now also shows as a thumbnail in its row.

## 0.15
- A meal keeps all its photos (up to 3), not just the first: the extra photos chosen in "Món ngoài kế hoạch", "Nhập bằng chữ" or a meal's photo box are saved and synced with it, and come back on another device.
- Battle log (Nhật ký) and History show one thumbnail per meal with a badge giving the number of photos; tapping it shows the photos side by side, with ‹ › and "2/3".
- The meal detail shows its photos in the same row: add another one (up to 3) or remove the one in view.

## 0.14
- One meal can be analysed from several photos: with a photo chosen in "Món ngoài kế hoạch" or in a meal's photo box, "Thêm ảnh cho AI" adds up to 2 more photos of the same meal (another angle, another dish, the receipt or label). The AI reads them all together as one meal and counts a dish seen twice only once. Only the first photo is kept with the food.
- Server: analyze-proof-photo accepts the extra photos; the photo check is shared with parse-meal-text.

## 0.13
- Meal ideas ("Gợi ý món khác"): each request returns 3 dishes and replaces the ones on screen; the replaced dishes go into a cookbook shared by all users. New "Gợi ý từ cookbook" (and a search box) suggests 3 fitting dishes from that cookbook without calling the AI. At most 3 dishes are listed per meal, under one header that folds or opens the whole list. Suggestions still survive a page reload.
- The daily limit for meal ideas is read from the database (`app_settings`, key `ai_quota.dinner`, now 30 a day); any AI feature's limit can be set the same way.
- Workout: the spoken coach can use Vietnamese or English (independent of the app language) and a female or male voice; when the device has no voice of that gender the pitch is shifted.
- History > Nhật ký hằng ngày: switch between a list grouped by month (fold/open each month) and a calendar (‹ ›, month/year picker) that shows each day's kcal deficit; tapping a day opens its detail.
- Món ngoài kế hoạch: type only the name (e.g. "2 quả trứng gà") and "+ Thêm vào hôm nay" looks it up in the food database and adds it with the database figures (noted under the form). Several foods or an unknown food give a message and a button to "Nhập bằng chữ" with the text filled in.
- Nhập bằng chữ: attach up to 3 photos (camera or library) that go to the AI with the description; photos alone also work.
- Needs `supabase/schema.sql` run again (tables `app_settings` and `cookbook_recipes`) and the AI functions redeployed (shared limit check changed; parse-meal-text and suggest-dinner changed).

## 0.12
- Analysis > Tuần/tháng: every week card has "Phân tích lại", which brings in the latest data from the cloud and works the week out again (it says when, or that only the device's data was used).
- Every week card lists the days that lack a main meal and which one ("06/10: thiếu sáng, tối"), and the days with nothing logged. A "Không ăn …" button records that meal as not eaten (a 0 kcal "Không ăn" item, synced, removable in the Journal), so the day counts as fully logged.
- Analysis > Nhận xét: each day shows its whole-day sodium, purine and sugar against the daily limits (within or over by how much). A meal warning now says it is about that meal alone and what share of the day's limit it used (e.g. "Natri riêng bữa này 1.600 mg = 80% trần cả ngày (2.000 mg)"). Comments are worked out again as soon as a food of the day is edited.

## 0.11
- Sync: the cloud is now the only source of truth for the diary (food, water, weigh-ins, workouts, check-ins, habits and ticks, uric acid). Opening the app makes the device match the cloud; a record only the device has, with nothing waiting to be sent, is removed (this is what brought back old days such as 14/09 and foods already deleted on 26/10).
- A change that could not be sent waits in the queue once per record, and is sent as the record is at that moment, never an older copy, so it can no longer undo a later change (this is what lost the water of 27/10). Food days queued under the old rules are dropped once.
- Deleting a weigh-in, a workout or a check-in now deletes it in the cloud too (before it only left the device and could come back).
- Check-ins (Nhật ký cảm giác) come back from the cloud after a sign-out or on another device; check-ins this device has that the cloud never got are sent up once.
- Web: the app's data is kept in IndexedDB instead of localStorage (about 5 MB, which meal photos filled up so saves failed silently and a reload showed an old copy); existing data is moved over on first open, and localStorage is still used when a browser will not open IndexedDB.
- Needs `supabase/schema.sql` run again (check-ins get an id of the device: `feeling_records.client_id`).

## 0.10
- AI & cost: the list by user is split by model too: under each user, one line per model they used that day (calls, tokens, the cost recorded at the time).
- Needs `supabase/schema.sql` run again (new function `ai_admin_by_user_model`); until then the user rows show without the split.

## 0.09
- AI & cost: the day and user lists keep the cost recorded when each call was made, with that call's model and price. Picking another model (or price) above only changes the estimate for one user and the calls made after saving; history is no longer worked out again.
- The 14-day list is split by model: a total per model over the 14 days and, under each day, one line per model (calls, tokens, cost).
- Needs `supabase/schema.sql` run again (usage is now kept per model; older rows count as the model they were made with, Sonnet if unknown) and every AI function redeployed (they share the quota count).

## 0.08
- Meal ideas: the AI's answer for a meal is kept (per day and meal), so reloading the page does not ask again and spend tokens; an idea that no longer fits what is left is hidden, not re-asked.
- Tap "Xem công thức" on an idea: a dialog with ingredients, difficulty, time, tools, the steps (each with an icon), the nutrition against what is left for the meal, your star rating and a photo of the dish you made. A dish without a recipe can have one written once by the AI.
- Cook book: every AI idea is saved (also synced to the cloud), reusable from the meal card (dishes that fit are offered without the AI) and from a Cook book screen (Profile or the meal card). "Gợi ý món khác" asks the AI for new dishes that are not in the cook book.
- Needs the `suggest-dinner` and `generate-meal-recipe` functions redeployed for the AI to send the full recipe and to write the recipe of a named dish.

## 0.07
- Fix: a day could hold two foods under the same id (seen on 26/10), so deleting or editing one changed both and the day table got stuck. Every food now gets its own id, and days already saved that way are repaired on opening (device and cloud).

## 0.06
- AI & cost: while choosing a model (or editing the prices) the model card shows the estimate for one user: tokens per day, cost per day and per average month (30 days), from the real use of recent days. The day and user lists below are worked out again at the chosen model's prices. Tapping a preset fills in a reference price.

## 0.05
- Journal: photos that were submitted from the web before 0.03 (and showed as empty after a reload) are brought back from the cloud; a dead local link no longer hides the cloud copy.
- Tap any small food photo to see it larger; History: "N ảnh minh chứng" is now an underlined link that opens that day's photos.
- History: the day table has "Thêm món" and "Khôi phục bữa đã xoá", so a day emptied of everything can be filled again (deleting down to the last food no longer leaves nothing to edit).
- Version number in Profile and this file.

## 0.04
- Deleting every food of a day now clears its calories (and saves that to the cloud); a leftover total with no foods can be removed from the diary table.
- Every food of a logged meal can be edited (amount, calories, protein, purine, salt, sugar) in the Journal dialog and the History table; changing the amount works the rest out again, offline.
- Opening the app: when every edit of this device has reached the cloud, a different cloud version of a day's food replaces the stale local copy.
- Photos kept inline on the web are stored once, smaller (720 px), so the browser's storage does not fill up.

## 0.03
- Journal: small photo on each logged meal; add, replace or remove a meal's photo from its dialog; edit the amount of a food and the calories follow.
- Photos sync to the cloud reliably (no duplicates, unreadable files dropped, local date) and come back on a new device; deleting a photo deletes it in the cloud too.
- Drag the week strip sideways to change week.

## 0.02
- Meal ideas: at most 600 kcal per meal, a day band of target−200 to target, wanted kcal and protein per meal (±10%) and a "never above" switch.

## 0.01
- Journal: tap a logged meal for a detail dialog with its photo; the day strip shows the real deficit.
- Typed meals use the food database first and send only unknown foods to the AI; each food of an AI meal is added to the food database.
