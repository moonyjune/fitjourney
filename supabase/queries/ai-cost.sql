-- Truy vấn theo dõi chi phí AI cho chủ ứng dụng. Chạy trong Supabase SQL Editor (service role), không dùng trong app.
-- Chi phí là ước tính: token x bảng giá cấu hình (AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK). Ngày tính theo giờ Việt Nam.

-- 1) Cấp quyền xem màn "AI & chi phí" trong app (thay email thật; không ghi email vào repo):
--    insert into public.ai_admins (email) values ('ten@example.com') on conflict do nothing;
--    Gỡ quyền: delete from public.ai_admins where email = 'ten@example.com';

-- 2) 30 ngày gần nhất, toàn ứng dụng
select * from public.ai_cost_by_day limit 30;

-- 3) Hôm nay theo người dùng (ai tốn nhiều nhất)
select * from public.ai_cost_by_user_day where day = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

-- 4) Hôm nay theo tính năng và model
select * from public.ai_cost_by_feature_day where day = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

-- 5) Tháng này: tổng, và trung bình mỗi người dùng hoạt động mỗi ngày
select date_trunc('month', day) as month,
       round(sum(cost_usd), 2) as cost_usd,
       sum(calls) as calls,
       round(sum(cost_usd) / nullif(count(distinct (user_id, day)), 0), 4) as usd_per_active_user_day
from public.ai_usage
where day >= date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)
group by 1;

-- 6) Người dùng chạm quota hoặc hạn mức trong 7 ngày qua
select user_id, day, feature, calls, round(cost_usd, 4) as cost_usd
from public.ai_usage
where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 7
  and (calls >= case feature when 'photo' then 15 when 'text' then 30 when 'label' then 15 when 'recipe' then 10 when 'report' then 3 when 'swap' then 10 else 5 end
       or cost_usd >= 0.6)
order by day desc, cost_usd desc;
