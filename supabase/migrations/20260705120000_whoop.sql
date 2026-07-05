-- WHOOP integration: token storage (service-role only) + recovery cache

create table if not exists public.whoop_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  whoop_user_id text,
  created_at timestamptz default now()
);

-- RLS on, NO policies: only edge functions using the service role key can touch tokens
alter table public.whoop_tokens enable row level security;

create table if not exists public.whoop_recovery (
  user_id uuid references public.profiles(id) on delete cascade,
  date date not null,
  recovery_score int,
  hrv_ms numeric,
  rhr numeric,
  sleep_performance int,
  primary key (user_id, date)
);

alter table public.whoop_recovery enable row level security;

create policy "Users can read own recovery"
  on public.whoop_recovery for select
  to authenticated
  using (auth.uid() = user_id);
