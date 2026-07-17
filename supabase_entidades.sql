-- ============================================================
--  GESTIÓN DE ENTIDADES — ficha completa por entidad del Estado
--
--  La tabla `institucion` (catálogo unificado que enlazan órdenes y
--  licitaciones) gana perfil (teléfono, logo, notas), asignación a
--  personas o grupos, contactos con extensión, y una bitácora de
--  movimientos propia.
--
--  Re-runnable. Correr en Supabase → SQL Editor (o Management API).
-- ============================================================

-- 1) Perfil: rnc y direccion ya existen (supabase_schema.sql).
alter table institucion add column if not exists telefono text;
alter table institucion add column if not exists logo_url text;   -- storage: {org}/entidades/{id}/logo.*
alter table institucion add column if not exists notas text;

-- 2) Contactos: la tabla `contacto` ya pertenece a suplidor O institución;
--    gana la extensión y notas ("teléfono directo" es su campo telefono).
alter table contacto add column if not exists extension text;
alter table contacto add column if not exists notas text;

-- 3) Asignación: la entidad la atiende una persona, varias, o un grupo.
create table if not exists institucion_asignacion (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacion(id) on delete cascade,
  institucion_id uuid not null references institucion(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  grupo_id       uuid references grupo(id) on delete cascade,
  created_at     timestamptz not null default now(),
  -- exactamente uno: persona o grupo
  constraint asignacion_dueno check (
    (user_id is not null)::int + (grupo_id is not null)::int = 1)
);
create unique index if not exists uq_inst_asig_user
  on institucion_asignacion(institucion_id, user_id) where user_id is not null;
create unique index if not exists uq_inst_asig_grupo
  on institucion_asignacion(institucion_id, grupo_id) where grupo_id is not null;
create index if not exists idx_inst_asig_inst on institucion_asignacion(institucion_id);

alter table institucion_asignacion enable row level security;
drop policy if exists institucion_asignacion_all on institucion_asignacion;
create policy institucion_asignacion_all on institucion_asignacion for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- 4) Bitácora de la entidad: cada movimiento queda escrito.
--    tipo: perfil | logo | contacto | asignacion | nota
create table if not exists institucion_evento (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacion(id) on delete cascade,
  institucion_id uuid not null references institucion(id) on delete cascade,
  autor_id       uuid references auth.users(id),
  tipo           text not null default 'nota',
  texto          text not null,
  created_at     timestamptz not null default now(),
  constraint institucion_evento_tipo check (tipo in
    ('perfil','logo','contacto','asignacion','nota'))
);
create index if not exists idx_inst_evento
  on institucion_evento(institucion_id, created_at desc);

alter table institucion_evento enable row level security;
drop policy if exists institucion_evento_all on institucion_evento;
create policy institucion_evento_all on institucion_evento for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
