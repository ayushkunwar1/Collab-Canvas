-- CollabCanvas Supabase schema
-- Run this file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User'
    check (char_length(display_name) between 1 and 32),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null
    check (char_length(name) between 2 and 80),
  description text not null default ''
    check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null
    check (char_length(title) between 3 and 120),
  description text not null default ''
    check (char_length(description) <= 2000),
  category text not null default 'General'
    check (char_length(category) between 2 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.upvotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (idea_id, user_id)
);

create table if not exists public.canvas_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_workspace_members_user
  on public.workspace_members(user_id);

create index if not exists idx_ideas_workspace_created
  on public.ideas(workspace_id, created_at desc);

create index if not exists idx_ideas_workspace_category
  on public.ideas(workspace_id, category);

create index if not exists idx_upvotes_workspace
  on public.upvotes(workspace_id);

create index if not exists idx_upvotes_idea
  on public.upvotes(idea_id);

create index if not exists idx_canvas_workspace_created
  on public.canvas_actions(workspace_id, created_at);

-- Needed so Postgres Changes can provide useful DELETE payloads.
alter table public.ideas replica identity full;
alter table public.upvotes replica identity full;
alter table public.canvas_actions replica identity full;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists ideas_updated_at on public.ideas;
create trigger ideas_updated_at
before update on public.ideas
for each row execute function public.set_updated_at();

-- ============================================================
-- AUTH PROFILE CREATION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      'User'
    )
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- OWNER -> MEMBER TRIGGER
-- ============================================================

create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists workspace_owner_membership on public.workspaces;
create trigger workspace_owner_membership
after insert on public.workspaces
for each row execute function public.add_workspace_owner();

-- ============================================================
-- RLS HELPERS
-- SECURITY DEFINER avoids recursive RLS checks when used by policies.
-- ============================================================

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.workspace_exists(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = auth.uid()
  );
$$;

create or replace function public.is_idea_in_workspace(target_idea_id uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ideas i
    where i.id = target_idea_id
      and i.workspace_id = target_workspace_id
  );
$$;

-- ============================================================
-- RLS ENABLEMENT
-- ============================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.ideas enable row level security;
alter table public.upvotes enable row level security;
alter table public.canvas_actions enable row level security;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- ============================================================
-- WORKSPACE POLICIES
-- ============================================================

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

-- ============================================================
-- WORKSPACE MEMBER POLICIES
-- ============================================================

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert_self on public.workspace_members;
create policy workspace_members_insert_self
on public.workspace_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists workspace_members_delete_self on public.workspace_members;
create policy workspace_members_delete_self
on public.workspace_members
for delete
to authenticated
using (user_id = auth.uid());

-- ============================================================
-- IDEA POLICIES
-- ============================================================

drop policy if exists ideas_select_member on public.ideas;
create policy ideas_select_member
on public.ideas
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists ideas_insert_member on public.ideas;
create policy ideas_insert_member
on public.ideas
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

drop policy if exists ideas_update_owner on public.ideas;
create policy ideas_update_owner
on public.ideas
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

drop policy if exists ideas_delete_owner on public.ideas;
create policy ideas_delete_owner
on public.ideas
for delete
to authenticated
using (user_id = auth.uid());

-- ============================================================
-- UPVOTE POLICIES
-- ============================================================

drop policy if exists upvotes_select_member on public.upvotes;
create policy upvotes_select_member
on public.upvotes
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists upvotes_insert_self on public.upvotes;
create policy upvotes_insert_self
on public.upvotes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
  and public.is_idea_in_workspace(idea_id, workspace_id)
);

drop policy if exists upvotes_delete_self on public.upvotes;
create policy upvotes_delete_self
on public.upvotes
for delete
to authenticated
using (user_id = auth.uid());

-- ============================================================
-- CANVAS POLICIES
-- ============================================================

drop policy if exists canvas_select_member on public.canvas_actions;
create policy canvas_select_member
on public.canvas_actions
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists canvas_insert_member on public.canvas_actions;
create policy canvas_insert_member
on public.canvas_actions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_workspace_member(workspace_id)
);

drop policy if exists canvas_delete_owner on public.canvas_actions;
create policy canvas_delete_owner
on public.canvas_actions
for delete
to authenticated
using (public.is_workspace_owner(workspace_id));

-- ============================================================
-- DATA API GRANTS
-- RLS still controls which rows each user may access.
-- ============================================================

grant usage on schema public to authenticated;

grant execute on function public.workspace_exists(uuid) to authenticated;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_idea_in_workspace(uuid, uuid) to authenticated;

grant select, insert, update, delete
on public.profiles,
   public.workspaces,
   public.workspace_members,
   public.ideas,
   public.upvotes,
   public.canvas_actions
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================

-- Add shared-data tables to the Supabase Realtime publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ideas'
  ) then
    execute 'alter publication supabase_realtime add table public.ideas';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'upvotes'
  ) then
    execute 'alter publication supabase_realtime add table public.upvotes';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'canvas_actions'
  ) then
    execute 'alter publication supabase_realtime add table public.canvas_actions';
  end if;
end
$$;
