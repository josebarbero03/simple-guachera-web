-- SInPLe Guachera · configuración propia de cada establecimiento, cambio manual de categoría con historial
-- y rango de días en el plan sanitario.
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0003. Se puede volver a ejecutar.

-- ───────────── Configuración del establecimiento ─────────────
-- { "categories": [{"name": "Guachera", "minAgeDays": 0, "maxAgeDays": 63}, ...],
--   "logKinds": ["Alimentación", ...], "planLateDays": 14 }   Vacío = valores por defecto.
alter table public.simple_guachera_farms add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.simple_guachera_update_farm_settings(target_farm uuid, new_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  cat jsonb;
  previous_max integer := -1;
begin
  if not public.simple_guachera_is_manager(target_farm) then raise exception 'Solo productor o veterinario pueden configurar el establecimiento'; end if;
  if jsonb_typeof(new_settings) <> 'object' then raise exception 'Configuración inválida'; end if;
  if new_settings ? 'categories' then
    if jsonb_typeof(new_settings->'categories') <> 'array' or jsonb_array_length(new_settings->'categories') = 0 then raise exception 'Definí al menos una categoría'; end if;
    for cat in select value from jsonb_array_elements(new_settings->'categories') loop
      if coalesce(trim(cat->>'name'), '') = '' then raise exception 'Cada categoría necesita un nombre'; end if;
      if (cat->>'minAgeDays')::integer is null or (cat->>'maxAgeDays')::integer is null
        or (cat->>'minAgeDays')::integer < 0 or (cat->>'maxAgeDays')::integer < (cat->>'minAgeDays')::integer then
        raise exception 'Rango de días inválido en la categoría %', cat->>'name';
      end if;
      if (cat->>'minAgeDays')::integer <= previous_max then raise exception 'Los rangos de las categorías no pueden superponerse (%)', cat->>'name'; end if;
      previous_max := (cat->>'maxAgeDays')::integer;
    end loop;
  end if;
  if new_settings ? 'planLateDays' and ((new_settings->>'planLateDays')::integer is null or (new_settings->>'planLateDays')::integer not between 0 and 60) then
    raise exception 'Los días de atraso deben estar entre 0 y 60';
  end if;
  update public.simple_guachera_farms set settings = new_settings where id = target_farm;
end;
$$;
grant execute on function public.simple_guachera_update_farm_settings(uuid, jsonb) to authenticated;

-- Categoría asignada a mano. Vacía (null) = automática según la edad.
alter table public.simple_guachera_calves add column if not exists category text check (category is null or length(trim(category)) > 0);

create table if not exists public.simple_guachera_category_moves (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid not null references public.simple_guachera_calves(id) on delete cascade,
  from_category text not null,
  to_category text not null,
  moved_on date not null,
  notes text not null default '',
  moved_by uuid default auth.uid() references auth.users(id) on delete set null,
  moved_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists simple_guachera_category_moves_calf on public.simple_guachera_category_moves (calf_id, moved_on);
alter table public.simple_guachera_category_moves enable row level security;
drop policy if exists "category_moves_select" on public.simple_guachera_category_moves;
create policy "category_moves_select" on public.simple_guachera_category_moves
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
grant select on public.simple_guachera_category_moves to authenticated;

-- Misma regla que src/lib/calves.ts (categoryFor): usa las categorías del establecimiento o las de por defecto.
drop function if exists public.simple_guachera_age_category(date, date);
create or replace function public.simple_guachera_age_category(target_farm uuid, birth date, on_day date)
returns text language sql stable security definer set search_path = public as $$
  with cats as (
    select coalesce(nullif(f.settings->'categories', 'null'::jsonb),
      '[{"name":"Guachera","minAgeDays":0,"maxAgeDays":63},{"name":"Acostumbramiento","minAgeDays":64,"maxAgeDays":150},{"name":"Recría","minAgeDays":151,"maxAgeDays":300}]'::jsonb) as list
    from public.simple_guachera_farms f where f.id = target_farm
  )
  select case when on_day - birth < 0 then 'Sin nacer' else coalesce((
    select c->>'name' from cats, jsonb_array_elements(cats.list) c
    where on_day - birth between (c->>'minAgeDays')::integer and (c->>'maxAgeDays')::integer limit 1), 'Fuera de rango') end;
$$;

-- Cambia la categoría de uno o varios terneros activos. new_category vacío = volver a automática por edad.
create or replace function public.simple_guachera_change_category(calf_ids uuid[], new_category text, moved_on date, move_notes text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare
  c public.simple_guachera_calves%rowtype;
  target text := nullif(trim(coalesce(new_category, '')), '');
  moved integer := 0;
begin
  if moved_on is null or moved_on > (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'Fecha inválida'; end if;
  for c in select * from public.simple_guachera_calves where id = any(calf_ids) and active loop
    if not public.simple_guachera_is_manager(c.farm_id) then raise exception 'Solo productor o veterinario pueden cambiar categorías'; end if;
    if moved_on < c.birth_date then raise exception 'La fecha es anterior al nacimiento del ternero %', c.tag; end if;
    if c.category is not distinct from target then continue; end if;
    insert into public.simple_guachera_category_moves (farm_id, calf_id, from_category, to_category, moved_on, notes, moved_by_name)
    values (c.farm_id, c.id,
      coalesce(c.category, public.simple_guachera_age_category(c.farm_id, c.birth_date, moved_on) || ' (por edad)'),
      coalesce(target, public.simple_guachera_age_category(c.farm_id, c.birth_date, moved_on) || ' (por edad)'),
      moved_on, coalesce(move_notes, ''), coalesce(public.simple_guachera_my_name(c.farm_id), ''));
    update public.simple_guachera_calves set category = target where id = c.id;
    moved := moved + 1;
  end loop;
  return moved;
end;
$$;

grant execute on function public.simple_guachera_change_category(uuid[], text, date, text) to authenticated;

-- ───────────── Plan sanitario: rango de días de vida ─────────────
-- age_day = desde qué día de vida se puede aplicar; age_day_to = hasta qué día (vacío = solo ese día).
alter table public.simple_guachera_protocols add column if not exists age_day_to integer;
alter table public.simple_guachera_protocols drop constraint if exists simple_guachera_protocols_age_range;
alter table public.simple_guachera_protocols add constraint simple_guachera_protocols_age_range
  check (age_day_to is null or (age_day is not null and age_day_to between age_day and 365));
