-- Times Dash — feedback + admin stats. Run once in Supabase → SQL Editor.

-- 1) Feedback table (anyone can submit; only the admin can read)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  kid_name text,
  rating int,
  ua text,
  email text
);
alter table public.feedback enable row level security;

drop policy if exists "anyone can submit feedback" on public.feedback;
create policy "anyone can submit feedback" on public.feedback
  for insert to anon, authenticated with check (true);

drop policy if exists "admin can read feedback" on public.feedback;
create policy "admin can read feedback" on public.feedback
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'spacemnke@gmail.com');

-- 2) Admin stats: accounts / players / new-this-week / feedback count
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if (auth.jwt() ->> 'email') is distinct from 'spacemnke@gmail.com' then
    raise exception 'not authorized';
  end if;
  select json_build_object(
    'accounts', (select count(*) from auth.users),
    'players',  (select count(*) from public.kids),
    'new7',     (select count(*) from public.kids where created_at > now() - interval '7 days'),
    'feedback', (select count(*) from public.feedback)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
