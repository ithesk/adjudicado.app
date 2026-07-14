-- ============================================================
--  Documentación base de la empresa
--
--  Los documentos legales que hay que presentar en CADA licitación
--  (Registro de Proveedores, certificaciones DGII y TSS, registro
--  mercantil, acta constitutiva…). Casi todos vencen: si uno está
--  vencido el día de la apertura, la oferta se cae.
--
--  No cuelgan de una orden, sino de la organización — por eso no
--  caben en la tabla `documento` (su orden_id es NOT NULL y su RLS
--  resuelve la organización a través de la orden).
--
--  Los archivos van al bucket `documentos` ya existente, con ruta
--  {org_id}/empresa/{uuid}.{ext} — la policy actual ya lo autoriza
--  (solo exige que el primer folder sea el org_id), así que
--  supabase_storage.sql NO cambia.
--
--  Correr en Supabase → SQL Editor, DESPUÉS de supabase_schema.sql.
-- ============================================================

create table if not exists documento_empresa (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizacion(id) on delete cascade,
  tipo              text not null,          -- código del catálogo; 'otro' = libre
  nombre            text not null,          -- título legible (por defecto, el del archivo)
  archivo_url       text not null,          -- PATH del storage, nunca una URL
  fecha_emision     date,
  fecha_vencimiento date,                   -- null = no vence (ej. acta constitutiva)
  notas             text,
  subido_por        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

-- Se permiten VARIAS filas del mismo tipo a propósito: renovar una
-- certificación es subir la nueva, no borrar la vieja. El "vigente" de cada
-- tipo es el de vencimiento más lejano; el resto queda como historial.
create index if not exists idx_documento_empresa_org  on documento_empresa(org_id);
create index if not exists idx_documento_empresa_venc on documento_empresa(org_id, fecha_vencimiento);

alter table documento_empresa enable row level security;

drop policy if exists documento_empresa_all on documento_empresa;
create policy documento_empresa_all on documento_empresa for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
