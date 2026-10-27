# Release notes — FitJourney

Version numbers are `A.BC`, counting up from 0.01 (0.99 is followed by 1.00). The current number is `APP_VERSION` in `src/utils/buildInfo.ts` and is shown in
Profile ("Phiên bản"). Every release adds an entry here, newest first, and bumps `APP_VERSION` to match (a test checks they agree).

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
