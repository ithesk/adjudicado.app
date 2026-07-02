-- ============================================================
--  Centro de Ejecución SK — schema de PRODUCCIÓN (v1)
--  De la orden de compra al cobro. Incluye todo lo construido:
--  responsable, ítem como unidad de seguimiento (suplidor/canal/
--  estado/ETA/condiciones), catálogo de suplidores e instituciones
--  con contactos, bitácora con eventos + reacciones + comentarios,
--  coordinación por ítem, y documentos.
--
--  Correr en Supabase → SQL Editor, sobre un proyecto nuevo.
--  Luego correr supabase_storage.sql para los buckets.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
--  1. ORGANIZACIÓN  (multi-tenant)
-- ============================================================
create table organizacion (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
--  2. MIEMBRO  (colaboradores)
-- ============================================================
create table miembro (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  user_id     uuid not null references auth.users(id)   on delete cascade,
  nombre      text,
  rol         text not null default 'colaborador',   -- 'admin' | 'colaborador'
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Helper RLS: ¿el usuario actual pertenece a esta organización?
create or replace function es_miembro(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from miembro where org_id = p_org and user_id = auth.uid()
  );
$$;

-- ============================================================
--  3. INSTITUCIÓN  (catálogo: instituciones del Estado)
-- ============================================================
create table institucion (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  nombre      text not null,
  siglas      text,
  created_at  timestamptz not null default now()
);
create index idx_institucion_org on institucion(org_id);

-- ============================================================
--  4. SUPLIDOR  (catálogo reutilizable)
-- ============================================================
create table suplidor (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  nombre      text not null,
  canal       text,   -- 'suscripcion'|'amazon'|'distribuidor'|'fabricante'|'directo'
  notas       text,
  created_at  timestamptz not null default now(),
  constraint canal_valido check (canal is null or canal in
    ('suscripcion','amazon','distribuidor','fabricante','directo'))
);
create index idx_suplidor_org on suplidor(org_id);

-- ============================================================
--  5. CONTACTO  (reutilizable; pertenece a un suplidor O a una institución)
-- ============================================================
create table contacto (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacion(id) on delete cascade,
  suplidor_id    uuid references suplidor(id) on delete cascade,
  institucion_id uuid references institucion(id) on delete cascade,
  nombre         text not null,
  rol            text,
  email          text,
  telefono       text,
  created_at     timestamptz not null default now(),
  -- pertenece exactamente a uno (suplidor o institución)
  constraint contacto_dueno check (
    (suplidor_id is not null)::int + (institucion_id is not null)::int = 1)
);
create index idx_contacto_suplidor    on contacto(suplidor_id);
create index idx_contacto_institucion on contacto(institucion_id);

-- ============================================================
--  6. ORDEN  (el corazón — nace al subir la OC)
-- ============================================================
create table orden (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizacion(id) on delete cascade,

  numero_oc         text,
  institucion       text,                              -- nombre (texto del OCR)
  institucion_id    uuid references institucion(id),   -- enlace al catálogo (opcional)
  codigo_expediente text,
  monto             numeric(14,2),
  moneda            text not null default 'DOP',
  fecha_oc          date,

  plazo_entrega     date,                        -- reloj de la institución
  estado            text not null default 'orden_recibida',

  -- Quién conduce la orden (trabajo en equipo)
  responsable_id    uuid references auth.users(id),
  colaboradores     uuid[] not null default '{}',  -- colaboradores además del responsable

  -- Suplidor a nivel de orden (compat; el seguimiento real es por ítem)
  suplidor              text,
  suplidor_estado       text,
  suplidor_fecha_estim  date,

  -- Pago
  metodo_pago       text,
  plazo_pago_dias   int,

  -- Marcadores libres
  etiquetas         text[] not null default '{}',

  oc_archivo_url    text,
  ocr_raw           jsonb,

  creado_por        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint estado_valido check (estado in (
    'orden_recibida','en_coordinacion','entregado',
    'listo_facturar','facturado','libramiento','cobrado','cerrado'))
);
create index idx_orden_org         on orden(org_id);
create index idx_orden_estado      on orden(org_id, estado);
create index idx_orden_plazo       on orden(org_id, plazo_entrega);
create index idx_orden_responsable on orden(responsable_id);

-- ============================================================
--  7. ITEM  (la unidad real de seguimiento)
-- ============================================================
create table item (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references orden(id) on delete cascade,
  nombre        text not null,
  tipo          text not null default 'licencia',  -- 'licencia'|'fisico'|'servicio'
  cantidad      numeric(12,2) not null default 1,
  entregado     boolean not null default false,
  fecha_entrega date,
  notas         text,
  orden_indice  int not null default 0,

  -- El ítem como mini-proyecto de cumplimiento:
  suplidor      text,                                  -- nombre (compat / texto)
  suplidor_id   uuid references suplidor(id),          -- enlace al catálogo
  canal         text,
  estado_item   text,                                  -- clave del flujo por tipo
  fecha_estim   date,                                  -- ETA propia
  precio        numeric,                               -- precio acordado del ítem
  condiciones   text,
  asignaciones  jsonb,                                 -- reparto entre suplidores

  constraint tipo_valido check (tipo in ('licencia','fisico','servicio')),
  constraint item_canal_valido check (canal is null or canal in
    ('suscripcion','amazon','distribuidor','fabricante','directo'))
);
create index idx_item_orden    on item(orden_id);
create index idx_item_suplidor on item(suplidor_id);

-- ============================================================
--  8. BITACORA  (notas, correos, llamadas, suplidor + EVENTOS del sistema)
--     item_id != null  → coordinación de un ítem específico.
-- ============================================================
create table bitacora (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  item_id     uuid references item(id) on delete cascade,   -- coordinación por ítem
  autor_id    uuid references auth.users(id),
  tipo        text not null default 'nota',
  texto       text not null,
  created_at  timestamptz not null default now(),
  constraint bitacora_tipo_valido check (tipo in
    ('nota','correo','llamada','suplidor','evento'))
);
create index idx_bitacora_orden on bitacora(orden_id, created_at desc);
create index idx_bitacora_item  on bitacora(item_id);

-- ---------- Reacciones a una entrada de bitácora ----------
create table bitacora_reaccion (
  id           uuid primary key default gen_random_uuid(),
  bitacora_id  uuid not null references bitacora(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  unique (bitacora_id, user_id, emoji)
);
create index idx_reaccion_bitacora on bitacora_reaccion(bitacora_id);

-- ---------- Comentarios (hilo) en una entrada de bitácora ----------
create table bitacora_comentario (
  id           uuid primary key default gen_random_uuid(),
  bitacora_id  uuid not null references bitacora(id) on delete cascade,
  autor_id     uuid references auth.users(id),
  texto        text not null,
  created_at   timestamptz not null default now()
);
create index idx_comentario_bitacora on bitacora_comentario(bitacora_id, created_at);

-- ============================================================
--  9. DOCUMENTO  (adjuntos; archivos en Storage)
--     item_id opcional → documento ligado a un ítem.
-- ============================================================
create table documento (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  item_id     uuid references item(id) on delete set null,
  nombre      text not null,
  tipo        text default 'otro',  -- 'acta'|'carta_fabricante'|'factura'|'oc'|'otro'
  archivo_url text not null,
  subido_por  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index idx_documento_orden on documento(orden_id);

-- ============================================================
--  updated_at automático en orden
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trg_orden_touch before update on orden
  for each row execute function touch_updated_at();

-- ============================================================
--  RLS — todo se filtra por organización
-- ============================================================
alter table organizacion        enable row level security;
alter table miembro             enable row level security;
alter table institucion         enable row level security;
alter table suplidor            enable row level security;
alter table contacto            enable row level security;
alter table orden               enable row level security;
alter table item                enable row level security;
alter table bitacora            enable row level security;
alter table bitacora_reaccion   enable row level security;
alter table bitacora_comentario enable row level security;
alter table documento           enable row level security;

create policy org_select on organizacion for select using (es_miembro(id));
create policy miembro_select on miembro for select using (es_miembro(org_id));

create policy institucion_all on institucion for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy suplidor_all on suplidor for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy contacto_all on contacto for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create policy orden_all on orden for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create policy item_all on item for all
  using (es_miembro((select org_id from orden where orden.id = item.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = item.orden_id)));

create policy bitacora_all on bitacora for all
  using (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)));

create policy documento_all on documento for all
  using (es_miembro((select org_id from orden where orden.id = documento.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = documento.orden_id)));

-- Reacciones/comentarios: a través de la orden dueña de la bitácora.
create policy reaccion_all on bitacora_reaccion for all
  using (es_miembro((select o.org_id from orden o
    join bitacora b on b.orden_id = o.id where b.id = bitacora_reaccion.bitacora_id)))
  with check (es_miembro((select o.org_id from orden o
    join bitacora b on b.orden_id = o.id where b.id = bitacora_reaccion.bitacora_id)));

create policy comentario_all on bitacora_comentario for all
  using (es_miembro((select o.org_id from orden o
    join bitacora b on b.orden_id = o.id where b.id = bitacora_comentario.bitacora_id)))
  with check (es_miembro((select o.org_id from orden o
    join bitacora b on b.orden_id = o.id where b.id = bitacora_comentario.bitacora_id)));

-- ============================================================
--  Semilla mínima (ajusta el user_id; correr autenticado o por API)
-- ============================================================
-- insert into organizacion (id, nombre)
--   values ('00000000-0000-0000-0000-000000000001','Innovación Tecnológica SK, SRL');
-- insert into miembro (org_id, user_id, nombre, rol)
--   values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'Tu Nombre', 'admin');

-- ============================================================
--  MIGRACIONES POSTERIORES AL v0 (aplicadas en producción)
--  Mantener sincronizado: esto reproduce el estado actual.
-- ============================================================

-- Ítems: componentes (sub-ítems) — jerarquía recursiva
alter table item add column if not exists parent_id uuid references item(id) on delete cascade;
create index if not exists idx_item_parent on item(parent_id);

-- Bitácora: entradas editables + adjunto vinculado
alter table bitacora add column if not exists editada boolean not null default false;
alter table bitacora add column if not exists documento_id uuid references documento(id) on delete set null;

-- Grupos / equipos dentro de la empresa
create table if not exists grupo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacion(id) on delete cascade,
  nombre text not null,
  color text,
  created_at timestamptz not null default now()
);
alter table grupo enable row level security;
create policy grupo_all on grupo for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

