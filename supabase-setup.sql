-- ============================================================================
-- Times Table Hero — FAMILY ACCOUNTS backend (Supabase Auth + one kids table)
-- ============================================================================
-- Model: a PARENT signs up with email + password (Supabase Auth). Their KIDS
-- live in one table, each row owned by the parent's auth user id. Row-Level
-- Security guarantees a parent can only ever see/edit their own kids. The app
-- talks to Supabase directly with plain fetch (no SDK): Auth endpoints for
-- sign-up / sign-in / password reset, and PostgREST for the kids table using
-- the parent's JWT.
--
-- The old nickname+PIN system (players table, tth_signup/tth_login/tth_save)
-- is retired — you can drop it at the very bottom once the new flow works.
-- ============================================================================

-- ---- 1. KIDS TABLE ---------------------------------------------------------
create table if not exists public.kids (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 24),
  avatar     text not null default '🦄',
  progress   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kids_owner_idx on public.kids (owner);

-- ---- 2. ROW-LEVEL SECURITY -------------------------------------------------
alter table public.kids enable row level security;

drop policy if exists "kids_select_own" on public.kids;
drop policy if exists "kids_insert_own" on public.kids;
drop policy if exists "kids_update_own" on public.kids;
drop policy if exists "kids_delete_own" on public.kids;

create policy "kids_select_own" on public.kids
  for select using (owner = auth.uid());
create policy "kids_insert_own" on public.kids
  for insert with check (owner = auth.uid());
create policy "kids_update_own" on public.kids
  for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "kids_delete_own" on public.kids
  for delete using (owner = auth.uid());

-- ---- 3. KEEP updated_at FRESH ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists kids_touch on public.kids;
create trigger kids_touch before update on public.kids
  for each row execute function public.touch_updated_at();

-- ---- 4. (LATER) retire the old nickname+PIN system -------------------------
-- Once family accounts are working end-to-end, you can clean up the old one:
--   drop function if exists public.tth_signup(text, text);
--   drop function if exists public.tth_login(text, text);
--   drop function if exists public.tth_save(text, text, jsonb);
--   drop table if exists public.players;

-- ============================================================================
-- DASHBOARD SETTINGS (do these in the Supabase UI, not SQL):
--   Authentication → Sign In / Providers → Email:  ENABLED.
--   Authentication → Providers → Email → "Confirm email":  turn OFF, so a
--       parent can sign up and add kids in one sitting (password reset still
--       works either way). Leave ON only if you want mandatory verification.
--   Authentication → URL Configuration → Site URL:
--       https://spacemnke.github.io/times-table-hero/
--       (so the password-reset email link returns to the game).
-- The public anon key already in the app is safe to ship; RLS does the real
-- protection. NEVER put the service_role/secret key in the app.
-- ============================================================================
