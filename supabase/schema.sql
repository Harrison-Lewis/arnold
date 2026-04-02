-- ============================================================
-- WHOOP COACH — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: own row read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own row insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: own row update" on public.profiles for update using (auth.uid() = id);

-- ── sessions ────────────────────────────────────────────────
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles on delete cascade,
  routine_name     text not null default '',
  date             date not null default current_date,
  duration_minutes int  not null default 0,
  total_volume     numeric not null default 0,
  exercises        jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "sessions: own rows read"   on public.sessions for select using (auth.uid() = user_id);
create policy "sessions: own rows insert" on public.sessions for insert with check (auth.uid() = user_id);
create policy "sessions: own rows update" on public.sessions for update using (auth.uid() = user_id);
create policy "sessions: own rows delete" on public.sessions for delete using (auth.uid() = user_id);

-- ── routines ─────────────────────────────────────────────────
create table if not exists public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  name       text not null,
  exercises  jsonb not null default '[]',
  is_preset  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.routines enable row level security;

create policy "routines: own rows read"   on public.routines for select using (auth.uid() = user_id);
create policy "routines: own rows insert" on public.routines for insert with check (auth.uid() = user_id);
create policy "routines: own rows update" on public.routines for update using (auth.uid() = user_id);
create policy "routines: own rows delete" on public.routines for delete using (auth.uid() = user_id);

-- ── custom_exercises ─────────────────────────────────────────
create table if not exists public.custom_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  name         text not null,
  muscle_group text not null default '',
  equipment    text not null default '',
  rep_range    text not null default '8-12',
  increment    numeric not null default 2.5,
  created_at   timestamptz not null default now()
);

alter table public.custom_exercises enable row level security;

create policy "custom_exercises: own rows read"   on public.custom_exercises for select using (auth.uid() = user_id);
create policy "custom_exercises: own rows insert" on public.custom_exercises for insert with check (auth.uid() = user_id);
create policy "custom_exercises: own rows update" on public.custom_exercises for update using (auth.uid() = user_id);
create policy "custom_exercises: own rows delete" on public.custom_exercises for delete using (auth.uid() = user_id);

-- ── auto-create profile on sign-up ──────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
