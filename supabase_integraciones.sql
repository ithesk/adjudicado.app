-- ============================================================
--  INTEGRACIONES POR ORGANIZACIÓN — Odoo
--
--  Cada empresa conecta SU Odoo desde Configuración → Integraciones
--  (botón «Conectar con Odoo»): url, base de datos, usuario y la API
--  key CIFRADA (AES-256-GCM con CREDENCIALES_SECRET del servidor —
--  nunca en claro, nunca viaja al navegador).
--
--  Las variables de entorno ODOO_* quedan como modo legado: si una
--  org no tiene fila aquí y las env existen, se usan (transición).
--
--  Re-runnable. Correr en Supabase → SQL Editor.
-- ============================================================

create table if not exists integracion_odoo (
  org_id          uuid primary key references organizacion(id) on delete cascade,
  url             text not null,
  db              text not null,
  usuario         text not null,
  api_key_cifrada text not null,
  activo          boolean not null default true,
  -- resultado de la última prueba de conexión (se ve de un vistazo)
  version         text,
  probado_at      timestamptz,
  updated_at      timestamptz not null default now()
);

alter table integracion_odoo enable row level security;
drop policy if exists integracion_odoo_all on integracion_odoo;
create policy integracion_odoo_all on integracion_odoo for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));

-- La factura VINCULADA muestra su nombre ("INV/2026/0035") sin ir a Odoo.
alter table orden add column if not exists odoo_factura_nombre text;
