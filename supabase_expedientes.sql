-- ============================================================
--  EXPEDIENTES Y RESULTADOS
--  Correr DESPUÉS de supabase_licitaciones.sql.
--
--  lic_expediente: caché COMÚN (no por organización) del expediente
--  completo de un proceso de la DGCP («Descargar procedimiento»). Es
--  información pública: se baja una vez y la reutilizan todos. Los
--  archivos y su texto viven en el bucket privado `expedientes`
--  ({codigo}/{sha1}.bin y {codigo}/{sha1}.json); aquí, el índice y el
--  análisis estructurado (quién ganó qué, habilitados, subsanaciones,
--  precios por ítem, requisitos del pliego).
--
--  lic_resultado: el resultado de cada proceso en el que la organización
--  participó, POR ORGANIZACIÓN: lo llena el cron (desde la API) y el
--  análisis profundo (desde el expediente), y lo confirma el usuario con
--  el informe. Es la base de las estadísticas.
-- ============================================================

create table if not exists lic_expediente (
  codigo            text primary key,
  estado            text not null default 'pendiente',
  -- Fase en curso: descargar → ocr → analizar → listo
  fase              text not null default 'descargar',
  estado_dgcp       text,
  archivos          jsonb not null default '[]'::jsonb,
  analisis          jsonb,
  error             text,
  intentos          int not null default 0,
  -- «Lease»: quien procesa lo reserva hasta esta hora (evita dos a la vez).
  trabajando_hasta  timestamptz,
  descargado_at     timestamptz,
  listo_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lic_expediente_estado_valido check
    (estado in ('pendiente','procesando','listo','error')),
  constraint lic_expediente_fase_valida check
    (fase in ('descargar','ocr','analizar','listo'))
);
drop trigger if exists trg_lic_expediente_touch on lic_expediente;
create trigger trg_lic_expediente_touch before update on lic_expediente
  for each row execute function touch_updated_at();
alter table lic_expediente enable row level security;
-- Datos públicos: cualquier usuario autenticado lo lee; escribe solo el servidor.
drop policy if exists lic_expediente_lectura on lic_expediente;
create policy lic_expediente_lectura on lic_expediente for select to authenticated using (true);

create table if not exists lic_resultado (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizacion(id) on delete cascade,
  codigo             text not null,
  proceso_id         uuid references lic_proceso(id) on delete set null,
  institucion        text,
  objeto             text,
  modalidad          text,
  estado_dgcp        text,
  -- ganado | parcial | perdido | desierto | cancelado | pendiente
  resultado          text not null default 'pendiente',
  -- precio | descalificacion | no_subsano | no_ofertado | desierto | otro | null (aún no se sabe)
  causa              text,
  nuestro_monto      numeric(16,2),
  monto_adjudicado   numeric(16,2),   -- a nosotros
  monto_ganador      numeric(16,2),   -- total adjudicado a otros
  oferentes          int,
  fecha_oferta       timestamptz,
  fecha_adjudicacion timestamptz,
  -- Ganadores y competidores (de la API): [{razon_social, rpe, valor_oferta, adjudicado, valor_adjudicado}]
  competidores       jsonb not null default '[]'::jsonb,
  -- Análisis profundo desde el expediente: cumplimiento frente al pliego,
  -- comparación por ítem, lecciones, patrones sugeridos.
  detalle            jsonb,
  analizado_at       timestamptz,
  informe            text,            -- informe confirmado por el usuario (markdown)
  confirmado_at      timestamptz,
  visto              boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, codigo),
  constraint lic_resultado_resultado_valido check
    (resultado in ('ganado','parcial','perdido','desierto','cancelado','pendiente')),
  constraint lic_resultado_causa_valida check
    (causa is null or causa in ('precio','descalificacion','no_subsano','no_ofertado','desierto','otro'))
);
create index if not exists idx_lic_resultado_org on lic_resultado(org_id, fecha_oferta desc);
drop trigger if exists trg_lic_resultado_touch on lic_resultado;
create trigger trg_lic_resultado_touch before update on lic_resultado
  for each row execute function touch_updated_at();
alter table lic_resultado enable row level security;
drop policy if exists lic_resultado_all on lic_resultado;
create policy lic_resultado_all on lic_resultado for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- Bucket privado: solo el servidor (service_role) lee y escribe.
insert into storage.buckets (id, name, public)
  values ('expedientes', 'expedientes', false)
  on conflict (id) do nothing;
