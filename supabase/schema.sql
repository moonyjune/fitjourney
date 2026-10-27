-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor > New query > Run.
-- An toàn để chạy lại nhiều lần (dùng "if not exists" / "or replace").

-- 1. Bảng hồ sơ người dùng (1 dòng / user, tạo tự động khi đăng ký).
-- coach_id để trống ở giai đoạn 1 (single-user); dùng cho giai đoạn 2 (Coach/Client).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'client' check (role in ('coach', 'client')),
  coach_id uuid references public.profiles (id) on delete set null,
  coach_code text unique,
  display_name text,
  start_weight_kg numeric,
  goal_weight_kg numeric,
  height_cm numeric,
  age integer,
  gender text check (gender in ('male', 'female')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  calorie_target_kcal numeric,
  target_daily_deficit_kcal numeric,
  protein_target_g numeric,
  water_target_ml numeric,
  start_date date,
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nâng cấp cho project đã chạy schema từ trước khi có Coach/Client (an toàn nếu cột đã tồn tại).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists coach_code text unique;
alter table public.profiles add column if not exists age integer;
alter table public.profiles add column if not exists gender text check (gender in ('male', 'female'));
alter table public.profiles add column if not exists activity_level text
  check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active'));
alter table public.profiles add column if not exists target_daily_deficit_kcal numeric;

-- 2. Lịch sử cân nặng.
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  weight_kg numeric not null,
  note text,
  created_at timestamptz not null default now()
);

-- 3. Nhật ký dinh dưỡng theo ngày (1 dòng / user / ngày).
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  meals_eaten jsonb not null default '{}'::jsonb,
  extra_calories numeric not null default 0,
  extra_protein_g numeric not null default 0,
  extra_items jsonb not null default '[]'::jsonb,
  water_ml numeric not null default 0,
  removed_meal_slots jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);
alter table public.nutrition_logs add column if not exists extra_items jsonb not null default '[]'::jsonb;
alter table public.nutrition_logs add column if not exists removed_meal_slots jsonb not null default '[]'::jsonb;

-- 4. Buổi tập đã ghi nhận.
create table if not exists public.workout_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  template_id text,
  label text not null,
  duration_min numeric not null,
  calories_burned numeric not null,
  created_at timestamptz not null default now(),
  -- The client-generated WorkoutLogEntry.id (a timestamp string, not a uuid). Lets pushWorkoutEntry
  -- upsert (e.g. after an AI photo analysis refines calories_burned) instead of only ever inserting.
  client_id text
);
alter table public.workout_entries add column if not exists client_id text;
create unique index if not exists workout_entries_user_client_id_key on public.workout_entries (user_id, client_id);

-- 5. Ảnh minh chứng (file ảnh lưu trong Storage bucket "proofs", bảng này lưu metadata).
create table if not exists public.proof_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  task_type text not null check (task_type in ('meal', 'workout')),
  task_ref_id text not null,
  photo_path text not null,
  note text,
  created_at timestamptz not null default now()
);

-- 6. Kế hoạch (thực đơn, bài tập, danh sách đi chợ) của user, có thể chỉnh qua AI hoặc thủ công.
-- Lưu dạng 1 JSON document / user để dễ round-trip qua prompt AI (xem PlanData trong src/types).
create table if not exists public.plans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan_json jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lịch sử các lần cập nhật kế hoạch qua AI (phục vụ audit / xem lại đề xuất cũ).
create table if not exists public.plan_update_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  instruction text not null,
  proposed_plan_json jsonb not null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

-- 7. Nhận xét/đánh giá định kỳ (tuần/tháng) của Coach dành cho từng Client.
create table if not exists public.coach_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade, -- Client được nhận xét
  coach_id uuid not null references public.profiles (id) on delete cascade,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_label text not null,
  feedback_text text not null,
  created_at timestamptz not null default now()
);

-- 8. Phiên chat với trợ lý AI cập nhật kế hoạch. "owner_id" là chủ nhân kế hoạch đang được bàn
-- (luôn là Client); "actor_id" là người đang chat (chính họ, hoặc Coach của họ). Lưu lại để:
--   (a) tiếp tục hội thoại cũ thay vì mất trắng khi thoát app,
--   (b) tránh gọi lại AI cho câu hỏi đã hỏi/trả lời y hệt trong cùng phiên (đỡ tốn token).
create table if not exists public.plan_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Cuộc trò chuyện mới',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.plan_chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  proposed_plan_json jsonb,
  created_at timestamptz not null default now()
);

