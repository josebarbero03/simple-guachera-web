-- SInPLe Guachera · roles (productor / veterinario / operario), protocolos, tratamientos y registro diario.
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0001_base.sql. Se puede volver a ejecutar.

-- ───────────── Roles ─────────────
-- propietario: quien creó el establecimiento (todas las funciones + eliminar el establecimiento).
-- productor / veterinario: todas las funciones de gestión.
-- operario: tratamientos del día y registro de tareas diarias.
alter table public.simple_guachera_farm_members drop constraint if exists simple_guachera_farm_members_role_check;
alter table public.simple_guachera_farm_members add constraint simple_guachera_farm_members_role_check
  check (role in ('propietario', 'productor', 'veterinario', 'operario'));
alter table public.simple_guachera_farm_members add column if not exists email text not null default '';
alter table public.simple_guachera_farm_members add column if not exists display_name text not null default '';

update public.simple_guachera_farm_members m
set email = lower(u.email), display_name = coalesce(u.raw_user_meta_data->>'full_name', '')
from auth.users u
where u.id = m.user_id and m.email = '';

create or replace function public.simple_guachera_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.simple_guachera_farm_members (farm_id, user_id, role, email, display_name)
  select new.id, new.owner_id, 'propietario', lower(u.email), coalesce(u.raw_user_meta_data->>'full_name', '')
  from auth.users u where u.id = new.owner_id
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.simple_guachera_role(target_farm uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.simple_guachera_farm_members where farm_id = target_farm and user_id = auth.uid();
$$;

create or replace function public.simple_guachera_is_manager(target_farm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.simple_guachera_role(target_farm) in ('propietario', 'productor', 'veterinario'), false);
$$;

create or replace function public.simple_guachera_my_name(target_farm uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), email, '') from public.simple_guachera_farm_members
  where farm_id = target_farm and user_id = auth.uid();
$$;

-- Solo productor/veterinario cargan y modifican terneros.
drop policy if exists "calves_insert" on public.simple_guachera_calves;
create policy "calves_insert" on public.simple_guachera_calves
  for insert to authenticated with check (public.simple_guachera_is_manager(farm_id));
drop policy if exists "calves_update" on public.simple_guachera_calves;
create policy "calves_update" on public.simple_guachera_calves
  for update to authenticated using (public.simple_guachera_is_manager(farm_id)) with check (public.simple_guachera_is_manager(farm_id));
drop policy if exists "calves_delete" on public.simple_guachera_calves;
create policy "calves_delete" on public.simple_guachera_calves
  for delete to authenticated using (public.simple_guachera_is_manager(farm_id));

-- ───────────── Equipo e invitaciones ─────────────
create table if not exists public.simple_guachera_invitations (
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('productor', 'veterinario', 'operario')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (farm_id, email)
);
alter table public.simple_guachera_invitations enable row level security;
drop policy if exists "invitations_select" on public.simple_guachera_invitations;
create policy "invitations_select" on public.simple_guachera_invitations
  for select to authenticated using (public.simple_guachera_is_manager(farm_id));
drop policy if exists "invitations_delete" on public.simple_guachera_invitations;
create policy "invitations_delete" on public.simple_guachera_invitations
  for delete to authenticated using (public.simple_guachera_is_manager(farm_id));

