-- À coller dans Supabase > SQL Editor > Run.
create table lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table cards (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  fr text not null,
  jp text not null,
  reading text,
  alt_fr text[] not null default '{}',
  alt_jp text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);
alter table lessons enable row level security;
alter table cards enable row level security;
-- Lecture ouverte à tous, écriture réservée à l'utilisateur connecté (l'admin).
create policy "lecture lessons" on lessons for select using (true);
create policy "lecture cards" on cards for select using (true);
create policy "admin lessons" on lessons for all to authenticated using (true) with check (true);
create policy "admin cards" on cards for all to authenticated using (true) with check (true);
