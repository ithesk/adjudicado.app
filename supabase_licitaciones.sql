-- ============================================================
--  Módulo de Licitaciones — persistencia (Fase 2)
--
--  Tablas del proceso PRE-adjudicación: expediente, lotes, ítems
--  con cotizador congelado, requisitos subsanables/no-subsanables,
--  paquetes generados, capabilities y firmantes por rol.
--
--  Prefijo `lic_` OBLIGATORIO (ya existen `item`, `orden`,
--  `documento` — sin prefijo la confusión es garantizada).
--  Multi-tenant con RLS es_miembro(org_id), como todo el repo.
--  Las tablas hijas duplican org_id a propósito: evita subselects
--  en las policies y permite el .eq("org_id", …) defensivo.
--
--  Reutiliza (NO crea): documento_empresa (assets con vencimiento),
--  institucion, suplidor, organizacion/miembro.
--
--  Nota de diseño: lic_entidad_patron nace org-scoped. El patrón
--  "global compartido entre tenants" queda diferido: exigiría un
--  catálogo global de entidades y hoy `institucion` es por org.
--
--  Correr en Supabase → SQL Editor, DESPUÉS de supabase_schema.sql
--  y supabase_empresa.sql. Re-ejecutable.
-- ============================================================

-- ¿Admin de la org? (para escrituras sensibles: perfil, firmantes)
create or replace function es_admin(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from miembro
                 where org_id = p_org and user_id = auth.uid() and rol = 'admin');
$$;

-- ============================================================
--  1. PERFIL DE LA EMPRESA (1:1 con organizacion)
--     La fuente del snapshot `oferente` del contrato canónico, y
--     los defaults del cotizador (herencia empresa → proceso → línea).
-- ============================================================
create table if not exists empresa_perfil (
  org_id        uuid primary key references organizacion(id) on delete cascade,
  nombre_legal  text not null,          -- razón social exacta (≠ nombre de display)
  rnc           text,
  rpe           text,                   -- Registro de Proveedores del Estado
  direccion     text,
  telefono      text,
  email         text,
  -- Defaults del cotizador
  tasa_usd_dop  numeric(10,4),
  tasa_fecha    date,                   -- para avisar "tasa de hace N días"
  margen_pct    numeric(6,3) not null default 30,
  margen_modo   text not null default 'markup',
  itbis_pct     numeric(5,2) not null default 18,
  updated_at    timestamptz not null default now(),
  constraint empresa_margen_modo_valido check (margen_modo in ('markup','margen'))
);
drop trigger if exists trg_empresa_perfil_touch on empresa_perfil;
create trigger trg_empresa_perfil_touch before update on empresa_perfil
  for each row execute function touch_updated_at();

-- ============================================================
--  2. PROCESO — el expediente de una licitación en curso
-- ============================================================
create table if not exists lic_proceso (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizacion(id) on delete cascade,
  institucion_id  uuid references institucion(id) on delete set null,
  codigo          text not null,        -- "OGTIC-CCC-CP-2026-0011"
  modalidad       text not null default 'OTRO',
  objeto          text,
  moneda          text not null default 'DOP',
  adjudicacion    text not null default 'total',
  criterio        text not null default 'menor_precio',
  plazo_pago_dias int,
  cierre          timestamptz,          -- fecha+hora límite; EL reloj del proceso
  estado          text not null default 'captura',
  -- Overrides del cotizador (null = hereda de empresa_perfil)
  tasa_usd_dop    numeric(10,4),
  margen_pct      numeric(6,3),
  itbis_pct       numeric(5,2),
  notas           text,
  creado_por      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint lic_proceso_modalidad_valida check
    (modalidad in ('CM','CD','LPN','CP','SB','OTRO')),
  constraint lic_proceso_moneda_valida check (moneda in ('DOP','USD')),
  constraint lic_proceso_adjudicacion_valida check
    (adjudicacion in ('item','lote','total')),
  constraint lic_proceso_criterio_valido check
    (criterio in ('menor_precio','calidad_precio','calidad')),
  constraint lic_proceso_estado_valido check (estado in
    ('captura','calificacion','costeo','armado','listo','sometido',
     'subsanacion','adjudicado','perdido','descartado'))
);
create unique index if not exists idx_lic_proceso_codigo on lic_proceso(org_id, codigo);
create index if not exists idx_lic_proceso_org    on lic_proceso(org_id);
create index if not exists idx_lic_proceso_estado on lic_proceso(org_id, estado);
create index if not exists idx_lic_proceso_cierre on lic_proceso(org_id, cierre);
drop trigger if exists trg_lic_proceso_touch on lic_proceso;
create trigger trg_lic_proceso_touch before update on lic_proceso
  for each row execute function touch_updated_at();