-- Agrega a alguien al equipo. Si todavía no tiene cuenta, queda invitado y se suma solo al registrarse.
create or replace function public.simple_guachera_add_member(target_farm uuid, member_email text, member_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  clean_email text := lower(trim(member_email));
  found_user auth.users%rowtype;
begin
  if not public.simple_guachera_is_manager(target_farm) then raise exception 'Solo productor o veterinario pueden sumar personas'; end if;
  if member_role not in ('productor', 'veterinario', 'operario') then raise exception 'Rol inválido'; end if;
  if position('@' in clean_email) < 2 then raise exception 'Email inválido'; end if;
  select * into found_user from auth.users where lower(email) = clean_email limit 1;
  if found_user.id is not null then
    if exists (select 1 from public.simple_guachera_farm_members where farm_id = target_farm and user_id = found_user.id and role = 'propietario') then
      raise exception 'Esa persona es la propietaria del establecimiento';
    end if;
    insert into public.simple_guachera_farm_members (farm_id, user_id, role, email, display_name)
    values (target_farm, found_user.id, member_role, clean_email, coalesce(found_user.raw_user_meta_data->>'full_name', ''))
    on conflict (farm_id, user_id) do update set role = excluded.role;
    return 'agregado';
  end if;
  insert into public.simple_guachera_invitations (farm_id, email, role)
  values (target_farm, clean_email, member_role)
  on conflict (farm_id, email) do update set role = excluded.role;
  return 'invitado';
end;
$$;

-- Al ingresar, la app suma al usuario a los establecimientos donde fue invitado.
create or replace function public.simple_guachera_claim_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  me auth.users%rowtype;
  claimed integer;
begin
  select * into me from auth.users where id = auth.uid();
  if me.id is null or me.email_confirmed_at is null then return 0; end if;
  insert into public.simple_guachera_farm_members (farm_id, user_id, role, email, display_name)
  select i.farm_id, me.id, i.role, lower(me.email), coalesce(me.raw_user_meta_data->>'full_name', '')
  from public.simple_guachera_invitations i where i.email = lower(me.email)
  on conflict (farm_id, user_id) do nothing;
  get diagnostics claimed = row_count;
  delete from public.simple_guachera_invitations where email = lower(me.email);
  return claimed;
end;
$$;

create or replace function public.simple_guachera_set_member_role(target_farm uuid, member uuid, member_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.simple_guachera_is_manager(target_farm) then raise exception 'Solo productor o veterinario pueden cambiar roles'; end if;
  if member_role not in ('productor', 'veterinario', 'operario') then raise exception 'Rol inválido'; end if;
  update public.simple_guachera_farm_members set role = member_role
  where farm_id = target_farm and user_id = member and role <> 'propietario';
  if not found then raise exception 'No se puede cambiar el rol de la persona propietaria'; end if;
end;
$$;

create or replace function public.simple_guachera_remove_member(target_farm uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.simple_guachera_is_manager(target_farm) or member = auth.uid()) then raise exception 'Sin permiso'; end if;
  delete from public.simple_guachera_farm_members
  where farm_id = target_farm and user_id = member and role <> 'propietario';
  if not found then raise exception 'No se puede quitar a la persona propietaria'; end if;
end;
$$;

-- ───────────── Protocolos ─────────────
create table if not exists public.simple_guachera_protocols (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  product text not null check (length(trim(product)) > 0),
  dose text not null default '',
  route text not null default '',
  interval_hours integer not null default 24 check (interval_hours between 1 and 720),
  duration_days integer not null default 1 check (duration_days between 1 and 60),
  withdrawal_days integer not null default 0 check (withdrawal_days between 0 and 365),
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists simple_guachera_protocols_farm on public.simple_guachera_protocols (farm_id);

-- ───────────── Tratamientos y dosis ─────────────
-- Producto, dosis y vía se copian del protocolo para que el historial no cambie si después se edita el protocolo.
create table if not exists public.simple_guachera_treatments (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid not null references public.simple_guachera_calves(id) on delete cascade,
  protocol_id uuid references public.simple_guachera_protocols(id) on delete set null,
  protocol_name text not null,
  product text not null,
  dose text not null default '',
  route text not null default '',
  diagnosis text not null default '',
  start_at timestamptz not null,
  withdrawal_until date,
  status text not null default 'Activo' check (status in ('Activo', 'Finalizado')),
  outcome text check (outcome in ('Recuperado', 'Sin respuesta', 'Muerte', 'Otro')),
  notes text not null default '',
  closed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists simple_guachera_treatments_farm on public.simple_guachera_treatments (farm_id, status);
create index if not exists simple_guachera_treatments_calf on public.simple_guachera_treatments (calf_id);

create table if not exists public.simple_guachera_doses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  treatment_id uuid not null references public.simple_guachera_treatments(id) on delete cascade,
  calf_id uuid not null references public.simple_guachera_calves(id) on delete cascade,
  number integer not null,
  total integer not null,
  due_at timestamptz not null,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Aplicada', 'No aplicada', 'Cancelada')),
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text not null default '',
  notes text not null default ''
);
create index if not exists simple_guachera_doses_farm_due on public.simple_guachera_doses (farm_id, due_at);
create index if not exists simple_guachera_doses_treatment on public.simple_guachera_doses (treatment_id);

-- Cantidad de dosis = duración (horas) / intervalo, mínimo 1. Igual que src/lib/treatments.ts.
create or replace function public.simple_guachera_start_treatment(
  target_farm uuid, calf_ids uuid[], protocol uuid, start_at timestamptz, diagnosis text default '', treatment_notes text default ''
) returns integer language plpgsql security definer set search_path = public as $$
declare
  p public.simple_guachera_protocols%rowtype;
  c record;
  total_doses integer;
  new_id uuid;
  created integer := 0;
begin
  if not public.simple_guachera_is_manager(target_farm) then raise exception 'Solo productor o veterinario pueden indicar tratamientos'; end if;
  select * into p from public.simple_guachera_protocols where id = protocol and farm_id = target_farm and active;
  if p.id is null then raise exception 'Protocolo no encontrado'; end if;
  if coalesce(array_length(calf_ids, 1), 0) = 0 then raise exception 'Elegí al menos un ternero'; end if;
  total_doses := greatest(1, ceil(p.duration_days * 24.0 / p.interval_hours)::integer);
  for c in select id from public.simple_guachera_calves where farm_id = target_farm and active and id = any(calf_ids) loop
    insert into public.simple_guachera_treatments (farm_id, calf_id, protocol_id, protocol_name, product, dose, route, diagnosis, start_at, withdrawal_until, notes)
    values (target_farm, c.id, p.id, p.name, p.product, p.dose, p.route, coalesce(diagnosis, ''), start_at,
      case when p.withdrawal_days > 0 then ((start_at + make_interval(hours => (total_doses - 1) * p.interval_hours)) at time zone 'America/Argentina/Buenos_Aires')::date + p.withdrawal_days end,
      coalesce(treatment_notes, ''))
    returning id into new_id;
    insert into public.simple_guachera_doses (farm_id, treatment_id, calf_id, number, total, due_at)
    select target_farm, new_id, c.id, n + 1, total_doses, start_at + make_interval(hours => n * p.interval_hours)
    from generate_series(0, total_doses - 1) as n;
    created := created + 1;
  end loop;
  if created = 0 then raise exception 'Ninguno de los terneros elegidos está activo en este establecimiento'; end if;
  return created;
end;
$$;

-- Operarios y gestión registran cada dosis (aplicada / no aplicada) o la vuelven a pendiente.
create or replace function public.simple_guachera_record_dose(dose uuid, new_status text, dose_notes text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.simple_guachera_doses%rowtype;
begin
  select * into d from public.simple_guachera_doses where id = dose;
  if d.id is null or public.simple_guachera_role(d.farm_id) is null then raise exception 'Dosis no encontrada'; end if;
  if new_status not in ('Aplicada', 'No aplicada', 'Pendiente') then raise exception 'Estado inválido'; end if;
  if d.status = 'Cancelada' or exists (select 1 from public.simple_guachera_treatments where id = d.treatment_id and status <> 'Activo') then
    raise exception 'El tratamiento ya está cerrado';
  end if;
  if new_status = 'Pendiente' then
    if d.done_by is distinct from auth.uid() and not public.simple_guachera_is_manager(d.farm_id) then raise exception 'Solo quien la registró puede deshacerla'; end if;
    update public.simple_guachera_doses set status = 'Pendiente', done_at = null, done_by = null, done_by_name = '', notes = '' where id = dose;
  else
    update public.simple_guachera_doses
    set status = new_status, done_at = now(), done_by = auth.uid(), done_by_name = public.simple_guachera_my_name(d.farm_id), notes = coalesce(dose_notes, '')
    where id = dose;
  end if;
end;
$$;

create or replace function public.simple_guachera_close_treatment(treatment uuid, result text, close_notes text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.simple_guachera_treatments%rowtype;
begin
  select * into t from public.simple_guachera_treatments where id = treatment;
  if t.id is null or not public.simple_guachera_is_manager(t.farm_id) then raise exception 'Solo productor o veterinario pueden cerrar tratamientos'; end if;
  if result not in ('Recuperado', 'Sin respuesta', 'Muerte', 'Otro') then raise exception 'Resultado inválido'; end if;
  update public.simple_guachera_treatments
  set status = 'Finalizado', outcome = result, closed_at = now(),
      notes = case when coalesce(close_notes, '') = '' then notes when notes = '' then close_notes else notes || E'\n' || close_notes end
  where id = treatment;
  update public.simple_guachera_doses set status = 'Cancelada' where treatment_id = treatment and status = 'Pendiente';
end;
$$;

-- ───────────── Registro de tareas diarias ─────────────
create table if not exists public.simple_guachera_daily_logs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid references public.simple_guachera_calves(id) on delete set null,
  kind text not null check (length(trim(kind)) > 0),
  notes text not null default '',
  done_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists simple_guachera_logs_farm_date on public.simple_guachera_daily_logs (farm_id, done_at desc);

create or replace function public.simple_guachera_log_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.author_name := coalesce(public.simple_guachera_my_name(new.farm_id), '');
  return new;
end;
$$;
drop trigger if exists simple_guachera_logs_author on public.simple_guachera_daily_logs;
create trigger simple_guachera_logs_author
  before insert on public.simple_guachera_daily_logs
  for each row execute function public.simple_guachera_log_author();

-- ───────────── Seguridad ─────────────
alter table public.simple_guachera_protocols enable row level security;
alter table public.simple_guachera_treatments enable row level security;
alter table public.simple_guachera_doses enable row level security;
alter table public.simple_guachera_daily_logs enable row level security;

drop policy if exists "protocols_select" on public.simple_guachera_protocols;
create policy "protocols_select" on public.simple_guachera_protocols
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "protocols_write" on public.simple_guachera_protocols;
create policy "protocols_write" on public.simple_guachera_protocols
  for all to authenticated using (public.simple_guachera_is_manager(farm_id)) with check (public.simple_guachera_is_manager(farm_id));

drop policy if exists "treatments_select" on public.simple_guachera_treatments;
create policy "treatments_select" on public.simple_guachera_treatments
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "treatments_update" on public.simple_guachera_treatments;
create policy "treatments_update" on public.simple_guachera_treatments
  for update to authenticated using (public.simple_guachera_is_manager(farm_id)) with check (public.simple_guachera_is_manager(farm_id));
drop policy if exists "treatments_delete" on public.simple_guachera_treatments;
create policy "treatments_delete" on public.simple_guachera_treatments
  for delete to authenticated using (public.simple_guachera_is_manager(farm_id));

drop policy if exists "doses_select" on public.simple_guachera_doses;
create policy "doses_select" on public.simple_guachera_doses
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);

drop policy if exists "logs_select" on public.simple_guachera_daily_logs;
create policy "logs_select" on public.simple_guachera_daily_logs
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "logs_insert" on public.simple_guachera_daily_logs;
create policy "logs_insert" on public.simple_guachera_daily_logs
  for insert to authenticated with check (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "logs_delete" on public.simple_guachera_daily_logs;
create policy "logs_delete" on public.simple_guachera_daily_logs
  for delete to authenticated using (created_by = auth.uid() or public.simple_guachera_is_manager(farm_id));

grant select, delete on public.simple_guachera_invitations to authenticated;
grant select, insert, update, delete on public.simple_guachera_protocols to authenticated;
grant select, update, delete on public.simple_guachera_treatments to authenticated;
grant select on public.simple_guachera_doses to authenticated;
grant select, insert, delete on public.simple_guachera_daily_logs to authenticated;
grant execute on function
  public.simple_guachera_role(uuid),
  public.simple_guachera_is_manager(uuid),
  public.simple_guachera_add_member(uuid, text, text),
  public.simple_guachera_claim_invitations(),
  public.simple_guachera_set_member_role(uuid, uuid, text),
  public.simple_guachera_remove_member(uuid, uuid),
  public.simple_guachera_start_treatment(uuid, uuid[], uuid, timestamptz, text, text),
  public.simple_guachera_record_dose(uuid, text, text),
  public.simple_guachera_close_treatment(uuid, text, text)
to authenticated;
