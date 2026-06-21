-- ============================================================
--  Centro de Ejecución SK — esquema base (v0)
--  Seguimiento de órdenes post-adjudicación: de la OC al cobro
--  Correr en: Supabase → SQL Editor
-- ============================================================

-- ---------- Extensiones ----------
create extension if not exists "pgcrypto";

-- ============================================================
--  1. ORGANIZACIÓN  (multi-tenant; para uso interno = 1 fila)
-- ============================================================
create table organizacion (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
--  2. MIEMBRO  (colaboradores de la empresa)
--     Une auth.users con una organización y un rol.
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

-- Helper para RLS: ¿el usuario actual pertenece a esta organización?
create or replace function es_miembro(p_org uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from miembro
    where org_id = p_org and user_id = auth.uid()
  );
$$;

-- ============================================================
--  3. ORDEN  (el corazón — nace al subir la OC)
-- ============================================================
create table orden (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizacion(id) on delete cascade,

  -- Datos de la orden (vienen del AI OCR de la OC; editables)
  numero_oc         text,
  institucion       text,
  codigo_expediente text,
  monto             numeric(14,2),
  moneda            text not null default 'DOP',
  fecha_oc          date,

  -- El único dato manual obligatorio: el reloj de la institución
  plazo_entrega     date,

  -- Estado (máquina de estados, enfocada en entrega→cobro)
  estado            text not null default 'orden_recibida',
    -- 'orden_recibida' | 'en_coordinacion' | 'entregado'
    -- | 'listo_facturar' | 'facturado' | 'cobrado' | 'cerrado'

  -- Segundo reloj: el suplidor (Ingram, distribuidor, etc.)
  suplidor              text,
  suplidor_estado       text,   -- 'pedido' | 'en_transito' | 'recibido'
  suplidor_fecha_estim  date,    -- cuándo llega el producto

  -- Pago
  metodo_pago       text,
  plazo_pago_dias   int,

  -- Marcadores libres: {'urgente','espera-suplidor','espera-acta'}
  etiquetas         text[] not null default '{}',

  -- Archivo de la OC original + lo que el OCR extrajo (para auditar)
  oc_archivo_url    text,
  ocr_raw           jsonb,

  creado_por        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint estado_valido check (estado in (
    'orden_recibida','en_coordinacion','entregado',
    'listo_facturar','facturado','cobrado','cerrado'
  ))
);

create index idx_orden_org      on orden(org_id);
create index idx_orden_estado   on orden(org_id, estado);
create index idx_orden_plazo    on orden(org_id, plazo_entrega);

-- ============================================================
--  4. ITEM  (cada ítem es particular; del OCR, editable)
-- ============================================================
create table item (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references orden(id) on delete cascade,
  nombre        text not null,
  tipo          text not null default 'licencia',  -- 'licencia' | 'fisico' | 'servicio'
  cantidad      numeric(12,2) not null default 1,
  entregado     boolean not null default false,
  fecha_entrega date,
  notas         text,
  orden_indice  int not null default 0,
  constraint tipo_valido check (tipo in ('licencia','fisico','servicio'))
);

create index idx_item_orden on item(orden_id);

-- ============================================================
--  5. BITACORA  (documentar: notas, correos, llamadas, suplidor)
--     La llamada es la más importante: se evapora si no se anota.
-- ============================================================
create table bitacora (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  autor_id    uuid references auth.users(id),
  tipo        text not null default 'nota',  -- 'nota' | 'correo' | 'llamada' | 'suplidor'
  texto       text not null,
  created_at  timestamptz not null default now(),
  constraint bitacora_tipo_valido check (tipo in ('nota','correo','llamada','suplidor'))
);

create index idx_bitacora_orden on bitacora(orden_id, created_at desc);

-- ============================================================
--  6. DOCUMENTO  (adjuntar todo tipo de doc: actas, cartas, etc.)
--     Los archivos viven en Supabase Storage; aquí solo la referencia.
-- ============================================================
create table documento (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  nombre      text not null,
  tipo        text default 'otro',  -- 'acta' | 'carta_fabricante' | 'factura' | 'oc' | 'otro'
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
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_orden_touch
  before update on orden
  for each row execute function touch_updated_at();

-- ============================================================
--  RLS  — cada quien solo ve lo de su organización
-- ============================================================
alter table organizacion enable row level security;
alter table miembro      enable row level security;
alter table orden        enable row level security;
alter table item         enable row level security;
alter table bitacora     enable row level security;
alter table documento    enable row level security;

-- organizacion: ves la tuya
create policy org_select on organizacion
  for select using (es_miembro(id));

-- miembro: ves los miembros de tu org
create policy miembro_select on miembro
  for select using (es_miembro(org_id));

-- orden: acceso completo si eres miembro de la org
create policy orden_all on orden
  for all using (es_miembro(org_id)) with check (es_miembro(org_id));

-- item / bitacora / documento: a través de la orden a la que pertenecen
create policy item_all on item
  for all using (es_miembro((select org_id from orden where orden.id = item.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = item.orden_id)));

create policy bitacora_all on bitacora
  for all using (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)));

create policy documento_all on documento
  for all using (es_miembro((select org_id from orden where orden.id = documento.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = documento.orden_id)));

-- ============================================================
--  Storage (correr la creación de buckets desde el dashboard
--  o con la API; aquí solo de referencia):
--    bucket 'ordenes-oc'  -> PDFs de las órdenes de compra
--    bucket 'documentos'  -> adjuntos (actas, cartas, facturas...)
--  Recuerda agregar policies de Storage por org_id en la ruta.
-- ============================================================

-- ============================================================
--  Semilla mínima para arrancar (ajusta el user_id real)
-- ============================================================
-- insert into organizacion (id, nombre)
--   values ('00000000-0000-0000-0000-000000000001','Innovación Tecnológica SK, SRL');
-- insert into miembro (org_id, user_id, nombre, rol)
--   values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'Pablo Holguín', 'admin');