create table if not exists grupo_miembro (
  grupo_id uuid not null references grupo(id) on delete cascade,
  user_id uuid not null,
  primary key (grupo_id, user_id)
);
alter table grupo_miembro enable row level security;
create policy grupo_miembro_all on grupo_miembro for all
  using (es_miembro((select org_id from grupo where id = grupo_id)))
  with check (es_miembro((select org_id from grupo where id = grupo_id)));

alter table orden add column if not exists grupo_id uuid references grupo(id) on delete set null;

-- Buzón de correo entrante por orden (oc-<buzon>@dominio)
alter table orden add column if not exists buzon text unique;
update orden set buzon = substr(md5(id::text), 1, 8) where buzon is null;
create or replace function public.set_buzon() returns trigger
language plpgsql as $fn$
begin
  if new.buzon is null then new.buzon := substr(md5(new.id::text), 1, 8); end if;
  return new;
end $fn$;
drop trigger if exists orden_buzon on orden;
create trigger orden_buzon before insert on orden
  for each row execute function public.set_buzon();

-- Integración Odoo (factura vinculada)
alter table orden add column if not exists odoo_factura_id bigint;
alter table orden add column if not exists odoo_factura_estado text;

-- Búsqueda global insensible a acentos (Cmd/Ctrl+K)
create extension if not exists unaccent with schema extensions;
-- La función buscar_global(p_org, p_q) vive en la BD (security definer,
-- guard es_miembro, execute solo para authenticated). Ver commit 38ab351.

-- Tiempo real de la bitácora
alter publication supabase_realtime add table bitacora;
alter publication supabase_realtime add table bitacora_comentario;
