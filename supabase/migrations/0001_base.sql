-- SInPLe Guachera · base mínima: establecimientos y terneros.
-- Ejecutar una sola vez en Supabase → SQL Editor.

create table if not exists public.simple_guachera_farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.simple_guachera_farm_members (
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operario' check (role in ('propietario', 'operario')),
  created_at timestamptz not null default now(),
  primary key (farm_id, user_id)
);

create table if not exists public.simple_guachera_calves (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  tag text not null check (length(trim(tag)) > 0),
  sex text not null default 'Hembra' check (sex in ('Hembra', 'Macho')),
  birth_date date not null,
  birth_weight numeric(6,2) check (birth_weight is null or birth_weight > 0),
  location text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una misma caravana no puede repetirse entre los terneros activos de un establecimiento.
create unique index if not exists simple_guachera_calves_active_tag
  on public.simple_guachera_calves (farm_id, lower(tag)) where active;
create index if not exists simple_guachera_calves_farm on public.simple_guachera_calves (farm_id);
create index if not exists simple_guachera_members_user on public.simple_guachera_farm_members (user_id);

-- ¿El usuario actual pertenece al establecimiento?
create or replace function public.simple_guachera_is_member(target_farm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.simple_guachera_farm_members
    where farm_id = target_farm and user_id = auth.uid()
  );
$$;

-- Quien crea un establecimiento queda como propietario.
create or replace function public.simple_guachera_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.simple_guachera_farm_members (farm_id, user_id, role)
  values (new.id, new.owner_id, 'propietario')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists simple_guachera_farms_owner on public.simple_guachera_farms;
create trigger simple_guachera_farms_owner
  after insert on public.simple_guachera_farms
  for each row execute function public.simple_guachera_add_owner();

create or replace function public.simple_guachera_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists simple_guachera_calves_touch on public.simple_guachera_calves;
create trigger simple_guachera_calves_touch
  before update on public.simple_guachera_calves
  for each row execute function public.simple_guachera_touch();

-- Seguridad: cada usuario ve solo los establecimientos de los que es miembro.
alter table public.simple_guachera_farms enable row level security;
alter table public.simple_guachera_farm_members enable row level security;
alter table public.simple_guachera_calves enable row level security;

drop policy if exists "farms_select" on public.simple_guachera_farms;
create policy "farms_select" on public.simple_guachera_farms
  for select to authenticated using (owner_id = auth.uid() or public.simple_guachera_is_member(id));
drop policy if exists "farms_insert" on public.simple_guachera_farms;
create policy "farms_insert" on public.simple_guachera_farms
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "farms_update" on public.simple_guachera_farms;
create policy "farms_update" on public.simple_guachera_farms
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "farms_delete" on public.simple_guachera_farms;
create policy "farms_delete" on public.simple_guachera_farms
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members_select" on public.simple_guachera_farm_members;
create policy "members_select" on public.simple_guachera_farm_members
  for select to authenticated using (public.simple_guachera_is_member(farm_id));

drop policy if exists "calves_select" on public.simple_guachera_calves;
create policy "calves_select" on public.simple_guachera_calves
  for select to authenticated using (public.simple_guachera_is_member(farm_id));
drop policy if exists "calves_insert" on public.simple_guachera_calves;
create policy "calves_insert" on public.simple_guachera_calves
  for insert to authenticated with check (public.simple_guachera_is_member(farm_id));
drop policy if exists "calves_update" on public.simple_guachera_calves;
create policy "calves_update" on public.simple_guachera_calves
  for update to authenticated using (public.simple_guachera_is_member(farm_id)) with check (public.simple_guachera_is_member(farm_id));
drop policy if exists "calves_delete" on public.simple_guachera_calves;
create policy "calves_delete" on public.simple_guachera_calves
  for delete to authenticated using (public.simple_guachera_is_member(farm_id));

grant select, insert, update, delete on public.simple_guachera_farms to authenticated;
grant select on public.simple_guachera_farm_members to authenticated;
grant select, insert, update, delete on public.simple_guachera_calves to authenticated;
grant execute on function public.simple_guachera_is_member(uuid) to authenticated;