-- Enlace post-adjudicación (Fase 6 lo cablea; la FK se deja lista).
alter table orden add column if not exists proceso_id uuid references lic_proceso(id) on delete set null;
create index if not exists idx_orden_proceso on orden(proceso_id);

-- ============================================================
--  3. LOTES E ÍTEMS
-- ============================================================
create table if not exists lic_lote (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  proceso_id  uuid not null references lic_proceso(id) on delete cascade,
  numero      int not null,
  nombre      text,
  unique (proceso_id, numero)
);
create index if not exists idx_lic_lote_proceso on lic_lote(proceso_id);
create index if not exists idx_lic_lote_org     on lic_lote(org_id);

create table if not exists lic_item (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizacion(id) on delete cascade,
  proceso_id      uuid not null references lic_proceso(id) on delete cascade,
  lote_id         uuid references lic_lote(id) on delete set null,
  numero          int not null,
  -- Texto TAL CUAL del pliego: evidencia legal. NUNCA se edita ni normaliza.
  spec_cruda      text not null,
  cantidad        numeric(12,2) not null default 1,
  unidad          text not null default 'UD',
  -- Lo que la empresa decide ofertar (separado de la spec del pliego)
  marca           text,
  modelo          text,
  parte           text,
  descripcion     text,                 -- redacción afirmativa, sin "Cumple/No cumple"
  ofertamos       boolean not null default true,
  motivo_descarte text,
  -- Cotizador CONGELADO al cotizar (snapshot, no referencia viva).
  -- Enlace estable al catálogo de Precios: (suplidor_id, sku) sobrevive
  -- re-importaciones de listas. Campos null en líneas manuales.
  suplidor_id     uuid references suplidor(id) on delete set null,
  sku             text,
  costo_usd       numeric(14,4),
  tasa            numeric(10,4),
  margen_pct      numeric(6,3),
  margen_modo     text,
  precio_unitario numeric(14,2),        -- DOP, venta, SIN ITBIS
  itbis_aplica    boolean not null default true,
  orden_indice    int not null default 0,
  unique (proceso_id, numero),
  constraint lic_item_margen_modo_valido check
    (margen_modo is null or margen_modo in ('markup','margen'))
);
create index if not exists idx_lic_item_proceso on lic_item(proceso_id, orden_indice);
create index if not exists idx_lic_item_org     on lic_item(org_id);
create index if not exists idx_lic_item_sku     on lic_item(org_id, suplidor_id, sku);

