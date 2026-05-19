create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_kind text not null check (source_kind in ('file', 'url')),
  source_value text not null,
  status text not null,
  language text,
  duration_seconds numeric,
  markdown text not null,
  transcript_text text not null,
  provider text not null default 'gladia',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.transcriptions enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read own transcriptions"
  on public.transcriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transcriptions"
  on public.transcriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transcriptions"
  on public.transcriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists transcriptions_user_created_idx
  on public.transcriptions(user_id, created_at desc);
