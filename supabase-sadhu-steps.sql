-- Anonymous step counts for Swami Neurananda on the Swar Yoga page.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Stores only a step name and the time. No name, email, IP, device or ID.

create table if not exists public.sadhu_steps (
  id bigint generated always as identity primary key,
  step text not null check (char_length(step) between 1 and 40 and step ~ '^[a-z0-9_]+$'),
  created_at timestamptz not null default now()
);

alter table public.sadhu_steps enable row level security;

-- Visitors can add a step. Nobody but you (the dashboard) can read them.
drop policy if exists "add a step" on public.sadhu_steps;
create policy "add a step" on public.sadhu_steps for insert to anon with check (true);

-- To see where people drop off (last 30 days), run:
-- select step, count(*) from public.sadhu_steps
-- where created_at > now() - interval '30 days'
-- group by step order by count(*) desc;
