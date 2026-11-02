# Release notes — FitJourney

Version numbers are `A.B.C` (since 2026-11-02; the user's rule): a fix or small change raises C, a big change (a new feature) raises B and
resets C, a big update raises A and resets B and C. Releases before that were numbered 0.01–0.48 one after another; they were renumbered by
the same rule, and each entry keeps its old number ("Số cũ") so old commits ("0.40: …") can still be matched. The current number is
`APP_VERSION` in `src/utils/buildInfo.ts` and is shown in Profile ("Phiên bản"). Every release adds an entry here, newest first, and bumps
`APP_VERSION` to match (a test checks they agree and that each step follows the rule).

## Server steps

What each release needs on the server, so it is clear whether anything really has to be run again. Every release adds a row (a test checks it).
- **schema.sql**: `yes` = run `supabase/schema.sql` again in the Supabase SQL Editor (it is safe to run more than once); `no` = no database change.
- **Redeploy**: the Edge Functions whose code changed: `npx supabase functions deploy <name> …`; `—` = none.
- Skipped a few releases? Run schema.sql once if any skipped row says `yes`, and deploy the union of their functions once: both always take the latest code.

| Version | schema.sql | Redeploy |
|---|---|---|
| 0.26.5 | no | tempt-me, dish-photo |
| 0.26.4 | yes | analyze-proof-photo, boss-banter, coach-digest, dish-photo, generate-meal-recipe, parse-meal-text, estimate-workout-kcal, read-nutrition-label, suggest-cheat-places, tempt-me, suggest-dinner, suggest-swap, weekly-report |
| 0.26.3 | no | analyze-proof-photo, boss-banter, coach-digest, dish-photo, generate-meal-recipe, parse-meal-text, estimate-workout-kcal, read-nutrition-label, suggest-cheat-places, tempt-me, suggest-dinner, suggest-swap, weekly-report |
| 0.26.2 | yes | tempt-me, dish-photo |
| 0.26.1 | no | — |
| 0.26.0 | yes | suggest-cheat-places, tempt-me |
| 0.25.0 | yes | send-push |
| 0.24.0 | no | — |
| 0.23.0 | no | — |
| 0.22.1 | no | — |
| 0.22.0 | no | dish-photo, suggest-cheat-places |
| 0.21.0 | no | — |
| 0.20.3 | no | — |
| 0.20.2 | no | — |
| 0.20.1 | no | — |
| 0.20.0 | yes | dish-photo |
| 0.19.0 | no | suggest-cheat-places, suggest-dinner, tempt-me |
| 0.18.1 | no | — |
| 0.18.0 | no | estimate-workout-kcal |
| 0.17.2 | no | — |
| 0.17.1 | no | — |
| 0.17.0 | no | weekly-report, coach-digest, analyze-proof-photo, read-nutrition-label, parse-meal-text, suggest-dinner, suggest-swap |
| 0.16.2 | no | — |
| 0.16.1 | no | — |
| 0.16.0 | no | — |
| 0.15.1 | no | suggest-cheat-places, suggest-dinner |
| 0.15.0 | no | boss-banter |
| 0.14.2 | no | — |
| 0.14.1 | no | — |
| 0.14.0 | no | — |
| 0.13.0 | no | story-chapter |
| 0.12.0 | yes | — |
| 0.11.0 | no | tempt-me, suggest-cheat-places, suggest-dinner, analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-swap, weekly-report, coach-digest |
| 0.10.0 | no | — |
| 0.9.0 | no | suggest-cheat-places, suggest-dinner, analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-swap, weekly-report, coach-digest |
| 0.8.2 | no | — |
| 0.8.1 | no | — |
| 0.8.0 | no | suggest-dinner |
| 0.7.1 | yes | — |
| 0.7.0 | yes | — |
| 0.6.3 | no | — |
| 0.6.2 | no | — |
| 0.6.1 | no | — |
| 0.6.0 | no | — |
| 0.5.5 | no | — |
| 0.5.4 | no | — |
| 0.5.3 | no | — |
| 0.5.2 | no | — |
| 0.5.1 | no | — |
| 0.5.0 | no | analyze-proof-photo, parse-meal-text |
| 0.4.0 | yes | analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-dinner, suggest-swap, weekly-report, coach-digest |
| 0.3.1 | no | — |
| 0.3.0 | yes | — |
| 0.2.7 | yes | — |
| 0.2.6 | yes | analyze-proof-photo, parse-meal-text, read-nutrition-label, generate-meal-recipe, suggest-dinner, suggest-swap, weekly-report, coach-digest |
| 0.2.5 | no | suggest-dinner, generate-meal-recipe |
| 0.2.4 | no | — |
| 0.2.3 | no | — |
| 0.2.2 | no | — |
| 0.2.1 | no | — |
| 0.2.0 | no | — |
| 0.1.1 | no | suggest-dinner |
| 0.1.0 | no | — |

## 0.26.5
- Temptation pool pictures: one picture belongs to one item only (compared without query / fragment). A picture another item already has, or one that looks like a site's generic image (logo, banner, default / share image, icon), is refused and the next way to find one is tried.
- The web photo search asks for a page about that exact dish (not a menu, category or home page), and the AI (Haiku) looks at the pictures found (one call for up to 8): a picture that does not show the dish is dropped.
- Repair: the next seed step takes away pictures shared by several items or generic (a library photo the AI had checked stays with one item) and those items look again, never taking that picture back; the seed answer says how many (`repaired`).
- Server: deploy tempt-me (and dish-photo, which shares the photo code). No schema change.

## 0.26.4
- Temptation pool: the calls without the web now ask for ~28 items each (6 calls by theme + the trending one with the web). With 55 items the answer ran out of room and came back without a list; a list given as text is now read too, an answer with no list is asked once more, and the seed's notes say how each answer ended (stop reason, what `items` was).
- Real photo for every pool item: after the item's own page and the photo libraries (Wikimedia / Openverse), a web search (up to 3 searches per 8 dishes) finds a page showing that dish and its page picture is used, credited with the site. An item is "no photo" only after the web search also found nothing; items marked "no photo" before get this search once.
- Per-feature models: the temptation pool and the dish photo checks / search run on Claude Haiku 5.5 by default (its cost logged at Haiku's price); "Tìm quán" stays on the global model. AI & cost > Model has a box per feature (Tìm quán, Kho món cám dỗ, Kiểm tra / tìm ảnh món) to set another one (ai_settings `model.places`, `model.tempt`, `model.photo`).
- Server: run schema.sql (ai_settings accepts the new keys), redeploy every AI function (the shared model choice changed).

## 0.26.3
- AI calls made at the same time no longer fail when the model refuses a forced tool call: each request remembers how it was sent, so every one of them switches to "tool_choice auto" and goes again (two of the four pool calls had failed this way).
- Temptation seed: a step that adds nothing (all calls failed) no longer counts as "generated", and generating goes on until the pool is nearly full; the seed answer lists what each call did.

## 0.26.2
- Temptation pool (Hard level) is seeded once, up front: the AI writes the ~200 items and every item gets a REAL photo on the server before anyone sees it (a web item's own page picture, else a Wikimedia Commons / Openverse photo the AI checked shows that dish; never a generated picture). The pop-up shows the photo's credit ("Ảnh: tác giả · giấy phép · Wikimedia"). An item no real photo shows is offered only when nothing with a photo fits.
- The seed runs step by step (each call fits the server's time limit and says how far it is): POST {"action":"seed"} to tempt-me with the cron secret. Its cost is kept on the pool (tempt_pool_meta), not on any player's AI quota or budget.
- Later refills get their photos the same way right after they are written; a pop-up that finds items still without one looks for a few in the background.
- Server: run schema.sql (new columns on tempt_pool_meta, functions tempt_pool_claim_photos and tempt_pool_add_cost), deploy tempt-me and dish-photo (its photo search is now shared code).

## 0.26.1
- The release number ("v0.26.1") is shown under the logo on the sign-in screen and the intro, so it is easy to see which version a browser has loaded.

## 0.26.0
- AI cost, "Tìm quán" (cheat day): one AI call now runs 2 web searches (was up to 4) and finds a big batch (up to 10 dishes, 10–15 places). The batch is kept on the server for 7 days; searching the same wish / area / dishes again and "Gợi ý tiếp" are answered page by page from it (6 places, 4 dishes, as before) with no AI call. A new call only when the batch is used up or older than 7 days, and it leaves out every place already shown.
- AI cost, temptation pop-up (Hard level): items now come from a pool shared by all players (~200 at a time, written in bulk by 4 AI calls, one of them searching the web for what is trending). Each pop-up picks one item that fits the time of day, weekday / weekend, the weather, the city and any holiday, never repeated for a player within 30 days: no AI call per pop-up. When the pool runs low it is refilled in the background (at most every 12 h). Pictures: a web item's page picture is fetched once and kept for everyone; otherwise the dish's real photo as before.
- Server: tables `places_batches`, `tempt_pool`, `tempt_shown`, `tempt_pool_meta` and the function `tempt_pool_claim_refill` (run schema.sql), then deploy `suggest-cheat-places` and `tempt-me`. Until schema.sql is run both functions work as before (place search with 2 searches, one AI call per pop-up).

## 0.25.0
- Web Push: reminders arrive while the app is closed. Profile › "Thông báo khi đóng app" (web only, next to "Nhắc nhở"). On iPhone it works only in the Home Screen app (Safari › Share › Add to Home Screen, iOS 16.4+); tapped in a Safari tab it shows how to add it.
- Pushed (only while "Nhắc nhở" is on): water at each drink time not yet reached (several missed times = one message), meal starts, and workouts on training days (same rules as on the phone). Each reminder once a day per user, to every device of that user. While push is on, the page no longer shows its own browser notification (the in-app water pop-up stays).
- The app is installable (manifest, icons, Home Screen metadata) and has a service worker for push only (no offline cache).
- Server: tables `push_subscriptions` / `push_sent`, a pg_cron job every 15 min calling the new function `send-push` (deploy with `--no-verify-jwt`; vault secrets `push_function_url`, `push_cron_secret`; function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET`).

## 0.24.0
- History: a day with a meal not logged shows its deficit without the level colour and with "⚠" (list and calendar); a screen reader reads "⚠ Chưa ghi …" with the meals. Today while meals are still to come shows its estimate, "~X · dự kiến", like the Journal.
- "Tôi không ăn sáng" (Profile, under the 16:8 switch, normal mode only): breakfast is no longer expected, so it is never "còn chờ" or "chưa ghi"; lunch and dinner share the day's kcal, so the day's expected total stays the same. Synced with the meal mode (user_data `mealMode.skipBreakfast`).
- "Bỏ bữa" on the Journal, next to "Ghi bổ sung" (and under today's "Đang tính" line for the meals still to come): marks that meal of that day as skipped on purpose. It no longer counts as missing or still to come, so the day gets its normal colours, or settles today (final deficit, boss hit no longer pending). "Đã bỏ … · Hoàn tác" undoes it. Synced per day (user_data `skippedMeals`).
- The diary's "Không ăn" mark on a normal-day meal counts as skipped too.

## 0.23.0
- Deficit without food: a day with nothing eaten has no deficit figure anywhere ("— · Chưa ghi bữa nào"), not the whole TDEE (~2,500 kcal). The TDEE card and the History deficit chart read it the same way as Camp (a day with only water is a gap).
- Today while meals are still to come: the deficit shows the end-of-day estimate, "Dự kiến ~640", with a line saying how it is worked out (eaten so far + the remaining meals as planned). It becomes the real figure once every meal is logged, skipped, or past its time. The deficit mission waits for that too.
- Boss: today's hit is "chờ chốt" until the day is settled. The HP bar shows the part it will take, faded, and the battle log shows "~−X". The boss no longer loses 1,500 HP in the morning just because nothing has been eaten yet.
- A past day with a meal not logged: "⚠ Chưa ghi Bữa tối: nếu đã ăn, thâm hụt thật thấp hơn số này", without the level colour, and "Ghi bổ sung" opens (+) on that day.
- Fasting mode: food logged on its own during a plan meal's time now counts as that meal once it is half the plan meal's kcal (a snack does not).

## 0.22.1
- Meal suggestions: each meal shows one dish; "Xem thêm N món ▾" opens the others and "Thu gọn ▴" folds them again.

## 0.22.0
- Cheat-day places are kept: every search goes to "🕘 Lịch sử tìm quán" (30 newest), and "☆ Lưu quán" keeps a place in "⭐ Quán đã lưu" (synced, user_data `cheatPlaces`).
- Real photos: place cards show the picture of the place's own web page (og:image, with "Ảnh: <domain>"); dish photos now really show — the search used the AI's long dish names ("… (1 tô lớn)") and found nothing, now it searches the dish itself; Openverse photos were also all rejected (fixed).
- "Gợi ý tiếp" asks for more places and dishes without repeating the ones already shown.
- An empty box is fine: the AI picks dishes from your day and history and finds places. Fewer web searches per call (4, "Gợi ý tiếp" 3) to keep the cost down.

## 0.21.0
- Camp: the day picked in the week strip becomes the working day. The (+) quick add opens on it, and "Nghỉ ở lửa trại" records for it (the button names the day when it is not today); both keep a ‹ › picker (today back to 30 days).
  - A past day that already has a check-in opens it for editing instead of adding a second one.
- Quick add (+): water can be lowered ("−250 ml", "−500 ml", never below 0) to fix a mistake; the day's total shows in ml.

## 0.20.3
- Boss battle log: each day's deficit is split into its two sources — "🍽 ăn dưới TDEE …" (or "ăn vượt TDEE …"; marked when above the 1,500 that eating can count for) and "🏃 tập luyện …".

## 0.20.2
- Training session: the screen stays on for the whole session, so the voice coach no longer stops when the phone would dim after 30 s (web: the browser's screen wake lock, asked again when you come back to the tab; phone app: keep-awake).

## 0.20.1
- Version numbers are now A.B.C (fix/small change: C, new feature: B, big update: A); every earlier release was renumbered and keeps its old number. 0.48 is 0.20.0.
- The weekly boss resets at 05:00 on Monday instead of midnight, so a Sunday-night win can be enjoyed a little longer.

## 0.20.0
_Số cũ: 0.48_
- Real dish photos: cheat-day dish suggestions and the temptation pop-up show a real photograph of the dish, found in Wikimedia Commons / Openverse (free, reusable licences) and checked by the AI to really show that dish; the emoji stays when none fits. A small credit line names the author and licence and opens the source. No AI-drawn images.
  - New function `dish-photo` (AI feature `dishphoto`, 40 a day); photos are kept in the new `dish_photos` table, so each dish is looked up once (run schema.sql; it works without the table, just uncached).

## 0.19.0
_Số cũ: 0.47_
- Place search works in Vietnam again: the web search no longer gets "VN" as its country (the API rejected it); the address from the map goes into the prompt, and a rejected location is retried once without it.
- Cheat day reads your wish: one box for a craving, a mood or something vague ("buồn, muốn ăn gì ấm bụng"). The AI reads it with the time of day, what you ate lately, your favourites, the foods that pushed days over target and current food trends, says how it understood you ("AI hiểu là: …") and pampers you.
  - "Tìm quán" always returns dishes that fit the wish and nearby places together, even with an empty box.

## 0.18.1
_Số cũ: 0.46_
- Water pop-up shows the day against the schedule: every drink time (✓ reached, ✗ missed, • now), how far behind you are and which times were missed, and a catch-up plan — drink this time's portion plus up to 250 ml now, the rest spread over the drink times ahead. The button brings the day up to what you drink now.

## 0.18.0
_Số cũ: 0.45_
- Logging a workout by hand (Training > the classic log, add or edit): "✨ AI ước tính kcal" estimates the kcal burned from the description and minutes with your body profile (latest weight, height, age, gender) — MET × kg × hours, shown with the formula. It only fills the form; you check and save. New function `estimate-workout-kcal` (AI feature `workout`, 20 a day).

## 0.17.2
_Số cũ: 0.44_
- Deficit limits: eating alone counts for at most 1500 kcal of a day's boss damage, but the day's training now adds on top (before, the whole day was capped at 1500).
  - Warnings, never a ban: "⚠ Ăn quá ít" when the deficit from eating alone is over 1500 kcal; "⚠ Thâm hụt quá lớn" when the whole day (eating + training) is over 1800 kcal, or 2000 kcal with a TDEE of 2600 or more. They replace the 0.41 "too steep" rule.
- Water pop-up: the button is now the milestone ("Đã uống đủ 3500 ml") and brings the day up to it, instead of adding that amount on top (3 L logged + "3.5 L" used to give 6.5 L).

## 0.17.1
_Số cũ: 0.43_
- Cheat days and the week: meals on a cheat day no longer use up the 80/20 flexible-meal allowance (the allowance covers the other days), and the weekly boss's "needed per remaining day" spreads what is left over the days ahead that are not cheat days.

## 0.17.0
_Số cũ: 0.42_
- A cheat day is left out of every calorie figure: no boss damage or heal, not in deficit totals, averages, charts, forecasts, the weekly target or the AI's numbers, and no battle chat that day. It shows "Cheat day · không tính kcal" instead of a deficit.
  - The streak neither breaks nor grows on a cheat day; the deficit mission gives no XP.
  - Its foods, photos and eaten kcal are still saved and shown as data. The weekly review and coach AI are told the day is a marked cheat day.

## 0.16.2
_Số cũ: 0.41_
- Deficit colours: a deficit far beyond the target (more than 160 % of it and more than 1000 kcal) is now "Thâm hụt quá mức" in violet — losing that fast costs muscle and, with gout, raises uric acid.
  - The old red "Quá lố" is split: 0–10 % of the target is "Duy trì" (light red, eating about what you burn) and a real surplus is "Ăn dư" (red). A cheat day is still "Cheat day".

## 0.16.1
_Số cũ: 0.40_
- Add food: a name the food database knows (one food, e.g. "2 quả trứng gà") now fills the form with its figures (scaled to the amount) and says where they came from; nothing is saved until you check and save it.

## 0.16.0
_Số cũ: 0.39_
- Water reminders work on the web: at each drink time of the water plan a pop-up says how much to drink now (catching up on missed times), how far the day is, and cheers you on; "Đã uống … ml" logs it.
  - Missed times while the app was closed give one pop-up for the latest (up to 2 h late), never a pile.
  - With the tab in the background, the browser's own notification shows too, if allowed. Turning Reminders on in Profile now works on the web (it asks the browser once).

## 0.15.1
_Số cũ: 0.38_
- Cook book, Cheat day: place search fixed and reworked.
  - A "Bạn muốn ăn gì?" box with "Tìm quán" searches places for exactly what you type, with or without AI ideas; each eat-out AI dish has a "🔎 Tìm quán" chip.
  - "📍 Vị trí của tôi" takes your precise position, turns it into an address (street, ward, district) you can edit, shows its accuracy and a "Xem trên bản đồ" link; "Bỏ tọa độ" clears it.
  - Places come nearest first with the distance and a Google Maps link.
  - A failed search now says why (timeout, web search not allowed, no answer…) instead of a generic AI error.
- Cheat day ignores the rules: no gout / purine warnings or limits on cheat dishes, and AI cheat ideas are just tasty popular dishes (kcal still shown).

## 0.15.0
_Số cũ: 0.37_
- Map: "Hội thoại chiến đấu" replaces the story chapters. Each day of the last 14 with food logged gets a short chat between the stage boss and you.
  - A deficit day: you unleash a move named from the real numbers ("Chưởng Thâm Hụt 1,000 kcal", a workout you logged, protein reached, no junk food) and the boss takes the grams of fat; a weigh-in drop is a critical hit; a boss that falls admits defeat.
  - A surplus day: the boss heals, teases you with a food you really logged and challenges you for tomorrow (lighter on a planned cheat day). Never about your body.
  - AI writes yesterday's chat once when the Map opens; any day can be written or rewritten with "Nhờ AI viết". Without AI a ready-made chat is shown, so every day has one.
  - Tapping a day in the damage log opens its chat; a boss's detail shows its latest exchange.
- Server: the story-chapter function is retired (`npx supabase functions delete story-chapter`).

## 0.14.2
_Số cũ: 0.36_
- Profile: settings and links grouped under headings: Diary & progress, Food & health, Daily targets (water, limits, fasting), Reminders & challenges, AI, Account & data (language, coach, import).

## 0.14.1
_Số cũ: 0.35_
- Map: a boss's detail dialog scrolls again when its content (chat, damage panel) is taller than the screen.

## 0.14.0
_Số cũ: 0.34_
- Map: a "Nhật ký sát thương" (damage log) under the journey.
  - By day: estimated damage from the day's deficit (÷ 7700 kcal/kg, coloured by deficit level, cheat days marked; a surplus heals the boss) next to the real damage from weigh-ins, with the boss being fought and any boss that fell.
  - Weight log: weigh-ins newest first with each boss's weight line where it fell; tapping a line opens that boss.
  - A boss's detail shows the damage dealt to it (estimated vs real kg, last 7 days). The weight chart marks where each boss fell.
- "Quái Một Ký Mỡ" is now drawn in the stage-boss style and is the same drawing on Camp, the boss screen, check-in, the weekly review, the Map chart and the first-boss sticker.
- The temptation bosses are drawn in the same style (cake demon, bubble-tea slime, beer barrel, noodle ninja, a new crispy goblin), with their moods drawn on their faces.

## 0.13.0
_Số cũ: 0.33_
- Map: a "Câu chuyện" section tells your journey as an RPG story, one chapter per finished week (Mon–Sun with something logged, the last 8 weeks) and one per stage boss beaten.
  - A chapter is written by AI from a summary of your real data: deficit days, weight change, workouts, habits, notable foods, limits and boss damage. Nothing is invented.
  - Writing is manual: one tap writes the oldest pending chapter (3 a day). Chapters are newest first, folded; boss chapters have a gold border.
  - Chapters sync with your account.

## 0.12.0
_Số cũ: 0.32_
- Water plan: the day's drinks come from the daily water target, 500 ml each, spread evenly over the drinking window (default 06:00–21:00); 3.5 L = 7 drinks, 4.5 L = 9.
  - Profile → "Nước mỗi ngày": presets 2.5–4.5 L, ±250 ml, and the start/end of the drinking window. The Plan screen no longer has a water target field.
  - Nutrition and Quick add show the next drink (or "catch up now" / done); reminders follow the plan.
- Each day keeps its own water target (saved on that day's log), so past days in Journal, History and achievements are judged against the target they had.

## 0.11.0
_Số cũ: 0.31_
- Temptation challenge (Profile, off by default): now and then a Temptation Boss messages you with a food or drink, as a chat with a drawn boss, typing dots, bubbles and two reply buttons.
  - Easy picks from 40+ bundled Vietnamese treats by time of day; Hard asks AI for one item that fits the date, time, weather and city, maybe found on the web (a picture only from a page really seen).
  - 1, 3 or 5 a day, never in quiet hours (22–07) or outside the eating window while fasting.
  - Resisting gives +15 XP and keeps a streak; giving in offers to log the food.
- AI usage lists the temptation challenge (6 a day).

## 0.10.0
_Số cũ: 0.30_
- Map: stage bosses along your weight path, one per 5 kg from your start weight to your goal (e.g. 110→105→100→95), grouped into zones (at least 3, about 3 bosses each).
  - A later zone means a stronger boss: more stars, a higher rank (Thường → Huyền thoại) and more skills.
  - The six drawn bosses each carry a weapon: Quỷ Bánh Kem, Gã Thùng Bia, Slime Trà Sữa, Ninja Mì Gói, Golem Sofa, and the final boss Rồng Lẩu Buffet.
  - Their skills include "Dụ dỗ đồ ngọt", "Bia lạnh cuối tuần", "Mì gói nửa đêm", "Ngủ muộn"…
- Map: a "Hành trình diệt boss" journey from start to goal.
  - Each zone has a banner and its progress.
  - A beaten boss shows the date it fell ("Hạ ngày 21/10 · 2 ngày", from the first weigh-in at or below its weight).
  - The current boss shows the kg left and "Bạn ở đây". Locked bosses show their skills.
  - A summary shows kg lost, bosses down and kg to go.
- Map: the current boss bobs with a pulsing ring. Tapping any boss opens a detail where it talks to you in chat bubbles, taunting or admitting defeat. Animations stop with the phone's reduced-motion setting.

## 0.9.0
_Số cũ: 0.29_
- Cook book, redesigned:
  - tabs "Của tôi" / "🎉 Cheat day" / "✨ Gợi ý", one at a time;
  - a search box over dish names and ingredients (accents ignored);
  - sorting (newest, most cooked, most stars, fewest kcal) and quick filters (fits the next meal, low purine, ≤ 20 min, rated);
  - compact dish cards with kcal / protein / purine badges; notes, ingredients and steps only in the recipe dialog;
  - the finder folded into a filter bar with the active filters as small chips; help behind "?".
- Cheat day in the finder: tick "🎉 Cheat day" and choose Tự nấu / Ăn ngoài / Cả hai.
  - Any dish goes, with no calorie budget, but kcal, purine, salt and sugar are still shown, with a gout caution and a "⚠ Purine cao" badge.
  - Saved cheat dishes go to their own "Cheat day" tab. They stay out of everyday suggestions and are never shared to the community cook book.
- Places to eat: enter an area (or use the current location on the web). For dishes to eat out, the AI searches the web for places: address, price range, rating with the number of reviews and its source, up to 3 recent reviews with date and link, opening status, and whether an article is sponsored.
  - Each place gets a reliability level, Cao / Trung bình / Thấp, with the reasons.
  - Only what the search actually found is shown. A rating or review without a source link is dropped ("không tìm thấy").
  - Limit: 10 searches a day. If web search is not enabled for the API key, the screen says so and dish ideas still work.

## 0.8.2
_Số cũ: 0.28_
- Daily calorie deficit in colour, against your daily deficit target (e.g. 1000 kcal):
  - green "Đạt": ≥ 90 % (900 kcal or more);
  - yellow "Tạm chấp nhận": 50–90 % (500–900);
  - orange "Không đạt": 10–50 % (100–500);
  - red "Quá lố": under 10 %, no deficit, or a surplus.

  Shown in the battle log (week strip, the day's deficit, and a chip with the level and a colour key) and in History (each day's deficit line and the calendar).
- Cheat day: tick "Cheat day" under the battle log's figures for a day (today or earlier). That day is never "Quá lố" and shows as "Cheat day" in blue. The marks are saved to the cloud.

## 0.8.1
_Số cũ: 0.27_
- History, daily diary: a day's workouts fold into one line, e.g. "6 buổi tập · 45 phút · đốt 320 kcal · 06:00–06:05, …". Tapping it lists each workout with its time range and, for a guided session, each exercise with the plan and what every set reached; tap again to fold it.
- History: the meal count ("x/3 bữa") now counts the meals you logged, not the plan's meals you ticked. Every meal time with food counts as one (breakfast, a snack, lunch…), so a day of 4 meals shows 4/3. A food logged without a meal counts by its time, and a "Không ăn" mark is not a meal.

## 0.8.0
_Số cũ: 0.26_
- Cook book: a "Hôm nay muốn ăn gì?" panel with chips you can tick several of:
  - meal or occasion: breakfast, lunch, dinner, snack, drink, coffee, dessert/sweet;
  - craving: sweet, salty, sour & spicy, crunchy, light, warm, high protein, low calorie;
  - dish type: soup, rice, noodles, salad, grilled, steamed/boiled, smoothie/juice, tea, cake;
  - ingredients to use ("Có sẵn") or to avoid ("Tránh"), typed or picked from your cook book and food database.

  A line shows what is left of today's kcal, protein, purine, salt and sugar for that meal or snack. The chips are remembered.
- "Gợi ý" (no AI, instant) ranks your own cook book by how many choices each dish matches. It drops dishes with an avoided ingredient, puts dishes that still fit today first, and flags high-purine ones. It then adds matching dishes from the shared cook book.
- "Gợi ý bằng AI" asks for 3 dishes that follow the choices and today's remaining budget, with the gout rules: no organ meat, shellfish, small oily fish, bone broth or beer, and a warning when a chosen ingredient is high in purine. A snack, drink or coffee gets a small snack budget instead of a meal's. It uses the same daily AI limit as the meal ideas, and the results are saved to your cook book.

## 0.7.1
_Số cũ: 0.25_
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

## 0.7.0
_Số cũ: 0.24_
- Training: set the number of sets, the length of each set (reps, or seconds for holds) and the rest between sets. Do it on the exercise screen, or in a session before a set starts or while resting. Lengthening the rest while resting also extends the countdown. The numbers are kept for the next sessions at that level; "Về mặc định" goes back to the level's own.
- Battle log (Nhật ký trận): workouts showed the wrong time. The cloud kept only the date, so a restored workout got a made-up time, and the date was the UTC one, a day early before 7 am. A workout now keeps its start time, is logged at the time it started, and is filed under the local date.
- Battle log: workouts close together (less than an hour apart) are one row: "15:00–15:26 · 20 min · burned 460 kcal · 2 workouts". Tapping it opens their history. It lists each workout with its time range and, for a guided session, each exercise with the plan (level, sets × amount, rest), what every set reached, and how it felt.
- Server: run `supabase/schema.sql` again. It adds `started_at` and `details` to `workout_entries`. Until then, workouts still sync without them.

## 0.6.3
_Số cũ: 0.23_
- Training: pick as many exercises as you like (2 or more; the old limit of 3 is gone).
- Training: a "Tự bắt đầu set mới khi hết giờ nghỉ" checkbox. When a rest ends (or is skipped), the next set starts counting by itself after a short intro. Before a new exercise, its steps are read during the rest.
- Training voice says which side goes first and which side comes next. Lunge and single-leg bridge do every rep on the right leg, then switch to the left. Dead bug and bird-dog alternate: right arm + left leg, then left arm + right leg, and one rep is both sides. The written steps say so too.
- Training: a "Diễn biến" list under the counter. It shows every set of the current exercise, step by step: get ready, start, switch side, end of set, with times from the start of the set, and the rests in between. The row in progress is highlighted and scrolled into view. Each row has its own drawing, with letters for the working side (L / R) and the direction of the move (↑T up / ↓B down). The large drawing above it follows the current row.
- Training voice: male and female now sound clearly different. Vietnamese voices whose name contains "Việt Nam" were taken for male voices. When the device has no voice of the chosen gender, the pitch is moved further, and a line under the picker says which device voice is used.
- Analysis (Phân tích): every tab, week/month card and comment day shows when it was analysed ("Phân tích lúc …"). It is marked as outdated when the data changed afterwards.
- Analysis: a new "Cập nhật phân tích" setting, Tự động (default) / Thủ công, synced to the cloud. Auto re-analyses a changed day at once and rewrites the current week's AI review after the edits stop, at most once per 30 minutes. Manual keeps everything as analysed until you tap "Phân tích lại tất cả", "Phân tích lại tab này", or the button on a week or day.
- Analysis: food logged without a meal now counts for the meal its time falls in. Before, a day could still say "missing breakfast" after breakfast was logged.

## 0.6.2
_Số cũ: 0.22_
- Camp's battle log (Nhật ký trận / timeline): a plan meal with nothing logged at its main meal (sáng, trưa, tối) has a "Không ăn bữa này" chip under its card. It records the meal as not eaten, so it is no longer counted as missing. The card then shows "Không ăn" as its status instead of a separate row, and "Bỏ "Không ăn"" undoes it. Shown for today and past days of your own diary, not for future days or a coach's view.

## 0.6.1
_Số cũ: 0.21_
- Photos: the larger view now says which meal and when, e.g. "Tối · 19:30". This covers History's "📷 n ảnh minh chứng" (each photo labelled with its meal or workout and time), the thumbnails in Journal and History, and the meal detail dialog (meal and time under the title).
- Several photos of one meal: the "1/2" counter follows the photo actually in view while you swipe. On the web it used to stay on the previous number after a drag. The view still opens on the first photo.

## 0.6.0
_Số cũ: 0.20_
- "Nhập bằng chữ" is merged into the add-food screen (Món ngoài kế hoạch): one screen with the description ("Bạn đã ăn gì?"), up to 3 photos and "Hỏi AI" (text only, photos only, or both, sent together to the AI). Foods your database knows are still taken from it without the AI. The same screen keeps the food-database lookup, "Đọc nhãn", manual entry ("Thêm món tự nhập"), meal time, exact time, junk switch, live comments and swaps. The old /text-meal link now opens this screen.
- Every food line (from the AI, the database, a label or typed) has an amount field ("Lượng", unit read from the name: g, ml, quả, bát…). Changing it works out calories, protein, purine, salt and sugar again in proportion, offline. A figure typed by hand still wins, and the next amount change starts from it.
- History / Journal: a meal saved as one food now shows its detail too (total kcal on top, the food below with the pencil to change its amount); editing it rescales the food's name and figures.
- Skipping a meal: "Không ăn <bữa>" on the add-food screen (after choosing breakfast, lunch or dinner), and "Bữa chưa ghi: Không ăn …" chips in History's day table for main meals with nothing logged, so a skipped meal is not counted as one missing by mistake.

## 0.5.5
_Số cũ: 0.19_
- Quick add (+): a "Ghi cho ngày" row with ‹ › picks the day (today back to 30 days ago, never the future). Meals, off-plan food (including "Nhập bằng chữ" opened from there) and water go to that day; the screens show "Đang ghi cho: …" and the add button names the day. Weight, check-in and workouts still log for today.
- Off-plan food: the photo box and the "more photos" box are one list (up to 3 photos, the first is the main one) with one pair of "Chụp ảnh" / "Chọn ảnh" buttons, and "Hỏi AI" / "Đọc nhãn" sit side by side under it instead of two more full-width buttons.

## 0.5.4
_Số cũ: 0.18_
- Recipe dialog: "Xóa khỏi cook book" is now a red delete button; pressing it closes the dialog (before, it stayed open and showed "Lưu vào cook book" again) and a message confirms "Đã xóa "…" khỏi cook book." on the Cook book screen and under the meal ideas.

## 0.5.3
_Số cũ: 0.17_
- Meal ideas: "Nhờ AI gợi ý" and "Gợi ý từ cookbook" no longer both show a spinner. Only the button pressed shows it is working; the other one is greyed out until the answer comes (both replace the same 3 dishes, so one request runs at a time).

## 0.5.2
_Số cũ: 0.16_
- History > Nhật ký hằng ngày: every meal already logged on a day (an off-plan food, or a plan meal marked eaten) has a camera button in the day's table. It opens the meal's photos: add up to 3 (camera or library), view them side by side with ‹ ›, or remove the one in view. Photos are saved straight away (no need to press "Lưu"). A plan meal's photo now also shows as a thumbnail in its row.

## 0.5.1
_Số cũ: 0.15_
- A meal keeps all its photos (up to 3), not just the first: the extra photos chosen in "Món ngoài kế hoạch", "Nhập bằng chữ" or a meal's photo box are saved and synced with it, and come back on another device.
- Battle log (Nhật ký) and History show one thumbnail per meal with a badge giving the number of photos; tapping it shows the photos side by side, with ‹ › and "2/3".
- The meal detail shows its photos in the same row: add another one (up to 3) or remove the one in view.

## 0.5.0
_Số cũ: 0.14_
- One meal can be analysed from several photos: with a photo chosen in "Món ngoài kế hoạch" or in a meal's photo box, "Thêm ảnh cho AI" adds up to 2 more photos of the same meal (another angle, another dish, the receipt or label). The AI reads them all together as one meal and counts a dish seen twice only once. Only the first photo is kept with the food.
- Server: analyze-proof-photo accepts the extra photos; the photo check is shared with parse-meal-text.

## 0.4.0
_Số cũ: 0.13_
- Meal ideas ("Gợi ý món khác"): each request returns 3 dishes and replaces the ones on screen; the replaced dishes go into a cookbook shared by all users. New "Gợi ý từ cookbook" (and a search box) suggests 3 fitting dishes from that cookbook without calling the AI. At most 3 dishes are listed per meal, under one header that folds or opens the whole list. Suggestions still survive a page reload.
- The daily limit for meal ideas is read from the database (`app_settings`, key `ai_quota.dinner`, now 30 a day); any AI feature's limit can be set the same way.
- Workout: the spoken coach can use Vietnamese or English (independent of the app language) and a female or male voice; when the device has no voice of that gender the pitch is shifted.
- History > Nhật ký hằng ngày: switch between a list grouped by month (fold/open each month) and a calendar (‹ ›, month/year picker) that shows each day's kcal deficit; tapping a day opens its detail.
- Món ngoài kế hoạch: type only the name (e.g. "2 quả trứng gà") and "+ Thêm vào hôm nay" looks it up in the food database and adds it with the database figures (noted under the form). Several foods or an unknown food give a message and a button to "Nhập bằng chữ" with the text filled in.
- Nhập bằng chữ: attach up to 3 photos (camera or library) that go to the AI with the description; photos alone also work.
- Needs `supabase/schema.sql` run again (tables `app_settings` and `cookbook_recipes`) and the AI functions redeployed (shared limit check changed; parse-meal-text and suggest-dinner changed).

## 0.3.1
_Số cũ: 0.12_
- Analysis > Tuần/tháng: every week card has "Phân tích lại", which brings in the latest data from the cloud and works the week out again (it says when, or that only the device's data was used).
- Every week card lists the days that lack a main meal and which one ("06/10: thiếu sáng, tối"), and the days with nothing logged. A "Không ăn …" button records that meal as not eaten (a 0 kcal "Không ăn" item, synced, removable in the Journal), so the day counts as fully logged.
- Analysis > Nhận xét: each day shows its whole-day sodium, purine and sugar against the daily limits (within or over by how much). A meal warning now says it is about that meal alone and what share of the day's limit it used (e.g. "Natri riêng bữa này 1.600 mg = 80% trần cả ngày (2.000 mg)"). Comments are worked out again as soon as a food of the day is edited.

## 0.3.0
_Số cũ: 0.11_
- Sync: the cloud is now the only source of truth for the diary (food, water, weigh-ins, workouts, check-ins, habits and ticks, uric acid). Opening the app makes the device match the cloud; a record only the device has, with nothing waiting to be sent, is removed (this is what brought back old days such as 14/09 and foods already deleted on 26/10).
- A change that could not be sent waits in the queue once per record, and is sent as the record is at that moment, never an older copy, so it can no longer undo a later change (this is what lost the water of 27/10). Food days queued under the old rules are dropped once.
- Deleting a weigh-in, a workout or a check-in now deletes it in the cloud too (before it only left the device and could come back).
- Check-ins (Nhật ký cảm giác) come back from the cloud after a sign-out or on another device; check-ins this device has that the cloud never got are sent up once.
- Web: the app's data is kept in IndexedDB instead of localStorage (about 5 MB, which meal photos filled up so saves failed silently and a reload showed an old copy); existing data is moved over on first open, and localStorage is still used when a browser will not open IndexedDB.
- Needs `supabase/schema.sql` run again (check-ins get an id of the device: `feeling_records.client_id`).

## 0.2.7
_Số cũ: 0.10_
- AI & cost: the list by user is split by model too: under each user, one line per model they used that day (calls, tokens, the cost recorded at the time).
- Needs `supabase/schema.sql` run again (new function `ai_admin_by_user_model`); until then the user rows show without the split.

## 0.2.6
_Số cũ: 0.09_
- AI & cost: the day and user lists keep the cost recorded when each call was made, with that call's model and price. Picking another model (or price) above only changes the estimate for one user and the calls made after saving; history is no longer worked out again.
- The 14-day list is split by model: a total per model over the 14 days and, under each day, one line per model (calls, tokens, cost).
- Needs `supabase/schema.sql` run again (usage is now kept per model; older rows count as the model they were made with, Sonnet if unknown) and every AI function redeployed (they share the quota count).

## 0.2.5
_Số cũ: 0.08_
- Meal ideas: the AI's answer for a meal is kept (per day and meal), so reloading the page does not ask again and spend tokens; an idea that no longer fits what is left is hidden, not re-asked.
- Tap "Xem công thức" on an idea: a dialog with ingredients, difficulty, time, tools, the steps (each with an icon), the nutrition against what is left for the meal, your star rating and a photo of the dish you made. A dish without a recipe can have one written once by the AI.
- Cook book: every AI idea is saved (also synced to the cloud), reusable from the meal card (dishes that fit are offered without the AI) and from a Cook book screen (Profile or the meal card). "Gợi ý món khác" asks the AI for new dishes that are not in the cook book.
- Needs the `suggest-dinner` and `generate-meal-recipe` functions redeployed for the AI to send the full recipe and to write the recipe of a named dish.

## 0.2.4
_Số cũ: 0.07_
- Fix: a day could hold two foods under the same id (seen on 26/10), so deleting or editing one changed both and the day table got stuck. Every food now gets its own id, and days already saved that way are repaired on opening (device and cloud).

## 0.2.3
_Số cũ: 0.06_
- AI & cost: while choosing a model (or editing the prices) the model card shows the estimate for one user: tokens per day, cost per day and per average month (30 days), from the real use of recent days. The day and user lists below are worked out again at the chosen model's prices. Tapping a preset fills in a reference price.

## 0.2.2
_Số cũ: 0.05_
- Journal: photos that were submitted from the web before 0.03 (and showed as empty after a reload) are brought back from the cloud; a dead local link no longer hides the cloud copy.
- Tap any small food photo to see it larger; History: "N ảnh minh chứng" is now an underlined link that opens that day's photos.
- History: the day table has "Thêm món" and "Khôi phục bữa đã xoá", so a day emptied of everything can be filled again (deleting down to the last food no longer leaves nothing to edit).
- Version number in Profile and this file.

## 0.2.1
_Số cũ: 0.04_
- Deleting every food of a day now clears its calories (and saves that to the cloud); a leftover total with no foods can be removed from the diary table.
- Every food of a logged meal can be edited (amount, calories, protein, purine, salt, sugar) in the Journal dialog and the History table; changing the amount works the rest out again, offline.
- Opening the app: when every edit of this device has reached the cloud, a different cloud version of a day's food replaces the stale local copy.
- Photos kept inline on the web are stored once, smaller (720 px), so the browser's storage does not fill up.

## 0.2.0
_Số cũ: 0.03_
- Journal: small photo on each logged meal; add, replace or remove a meal's photo from its dialog; edit the amount of a food and the calories follow.
- Photos sync to the cloud reliably (no duplicates, unreadable files dropped, local date) and come back on a new device; deleting a photo deletes it in the cloud too.
- Drag the week strip sideways to change week.

## 0.1.1
_Số cũ: 0.02_
- Meal ideas: at most 600 kcal per meal, a day band of target−200 to target, wanted kcal and protein per meal (±10%) and a "never above" switch.

## 0.1.0
_Số cũ: 0.01_
- Journal: tap a logged meal for a detail dialog with its photo; the day strip shows the real deficit.
- Typed meals use the food database first and send only unknown foods to the AI; each food of an AI meal is added to the food database.
