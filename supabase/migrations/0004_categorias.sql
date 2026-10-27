-- SInPLe Guachera · cambio manual de categoría con historial.
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0003. Se puede volver a ejecutar.

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

-- Misma regla que src/lib/calves.ts (categoryFor).
create or replace function public.simple_guachera_age_category(birth date, on_day date)
returns text language sql immutable as $$
  select case
    when on_day - birth < 0 then 'Sin nacer'
    when on_day - birth <= 63 then 'Guachera'
    when on_day - birth <= 150 then 'Acostumbramiento'
    when on_day - birth <= 300 then 'Recría'
    else 'Fuera de recría' end;
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
      coalesce(c.category, public.simple_guachera_age_category(c.birth_date, moved_on) || ' (por edad)'),
      coalesce(target, public.simple_guachera_age_category(c.birth_date, moved_on) || ' (por edad)'),
      moved_on, coalesce(move_notes, ''), coalesce(public.simple_guachera_my_name(c.farm_id), ''));
    update public.simple_guachera_calves set category = target where id = c.id;
    moved := moved + 1;
  end loop;
  return moved;
end;
$$;

grant execute on function public.simple_guachera_change_category(uuid[], text, date, text) to authenticated;
