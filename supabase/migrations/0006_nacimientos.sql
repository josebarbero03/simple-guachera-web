-- SInPLe Guachera · nacimientos avisados por el operario para que productor / veterinario los carguen como terneros.
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0005. Se puede volver a ejecutar.

create table if not exists public.simple_guachera_births (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  tag text not null default '',
  sex text check (sex is null or sex in ('Hembra', 'Macho')),
  birth_date date not null,
  birth_weight numeric(6,2) check (birth_weight is null or (birth_weight > 0 and birth_weight < 120)),
  mother_tag text not null default '',
  calving text not null default 'Normal' check (calving in ('Normal', 'Con ayuda', 'Difícil')),
  alive boolean not null default true,
  colostrum_liters numeric(4,1) check (colostrum_liters is null or colostrum_liters between 0 and 10),
  colostrum_hours numeric(4,1) check (colostrum_hours is null or colostrum_hours between 0 and 72),
  notes text not null default '',
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Cargado', 'Descartado')),
  calf_id uuid references public.simple_guachera_calves(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists simple_guachera_births_farm on public.simple_guachera_births (farm_id, status, created_at desc);

create or replace function public.simple_guachera_birth_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.author_name := coalesce(public.simple_guachera_my_name(new.farm_id), '');
  new.status := 'Pendiente';
  new.calf_id := null;
  new.reviewed_by_name := '';
  new.reviewed_at := null;
  new.tag := trim(new.tag);
  if new.birth_date > (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'La fecha de nacimiento no puede ser futura'; end if;
  return new;
end;
$$;
drop trigger if exists simple_guachera_births_author on public.simple_guachera_births;
create trigger simple_guachera_births_author
  before insert on public.simple_guachera_births
  for each row execute function public.simple_guachera_birth_author();

alter table public.simple_guachera_births enable row level security;
drop policy if exists "births_select" on public.simple_guachera_births;
create policy "births_select" on public.simple_guachera_births
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "births_insert" on public.simple_guachera_births;
create policy "births_insert" on public.simple_guachera_births
  for insert to authenticated with check (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "births_delete" on public.simple_guachera_births;
create policy "births_delete" on public.simple_guachera_births
  for delete to authenticated using ((created_by = auth.uid() and status = 'Pendiente') or public.simple_guachera_is_manager(farm_id));
grant select, insert, delete on public.simple_guachera_births to authenticated;

-- Productor / veterinario confirma el nacimiento (con los datos corregidos) y se crea el ternero.
-- Si nació muerto, el ternero queda dado de baja por muerte el mismo día (cuenta en "primeras 24 h").
create or replace function public.simple_guachera_accept_birth(
  birth uuid, calf_tag text, calf_sex text, calf_birth_date date, calf_birth_weight numeric default null,
  calf_location text default '', calf_colostrum_liters numeric default null, calf_colostrum_hours numeric default null, calf_alive boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b public.simple_guachera_births%rowtype;
  new_calf uuid;
  extra text;
begin
  select * into b from public.simple_guachera_births where id = birth;
  if b.id is null or not public.simple_guachera_is_manager(b.farm_id) then raise exception 'Solo productor o veterinario pueden cargar nacimientos'; end if;
  if b.status <> 'Pendiente' then raise exception 'Este nacimiento ya fue procesado'; end if;
  if coalesce(trim(calf_tag), '') = '' then raise exception 'Falta la caravana'; end if;
  if calf_sex not in ('Hembra', 'Macho') then raise exception 'Elegí hembra o macho'; end if;
  extra := concat_ws('. ',
    case when b.calving <> 'Normal' then 'Parto ' || lower(b.calving) end,
    case when b.mother_tag <> '' then 'Madre ' || b.mother_tag end,
    nullif(b.notes, ''));
  insert into public.simple_guachera_calves (farm_id, tag, sex, birth_date, birth_weight, location, notes, colostrum_liters, colostrum_hours,
    active, exit_date, exit_reason, exit_cause)
  values (b.farm_id, trim(calf_tag), calf_sex, calf_birth_date, calf_birth_weight, coalesce(calf_location, ''), coalesce(extra, ''),
    calf_colostrum_liters, calf_colostrum_hours,
    calf_alive, case when not calf_alive then calf_birth_date end, case when not calf_alive then 'Muerte' end, case when not calf_alive then 'Nacido muerto' else '' end)
  returning id into new_calf;
  update public.simple_guachera_births
  set status = 'Cargado', calf_id = new_calf, reviewed_by_name = coalesce(public.simple_guachera_my_name(b.farm_id), ''), reviewed_at = now()
  where id = birth;
  return new_calf;
end;
$$;

create or replace function public.simple_guachera_discard_birth(birth uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.simple_guachera_births%rowtype;
begin
  select * into b from public.simple_guachera_births where id = birth;
  if b.id is null or not public.simple_guachera_is_manager(b.farm_id) then raise exception 'Solo productor o veterinario pueden descartar nacimientos'; end if;
  update public.simple_guachera_births
  set status = 'Descartado', reviewed_by_name = coalesce(public.simple_guachera_my_name(b.farm_id), ''), reviewed_at = now()
  where id = birth and status = 'Pendiente';
end;
$$;

grant execute on function
  public.simple_guachera_accept_birth(uuid, text, text, date, numeric, text, numeric, numeric, boolean),
  public.simple_guachera_discard_birth(uuid)
to authenticated;
