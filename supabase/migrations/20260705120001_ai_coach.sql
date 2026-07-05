-- AI coach usage tracking (rate limiting, service-role only)

create table if not exists public.ai_usage (
  user_id uuid references public.profiles(id) on delete cascade,
  date date not null,
  count int not null default 0,
  primary key (user_id, date)
);

-- RLS on, NO policies: only the ai-coach edge function (service role) writes/reads
alter table public.ai_usage enable row level security;