-- 8b. Thói quen theo dõi hằng ngày (danh sách thói quen + tích ✔/✘ mỗi ngày). client_id là id do app sinh ra,
-- nên đẩy lên bằng upsert (chạy lại không nhân đôi). Xoá một thói quen = archived (giữ lịch sử đã tích).
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null,
  name text not null,
  status text not null default 'building' check (status in ('formed', 'building', 'todo')),
  assessment text not null default '',
  kaizen text not null default '',
  measured_by text not null default '',
  tracked boolean not null default true,
  auto text check (auto in ('water', 'weigh', 'walk')),
  sort integer not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_client_id text not null,
  entry_date date not null,
  value text not null check (value in ('done', 'missed')),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_client_id, entry_date)
);

-- 8c. Kết quả xét nghiệm axit uric (µmol/L). client_id là id do app sinh ra nên đẩy lên bằng upsert (chạy lại không nhân đôi).
create table if not exists public.uric_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null,
  entry_date date not null,
  value_umol numeric not null check (value_umol > 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

-- 8d. Mỗi lần cân có client_id (id do app sinh) + giờ cân thật, để đẩy bằng upsert (nhập lại không nhân đôi) và khôi phục đúng giờ khi đăng nhập lại.
alter table public.weight_entries add column if not exists client_id text;
alter table public.weight_entries add column if not exists logged_at timestamptz;
create unique index if not exists weight_entries_user_client_id_key on public.weight_entries (user_id, client_id);

-- 8e. Cài đặt riêng của user (ghi chú Kiến thức, mục tiêu axit uric, món ăn tự thêm, giới hạn purine/muối/đường): mỗi khóa một dòng JSON.
create table if not exists public.user_data (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 7. Feeling record: điểm cảm giác thèm ăn/đói/tâm trạng/tình trạng tập luyện tại 1 thời điểm.
-- Dùng làm input để AI gợi ý điều chỉnh thực đơn/lịch tập hàng tuần (xem weekly_suggestions).
create table if not exists public.feeling_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  craving_level smallint not null check (craving_level between 1 and 5),
  hunger_level smallint not null check (hunger_level between 1 and 5),
  mood text not null check (mood in ('great', 'good', 'neutral', 'stressed', 'tired')),
  workout_condition text check (workout_condition in ('energetic', 'normal', 'tired', 'sore', 'skipped')),
  note text,
  created_at timestamptz not null default now()
);

-- Cached AI weekly suggestion so re-opening the screen doesn't re-spend a Claude call.
create table if not exists public.weekly_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_key date not null,
  suggestion_text text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_key)
);

-- AI-suggested alternative dish per meal slot ("tuỳ biến món ăn"), matching the plan's calorie/
-- protein target for that slot but a different dish — cached so re-opening Nutrition shows the
-- same suggestion until the user taps refresh (which overwrites this row, one per user+slot).
-- Keyed by day_type too since meal1/meal2/meal3 differ between training and rest days.
create table if not exists public.meal_recipe_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_type text not null check (day_type in ('training', 'rest')),
  meal_slot text not null check (meal_slot in ('meal1', 'meal2', 'meal3')),
  dish_name text not null,
  emoji text not null default '🍽️',
  duration_minutes integer not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  calories_kcal numeric not null,
  protein_g numeric not null,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, day_type, meal_slot)
);

-- Món gợi ý: dụng cụ cần dùng và lý do hợp khẩu vị (thêm sau, an toàn nếu đã tồn tại).
alter table public.meal_recipe_suggestions add column if not exists equipment jsonb not null default '[]'::jsonb;
alter table public.meal_recipe_suggestions add column if not exists taste_note text;

-- Tự động tạo profile khi có user đăng ký mới.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, start_date)
  values (new.id, new.email, current_date)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Mã Coach gắn với tài khoản: đã có thì không được đổi hay xoá (chỉ được tạo lần đầu khi đang trống).
-- Tính duy nhất do ràng buộc unique của cột coach_code đảm bảo.
create or replace function public.keep_coach_code()
returns trigger
language plpgsql
as $$
begin
  if old.coach_code is not null and new.coach_code is distinct from old.coach_code then
    raise exception 'Mã Coach không thể thay đổi.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_coach_code on public.profiles;
