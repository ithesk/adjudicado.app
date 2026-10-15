-- ============================================================
--  OPORTUNIDADES DETECTADAS y SALUD DE LAS FUENTES DE LA DGCP
--
--  El barrido programado (/api/cron/oportunidades) lee TODO lo abierto en
--  ComprasDominicana —la API de datos abiertos más lo recién publicado en
--  el portal— y deja aquí, por empresa, lo que su radar considera suyo
--  (nivel alta/media, cierra pronto). La bandeja lo muestra: «qué hay
--  hoy» ya no depende de que la API conteste en ese instante.
--
--  dgcp_fuente_salud guarda cómo estaban las dos fuentes en cada barrido:
--  hasta cuándo llega cada una y su retraso. Si la API lleva más de un
--  día sin actualizarse o el portal dejó de leerse, la bandeja avisa.
--
--  Re-ejecutable. Correr en Supabase → SQL Editor, después de
--  supabase_licitaciones.sql (usa es_miembro).
-- ============================================================

create table if not exists lic_oportunidad (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacion(id) on delete cascade,
  codigo         text not null,                  -- "MIMARENA-DAF-CM-2026-0125"
  titulo         text not null,
  institucion    text,
  modalidad      text,
  monto          numeric(16,2),                  -- presupuesto de la entidad
  divisa         text not null default 'DOP',
  cierre         timestamptz,
  publicado      timestamptz,
  nivel          text not null,                  -- alta | media | explorar
  puntaje        int  not null default 0,
  socios         text[] not null default '{}',   -- vendors de la empresa que menciona
  coincidencias  text[] not null default '{}',
  origen         text not null default 'api',    -- api | portal (recién publicado)
  url            text,
  visto          boolean not null default false,
  descartada     boolean not null default false,
  detectado_at   timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint lic_oportunidad_nivel_valido  check (nivel in ('alta','media','explorar')),
  constraint lic_oportunidad_origen_valido check (origen in ('api','portal'))
);
create unique index if not exists idx_lic_oportunidad_codigo on lic_oportunidad(org_id, codigo);
create index if not exists idx_lic_oportunidad_cierre on lic_oportunidad(org_id, cierre);

alter table lic_oportunidad enable row level security;
-- Leer y marcar (visto/descartada) es de los miembros; escribe el cron con service_role.
drop policy if exists lic_oportunidad_select on lic_oportunidad;
create policy lic_oportunidad_select on lic_oportunidad for select using (es_miembro(org_id));
drop policy if exists lic_oportunidad_update on lic_oportunidad;
create policy lic_oportunidad_update on lic_oportunidad for update
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create table if not exists dgcp_fuente_salud (
  id                bigserial primary key,
  revisado_at       timestamptz not null default now(),
  api_ok            boolean not null,
  api_hasta         timestamptz,                 -- publicación más reciente que tiene la API
  api_procesos      int not null default 0,
  api_error         text,
  portal_ok         boolean not null,
  portal_hasta      timestamptz,                 -- publicación más reciente leída en el portal
  portal_procesos   int not null default 0,
  portal_error      text,
  retraso_horas     numeric(8,1),                -- ahora − api_hasta
  nuevos_del_portal int not null default 0,      -- procesos que solo tenía el portal
  avisos            text[] not null default '{}'
);
create index if not exists idx_dgcp_fuente_salud_fecha on dgcp_fuente_salud(revisado_at desc);

alter table dgcp_fuente_salud enable row level security;
-- Es global (no hay org): cualquier usuario con sesión puede verlo.
drop policy if exists dgcp_fuente_salud_select on dgcp_fuente_salud;
create policy dgcp_fuente_salud_select on dgcp_fuente_salud for select
  using (auth.role() = 'authenticated');
