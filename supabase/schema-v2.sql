-- À exécuter APRÈS schema.sql (SQL Editor > Run). Remplacez l'e-mail admin ligne "insert into admins".
alter table lessons add column if not exists category text not null default 'vocab' check (category in ('vocab','sentence','kanji'));

-- Droits d'écriture : réservés à l'e-mail admin (les élèves, eux, se connectent par e-mail).
create table if not exists admins (email text primary key);
alter table admins enable row level security;
insert into admins values ('vous@exemple.com') on conflict do nothing;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where email = auth.jwt() ->> 'email') $$;
drop policy if exists "admin lessons" on lessons;
drop policy if exists "admin cards" on cards;
create policy "admin lessons" on lessons for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin cards" on cards for all to authenticated using (is_admin()) with check (is_admin());

-- Profils, statistiques cumulées et historique des connexions.
create table if not exists profiles (id uuid primary key references auth.users on delete cascade, pseudo text not null check (char_length(pseudo) between 1 and 30));
create table if not exists user_stats (user_id uuid primary key references auth.users on delete cascade, correct int not null default 0, wrong int not null default 0, quizzes int not null default 0, seconds int not null default 0, last_ping timestamptz);
create table if not exists logins (id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade, at timestamptz not null default now());
alter table profiles enable row level security;
alter table user_stats enable row level security;
alter table logins enable row level security;
create policy "profil lecture" on profiles for select to authenticated using (id = auth.uid());
create policy "profil pseudo" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "stats lecture" on user_stats for select to authenticated using (user_id = auth.uid());

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin
  insert into profiles values (new.id, left(split_part(new.email, '@', 1), 30)) on conflict do nothing;
  insert into user_stats (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
insert into profiles select id, left(split_part(email, '@', 1), 30) from auth.users on conflict do nothing;
insert into user_stats (user_id) select id from auth.users on conflict do nothing;

-- Écritures des statistiques : uniquement par ces fonctions (valeurs bornées).
create or replace function ping() returns void language sql security definer set search_path = public as
$$ update user_stats set
     seconds = seconds + case when last_ping is not null and now() - last_ping < interval '45 seconds' then extract(epoch from now() - last_ping)::int else 0 end,
     last_ping = now()
   where user_id = auth.uid() $$;
create or replace function record_answers(c int, w int, done boolean) returns void language sql security definer set search_path = public as
$$ update user_stats set correct = correct + least(greatest(c, 0), 100), wrong = wrong + least(greatest(w, 0), 100), quizzes = quizzes + case when done then 1 else 0 end
   where user_id = auth.uid() $$;
create or replace function log_login() returns void language sql security definer set search_path = public as
$$ insert into logins (user_id) select auth.uid() where auth.uid() is not null $$;
create or replace function leaderboard() returns table (pseudo text, correct int, seconds int) language sql security definer set search_path = public as
$$ select p.pseudo, s.correct, s.seconds from user_stats s join profiles p on p.id = s.user_id order by s.correct desc limit 200 $$;