create trigger profiles_keep_coach_code
  before update on public.profiles
  for each row execute procedure public.keep_coach_code();

-- Kiểm tra "user hiện tại có phải Coach của target_user_id không" — chạy với quyền definer để
-- tránh đệ quy RLS khi được dùng bên trong policy của chính bảng profiles.
create or replace function public.is_coach_of(target_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id and p.coach_id = auth.uid()
  );
$$;

-- Client dùng mã của Coach để liên kết tài khoản (1 Coach - nhiều Client).
create or replace function public.link_to_coach(p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_coach_id uuid;
  v_current uuid;
begin
  select id into v_coach_id from public.profiles where coach_code = p_code and role = 'coach';
  if v_coach_id is null then
    raise exception 'Mã Coach không hợp lệ.';
  end if;
  if v_coach_id = auth.uid() then
    raise exception 'Không thể tự liên kết với chính mình.';
  end if;
  select coach_id into v_current from public.profiles where id = auth.uid();
  if v_current = v_coach_id then
    return; -- đã liên kết đúng Coach này
  end if;
  if v_current is not null then
    raise exception 'Bạn đã liên kết với một Coach. Hãy gỡ liên kết hiện tại trước khi liên kết Coach khác.';
  end if;
  update public.profiles set coach_id = v_coach_id, updated_at = now() where id = auth.uid();
end;
$$;

grant execute on function public.link_to_coach(text) to authenticated;

-- Lịch sử liên kết Học viên - Coach. Mỗi lần liên kết là 1 dòng (kèm email và mã Coach tại thời điểm đó), dòng đang hiệu lực
-- có unlinked_at rỗng. 1 Học viên chỉ có 1 dòng đang hiệu lực; các dòng cũ giữ lại làm lịch sử qua nhiều giai đoạn huấn luyện.
-- Chỉ trigger bên dưới được ghi bảng này (không có policy insert/update/delete cho client).
create table if not exists public.coach_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  coach_email text,
  coach_code text,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz
);
create unique index if not exists coach_links_one_active on public.coach_links (client_id) where unlinked_at is null;
create index if not exists coach_links_coach_idx on public.coach_links (coach_id, linked_at desc);

-- 1 Học viên chỉ liên kết 1 Coach: đã có Coach thì không được chuyển thẳng sang Coach khác (phải gỡ liên kết trước).
create or replace function public.keep_one_coach()
returns trigger
language plpgsql
as $$
begin
  if old.coach_id is not null and new.coach_id is not null and new.coach_id is distinct from old.coach_id then
    raise exception 'Bạn đã liên kết với một Coach. Hãy gỡ liên kết hiện tại trước khi liên kết Coach khác.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_one_coach on public.profiles;
create trigger profiles_keep_one_coach
  before update of coach_id on public.profiles
  for each row execute procedure public.keep_one_coach();

-- Ghi lịch sử mỗi khi coach_id đổi (kể cả khi bị xoá trực tiếp bằng SQL): đóng dòng cũ, mở dòng mới với email/mã Coach.
create or replace function public.record_coach_link()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.coach_id is not distinct from old.coach_id then
    return new;
  end if;
  update public.coach_links set unlinked_at = now() where client_id = new.id and unlinked_at is null;
  if new.coach_id is not null then
    insert into public.coach_links (client_id, coach_id, coach_email, coach_code)
    select new.id, c.id, c.email, c.coach_code from public.profiles c where c.id = new.coach_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_record_coach_link on public.profiles;
create trigger profiles_record_coach_link
  after update of coach_id on public.profiles
  for each row execute procedure public.record_coach_link();

-- Học viên đã liên kết từ trước khi có bảng này: tạo dòng đang hiệu lực cho họ (chạy lại không tạo trùng).
insert into public.coach_links (client_id, coach_id, coach_email, coach_code)
select p.id, c.id, c.email, c.coach_code
from public.profiles p
join public.profiles c on c.id = p.coach_id
where not exists (select 1 from public.coach_links l where l.client_id = p.id and l.unlinked_at is null);

