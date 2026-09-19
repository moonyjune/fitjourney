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
  calorie_target_kcal numeric,
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
  water_ml numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- 4. Buổi tập đã ghi nhận.
create table if not exists public.workout_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  template_id text,
  label text not null,
  duration_min numeric not null,
  calories_burned numeric not null,
  created_at timestamptz not null default now()
);

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
begin
  select id into v_coach_id from public.profiles where coach_code = p_code and role = 'coach';
  if v_coach_id is null then
    raise exception 'Mã Coach không hợp lệ.';
  end if;
  if v_coach_id = auth.uid() then
    raise exception 'Không thể tự liên kết với chính mình.';
  end if;
  update public.profiles set coach_id = v_coach_id, updated_at = now() where id = auth.uid();
end;
$$;

grant execute on function public.link_to_coach(text) to authenticated;

-- Row Level Security: mỗi user chỉ đọc/ghi được dữ liệu của chính mình.
alter table public.profiles enable row level security;
alter table public.weight_entries enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.workout_entries enable row level security;
alter table public.proof_photos enable row level security;
alter table public.plans enable row level security;
alter table public.plan_update_requests enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_select_by_coach" on public.profiles;
create policy "profiles_select_by_coach" on public.profiles for select using (coach_id = auth.uid());

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
