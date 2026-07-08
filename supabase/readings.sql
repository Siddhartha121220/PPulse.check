-- Run this in the Supabase SQL Editor before using the app.

create table if not exists public.readings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'local-user',
  bpm integer not null check (bpm between 40 and 220),
  confidence integer not null check (confidence between 0 and 100),
  signal_quality text not null check (signal_quality in ('Weak', 'Good', 'Strong')),
  created_at timestamptz not null default now()
);

alter table public.readings enable row level security;

create policy "Allow anonymous read"
  on public.readings for select
  using (true);

create policy "Allow anonymous insert"
  on public.readings for insert
  with check (true);