-- AI: số lượt, token và chi phí ước tính theo người dùng / ngày / tính năng (chỉ Edge Function ghi, bằng service role).
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  feature text not null,
  calls integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric not null default 0,
  primary key (user_id, day, feature)
);

alter table public.ai_usage add column if not exists last_model text;

-- Mỗi model một dòng riêng: chi phí đã ghi giữ nguyên theo model và giá lúc gọi; đổi model chỉ ảnh hưởng các lượt gọi sau.
-- Dòng cũ (trước khi có cột này) lấy last_model, nếu không có thì là model mặc định lúc đó (claude-sonnet-5-5).
alter table public.ai_usage add column if not exists model text not null default '';
update public.ai_usage set model = coalesce(nullif(last_model, ''), 'claude-sonnet-5-5') where model = '';
do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.ai_usage'::regclass and i.indisprimary and a.attname = 'model'
  ) then
    alter table public.ai_usage drop constraint if exists ai_usage_pkey;
    alter table public.ai_usage add primary key (user_id, day, feature, model);
  end if;
end;
$$;

-- Hàm cũ (không có model) được thay bằng bản có model.
drop function if exists public.ai_usage_bump(uuid, date, text, bigint, bigint, numeric);
create or replace function public.ai_usage_bump(p_user uuid, p_day date, p_feature text, p_in bigint, p_out bigint, p_cost numeric, p_model text)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.ai_usage (user_id, day, feature, model, calls, tokens_in, tokens_out, cost_usd, last_model)
  values (p_user, p_day, p_feature, coalesce(nullif(p_model, ''), 'claude-sonnet-5-5'), 1, p_in, p_out, p_cost, p_model)
  on conflict (user_id, day, feature, model) do update
    set calls = public.ai_usage.calls + 1,
        tokens_in = public.ai_usage.tokens_in + excluded.tokens_in,
        tokens_out = public.ai_usage.tokens_out + excluded.tokens_out,
        cost_usd = public.ai_usage.cost_usd + excluded.cost_usd,
        last_model = excluded.last_model;
