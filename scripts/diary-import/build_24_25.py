#!/usr/bin/env python3
"""Builds the import files for the two diary days that were missing (24/10 and 25/10/2026) from Input/Nhat_ky_24-25_10.md.

    SEED_EMAIL=you@example.com python3 scripts/diary-import/build_24_25.py Input/generated

Writes (into the folder given):
  diary-import-24-25-10.json  open in the app: Profile > Import diary (the app saves it on the device and syncs it to the cloud)
  seed-24-25-10.sql           the same data for Supabase > SQL Editor (an alternative; use one of the two)

It adds only what is missing and touches nothing else: two days of food (one entry per meal, the sheet's meal totals, the
day's own meal times), and the weigh-in of 26/10 (25/10 is already in the diary). No water, habits, notes, profile or uric
data. A day that already holds food logged in the app is left exactly as it is. Output holds personal health data: keep it
out of git (Input/generated is in .git/info/exclude).
"""
import json
import os
import sys
from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime, timedelta, timezone

EMAIL = os.environ.get('SEED_EMAIL', 'user@example.com')
VN = timezone(timedelta(hours=7))

# Sodium (mg) x 2.5 = salt (mg), as the rest of the diary import does.
def salt_g(sodium_mg):
    return float((Decimal(sodium_mg) * Decimal('2.5') / 1000).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

# Meal totals come from the md's "Từng bữa" tables (24/10 already reduced by 20%). Times: the meal's own clock time (VN).
# `junk` marks the meals the sheet itself calls flexible (80/20 "Linh hoạt"); the plan-conform meals are not flagged.
MEALS = [
    ('2026-10-24', 1, 'morning_snack', (10, 0), False, 440, 20.0, 120, 14, 1360,
     'Nem nướng cuốn 288g (3 cuốn, kèm nem giòn, bánh phở, rau, xoài) + sốt chấm 24g, rau muối'),
    ('2026-10-24', 2, 'lunch', (12, 0), False, 436, 40.0, 232, 13, 964,
     'Cà phê đen ít đường 100ml; gà rán Jollibee bỏ da 136g (má đùi + tỏi đùi); mỳ Ý sốt thịt băm 72g'),
    ('2026-10-24', 3, 'dinner', (19, 0), True, 1004, 41.0, 304, 0, 2084,
     'Cháo lòng 480g; quẩy 60g (4 cái nhỏ); lòng già 56g + dồi tiết 40g + lợn mán rang 64g; xoài 96g + dưa hấu 200g'),
    ('2026-10-25', 1, 'lunch', (12, 0), True, 981, 57.0, 342, 0, 1460,
     'Tóp mỡ 15g; gà bỏ da 160g (4 miếng đùi, ức); khoai sọ nấu canh 150g; miến nấu 500g (2 bát con); bia 165ml (1/2 lon 333); roi 200g (2 quả)'),
    ('2026-10-25', 2, 'dinner', (19, 0), False, 833, 41.0, 215, 31, 550,
     'Cơm trắng 150g (1 nắm); lợn rừng rán nạc 100g; nước mắm 3g; sữa chua không đường 200g; táo 150g; bánh su kem 25g (1 cái); nước lê ép không đường 250ml'),
]
DAY_TOTALS = {'2026-10-24': (1880, 101.0, 656, 27, 4408), '2026-10-25': (1814, 98.0, 557, 31, 2010)}
# 26/10 weigh-in ("Sau ăn sáng"); the one of 25/10 is already in the diary (id diary-w-20261025-1).
WEIGHT = {'id': 'diary-w-20261026-1', 'date': '2026-10-26', 'kg': 105.0, 'note': 'Cân sau ăn sáng 26/10'}


def utc_iso(date, hm):
    y, m, d = map(int, date.split('-'))
    t = datetime(y, m, d, hm[0], hm[1], tzinfo=VN).astimezone(timezone.utc)
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def build():
    days = {}
    for date, n, meal, hm, junk, kcal, protein, purine, sugar, sodium, name in MEALS:
        item = {
            'id': f"diary-{date.replace('-', '')}-{n}",
            'name': name,
            'calories': kcal,
            'proteinG': protein,
            'loggedAtISO': utc_iso(date, hm),
            'mealTime': meal,
            'purineMg': purine,
            'saltG': salt_g(sodium),
            'sugarG': sugar,
        }
        if junk:
            item['junk'] = True
        days.setdefault(date, []).append(item)
    # The sheet's own day totals must equal the sum of the meals, or the sheet was read wrongly.
    for date, items in days.items():
        kcal, protein, purine, sugar, sodium = DAY_TOTALS[date]
        assert sum(i['calories'] for i in items) == kcal, date
        assert abs(sum(i['proteinG'] for i in items) - protein) < 0.01, date
        assert sum(i['purineMg'] for i in items) == purine, date
        assert sum(i['sugarG'] for i in items) == sugar, date
    return days


def to_json(days):
    return {
        'format': 'fitjourney-diary',
        'version': 1,
        'weights': [{'id': WEIGHT['id'], 'dateISO': utc_iso(WEIGHT['date'], (12, 0)), 'weightKg': WEIGHT['kg'], 'note': WEIGHT['note']}],
        'nutrition': [{'dateISO': date, 'items': items} for date, items in days.items()],
        'workouts': [],
    }


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def to_sql(days):
    out = [
        f'-- Dữ liệu còn thiếu của 24/10 và 25/10/2026 cho {EMAIL} (tạo bởi scripts/diary-import/build_24_25.py).',
        '-- Chạy trong Supabase > SQL Editor. Chỉ BỔ SUNG, không đụng dữ liệu hiện có:',
        '--   * ngày chưa có món ăn nào: ghi các bữa (và đánh dấu 3 bữa kế hoạch là không ăn theo kế hoạch, như các ngày khác của nhật ký); số nước, bữa tích sẵn giữ nguyên;',
        '--   * ngày đã có món ăn (nhập trong app): giữ nguyên hoàn toàn;',
        '--   * cân nặng 26/10: chỉ thêm nếu ngày đó chưa có lần cân nào.',
        '-- Chạy lại được, kết quả như lần đầu.',
        'do $seed$',
        'declare',
        '  uid uuid;',
        'begin',
        f'  select id into uid from auth.users where lower(email) = lower({q(EMAIL)});',
        f"  if uid is null then raise exception 'Chưa có tài khoản %. Hãy đăng ký/đăng nhập app bằng email này trước.', {q(EMAIL)}; end if;",
        '',
    ]
    for date, items in days.items():
        kcal = sum(i['calories'] for i in items)
        protein = round(sum(i['proteinG'] for i in items), 1)
        out.append(f'  -- {date}')
        out.append(
            f"  insert into public.nutrition_logs (user_id, entry_date, meals_eaten, extra_calories, extra_protein_g, extra_items, water_ml, removed_meal_slots) values "
            f"(uid, {q(date)}, '{{}}'::jsonb, {kcal}, {protein}, {q(json.dumps(items, ensure_ascii=False))}::jsonb, 0, '[\"meal1\",\"meal2\",\"meal3\"]'::jsonb) "
            f"on conflict (user_id, entry_date) do update set extra_calories = excluded.extra_calories, extra_protein_g = excluded.extra_protein_g, "
            f"extra_items = excluded.extra_items, removed_meal_slots = excluded.removed_meal_slots, updated_at = now() "
            f"where coalesce(jsonb_array_length(public.nutrition_logs.extra_items), 0) = 0 and public.nutrition_logs.extra_calories = 0;"
        )
    iso = utc_iso(WEIGHT['date'], (12, 0))
    out += [
        '',
        f"  -- Cân nặng {WEIGHT['date']}: thêm nếu ngày này chưa có lần cân nào.",
        f"  insert into public.weight_entries (user_id, client_id, entry_date, logged_at, weight_kg, note) "
        f"select uid, {q(WEIGHT['id'])}, date {q(WEIGHT['date'])}, {q(iso)}::timestamptz, {WEIGHT['kg']}::numeric, {q(WEIGHT['note'])} "
        f"where not exists (select 1 from public.weight_entries where user_id = uid and entry_date = date {q(WEIGHT['date'])}) "
        f"on conflict (user_id, client_id) do nothing;",
        'end',
        '$seed$;',
        '',
    ]
    return '\n'.join(out)


if __name__ == '__main__':
    dest = sys.argv[1]
    days = build()
    with open(f'{dest}/diary-import-24-25-10.json', 'w') as f:
        json.dump(to_json(days), f, ensure_ascii=False, indent=1)
    with open(f'{dest}/seed-24-25-10.sql', 'w') as f:
        f.write(to_sql(days))
    print(f"days={len(days)} items={sum(len(v) for v in days.values())} -> {dest}")
