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
