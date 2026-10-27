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

-- 3. Perfil de cada cuenta: nombre de usuario único y rol (siempre "profesor")
create table if not exists public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique,
  correo  text not null,
  rol     text not null default 'profesor' check (rol = 'profesor'),
  creado  timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- El usuario tal como el docente lo escribió (con mayúsculas, espacios y tildes); "usuario" guarda la forma para comparar
alter table public.perfiles add column if not exists usuario_visible text;

drop policy if exists "ver su perfil" on public.perfiles;
create policy "ver su perfil" on public.perfiles
  for select using (auth.uid() = id);

-- Al crear una cuenta se crea su perfil; el rol siempre es "profesor", sin importar lo que se envíe
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, usuario, usuario_visible, correo, rol)
  values (
    new.id,
    lower(trim(coalesce(nullif(new.raw_user_meta_data ->> 'usuario_clave', ''), nullif(new.raw_user_meta_data ->> 'usuario', ''), split_part(new.email, '@', 1)))),
    coalesce(nullif(new.raw_user_meta_data ->> 'usuario', ''), split_part(new.email, '@', 1)),
    new.email,
    'profesor'
  );
  return new;
end;
$$;

drop trigger if exists al_crear_cuenta on auth.users;
create trigger al_crear_cuenta
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Para poder entrar escribiendo el usuario en vez del correo
create or replace function public.correo_de_usuario(p_usuario text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select correo from public.perfiles where usuario = lower(trim(p_usuario)) limit 1;
$$;

-- Para avisar en el registro si el usuario ya está ocupado
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.perfiles where usuario = lower(trim(p_usuario)));
$$;

grant execute on function public.correo_de_usuario(text) to anon, authenticated;
grant execute on function public.usuario_disponible(text) to anon, authenticated;

-- 4. Planes y códigos de activación
-- Hasta cuándo puede usar la aplicación cada profesor
alter table public.perfiles add column if not exists vence timestamptz;

-- Códigos que el administrador genera al recibir un pago (cada uno sirve una sola vez)
create table if not exists public.codigos (
  codigo       text primary key,
  plan_dias    integer not null check (plan_dias > 0),
  nota         text,
  creado       timestamptz not null default now(),
  reservado_en timestamptz,
  usado_por    uuid references auth.users (id) on delete set null,
  usado_en     timestamptz,
  anulado      boolean not null default false
);

-- Sin políticas: solo el servidor de la aplicación puede leer y cambiar los códigos
alter table public.codigos enable row level security;

-- ¿El profesor que está usando la app tiene el plan al día?
create or replace function public.plan_vigente()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and vence > now());
$$;

-- Con el plan vencido el profesor puede ver su planeación, pero no guardar cambios
drop policy if exists "crear su planeacion" on public.planeaciones;
create policy "crear su planeacion" on public.planeaciones
  for insert with check (auth.uid() = user_id and public.plan_vigente());

drop policy if exists "editar su planeacion" on public.planeaciones;
create policy "editar su planeacion" on public.planeaciones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.plan_vigente());
