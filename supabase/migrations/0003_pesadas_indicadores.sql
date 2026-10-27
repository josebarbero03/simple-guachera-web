-- SInPLe Guachera · pesadas, calostrado, bajas, destete, gravedad de tratamientos y plan sanitario por edad.
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0002. Se puede volver a ejecutar.

-- ───────────── Datos del ternero ─────────────
-- Calostrado (INIA / Lombard 2020): litros en la primera toma, Brix del calostro (≥22% = buena calidad),
-- horas de vida a la primera toma, y control de transferencia de inmunidad pasiva en suero (24 h a 7 días):
-- proteína total (g/dL) o Brix sérico (%).
alter table public.simple_guachera_calves add column if not exists colostrum_liters numeric(4,1) check (colostrum_liters is null or colostrum_liters between 0 and 10);
alter table public.simple_guachera_calves add column if not exists colostrum_brix numeric(4,1) check (colostrum_brix is null or colostrum_brix between 0 and 40);
alter table public.simple_guachera_calves add column if not exists colostrum_hours numeric(4,1) check (colostrum_hours is null or colostrum_hours between 0 and 72);
alter table public.simple_guachera_calves add column if not exists serum_tp numeric(3,1) check (serum_tp is null or serum_tp between 2 and 12);
alter table public.simple_guachera_calves add column if not exists serum_brix numeric(3,1) check (serum_brix is null or serum_brix between 4 and 15);
alter table public.simple_guachera_calves add column if not exists weaning_date date;
alter table public.simple_guachera_calves add column if not exists weaning_weight numeric(6,2) check (weaning_weight is null or weaning_weight > 0);
alter table public.simple_guachera_calves add column if not exists exit_date date;
alter table public.simple_guachera_calves add column if not exists exit_reason text check (exit_reason is null or exit_reason in ('Muerte', 'Venta', 'Traslado', 'Otro'));
alter table public.simple_guachera_calves add column if not exists exit_cause text not null default '';

-- ───────────── Pesadas ─────────────
create table if not exists public.simple_guachera_weights (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid not null references public.simple_guachera_calves(id) on delete cascade,
  weighed_at date not null,
  weight numeric(6,2) not null check (weight > 0 and weight < 1000),
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (calf_id, weighed_at)
);
create index if not exists simple_guachera_weights_farm on public.simple_guachera_weights (farm_id, weighed_at);

alter table public.simple_guachera_weights enable row level security;
drop policy if exists "weights_select" on public.simple_guachera_weights;
create policy "weights_select" on public.simple_guachera_weights
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "weights_write" on public.simple_guachera_weights;
create policy "weights_write" on public.simple_guachera_weights
  for all to authenticated using (public.simple_guachera_is_manager(farm_id)) with check (public.simple_guachera_is_manager(farm_id));
grant select, insert, update, delete on public.simple_guachera_weights to authenticated;

-- ───────────── Protocolos: tipo, grupo de enfermedad y día de vida ─────────────
alter table public.simple_guachera_protocols add column if not exists kind text not null default 'Tratamiento';
alter table public.simple_guachera_protocols drop constraint if exists simple_guachera_protocols_kind_check;
alter table public.simple_guachera_protocols add constraint simple_guachera_protocols_kind_check check (kind in ('Tratamiento', 'Plan sanitario'));
alter table public.simple_guachera_protocols add column if not exists disease_group text not null default 'Otra';
alter table public.simple_guachera_protocols drop constraint if exists simple_guachera_protocols_disease_group_check;
alter table public.simple_guachera_protocols add constraint simple_guachera_protocols_disease_group_check
  check (disease_group in ('Diarrea', 'Respiratoria', 'Ombligo', 'Otra', 'Preventivo'));
-- Plan sanitario: se aplica una vez a cada ternero al cumplir este día de vida.
alter table public.simple_guachera_protocols add column if not exists age_day integer check (age_day is null or age_day between 0 and 365);
alter table public.simple_guachera_protocols drop constraint if exists simple_guachera_protocols_plan_age;
alter table public.simple_guachera_protocols add constraint simple_guachera_protocols_plan_age check (kind <> 'Plan sanitario' or age_day is not null);

-- ───────────── Tratamientos: grupo y gravedad ─────────────
alter table public.simple_guachera_treatments add column if not exists disease_group text not null default 'Otra';
alter table public.simple_guachera_treatments add column if not exists severity text not null default 'Leve';
alter table public.simple_guachera_treatments drop constraint if exists simple_guachera_treatments_severity_check;
alter table public.simple_guachera_treatments add constraint simple_guachera_treatments_severity_check check (severity in ('Leve', 'Moderado', 'Grave'));

