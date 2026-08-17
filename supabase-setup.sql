-- ============================================================================
-- Times Table Hero — cloud save backend (Supabase / Postgres)
--
-- Nickname + PIN accounts, no email / no personal info. Run this once in the
-- Supabase SQL Editor for a fresh project (SQL Editor -> New query -> Run).
--
-- Notes:
--   * pgcrypto lives in the `extensions` schema on Supabase, so the login
--     functions set search_path = public, extensions (otherwise crypt/gen_salt
--     resolve to "function does not exist").
--   * The accounts table has RLS on and is revoked from anon/authenticated —
--     it can only be reached through these three SECURITY DEFINER functions,
--     each of which checks the PIN. The web app calls them with the public
--     (anon) key, which is safe to ship in a static site.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  username_key text unique not null,           -- normalized nickname (lowercased)
  display_name text not null,                  -- nickname as typed
  pin_hash     text not null,                  -- bcrypt hash of the PIN
  progress     jsonb not null default '{}'::jsonb,
  fails        int  not null default 0,         -- wrong-PIN counter (lockout)
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;

-- normalize a nickname to a uniqueness key
create or replace function public.tth_key(p_name text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
$$;

-- SIGN UP: create an account, returns {ok, id, display_name, updated_at} or {ok:false, error}
create or replace function public.tth_signup(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_key text; v_id uuid; v_now timestamptz := now();
begin
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 20 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if p_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
  v_key := public.tth_key(p_name);
  if exists (select 1 from public.players where username_key = v_key) then return jsonb_build_object('ok', false, 'error', 'name_taken'); end if;
  insert into public.players (username_key, display_name, pin_hash, updated_at)
    values (v_key, p_name, crypt(p_pin, gen_salt('bf')), v_now) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'display_name', p_name, 'updated_at', v_now);
end $$;

-- LOG IN: verify PIN, returns {ok, id, display_name, progress, updated_at} or {ok:false, error}
-- Locks the account for 5 minutes after 6 wrong PINs.
create or replace function public.tth_login(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.players%rowtype; v_key text;
begin
  v_key := public.tth_key(coalesce(p_name, ''));
  select * into r from public.players where username_key = v_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.locked_until is not null and r.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.players set fails = 0, locked_until = null where id = r.id;
    return jsonb_build_object('ok', true, 'id', r.id, 'display_name', r.display_name, 'progress', r.progress, 'updated_at', r.updated_at);
  end if;
  update public.players set
    fails = case when fails + 1 >= 6 then 0 else fails + 1 end,
    locked_until = case when fails + 1 >= 6 then now() + interval '5 minutes' else locked_until end
    where id = r.id;
  return jsonb_build_object('ok', false, 'error', 'not_found');
end $$;

-- SAVE: verify PIN, overwrite progress. Returns {ok, updated_at} or {ok:false, error}
create or replace function public.tth_save(p_name text, p_pin text, p_progress jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.players%rowtype; v_key text; v_now timestamptz := now();
begin
  v_key := public.tth_key(coalesce(p_name, ''));
  select * into r from public.players where username_key = v_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.locked_until is not null and r.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.players set progress = coalesce(p_progress, '{}'::jsonb), updated_at = v_now, fails = 0 where id = r.id;
    return jsonb_build_object('ok', true, 'updated_at', v_now);
  end if;
  return jsonb_build_object('ok', false, 'error', 'not_found');
end $$;

grant execute on function public.tth_signup(text, text) to anon, authenticated;
grant execute on function public.tth_login(text, text) to anon, authenticated;
grant execute on function public.tth_save(text, text, jsonb) to anon, authenticated;