-- ============================================================
--  4. REQUISITOS — el corazón del gate de no-subsanables
-- ============================================================
create table if not exists lic_requisito (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizacion(id) on delete cascade,
  proceso_id           uuid not null references lic_proceso(id) on delete cascade,
  codigo               text not null,   -- "SNCC.F.042", "CERT-DGII", libre
  nombre               text not null,
  -- FAIL-SAFE: ante la duda, un requisito es crítico. Un no-subsanable
  -- faltante descalifica — ya pasó una vez.
  subsanable           boolean not null default false,
  fuente               text,            -- dónde en el pliego se exige
  firmante_rol         text not null default 'gerente_general',
  origen               text not null default 'externo',
  estado               text not null default 'pendiente',
  documento_empresa_id uuid references documento_empresa(id) on delete set null,
  storage_path         text,            -- archivo subido para ESTE proceso
  orden_indice         int not null default 0,
  unique (proceso_id, codigo),
  constraint lic_requisito_firmante_valido check
    (firmante_rol in ('gerente_general','gerente_ventas','ninguno')),
  constraint lic_requisito_origen_valido check
    (origen in ('generado','plantilla_oficial','documento_empresa','externo')),
  constraint lic_requisito_estado_valido check (estado in ('pendiente','listo'))
);
create index if not exists idx_lic_requisito_proceso on lic_requisito(proceso_id, orden_indice);
create index if not exists idx_lic_requisito_org     on lic_requisito(org_id);
-- El gate consulta esto en cada render: no-subsanables pendientes.
create index if not exists idx_lic_requisito_gate
  on lic_requisito(proceso_id) where (not subsanable and estado = 'pendiente');

-- ============================================================
--  5. PAQUETES — cada generación, con su payload exacto (idempotencia)
-- ============================================================
create table if not exists lic_paquete (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizacion(id) on delete cascade,
  proceso_id   uuid not null references lic_proceso(id) on delete cascade,
  version      int not null,
  payload      jsonb not null,          -- el JSON canónico EXACTO que se usó
  payload_hash text not null,           -- mismo hash = mismo paquete
  storage_path text,                    -- el ZIP en storage
  generado_por uuid references auth.users(id),
  generado_at  timestamptz not null default now(),
  unique (proceso_id, version)
);
create index if not exists idx_lic_paquete_org on lic_paquete(org_id);

-- ============================================================
--  6. CAPABILITIES — qué vendors puede ofertar la organización
-- ============================================================
create table if not exists lic_capability (
  org_id  uuid not null references organizacion(id) on delete cascade,
  vendor  text not null,                -- minúsculas: 'microsoft', 'sophos'…
  estado  text not null,
  nota    text,
  primary key (org_id, vendor),
  constraint lic_capability_estado_valido check
    (estado in ('partner','canal','ninguno','blocker'))
);

-- ============================================================
--  7. FIRMANTES — rol → persona, por organización. NUNCA nombres
--     hardcodeados en el código: esto se vende a otros proveedores.
-- ============================================================
create table if not exists lic_firmante (
  org_id       uuid not null references organizacion(id) on delete cascade,
  rol          text not null,
  nombre       text not null,
  cedula       text,
  cargo        text,
  firma_doc_id uuid references documento_empresa(id) on delete set null,  -- imagen de firma
  sello_doc_id uuid references documento_empresa(id) on delete set null,  -- imagen de sello
  primary key (org_id, rol),
  constraint lic_firmante_rol_valido check
    (rol in ('gerente_general','gerente_ventas'))
);

-- ============================================================
--  8. MEMORIA INSTITUCIONAL — patrones por entidad convocante
--     ("en tal entidad la carta de fabricante es no-subsanable").
--     Org-scoped por ahora; el compartir global queda diferido.
-- ============================================================
create table if not exists lic_entidad_patron (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacion(id) on delete cascade,
  institucion_id uuid not null references institucion(id) on delete cascade,
  clave          text not null,
  valor          jsonb not null default '{}'::jsonb,
  nota           text,
  confianza      int not null default 1,   -- sube cada vez que se confirma
  created_at     timestamptz not null default now(),
  unique (org_id, institucion_id, clave)
);
create index if not exists idx_lic_entidad_patron_inst
  on lic_entidad_patron(org_id, institucion_id);

-- ============================================================
--  RLS — es_miembro(org_id) para todo; el perfil y los firmantes
--  los escribe solo un admin (datos fiscales y de firma).
-- ============================================================
alter table empresa_perfil     enable row level security;
alter table lic_proceso        enable row level security;
alter table lic_lote           enable row level security;
alter table lic_item           enable row level security;
alter table lic_requisito      enable row level security;
alter table lic_paquete        enable row level security;
alter table lic_capability     enable row level security;
alter table lic_firmante       enable row level security;
alter table lic_entidad_patron enable row level security;

