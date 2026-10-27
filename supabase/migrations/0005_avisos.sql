-- SInPLe Guachera · avisos con fotos y audio (operario) y diagnóstico (productor / veterinario).
-- Ejecutar una sola vez en Supabase → SQL Editor, después de 0004. Se puede volver a ejecutar.

create table if not exists public.simple_guachera_reports (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.simple_guachera_farms(id) on delete cascade,
  calf_id uuid references public.simple_guachera_calves(id) on delete set null,
  notes text not null default '',
  urgent boolean not null default false,
  -- [{"path": "<farm>/<aviso>/foto-1.jpg", "kind": "foto" | "audio", "mime": "image/jpeg"}]
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Revisado')),
  diagnosis text not null default '',
  diagnosed_by_name text not null default '',
  diagnosed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  check (length(trim(notes)) > 0 or jsonb_array_length(attachments) > 0)
);
create index if not exists simple_guachera_reports_farm on public.simple_guachera_reports (farm_id, status, created_at desc);

create or replace function public.simple_guachera_report_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.author_name := coalesce(public.simple_guachera_my_name(new.farm_id), '');
  new.status := 'Pendiente';
  new.diagnosis := '';
  new.diagnosed_by_name := '';
  new.diagnosed_at := null;
  return new;
end;
$$;
drop trigger if exists simple_guachera_reports_author on public.simple_guachera_reports;
create trigger simple_guachera_reports_author
  before insert on public.simple_guachera_reports
  for each row execute function public.simple_guachera_report_author();

alter table public.simple_guachera_reports enable row level security;
drop policy if exists "reports_select" on public.simple_guachera_reports;
create policy "reports_select" on public.simple_guachera_reports
  for select to authenticated using (public.simple_guachera_role(farm_id) is not null);
drop policy if exists "reports_insert" on public.simple_guachera_reports;
create policy "reports_insert" on public.simple_guachera_reports
  for insert to authenticated with check (public.simple_guachera_role(farm_id) is not null);
-- Borra quien lo creó (mientras está pendiente) o quien gestiona.
drop policy if exists "reports_delete" on public.simple_guachera_reports;
create policy "reports_delete" on public.simple_guachera_reports
  for delete to authenticated using ((created_by = auth.uid() and status = 'Pendiente') or public.simple_guachera_is_manager(farm_id));
grant select, insert, delete on public.simple_guachera_reports to authenticated;

-- Productor o veterinario registran el diagnóstico (o lo vuelven a pendiente).
create or replace function public.simple_guachera_diagnose_report(report uuid, report_diagnosis text, new_status text default 'Revisado')
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.simple_guachera_reports%rowtype;
begin
  select * into r from public.simple_guachera_reports where id = report;
  if r.id is null or not public.simple_guachera_is_manager(r.farm_id) then raise exception 'Solo productor o veterinario pueden diagnosticar avisos'; end if;
  if new_status not in ('Pendiente', 'Revisado') then raise exception 'Estado inválido'; end if;
  update public.simple_guachera_reports
  set diagnosis = coalesce(report_diagnosis, ''), status = new_status,
      diagnosed_by_name = case when new_status = 'Revisado' then coalesce(public.simple_guachera_my_name(r.farm_id), '') else '' end,
      diagnosed_at = case when new_status = 'Revisado' then now() end
  where id = report;
end;
$$;
grant execute on function public.simple_guachera_diagnose_report(uuid, text, text) to authenticated;

-- ───────────── Archivos (fotos y audios) ─────────────
-- Carpeta privada; cada archivo vive en "<id del establecimiento>/<id del aviso>/<archivo>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('simple-guachera-avisos', 'simple-guachera-avisos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.simple_guachera_file_farm(object_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "simple_guachera_avisos_select" on storage.objects;
create policy "simple_guachera_avisos_select" on storage.objects
  for select to authenticated using (bucket_id = 'simple-guachera-avisos' and public.simple_guachera_role(public.simple_guachera_file_farm(name)) is not null);
drop policy if exists "simple_guachera_avisos_insert" on storage.objects;
create policy "simple_guachera_avisos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'simple-guachera-avisos' and public.simple_guachera_role(public.simple_guachera_file_farm(name)) is not null);
drop policy if exists "simple_guachera_avisos_delete" on storage.objects;
create policy "simple_guachera_avisos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'simple-guachera-avisos' and (owner_id = auth.uid()::text or public.simple_guachera_is_manager(public.simple_guachera_file_farm(name))));
