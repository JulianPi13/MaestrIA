-- Base de datos de la aplicación (Supabase).
-- Cópielo completo en Supabase → SQL Editor → New query, y toque "Run". Se ejecuta una sola vez.

-- 1. La planeación de cada docente (una fila por cuenta)
create table if not exists public.planeaciones (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  datos       jsonb not null,
  actualizado timestamptz not null default now()
);

alter table public.planeaciones enable row level security;

-- Cada docente solo puede ver y cambiar su propia planeación
drop policy if exists "ver su planeacion" on public.planeaciones;
create policy "ver su planeacion" on public.planeaciones
  for select using (auth.uid() = user_id);

drop policy if exists "crear su planeacion" on public.planeaciones;
create policy "crear su planeacion" on public.planeaciones
  for insert with check (auth.uid() = user_id);

drop policy if exists "editar su planeacion" on public.planeaciones;
create policy "editar su planeacion" on public.planeaciones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Cuántas guías con IA ha generado cada docente en el mes
create table if not exists public.uso_ia (
  user_id  uuid not null references auth.users (id) on delete cascade,
  mes      text not null,              -- por ejemplo '2026-10'
  cantidad integer not null default 0,
  primary key (user_id, mes)
);

-- Sin políticas: solo el servidor de la aplicación puede leerla y escribirla
alter table public.uso_ia enable row level security;

create or replace function public.sumar_uso_ia(p_user uuid, p_mes text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.uso_ia (user_id, mes, cantidad)
  values (p_user, p_mes, 1)
  on conflict (user_id, mes) do update set cantidad = public.uso_ia.cantidad + 1
  returning cantidad;
$$;

revoke execute on function public.sumar_uso_ia(uuid, text) from public, anon, authenticated;
grant execute on function public.sumar_uso_ia(uuid, text) to service_role;
