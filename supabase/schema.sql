-- KoinCLICK Database Schema & RLS Policies (Supabase Postgres 17)
-- Follows Supabase Postgres Best Practices:
-- 1. bigint generated always as identity PKs
-- 2. numeric(12, 2) for exact currency arithmetic, timestamptz for timestamps
-- 3. Explicit indexes on all foreign keys
-- 4. Explicit GRANTs to authenticated role
-- 5. RLS enabled on all public tables using TO authenticated and cached (select auth.uid())

create table if not exists public.koinclick_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Koin Master',
  monthly_income numeric(12, 2) not null default 4200.00,
  fixed_bills numeric(12, 2) not null default 1450.00,
  savings_goal numeric(12, 2) not null default 800.00,
  currency text not null default 'USD',
  streak_days integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.koinclick_jars (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '🪙',
  color text not null default '#10B981',
  allocated numeric(12, 2) not null default 0.00,
  spent numeric(12, 2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index if not exists koinclick_jars_user_id_idx on public.koinclick_jars (user_id);

create table if not exists public.koinclick_clickpads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  jar_id bigint references public.koinclick_jars(id) on delete set null,
  label text not null,
  emoji text not null default '⚡',
  amount numeric(12, 2) not null,
  category text not null default 'Daily',
  clicks_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists koinclick_clickpads_user_id_idx on public.koinclick_clickpads (user_id);
create index if not exists koinclick_clickpads_jar_id_idx on public.koinclick_clickpads (jar_id);

create table if not exists public.koinclick_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  jar_id bigint references public.koinclick_jars(id) on delete set null,
  title text not null,
  emoji text not null default '💸',
  amount numeric(12, 2) not null,
  tx_type text not null default 'expense' check (tx_type in ('expense', 'income', 'transfer')),
  category text not null default 'General',
  source text not null default 'manual' check (source in ('clickpad', 'manual', 'subscription')),
  notes text default '',
  original_amount numeric(12, 2),
  original_currency text default 'USD',
  tx_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists koinclick_transactions_user_id_tx_date_idx on public.koinclick_transactions (user_id, tx_date desc);
create index if not exists koinclick_transactions_jar_id_idx on public.koinclick_transactions (jar_id);

create table if not exists public.koinclick_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '🔄',
  monthly_cost numeric(12, 2) not null,
  billing_day integer not null check (billing_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'cancel_alert', 'paused')),
  created_at timestamptz not null default now()
);

create index if not exists koinclick_subscriptions_user_id_idx on public.koinclick_subscriptions (user_id);

grant select, insert, update, delete on public.koinclick_settings to authenticated;
grant select, insert, update, delete on public.koinclick_jars to authenticated;
grant select, insert, update, delete on public.koinclick_clickpads to authenticated;
grant select, insert, update, delete on public.koinclick_transactions to authenticated;
grant select, insert, update, delete on public.koinclick_subscriptions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.koinclick_settings enable row level security;
alter table public.koinclick_jars enable row level security;
alter table public.koinclick_clickpads enable row level security;
alter table public.koinclick_transactions enable row level security;
alter table public.koinclick_subscriptions enable row level security;