drop function if exists public.simple_guachera_start_treatment(uuid, uuid[], uuid, timestamptz, text, text);
create or replace function public.simple_guachera_start_treatment(
  target_farm uuid, calf_ids uuid[], protocol uuid, start_at timestamptz, diagnosis text default '', treatment_notes text default '', severity text default 'Leve'
) returns integer language plpgsql security definer set search_path = public as $$
declare
  p public.simple_guachera_protocols%rowtype;
  c record;
  total_doses integer;
  new_id uuid;
  created integer := 0;
begin
  if not public.simple_guachera_is_manager(target_farm) then raise exception 'Solo productor o veterinario pueden indicar tratamientos'; end if;
  if severity not in ('Leve', 'Moderado', 'Grave') then raise exception 'Gravedad inválida'; end if;
  select * into p from public.simple_guachera_protocols where id = protocol and farm_id = target_farm and active and kind = 'Tratamiento';
  if p.id is null then raise exception 'Protocolo no encontrado'; end if;
  if coalesce(array_length(calf_ids, 1), 0) = 0 then raise exception 'Elegí al menos un ternero'; end if;
  total_doses := greatest(1, ceil(p.duration_days * 24.0 / p.interval_hours)::integer);
  for c in select id from public.simple_guachera_calves where farm_id = target_farm and active and id = any(calf_ids) loop
    insert into public.simple_guachera_treatments (farm_id, calf_id, protocol_id, protocol_name, product, dose, route, diagnosis, start_at, withdrawal_until, notes, disease_group, severity)
    values (target_farm, c.id, p.id, p.name, p.product, p.dose, p.route, coalesce(diagnosis, ''), start_at,
      case when p.withdrawal_days > 0 then ((start_at + make_interval(hours => (total_doses - 1) * p.interval_hours)) at time zone 'America/Argentina/Buenos_Aires')::date + p.withdrawal_days end,
      coalesce(treatment_notes, ''), p.disease_group, severity)
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

-- ───────────── Plan sanitario: aplicaciones por edad ─────────────
create table if not exists public.simple_guachera_plan_applications (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid not null references public.simple_guachera_calves(id) on delete cascade,
  protocol_id uuid not null references public.simple_guachera_protocols(id) on delete cascade,
  status text not null check (status in ('Aplicada', 'No aplicada')),
  done_at timestamptz not null default now(),
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text not null default '',
  notes text not null default '',
  unique (calf_id, protocol_id)
);
create index if not exists simple_guachera_plan_apps_farm on public.simple_guachera_plan_applications (farm_id, done_at);
alter table public.simple_guachera_plan_applications enable row level security;
drop policy if exists "plan_apps_select" on public.simple_guachera_plan_applications;
create policy "plan_apps_select" on public.simple_guachera_plan_applications
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
grant select on public.simple_guachera_plan_applications to authenticated;

-- Operarios y gestión registran (o deshacen con 'Pendiente') una aplicación del plan sanitario.
create or replace function public.simple_guachera_record_plan(calf uuid, protocol uuid, new_status text, plan_notes text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.simple_guachera_calves%rowtype;
  existing public.simple_guachera_plan_applications%rowtype;
begin
  select * into c from public.simple_guachera_calves where id = calf;
  if c.id is null or public.simple_guachera_role(c.farm_id) is null then raise exception 'Ternero no encontrado'; end if;
  if not exists (select 1 from public.simple_guachera_protocols where id = protocol and farm_id = c.farm_id and kind = 'Plan sanitario') then
    raise exception 'Plan sanitario no encontrado';
  end if;
  select * into existing from public.simple_guachera_plan_applications where calf_id = calf and protocol_id = protocol;
  if new_status = 'Pendiente' then
    if existing.id is not null and existing.done_by is distinct from auth.uid() and not public.simple_guachera_is_manager(c.farm_id) then
      raise exception 'Solo quien la registró puede deshacerla';
    end if;
    delete from public.simple_guachera_plan_applications where calf_id = calf and protocol_id = protocol;
    return;
  end if;
  if new_status not in ('Aplicada', 'No aplicada') then raise exception 'Estado inválido'; end if;
  insert into public.simple_guachera_plan_applications (farm_id, calf_id, protocol_id, status, done_by, done_by_name, notes)
  values (c.farm_id, calf, protocol, new_status, auth.uid(), public.simple_guachera_my_name(c.farm_id), coalesce(plan_notes, ''))
  on conflict (calf_id, protocol_id) do update
    set status = excluded.status, done_at = now(), done_by = excluded.done_by, done_by_name = excluded.done_by_name, notes = excluded.notes;
end;
$$;

grant execute on function
  public.simple_guachera_start_treatment(uuid, uuid[], uuid, timestamptz, text, text, text),
  public.simple_guachera_record_plan(uuid, uuid, text, text)
to authenticated;