drop policy if exists empresa_perfil_select on empresa_perfil;
drop policy if exists empresa_perfil_insert on empresa_perfil;
drop policy if exists empresa_perfil_update on empresa_perfil;
create policy empresa_perfil_select on empresa_perfil for select using (es_miembro(org_id));
create policy empresa_perfil_insert on empresa_perfil for insert with check (es_admin(org_id));
create policy empresa_perfil_update on empresa_perfil for update
  using (es_admin(org_id)) with check (es_admin(org_id));

drop policy if exists lic_proceso_all on lic_proceso;
create policy lic_proceso_all on lic_proceso for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_lote_all on lic_lote;
create policy lic_lote_all on lic_lote for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_item_all on lic_item;
create policy lic_item_all on lic_item for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_requisito_all on lic_requisito;
create policy lic_requisito_all on lic_requisito for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_paquete_all on lic_paquete;
create policy lic_paquete_all on lic_paquete for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_capability_all on lic_capability;
create policy lic_capability_all on lic_capability for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
drop policy if exists lic_entidad_patron_all on lic_entidad_patron;
create policy lic_entidad_patron_all on lic_entidad_patron for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

drop policy if exists lic_firmante_select on lic_firmante;
drop policy if exists lic_firmante_write  on lic_firmante;
drop policy if exists lic_firmante_update on lic_firmante;
drop policy if exists lic_firmante_delete on lic_firmante;
create policy lic_firmante_select on lic_firmante for select using (es_miembro(org_id));
create policy lic_firmante_write  on lic_firmante for insert with check (es_admin(org_id));
create policy lic_firmante_update on lic_firmante for update
  using (es_admin(org_id)) with check (es_admin(org_id));
create policy lic_firmante_delete on lic_firmante for delete using (es_admin(org_id));

revoke execute on function es_admin(uuid) from public, anon;
grant  execute on function es_admin(uuid) to authenticated;

-- ============================================================
--  SEED — capabilities del tenant principal (confirmado por Pablo
--  el 2026-07-14). Idempotente; no toca otros tenants.
-- ============================================================
insert into lic_capability (org_id, vendor, estado, nota)
select o.id, v.vendor, v.estado, v.nota
from organizacion o
cross join (values
  ('microsoft',    'partner', null),
  ('adobe',        'partner', null),
  ('veeam',        'partner', null),
  ('fortinet',     'partner', null),
  ('kaspersky',    'partner', null),
  ('lenovo',       'partner', null),
  ('zoom',         'partner', null),
  ('manageengine', 'partner', null),
  ('sophos',       'blocker', 'Bloqueado — no ofertar'),
  ('autodesk',     'ninguno', 'Sin canal de distribución'),
  ('google',       'ninguno', 'Sin canal de distribución')
) as v(vendor, estado, nota)
where o.id = '1ae66d63-f4e6-4463-8e6d-dc4035a8b554'
on conflict (org_id, vendor) do nothing;

-- ============================================================
--  MIGRACIÓN: constructor de plantillas (sin código)
--  El usuario sube un Word, arrastra variables sobre los huecos
--  detectados, y la plantilla queda reutilizable en la generación.
-- ============================================================
create table if not exists lic_plantilla (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizacion(id) on delete cascade,
  codigo           text not null,           -- enlaza con el requisito ("MI-CARTA-X")
  nombre           text not null,
  descripcion      text,
  archivo_original text not null,           -- storage: el .docx tal cual subió
  archivo_tpl      text,                    -- storage: el taggeado (al guardar)
  asignaciones     jsonb not null default '[]'::jsonb,
  estado           text not null default 'borrador',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, codigo),
  constraint lic_plantilla_estado_valido check (estado in ('borrador','lista'))
);
create index if not exists idx_lic_plantilla_org on lic_plantilla(org_id);
drop trigger if exists trg_lic_plantilla_touch on lic_plantilla;
create trigger trg_lic_plantilla_touch before update on lic_plantilla
  for each row execute function touch_updated_at();