$$;
revoke all on function public.ai_usage_bump(uuid, date, text, bigint, bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.ai_usage_bump(uuid, date, text, bigint, bigint, numeric, text) to service_role;

-- Tổng chi phí ước tính của tất cả người dùng trong một ngày (dùng cho trần ngân sách toàn hệ thống).
create or replace function public.ai_cost_on_day(p_day date)
returns numeric
language sql
security definer set search_path = public
stable
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_usage where day = p_day;
$$;
revoke all on function public.ai_cost_on_day(date) from public, anon, authenticated;
grant execute on function public.ai_cost_on_day(date) to service_role;

-- Báo cáo cho chủ ứng dụng (xem trong Supabase SQL Editor, không mở cho người dùng): theo ngày và theo người/ngày.
create or replace view public.ai_cost_by_day as
  select day,
         count(distinct user_id) as users,
         sum(calls) as calls,
         sum(tokens_in) as tokens_in,
         sum(tokens_out) as tokens_out,
         round(sum(cost_usd), 4) as cost_usd
  from public.ai_usage
  group by day
  order by day desc;

create or replace view public.ai_cost_by_user_day as
  select u.day,
         u.user_id,
         p.email,
         sum(u.calls) as calls,
         sum(u.tokens_in) as tokens_in,
         sum(u.tokens_out) as tokens_out,
         round(sum(u.cost_usd), 4) as cost_usd
  from public.ai_usage u
  left join public.profiles p on p.id = u.user_id
  group by u.day, u.user_id, p.email
  order by u.day desc, cost_usd desc;

drop view if exists public.ai_cost_by_feature_day;
create view public.ai_cost_by_feature_day as
  select day, feature, model,
         sum(calls) as calls,
         sum(tokens_in) as tokens_in,
         sum(tokens_out) as tokens_out,
         round(sum(cost_usd), 4) as cost_usd
  from public.ai_usage
  group by day, feature, model
  order by day desc, cost_usd desc;

revoke all on public.ai_cost_by_day, public.ai_cost_by_user_day, public.ai_cost_by_feature_day from public, anon, authenticated;
grant select on public.ai_cost_by_day, public.ai_cost_by_user_day, public.ai_cost_by_feature_day to service_role;

-- Danh sách tài khoản được xem màn "AI & chi phí" (toàn ứng dụng). Không có policy nào: chỉ các hàm bên dưới đọc bảng này.
-- Thêm tài khoản bằng SQL riêng, KHÔNG ghi email vào file này:  insert into public.ai_admins (email) values ('ten@example.com');
create table if not exists public.ai_admins (
  email text primary key
);
alter table public.ai_admins enable row level security;
revoke all on public.ai_admins from public, anon, authenticated;

create or replace function public.is_ai_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.ai_admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_ai_admin() from public, anon;
grant execute on function public.is_ai_admin() to authenticated;

-- Cài đặt AI do tài khoản trong ai_admins chọn trên màn "AI & chi phí": model (key 'model') và giá ước tính USD / 1 triệu token
-- (key 'price_in', 'price_out'). Edge Function đọc bằng service role (bỏ qua RLS); không client nào đọc/ghi trực tiếp.
create table if not exists public.ai_settings (
  key text primary key check (key in ('model', 'price_in', 'price_out')),
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
revoke all on public.ai_settings from public, anon, authenticated;

create or replace function public.ai_admin_get_settings()
returns table (key text, value text)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_ai_admin() then
    raise exception 'Không có quyền xem.';
  end if;
  return query select s.key, s.value from public.ai_settings s;
end;
$$;
revoke all on function public.ai_admin_get_settings() from public, anon;
grant execute on function public.ai_admin_get_settings() to authenticated;

-- Đặt một cài đặt. Model: chữ thường/số/dấu . - _ (3-60 ký tự). Giá: số từ 0 đến 1000. Giá trị rỗng = xoá (quay về cấu hình máy chủ).
create or replace function public.ai_admin_set_setting(p_key text, p_value text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if not public.is_ai_admin() then
    raise exception 'Không có quyền đổi.';
  end if;
  if p_key not in ('model', 'price_in', 'price_out') then
    raise exception 'Cài đặt không hợp lệ.';
  end if;
  if v = '' then
    delete from public.ai_settings where key = p_key;
    return;
  end if;
  if p_key = 'model' and v !~ '^[a-z0-9][a-z0-9._-]{2,59}$' then
    raise exception 'Tên model không hợp lệ.';
  end if;
  if p_key in ('price_in', 'price_out') and (v !~ '^[0-9]+(\.[0-9]+)?$' or v::numeric > 1000) then
    raise exception 'Giá không hợp lệ (số từ 0 đến 1000).';
  end if;
  insert into public.ai_settings (key, value, updated_at) values (p_key, v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.ai_admin_set_setting(text, text) from public, anon;
grant execute on function public.ai_admin_set_setting(text, text) to authenticated;

-- Tổng hợp toàn ứng dụng theo ngày (p_days ngày gần nhất tính đến p_today). Chỉ tài khoản trong ai_admins gọi được.
create or replace function public.ai_admin_by_day(p_today date, p_days integer default 14)
returns table (day date, users bigint, calls bigint, tokens_in bigint, tokens_out bigint, cost_usd numeric)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_ai_admin() then
    raise exception 'Không có quyền xem.';
  end if;
  return query
    select u.day, count(distinct u.user_id), sum(u.calls)::bigint, sum(u.tokens_in)::bigint, sum(u.tokens_out)::bigint, round(sum(u.cost_usd), 4)
    from public.ai_usage u
    where u.day > p_today - greatest(1, least(p_days, 90)) and u.day <= p_today
    group by u.day
    order by u.day desc;
end;
$$;
revoke all on function public.ai_admin_by_day(date, integer) from public, anon;
grant execute on function public.ai_admin_by_day(date, integer) to authenticated;

-- Như trên nhưng tách theo model: mỗi (ngày, model) một dòng, chi phí là chi phí đã ghi lúc gọi.
create or replace function public.ai_admin_by_day_model(p_today date, p_days integer default 14)
returns table (day date, model text, users bigint, calls bigint, tokens_in bigint, tokens_out bigint, cost_usd numeric)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_ai_admin() then
    raise exception 'Không có quyền xem.';
  end if;
  return query
    select u.day, u.model, count(distinct u.user_id), sum(u.calls)::bigint, sum(u.tokens_in)::bigint, sum(u.tokens_out)::bigint, round(sum(u.cost_usd), 4)
    from public.ai_usage u
    where u.day > p_today - greatest(1, least(p_days, 90)) and u.day <= p_today
    group by u.day, u.model
    order by u.day desc, sum(u.cost_usd) desc;
end;
$$;
revoke all on function public.ai_admin_by_day_model(date, integer) from public, anon;
grant execute on function public.ai_admin_by_day_model(date, integer) to authenticated;

-- Chi tiết theo người dùng của một ngày.
create or replace function public.ai_admin_by_user(p_day date)
returns table (user_id uuid, email text, calls bigint, tokens_in bigint, tokens_out bigint, cost_usd numeric)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_ai_admin() then
    raise exception 'Không có quyền xem.';
  end if;
  return query
    select u.user_id, p.email, sum(u.calls)::bigint, sum(u.tokens_in)::bigint, sum(u.tokens_out)::bigint, round(sum(u.cost_usd), 4)
    from public.ai_usage u
    left join public.profiles p on p.id = u.user_id
    where u.day = p_day
    group by u.user_id, p.email
    order by sum(u.cost_usd) desc
    limit 200;
end;
$$;
revoke all on function public.ai_admin_by_user(date) from public, anon;
grant execute on function public.ai_admin_by_user(date) to authenticated;

-- AI: báo cáo đã tạo (tổng kết tuần...). Edge Function ghi; người dùng chỉ đọc báo cáo của mình.
create table if not exists public.ai_reports (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  period_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, period_key)
);

-- Row Level Security: mỗi user chỉ đọc/ghi được dữ liệu của chính mình.
alter table public.profiles enable row level security;
alter table public.weight_entries enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.workout_entries enable row level security;
alter table public.proof_photos enable row level security;
alter table public.plans enable row level security;
alter table public.plan_update_requests enable row level security;
alter table public.coach_feedback enable row level security;
alter table public.plan_chat_sessions enable row level security;
alter table public.plan_chat_messages enable row level security;
alter table public.feeling_records enable row level security;
alter table public.weekly_suggestions enable row level security;
alter table public.meal_recipe_suggestions enable row level security;
alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;
alter table public.uric_readings enable row level security;
alter table public.user_data enable row level security;
alter table public.coach_links enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_reports enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_select_by_coach" on public.profiles;
create policy "profiles_select_by_coach" on public.profiles for select using (coach_id = auth.uid());

drop policy if exists "coach_links_select_own" on public.coach_links;
create policy "coach_links_select_own" on public.coach_links for select using (auth.uid() = client_id);
drop policy if exists "coach_links_select_by_coach" on public.coach_links;
create policy "coach_links_select_by_coach" on public.coach_links for select using (auth.uid() = coach_id);

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select using (auth.uid() = user_id);
drop policy if exists "ai_reports_select_own" on public.ai_reports;
create policy "ai_reports_select_own" on public.ai_reports for select using (auth.uid() = user_id);

drop policy if exists "weight_entries_all_own" on public.weight_entries;
create policy "weight_entries_all_own" on public.weight_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "weight_entries_select_by_coach" on public.weight_entries;
create policy "weight_entries_select_by_coach" on public.weight_entries for select
  using (public.is_coach_of(user_id));

drop policy if exists "nutrition_logs_all_own" on public.nutrition_logs;
create policy "nutrition_logs_all_own" on public.nutrition_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "nutrition_logs_select_by_coach" on public.nutrition_logs;
create policy "nutrition_logs_select_by_coach" on public.nutrition_logs for select
  using (public.is_coach_of(user_id));

drop policy if exists "workout_entries_all_own" on public.workout_entries;
create policy "workout_entries_all_own" on public.workout_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "workout_entries_select_by_coach" on public.workout_entries;
create policy "workout_entries_select_by_coach" on public.workout_entries for select
  using (public.is_coach_of(user_id));

drop policy if exists "proof_photos_all_own" on public.proof_photos;
create policy "proof_photos_all_own" on public.proof_photos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "proof_photos_select_by_coach" on public.proof_photos;
create policy "proof_photos_select_by_coach" on public.proof_photos for select
  using (public.is_coach_of(user_id));

drop policy if exists "feeling_records_all_own" on public.feeling_records;
create policy "feeling_records_all_own" on public.feeling_records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "feeling_records_select_by_coach" on public.feeling_records;
create policy "feeling_records_select_by_coach" on public.feeling_records for select
  using (public.is_coach_of(user_id));

drop policy if exists "habits_all_own" on public.habits;
create policy "habits_all_own" on public.habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "habits_select_by_coach" on public.habits;
create policy "habits_select_by_coach" on public.habits for select
  using (public.is_coach_of(user_id));

drop policy if exists "habit_checks_all_own" on public.habit_checks;
create policy "habit_checks_all_own" on public.habit_checks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "habit_checks_select_by_coach" on public.habit_checks;
create policy "habit_checks_select_by_coach" on public.habit_checks for select
  using (public.is_coach_of(user_id));

drop policy if exists "uric_readings_all_own" on public.uric_readings;
create policy "uric_readings_all_own" on public.uric_readings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "uric_readings_select_by_coach" on public.uric_readings;
create policy "uric_readings_select_by_coach" on public.uric_readings for select
  using (public.is_coach_of(user_id));

drop policy if exists "weekly_suggestions_all_own" on public.weekly_suggestions;
create policy "weekly_suggestions_all_own" on public.weekly_suggestions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meal_recipe_suggestions_all_own" on public.meal_recipe_suggestions;
create policy "meal_recipe_suggestions_all_own" on public.meal_recipe_suggestions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Plans: Coach có thể xem VÀ sửa kế hoạch của Client (đây là cơ chế "Coach cập nhật menu/lịch tập").
drop policy if exists "plans_all_own" on public.plans;
create policy "plans_all_own" on public.plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "plans_all_by_coach" on public.plans;
create policy "plans_all_by_coach" on public.plans for all
  using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id));

drop policy if exists "plan_update_requests_all_own" on public.plan_update_requests;
create policy "plan_update_requests_all_own" on public.plan_update_requests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "plan_update_requests_all_by_coach" on public.plan_update_requests;
create policy "plan_update_requests_all_by_coach" on public.plan_update_requests for all
  using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id));