alter table lic_plantilla enable row level security;
drop policy if exists lic_plantilla_all on lic_plantilla;
create policy lic_plantilla_all on lic_plantilla for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- Variables personalizadas del constructor: fijas (valor definido en la
-- plantilla, ej. "dominicano") o preguntadas al generar (valor vacío → cada
-- proceso captura el suyo en lic_requisito.datos).
alter table lic_plantilla add column if not exists variables_personalizadas jsonb not null default '[]'::jsonb;
alter table lic_requisito add column if not exists datos jsonb not null default '{}'::jsonb;

-- ============================================================
--  MIGRACIÓN: variantes de plantilla por ENTIDAD
--  A veces una entidad exige su propia versión de un formulario
--  (pequeños cambios sobre el estándar). Una plantilla sin
--  institucion_id es la genérica de la organización; con
--  institucion_id es la variante que GANA cuando el proceso es
--  de esa entidad (cascada: entidad → org → sistema).
-- ============================================================
alter table lic_plantilla add column if not exists institucion_id uuid references institucion(id) on delete cascade;

-- La unicidad deja de ser (org, codigo) a secas: una genérica por código
-- + una variante por código y entidad.
alter table lic_plantilla drop constraint if exists lic_plantilla_org_id_codigo_key;
create unique index if not exists uq_lic_plantilla_base
  on lic_plantilla(org_id, codigo) where institucion_id is null;
create unique index if not exists uq_lic_plantilla_variante
  on lic_plantilla(org_id, codigo, institucion_id) where institucion_id is not null;
create index if not exists idx_lic_plantilla_institucion
  on lic_plantilla(institucion_id) where institucion_id is not null;

-- La bitácora de la entidad también registra sus plantillas propias.
alter table institucion_evento drop constraint if exists institucion_evento_tipo;
alter table institucion_evento add constraint institucion_evento_tipo check (tipo in
  ('perfil','logo','contacto','asignacion','nota','plantilla'));

-- ============================================================
--  MIGRACIÓN: SUBSANACIÓN
--  Tras presentar la oferta, la entidad puede pedir por correo
--  documentos faltantes o corregidos con una FECHA LÍMITE corta.
--  Se registra el pedido, se marcan los requisitos afectados
--  (lic_requisito.subsanacion_id) y se genera un paquete chico
--  solo con eso. Estados: abierta → enviada → cerrada.
-- ============================================================
create table if not exists lic_subsanacion (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizacion(id) on delete cascade,
  proceso_id   uuid not null references lic_proceso(id) on delete cascade,
  fecha_limite timestamptz not null,
  texto        text,                    -- el correo de la entidad, pegado tal cual
  estado       text not null default 'abierta',
  enviada_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lic_subsanacion_estado_valido check (estado in ('abierta','enviada','cerrada'))
);
create index if not exists idx_lic_subsanacion_proceso on lic_subsanacion(proceso_id);
drop trigger if exists trg_lic_subsanacion_touch on lic_subsanacion;
create trigger trg_lic_subsanacion_touch before update on lic_subsanacion
  for each row execute function touch_updated_at();
alter table lic_subsanacion enable row level security;
drop policy if exists lic_subsanacion_all on lic_subsanacion;
create policy lic_subsanacion_all on lic_subsanacion for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- Qué requisitos pidió la subsanación (marcar = vuelve a "pendiente").
alter table lic_requisito add column if not exists subsanacion_id uuid references lic_subsanacion(id) on delete set null;

-- La bitácora de la entidad también registra sus subsanaciones.
alter table institucion_evento drop constraint if exists institucion_evento_tipo;
alter table institucion_evento add constraint institucion_evento_tipo check (tipo in
  ('perfil','logo','contacto','asignacion','nota','plantilla','subsanacion'));