drop policy if exists "coach_feedback_select_own" on public.coach_feedback;
create policy "coach_feedback_select_own" on public.coach_feedback for select using (auth.uid() = user_id);
drop policy if exists "coach_feedback_all_by_coach" on public.coach_feedback;
create policy "coach_feedback_all_by_coach" on public.coach_feedback for all
  using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id) and coach_id = auth.uid());

-- Phiên chat & tin nhắn: riêng tư cho người đang chat (actor_id) — Coach có phiên chat riêng với
-- AI về từng Client, Client không cần thấy quá trình soạn thảo của Coach (chỉ thấy kết quả qua
-- coach_feedback và bản kế hoạch đã áp dụng).
drop policy if exists "plan_chat_sessions_all_own" on public.plan_chat_sessions;
create policy "plan_chat_sessions_all_own" on public.plan_chat_sessions for all
  using (auth.uid() = actor_id) with check (auth.uid() = actor_id);

drop policy if exists "plan_chat_messages_all_own" on public.plan_chat_messages;
create policy "plan_chat_messages_all_own" on public.plan_chat_messages for all
  using (exists (select 1 from public.plan_chat_sessions s where s.id = plan_chat_messages.session_id and s.actor_id = auth.uid()))
  with check (exists (select 1 from public.plan_chat_sessions s where s.id = plan_chat_messages.session_id and s.actor_id = auth.uid()));

-- Storage bucket cho ảnh minh chứng (private, truy cập qua signed URL / policy bên dưới).
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

drop policy if exists "proofs_storage_all_own" on storage.objects;
create policy "proofs_storage_all_own" on storage.objects for all
  using (bucket_id = 'proofs' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'proofs' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "proofs_storage_select_by_coach" on storage.objects;
create policy "proofs_storage_select_by_coach" on storage.objects for select
  using (bucket_id = 'proofs' and public.is_coach_of((storage.foldername(name))[1]::uuid));

drop policy if exists "user_data_all_own" on public.user_data;
create policy "user_data_all_own" on public.user_data for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Huấn luyện viên chỉ đọc được giới hạn purine/muối/đường của học viên (để màn Nhật ký trận của học viên tính đúng); các khoá khác vẫn riêng tư.
drop policy if exists "user_data_limits_select_by_coach" on public.user_data;
create policy "user_data_limits_select_by_coach" on public.user_data for select
  using (key = 'limits' and public.is_coach_of(user_id));
